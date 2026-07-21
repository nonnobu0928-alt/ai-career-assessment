import { nanoid } from "nanoid";
import { appendSample, computeDeviation } from "@/lib/deviation";
import { QUICK_METRICS, type QuickResult } from "@/lib/diagnostic/types";
import { deriveQuickType } from "@/lib/quizBank";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const DIST_TABLE = "score_distributions";
const SHARES_TABLE = "quick_shares";
const METRIC = "quick_overall";

// クイック診断の結果を匿名シェアとして保存し、公開URL用の share_id を返す。
// - 偏差値は score_distributions を母集団に算出(F1-4)
// - 公開に出すのは匿名要約のみ(発言ログ・企業評価は保存しない)
// - DB未設定時は共有できない(shareId=null)。合意済みのフォールバック
export async function POST(req: Request) {
  const { result } = (await req.json()) as { result: QuickResult };

  if (!result || typeof result.overall !== "number" || !result.byMetric) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }
  const overall = Math.max(0, Math.min(100, Math.round(result.overall)));
  const type = deriveQuickType(result);

  // 上位2軸を強みとして匿名要約に含める
  const topStrengths = [...QUICK_METRICS]
    .sort((a, b) => (result.byMetric[b.key] ?? 0) - (result.byMetric[a.key] ?? 0))
    .slice(0, 2)
    .map((m) => m.name);

  const supabase = getSupabase();
  if (!supabase) {
    // DBなし: 公開シェア不可(結果はローカルで閲覧可能)
    return Response.json({ ok: true, available: false, shareId: null, deviation: null });
  }

  // 偏差値算出(母集団に匿名スコアを追記)
  const { data: dist } = await supabase
    .from(DIST_TABLE)
    .select("samples")
    .eq("metric", METRIC)
    .maybeSingle();
  const existing: number[] = Array.isArray(dist?.samples) ? (dist!.samples as number[]) : [];
  const population = appendSample(existing, overall);
  await supabase
    .from(DIST_TABLE)
    .upsert({ metric: METRIC, samples: population, updated_at: new Date().toISOString() });
  const deviation = computeDeviation(overall, population);

  const shareId = nanoid(12);
  const { error } = await supabase.from(SHARES_TABLE).insert({
    share_id: shareId,
    type_name: type.name,
    type_en: type.en,
    overall,
    by_metric: result.byMetric,
    deviation,
    top_strengths: topStrengths,
  });
  if (error) {
    console.error("quick_shares insert error:", error.message);
    return Response.json({ ok: true, available: false, shareId: null, deviation });
  }

  return Response.json({ ok: true, available: true, shareId, deviation });
}
