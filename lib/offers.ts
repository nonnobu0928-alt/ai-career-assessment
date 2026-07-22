// ============================================================
// 一気 IKKI — オファー条件(構造化) v0.3 F3-3
//
// 給与・福利厚生・仕事内容を「項目化」して扱う(自由記述の塊にしない)。
// これが条件データの第一ソース。求人サイトの無差別クローリングはしない。
// ============================================================

// 福利厚生は固定の選択肢から選ぶ(構造化。相対評価 F3-4 の集計軸にもなる)
export const BENEFIT_OPTIONS = [
  "リモート可",
  "フルフレックス",
  "住宅手当",
  "資格取得支援",
  "ストックオプション",
  "副業可",
  "退職金制度",
  "書籍・学習支援",
  "育児・介護支援",
  "フルリモート",
] as const;

export type Benefit = (typeof BENEFIT_OPTIONS)[number];

export interface OfferInput {
  card_ids: string[];
  salary_min: number;
  salary_max: number;
  benefits: Benefit[];
  role_description: string;
}

export function isBenefit(v: unknown): v is Benefit {
  return typeof v === "string" && (BENEFIT_OPTIONS as readonly string[]).includes(v);
}
