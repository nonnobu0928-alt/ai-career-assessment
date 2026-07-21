import Anthropic from "@anthropic-ai/sdk";
import {
  buildCommPrompt,
  commBarsText,
  COMM_AXES,
  COMM_SCHEMA,
  COMM_SITUATIONS,
  COMM_SYSTEM_PROMPT,
  type CommAxisEval,
  type CommResult,
} from "@/lib/commTest";
import { normalizeForMatch, quoteInLog } from "@/lib/grounding";
import type { Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// コミュ試験の採点。自由記述を固定4軸で採点し、各軸の根拠引用を
// 本人の記述に対して照合する(v0.2のグラウンディング原則)。
export async function POST(req: Request) {
  const { situationId, response } = (await req.json()) as {
    situationId: string;
    response: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }
  const situation = COMM_SITUATIONS.find((s) => s.id === situationId);
  if (!situation || typeof response !== "string" || response.trim().length < 10) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: COMM_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildCommPrompt(situation.prompt, response) },
    ],
    output_config: { format: { type: "json_schema", schema: COMM_SCHEMA } },
  });

  if (res.stop_reason === "refusal") {
    return Response.json({ error: "採点が拒否されました。" }, { status: 502 });
  }

  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  let raw: {
    axes?: { key?: string; score?: number; evidence_quote?: string; confidence?: Confidence }[];
  };
  try {
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "採点結果のパースに失敗しました。" }, { status: 502 });
  }

  // 本人の記述に対して引用を照合。合致しない軸は評価保留(null)にする
  const logNorm = normalizeForMatch(response);
  const byKey = new Map((raw.axes ?? []).map((a) => [String(a.key), a]));

  const axes: CommAxisEval[] = COMM_AXES.map((def) => {
    const a = byKey.get(def.key);
    const score = Math.round(Number(a?.score ?? 0));
    const quote = String(a?.evidence_quote ?? "").trim();
    const barsText = score >= 1 && score <= 5 ? commBarsText(def.key, score) : null;
    const grounded = quote.length > 0 && quoteInLog(quote, logNorm);
    if (!a || !barsText || !grounded) {
      return {
        key: def.key,
        name: def.name,
        score: null,
        bars_text: null,
        evidence_quote: null,
        confidence: null,
      };
    }
    const c = a.confidence;
    return {
      key: def.key,
      name: def.name,
      score,
      bars_text: barsText,
      evidence_quote: quote,
      confidence: c === "high" || c === "med" || c === "low" ? c : "low",
    };
  });

  const scored = axes.filter((a) => a.score !== null) as (CommAxisEval & { score: number })[];
  const overall =
    scored.length > 0
      ? Math.round((scored.reduce((s, a) => s + a.score, 0) / scored.length / 5) * 100)
      : null;

  const result: CommResult = { situationId, response, axes, overall };
  return Response.json({ ok: true, result });
}
