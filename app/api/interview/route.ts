import Anthropic from "@anthropic-ai/sdk";
import {
  buildExtractionPrompt,
  buildQuestionFormatPrompt,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  QUESTION_FORMAT_SYSTEM_PROMPT,
} from "@/lib/prompts";
import {
  decideNextMove,
  initInterviewState,
  isInterviewState,
  mergeExtraction,
  type InterviewState,
} from "@/lib/interviewEngine";
import { buildIntro, EPISODE_OPENERS, type SlotKey } from "@/lib/questionBank";
import { getSupabase } from "@/lib/supabase";
import type { CandidateInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// ============================================================
// 面談ステートマシン (パッケージB-2)。毎ターン3段処理:
//   1. 抽出: 直前の回答から埋まったスロットを判定(structured outputs)
//   2. 方針: 未充足スロットのうち最重要を1つ選ぶ(interviewEngineのルール)
//   3. 質問生成: 選ばれた質問テンプレを直前の文脈に合わせて温かく整形(LLM)
// 面談状態(InterviewState)はリクエストで往復させる(DB非依存で動く)。
// DB設定時は interview_sessions にも保存する。
// ============================================================

type Guide = { chips: string[]; placeholder: string } | null;

async function extractSlots(
  client: Anthropic,
  answer: string,
): Promise<Partial<Record<SlotKey, string>>> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildExtractionPrompt(answer) }],
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
  });
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text) as Partial<Record<SlotKey, string>>;
  } catch {
    return {};
  }
}

async function formatQuestion(
  client: Anthropic,
  candidate: CandidateInput,
  lastAnswer: string | null,
  questionText: string,
): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: QUESTION_FORMAT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildQuestionFormatPrompt(candidate, lastAnswer, questionText),
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  // 整形が空になった場合は素のテンプレにフォールバック
  return text || questionText;
}

async function persistState(state: InterviewState): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("interview_sessions").insert({ state });
  } catch (e) {
    console.error("interview_sessions insert error:", e);
  }
}

export async function POST(req: Request) {
  const { candidate, state, answer } = (await req.json()) as {
    candidate: CandidateInput;
    state?: InterviewState | null;
    answer?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。" },
      { status: 500 },
    );
  }
  if (!candidate?.name || !candidate?.role) {
    return Response.json({ error: "candidate が不正です。" }, { status: 400 });
  }

  const client = new Anthropic();

  // 初回: 状態を初期化し、挨拶 + 1本目のエピソード導入質問を返す。
  // 導入は決定的なので整形LLMを通さず即返し(初動を速く)。
  if (!isInterviewState(state)) {
    const fresh = initInterviewState();
    const opener = EPISODE_OPENERS[0];
    const guide: Guide = { chips: opener.chips, placeholder: opener.placeholder };
    return Response.json({
      message: `${buildIntro(candidate.name)}\n\n${opener.text}`,
      state: fresh,
      done: false,
      guide,
    });
  }

  const working: InterviewState = state;

  // 1. 抽出: 直前の回答から埋まったスロットを判定してマージ
  if (answer && answer.trim()) {
    const ep = working.episodes[working.episodeIndex];
    const extracted = await extractSlots(client, answer.trim());
    mergeExtraction(ep, extracted);
  }

  // 2. 方針: 次に取る手をコード側ルールで決める
  const move = decideNextMove(working);

  // 3. 質問生成(または終了)
  if (move.kind === "close") {
    await persistState(working);
    return Response.json({
      message: move.message,
      state: working,
      done: true,
      guide: null,
    });
  }

  const message = await formatQuestion(
    client,
    candidate,
    answer?.trim() ?? null,
    move.question.text,
  );
  const guide: Guide = {
    chips: move.question.chips,
    placeholder: move.question.placeholder,
  };
  return Response.json({ message, state: working, done: false, guide });
}
