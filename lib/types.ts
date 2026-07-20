// ============================================================
// 一気 IKKI — 共有型定義 (v2)
//
// v0.2設計原則:
// - トレーサビリティ: カードの全記述は evidence_quote で会話ログに遡れる
// - 誠実な欠損: 聴取できなかった項目は null / 空配列を保持し、
//   UI側で「面談で十分に聴取できませんでした」と表示する。
//   デモデータ等での補完は行わない
// - 3層構造: 発言事実(逐語引用) / 構造化データ(数字・役割等) /
//   AI所見(推定ラベル+確信度つき) を型レベルで区別する
// ============================================================

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// 面談開始前に入力する候補者の基本情報
export interface CandidateInput {
  name: string;
  role: string;
  years: string;
}

export type Confidence = "high" | "med" | "low";

// 層3: AI所見。推論を含む評価。必ず「AIによる推定」ラベルつきで表示する
export interface Insight {
  text: string;
  confidence: Confidence;
}

// 層1+3: 逐語引用(発言事実)と、そこから言える解釈(AI所見)のペア
export interface EvidencedItem {
  title: string;
  evidence_quote: string; // 候補者の発言からの一字一句そのままの引用
  interpretation: string;
  confidence: Confidence;
}

// 層1+3: タイトルなし版(面談ハイライト用)
export interface QuotedInsight {
  evidence_quote: string;
  interpretation: string;
  confidence: Confidence;
}

// 層2: 構造化データ。ログから抽出した数字・役割・期間など
export interface QuantFact {
  label: string; // 例: "担当顧客数"
  value: string; // 例: "30社" (ログに現れた数字のみ)
  evidence_quote: string;
}

// エピソード。スロットはB-2の必須5項目に合わせる。
// 聴取できなかったスロットは null(埋めない)
export interface EpisodeV2 {
  situation: string | null; // 組織規模/役割/期間
  challenge: string | null; // 何が問題だったか
  action: string | null; // 本人の行動
  result_quant: string | null; // 定量的な結果
  reproducibility: string | null; // なぜ上手くいったか
  evidence_quote: string | null;
}

// 想定年収。ログではなく市場レンジに基づく参考値のため、
// 算出根拠(basis)を必ず持ち「参考」として表示する
export interface SalaryEstimate {
  min: number; // 万円
  max: number; // 万円
  basis: string;
}

// コンピテンシー評価(パッケージBで生成)。
// score が null = 評価保留(根拠不足)
export interface CompetencyEval {
  key: string;
  name: string;
  score: number | null; // 1〜5
  bars_text: string | null; // 該当したBARS基準文(lib/competencyModel.tsの定数)
  evidence_quote: string | null;
  confidence: Confidence | null;
}

// キャリアカード本体 (v2)
export interface ProfileV2 {
  schema_version: 2;
  // 基本情報(事実のみ)
  name: string;
  role: string;
  years: string;
  // AI所見
  catchcopy: Insight | null;
  summary: Insight | null;
  // 根拠引用つき項目(サーバー照合検証を通過したもののみ)
  strengths: EvidencedItem[];
  quant_facts: QuantFact[];
  episodes: EpisodeV2[];
  highlight: QuotedInsight | null;
  // AI所見(チップ類)
  values: string[];
  match_roles: string[];
  match_score: number | null;
  // 参考値
  salary: SalaryEstimate | null;
  // 聴取不足・照合破棄となった項目キーの一覧
  insufficient: string[];
  // コンピテンシー評価(パッケージB)
  competencies?: CompetencyEval[];
  // LP「デモカードを見る」経由のサンプルデータのみ true
  is_demo?: boolean;
}

// DBに保存されるカード1件分
export interface CareerCardRecord {
  id: string;
  created_at: string;
  name: string;
  role: string;
  years: string;
  transcript: ChatMessage[];
  profile: ProfileV2;
}
