import Anthropic from "@anthropic-ai/sdk";
import {
  buildAnalysisPrompt,
  normalizeProfile,
  PROFILE_SCHEMA,
} from "@/lib/prompts";
import { CARDS_TABLE, getSupabase } from "@/lib/supabase";
import type { CandidateInput, ChatMessage, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// 会話ログからキャリアカード(Profile)を生成し、DBに保存する。
// - structured outputs でスキーマを強制し、さらに normalizeProfile で
//   件数・数値レンジを保証(「壊れないカード」)
// - Supabase未設定時は saved: false で返し、クライアント側の
//   ローカル保存にフォールバックさせる
export async function POST(req: Request) {
  const { candidate, messages } = (await req.json()) as {
    candidate: CandidateInput;
    messages: ChatMessage[];
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }
  if (!candidate?.name || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "あなたは転職サービス「一気(IKKI)」の解析エンジンです。キャリア面談の会話ログから、候補者のキャリアカードを生成します。会話中に確認できた具体的ファクトのみを根拠とし、裏付けのない自己申告は割り引いて評価してください。",
    messages: [
      { role: "user", content: buildAnalysisPrompt(candidate, messages) },
    ],
    output_config: {
      format: { type: "json_schema", schema: PROFILE_SCHEMA },
    },
  });

  if (response.stop_reason === "refusal") {
    return Response.json({ error: "解析が拒否されました。" }, { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: Partial<Profile>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "解析結果のパースに失敗しました。" }, { status: 502 });
  }

  const profile = normalizeProfile(parsed, candidate);

  // DB保存(Supabase設定時のみ)
  let saved = false;
  let id: string | null = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from(CARDS_TABLE)
      .insert({
        name: profile.name,
        role: profile.role,
        years: profile.years,
        transcript: messages,
        profile,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Supabase insert error:", error.message);
    } else {
      saved = true;
      id = data.id;
    }
  }

  return Response.json({ ok: true, saved, id, profile });
}
