// ============================================================
// 一気 IKKI — コンピテンシーモデル (パッケージB-1)
//
// 比較可能性の担保: 全候補者を同じ5項目 × 同じ行動基準(BARS)で評価する。
// 採点は「該当するBARS基準文 + 根拠引用」のセットが揃った場合のみ有効。
// 揃わない項目は「評価保留(根拠不足)」とする。
// BARS基準文はLLM出力を使わず、必ずこの定数から引く。
// ============================================================

export type CompetencyKey =
  | "problem_solving"
  | "execution"
  | "influence"
  | "learning"
  | "ownership";

export interface CompetencyDef {
  key: CompetencyKey;
  name: string;
  bars: Record<1 | 2 | 3 | 4 | 5, string>;
}

export const COMPETENCY_MODEL: CompetencyDef[] = [
  {
    key: "problem_solving",
    name: "課題解決",
    bars: {
      1: "与えられた課題を、指示された方法で処理した",
      2: "課題の原因を自分なりに調べ、既存の方法で解決した",
      3: "課題を分解・構造化し、原因に応じた打ち手を自ら選んだ",
      4: "データや事実から課題を特定し、複数案を比較して解決した",
      5: "問題の構造自体を再定義し、根本原因への対策を設計した",
    },
  },
  {
    key: "execution",
    name: "実行・完遂",
    bars: {
      1: "指示された作業を期限内に行った",
      2: "決められた手順の中で、遅延なく安定して業務を回した",
      3: "障害発生時に自ら代替手段を用意し、業務を完遂した",
      4: "関係者を巻き込んで障害を取り除き、目標を達成した",
      5: "部門を跨ぐ問題を解決し、再発しない仕組み化まで行った",
    },
  },
  {
    key: "influence",
    name: "対人影響",
    bars: {
      1: "求められた報告・連絡を適切に行った",
      2: "相手に合わせた説明で、依頼や調整を円滑に進めた",
      3: "利害の異なる相手を説得し、合意を形成した",
      4: "関係者を巻き込み、他者の行動変化を引き出した",
      5: "組織を跨ぐ合意を主導し、周囲の判断基準に影響を与えた",
    },
  },
  {
    key: "learning",
    name: "学習・適応",
    bars: {
      1: "必要になった知識を、指示を受けて習得した",
      2: "業務に必要な知識・スキルを自分で調べて習得した",
      3: "失敗や指摘を振り返り、行動を具体的に変えた",
      4: "環境変化に合わせて自らやり方を再設計し、成果を維持した",
      5: "学んだことを仕組み・ノウハウ化し、他者にも展開した",
    },
  },
  {
    key: "ownership",
    name: "主体性",
    bars: {
      1: "担当範囲の業務を責任を持って行った",
      2: "気づいた問題を報告し、改善を提案した",
      3: "役割の外の問題でも、自ら手を挙げて対応した",
      4: "誰も担っていない課題を自ら定義し、周囲を動かして解決した",
      5: "組織の課題を自分事として設計・推進し、結果まで責任を持った",
    },
  },
];

export function barsText(key: string, score: number): string | null {
  const def = COMPETENCY_MODEL.find((c) => c.key === key);
  if (!def) return null;
  if (score < 1 || score > 5) return null;
  return def.bars[score as 1 | 2 | 3 | 4 | 5];
}

// 解析プロンプトに埋め込むBARS定義テキスト
export function competencyPromptSection(): string {
  return COMPETENCY_MODEL.map(
    (c) =>
      `- ${c.key}(${c.name}):\n` +
      ([1, 2, 3, 4, 5] as const).map((n) => `  ${n}: ${c.bars[n]}`).join("\n"),
  ).join("\n");
}
