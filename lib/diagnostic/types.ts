// ============================================================
// 一気 IKKI — 診断(v0.3 フェーズ1)共有型
//
// クイック層(選択式)・コミュ試験・偏差値の各機能で共有する型。
// v0.2 の原則を踏襲: スコアは根拠に紐付き、公開面には匿名要約しか出さない。
// ============================================================

// --- クイック層(選択式診断) ---

// 選択肢1つ。score は各コンピテンシー系メトリクスへの加点(コード側で固定)
export interface QuickChoice {
  label: string;
  // この選択肢が加点するメトリクスと点数(採点根拠はコード側に固定=恣意性排除)
  scores: Partial<Record<QuickMetric, number>>;
}

export interface QuickQuestion {
  id: string;
  prompt: string;
  // 選択の根拠(なぜこの配点かの設計意図)。UIには出さないがレビュー可能に保持
  rationale: string;
  choices: QuickChoice[];
}

// クイック層で測る能力メトリクス(偏差値対象になりうる能力軸)
export type QuickMetric =
  | "problem_solving"
  | "execution"
  | "influence"
  | "learning"
  | "ownership";

// en は OGP画像(横組み・Latin)用のラベル
export const QUICK_METRICS: { key: QuickMetric; name: string; en: string }[] = [
  { key: "problem_solving", name: "課題解決", en: "PROBLEM SOLVING" },
  { key: "execution", name: "実行・完遂", en: "EXECUTION" },
  { key: "influence", name: "対人影響", en: "INFLUENCE" },
  { key: "learning", name: "学習・適応", en: "LEARNING" },
  { key: "ownership", name: "主体性", en: "OWNERSHIP" },
];

// クイック結果から導く「強みタイプ」(能力ベース。性格タイプ=MBTI風はフェーズ2)
export interface QuickType {
  key: QuickMetric;
  name: string; // 例: 主体推進型
  tagline: string;
  en: string; // OGP用
}

// クイック層の結果(0〜100の総合 + 軸別)
export interface QuickResult {
  overall: number; // 0〜100
  byMetric: Record<QuickMetric, number>; // 各 0〜100
  answered: number;
  total: number;
}

// --- 診断セッション(中断・再開) ---

export interface DiagnosticSessionState {
  kind: "quick" | "comm_test";
  answers: Record<string, number>; // questionId -> 選択したchoiceのindex
  index: number; // 現在の設問位置
  updatedAt: number;
}
