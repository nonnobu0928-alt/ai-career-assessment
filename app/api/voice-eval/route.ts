import Anthropic from "@anthropic-ai/sdk";
import { barsText, COMPETENCY_MODEL } from "@/lib/competencyModel";
import { normalizeForMatch, quoteInLog } from "@/lib/grounding";
import {
  buildVoiceEvalPrompt,
  computeVoiceMetrics,
  VOICE_COMP_SCHEMA,
  VOICE_EVAL_SYSTEM_PROMPT,
  type VoiceAnswer,
} from "@/lib/voice";
import type { CompetencyEval, Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// 音声面接の評価 (F2-3b)。
// 主軸: 発話「内容」をコンピテンシーで採点し、根拠は文字起こしから逐語引用・照合。
// 補助: 話速/フィラー率などは参考値として別に返す(合否に直結させない)。
export async function POST(req: Request) {
  const { answers } = (await req.json()) as { answers: VoiceAnswer[] };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY が設定されていません。" }, { status: 500 });
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const transcript = answers.map((a) => a.transcript).join("\n");
  // 補助指標(参考値)は決定的に算出
  const metrics = answers.map((a) => ({ questionId: a.questionId, ...computeVoiceMetrics(a) }));

  // 発話が短すぎる場合は内容評価をスキップ(参考指標のみ返す)
  if (normalizeForMatch(transcript).length < 10) {
    const competencies: CompetencyEval[] = COMPETENCY_MODEL.map((d) => ({
      key: d.key, name: d.name, score: null, bars_text: null, evidence_quote: null, confidence: null,
    }));
    return Response.json({ ok: true, competencies, metrics });
  }

  const client = new Anthropic();
  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: VOICE_EVAL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildVoiceEvalPrompt(transcript) }],
      output_config: { format: { type: "json_schema", schema: VOICE_COMP_SCHEMA } },
    });
  } catch (e) {
    console.error("voice-eval error:", e);
    return Response.json({ error: "評価に失敗しました。" }, { status: 502 });
  }

  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  let raw: { competencies?: { key?: string; score?: number; evidence_quote?: string; confidence?: Confidence }[] };
  try {
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "評価結果のパースに失敗しました。" }, { status: 502 });
  }

  // 発話内容に対する引用照合(grounding)。合致しない項目は評価保留
  const logNorm = normalizeForMatch(transcript);
  const byKey = new Map((raw.competencies ?? []).map((c) => [String(c.key), c]));
  const competencies: CompetencyEval[] = COMPETENCY_MODEL.map((def) => {
    const c = byKey.get(def.key);
    const score = Math.round(Number(c?.score ?? 0));
    const quote = String(c?.evidence_quote ?? "").trim();
    const bars = score >= 1 && score <= 5 ? barsText(def.key, score) : null;
    const grounded = quote.length > 0 && quoteInLog(quote, logNorm);
    if (!c || !bars || !grounded) {
      return { key: def.key, name: def.name, score: null, bars_text: null, evidence_quote: null, confidence: null };
    }
    const conf = c.confidence;
    return {
      key: def.key, name: def.name, score, bars_text: bars, evidence_quote: quote,
      confidence: conf === "high" || conf === "med" || conf === "low" ? conf : "low",
    };
  });

  return Response.json({ ok: true, competencies, metrics });
}
