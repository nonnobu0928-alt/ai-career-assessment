import { appendSample, computeDeviation } from "@/lib/deviation";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const DIST_TABLE = "score_distributions";
// 偏差値対象の許可メトリクス(能力スコアのみ。性格タイプは対象外)
const ALLOWED_METRICS = new Set([
  "quick_overall",
  "competency_overall",
  "communication",
]);

// 匿名スコアを分布に加え、偏差値・パーセンタイルを算出して返す。
// DB未設定時は相対評価を出せないため provisional 情報のみ返す(参考値扱い)。
export async function POST(req: Request) {
  const { metric, score } = (await req.json()) as { metric: string; score: number };

  if (!ALLOWED_METRICS.has(metric) || typeof score !== "number" || !Number.isFinite(score)) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const supabase = getSupabase();
  if (!supabase) {
    // DBなし: 母集団を持てないので相対評価は出さない(参考値)
    return Response.json({
      ok: true,
      available: false,
      result: null,
    });
  }

  // 既存サンプルを取得(なければ空)
  const { data } = await supabase
    .from(DIST_TABLE)
    .select("samples")
    .eq("metric", metric)
    .maybeSingle();

  const existing: number[] = Array.isArray(data?.samples) ? (data!.samples as number[]) : [];
  const population = appendSample(existing, clamped);

  // 匿名スコアを追記(個人特定情報は持たない)
  const { error } = await supabase
    .from(DIST_TABLE)
    .upsert({ metric, samples: population, updated_at: new Date().toISOString() });
  if (error) {
    console.error("score_distributions upsert error:", error.message);
  }

  const result = computeDeviation(clamped, population);
  return Response.json({ ok: true, available: true, result });
}
