import { getSupabase } from "./supabase";
import type { DeviationResult } from "./deviation";
import type { QuickMetric } from "./diagnostic/types";

// ============================================================
// 一気 IKKI — 公開シェア取得(F1-3)
//
// 公開ページ /r/[shareId] と OGP画像が参照する。返すのは匿名要約のみ。
// 発言ログ・氏名・企業向け評価は構造上ここに存在しない(quick_shares に
// そもそも保存していない)ため、公開面への漏洩が起きない設計。
// ============================================================

export interface PublicShare {
  shareId: string;
  typeName: string;
  typeEn: string;
  overall: number;
  byMetric: Record<QuickMetric, number>;
  deviation: DeviationResult | null;
  topStrengths: string[];
}

export async function getPublicShare(shareId: string): Promise<PublicShare | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("quick_shares")
    .select("share_id, type_name, type_en, overall, by_metric, deviation, top_strengths")
    .eq("share_id", shareId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    shareId: data.share_id,
    typeName: data.type_name,
    typeEn: data.type_en,
    overall: data.overall,
    byMetric: data.by_metric,
    deviation: data.deviation ?? null,
    topStrengths: Array.isArray(data.top_strengths) ? data.top_strengths : [],
  };
}
