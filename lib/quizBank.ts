import type {
  QuickMetric,
  QuickQuestion,
  QuickResult,
} from "./diagnostic/types";
import { QUICK_METRICS } from "./diagnostic/types";

// ============================================================
// 一気 IKKI — クイック層 設問バンク(F1-1 / F1-5の選択式部分)
//
// SNS拡散のフック。3〜4分・選択式中心・1問1画面。
// 設計原則:
// - 採点の正誤・配点は「コード側に固定」(恣意性を排除)。LLMで採点しない
// - 測るのは v0.2 と同じ5コンピテンシー軸(比較可能性のため軸を統一)
// - これは自己申告ベースの「参考のクイック指標」。根拠に裏打ちされた本体は
//   コンピテンシー面接(v0.2)側。クイック層はあくまで入口フック
// - ドラフト版。設問・配点は運営レビューで差し替え可能な単純データ構造
// ============================================================

// スコアは各選択肢が該当メトリクスに加える点数(0〜3)。
// 配点意図は rationale に明記(UIには出さないがレビュー可能)。
export const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: "q1",
    prompt: "新しい仕事を任されたとき、最初にすることに近いのは?",
    rationale: "課題の構造化(problem_solving)と主体的な段取り(ownership)を測る",
    choices: [
      { label: "全体像とゴールを整理してから動く", scores: { problem_solving: 3, ownership: 1 } },
      { label: "詳しい人にまず聞きに行く", scores: { influence: 2, learning: 1 } },
      { label: "とりあえず手を動かして進める", scores: { execution: 2, ownership: 1 } },
      { label: "似た事例を調べて型を探す", scores: { learning: 3 } },
    ],
  },
  {
    id: "q2",
    prompt: "計画通りに進まない場面に直面したら?",
    rationale: "代替手段の用意(execution)と原因分析(problem_solving)",
    choices: [
      { label: "原因を切り分けて打ち手を選び直す", scores: { problem_solving: 3 } },
      { label: "代替案を用意して止めずに進める", scores: { execution: 3 } },
      { label: "関係者を巻き込んで解決にあたる", scores: { influence: 2, execution: 1 } },
      { label: "一度立ち止まり学び直す", scores: { learning: 2 } },
    ],
  },
  {
    id: "q3",
    prompt: "意見が対立したときのあなたに近いのは?",
    rationale: "対人影響(influence)の型を測る",
    choices: [
      { label: "相手の意図を汲んで着地点を探す", scores: { influence: 3 } },
      { label: "データや事実で説得する", scores: { influence: 2, problem_solving: 1 } },
      { label: "まず自分がやって見せる", scores: { execution: 2, ownership: 1 } },
      { label: "第三者を交えて調整する", scores: { influence: 1, learning: 1 } },
    ],
  },
  {
    id: "q4",
    prompt: "担当外の問題に気づいたら?",
    rationale: "主体性(ownership)の度合い",
    choices: [
      { label: "自分ごととして手を挙げて動く", scores: { ownership: 3 } },
      { label: "気づいた点を提案・共有する", scores: { ownership: 2, influence: 1 } },
      { label: "担当者に任せて見守る", scores: { execution: 1 } },
      { label: "仕組みで再発しないよう整える", scores: { ownership: 2, problem_solving: 1 } },
    ],
  },
  {
    id: "q5",
    prompt: "失敗や指摘を受けたあとのあなたは?",
    rationale: "学習・適応(learning)",
    choices: [
      { label: "原因を振り返り行動を具体的に変える", scores: { learning: 3 } },
      { label: "同じ失敗を防ぐ仕組みを作る", scores: { learning: 2, problem_solving: 1 } },
      { label: "気持ちを切り替えて次に集中する", scores: { execution: 2 } },
      { label: "周囲に共有して再発を防ぐ", scores: { learning: 1, influence: 1 } },
    ],
  },
  {
    id: "q6",
    prompt: "チームで成果を出すとき、力を発揮しやすいのは?",
    rationale: "対人影響(influence)と実行(execution)のバランス",
    choices: [
      { label: "巻き込んで人を動かす役割", scores: { influence: 3 } },
      { label: "手を動かして完遂する役割", scores: { execution: 3 } },
      { label: "課題を整理し方針を出す役割", scores: { problem_solving: 3 } },
      { label: "抜けを拾い支える役割", scores: { ownership: 2 } },
    ],
  },
  {
    id: "q7",
    prompt: "締め切りが厳しい仕事での動き方は?",
    rationale: "実行・完遂(execution)",
    choices: [
      { label: "優先順位を決めて確実に終わらせる", scores: { execution: 3 } },
      { label: "人を巻き込んで分担する", scores: { influence: 2, execution: 1 } },
      { label: "ムダを削る工夫を先に考える", scores: { problem_solving: 2 } },
      { label: "早めに着手して余裕を作る", scores: { execution: 2, ownership: 1 } },
    ],
  },
  {
    id: "q8",
    prompt: "新しいスキルが必要になったら?",
    rationale: "学習・適応(learning)",
    choices: [
      { label: "自分で調べて短期間で習得する", scores: { learning: 3 } },
      { label: "詳しい人に教わり実践で覚える", scores: { learning: 2, influence: 1 } },
      { label: "仕事の中で使いながら身につける", scores: { execution: 2 } },
      { label: "学んだことを周囲にも展開する", scores: { learning: 2, ownership: 1 } },
    ],
  },
  {
    id: "q9",
    prompt: "成果を出すうえで、あなたが最も大事にするのは?",
    rationale: "価値観の傾向(複数軸に薄く配点)",
    choices: [
      { label: "筋の良い課題設定", scores: { problem_solving: 2 } },
      { label: "最後までやり切ること", scores: { execution: 2 } },
      { label: "周囲との信頼関係", scores: { influence: 2 } },
      { label: "学び続ける姿勢", scores: { learning: 2 } },
    ],
  },
  {
    id: "q10",
    prompt: "理想に近い働き方は?",
    rationale: "主体性(ownership)と学習(learning)の志向",
    choices: [
      { label: "自分で課題を定義して進める", scores: { ownership: 3 } },
      { label: "決まった役割を高い質でこなす", scores: { execution: 2 } },
      { label: "人と協働して大きな成果を出す", scores: { influence: 2 } },
      { label: "新しいことに挑戦し続ける", scores: { learning: 2, ownership: 1 } },
    ],
  },
];

// 各メトリクスの理論最大点(全設問で最も高い配点を選んだ場合の合計)。
// 正規化の分母に使う(コード側固定=恣意性排除)。
function maxByMetric(): Record<QuickMetric, number> {
  const max = Object.fromEntries(
    QUICK_METRICS.map((m) => [m.key, 0]),
  ) as Record<QuickMetric, number>;
  for (const q of QUICK_QUESTIONS) {
    const perMetricMax = Object.fromEntries(
      QUICK_METRICS.map((m) => [m.key, 0]),
    ) as Record<QuickMetric, number>;
    for (const c of q.choices) {
      for (const m of QUICK_METRICS) {
        const v = c.scores[m.key] ?? 0;
        if (v > perMetricMax[m.key]) perMetricMax[m.key] = v;
      }
    }
    for (const m of QUICK_METRICS) max[m.key] += perMetricMax[m.key];
  }
  return max;
}

// 回答(questionId -> 選択したchoiceのindex)から結果を算出。
export function scoreQuiz(answers: Record<string, number>): QuickResult {
  const raw = Object.fromEntries(
    QUICK_METRICS.map((m) => [m.key, 0]),
  ) as Record<QuickMetric, number>;
  let answered = 0;

  for (const q of QUICK_QUESTIONS) {
    const idx = answers[q.id];
    if (idx == null || idx < 0 || idx >= q.choices.length) continue;
    answered += 1;
    const choice = q.choices[idx];
    for (const m of QUICK_METRICS) {
      raw[m.key] += choice.scores[m.key] ?? 0;
    }
  }

  const max = maxByMetric();
  const byMetric = Object.fromEntries(
    QUICK_METRICS.map((m) => {
      const denom = max[m.key] || 1;
      const pct = Math.round((raw[m.key] / denom) * 100);
      return [m.key, Math.max(0, Math.min(100, pct))];
    }),
  ) as Record<QuickMetric, number>;

  const overall = Math.round(
    QUICK_METRICS.reduce((s, m) => s + byMetric[m.key], 0) / QUICK_METRICS.length,
  );

  return { overall, byMetric, answered, total: QUICK_QUESTIONS.length };
}
