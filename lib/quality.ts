import type { ProfileV2, QualityScore } from "./types";

// ============================================================
// 一気 IKKI — Card Quality Score (パッケージE)
//
// /api/analyze 完了時にサーバーで算出し、career_cards.quality に保存する。
// - ユーザーには「充足度」として表示(回答改善のゲーミフィケーション)
// - 運営にはプロンプト改善のKPI(Supabaseのテーブルビューで直接確認)
// - 将来的には企業側の検索フィルタ
// ============================================================

const EPISODE_SLOTS = [
  "situation",
  "challenge",
  "action",
  "result_quant",
  "reproducibility",
] as const;

export function computeQuality(
  profile: ProfileV2,
  quotesChecked: number,
  quotesPassed: number,
): QualityScore {
  const attempted = profile.episodes.length;
  const complete = profile.episodes.filter((ep) =>
    EPISODE_SLOTS.every((s) => ep[s] !== null),
  ).length;
  const slotsFilled = profile.episodes.reduce(
    (n, ep) => n + EPISODE_SLOTS.filter((s) => ep[s] !== null).length,
    0,
  );

  const quant_count = profile.quant_facts.length;
  const star_complete_rate = attempted > 0 ? complete / attempted : 0;
  const quote_pass_rate = quotesChecked > 0 ? quotesPassed / quotesChecked : 0;
  const slot_fill_rate =
    attempted > 0 ? slotsFilled / (attempted * EPISODE_SLOTS.length) : 0;

  // 重み: 引用カバー率 40 / STAR完全率 25 / スロット充足率 20 / 定量数 15
  const total = Math.round(
    quote_pass_rate * 40 +
      star_complete_rate * 25 +
      slot_fill_rate * 20 +
      Math.min(1, quant_count / 4) * 15,
  );

  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    quant_count,
    star_complete_rate: round2(star_complete_rate),
    quote_pass_rate: round2(quote_pass_rate),
    slot_fill_rate: round2(slot_fill_rate),
    total,
  };
}
