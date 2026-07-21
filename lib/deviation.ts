// ============================================================
// 一気 IKKI — 偏差値・相対評価エンジン(F1-4)
//
// 偏差値 = 50 + 10 × (score − mean) / sd、パーセンタイル(上位何%)も算出。
// サンプル数が閾値(100)未満の間は「参考値」とし確定表示しない
// (誤った相対評価は信頼を破壊するため)。
// MBTI風の性格タイプには偏差値を出さない — 本エンジンは能力スコア専用。
// ============================================================

export const SAMPLE_THRESHOLD = 100;
export const MAX_SAMPLES = 5000; // jsonb肥大化を防ぐ上限

export interface DeviationResult {
  score: number; // 対象スコア(0〜100)
  deviation: number; // 偏差値(小数1桁)
  percentileTop: number; // 上位何%(小数1桁)。小さいほど上位
  samples: number; // 母集団サイズ
  provisional: boolean; // サンプル不足なら true(=参考値)
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

// population にはスコア本人を含めた配列を渡す
export function computeDeviation(score: number, population: number[]): DeviationResult {
  const n = population.length;
  const m = mean(population);
  const sd = stddev(population);
  const round1 = (v: number) => Math.round(v * 10) / 10;

  // sd=0(全員同点/母集団1)の場合は偏差値50に丸める
  const deviation = sd > 0 ? round1(50 + (10 * (score - m)) / sd) : 50;

  // 上位%: 自分より高いスコアの割合
  const higher = population.filter((x) => x > score).length;
  const percentileTop = n > 0 ? round1((higher / n) * 100) : 100;

  return {
    score,
    deviation,
    percentileTop,
    samples: n,
    provisional: n < SAMPLE_THRESHOLD,
  };
}

// 既存サンプルに新スコアを加えた配列(上限で古いものを切り詰め)
export function appendSample(samples: number[], score: number): number[] {
  const next = [...samples, score];
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
}
