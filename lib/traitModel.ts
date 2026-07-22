// ============================================================
// 一気 IKKI — 特性診断(MBTI風・独自設計) v0.3 F2-2
//
// 方針:
// - 既存MBTIの商標・設問は一切流用しない。独自4軸のオリジナル設計
// - 合否には使わない。「チームでの動き方」「向いていそうな役割」の参考のみ
// - 採点はコード側で固定(恣意性排除)。LLMを使わない
// - 偏差値は出さない(優劣ではないため。F1-4の原則)
// - 企業ビューでは「参考特性」として隔離し、評価スコアと混同させない
// - ドラフト版。設問・タイプ名は運営レビューで差し替え可能
// ============================================================

export type AxisKey = "social" | "judge" | "drive" | "scope";

export interface Pole {
  code: string; // 1文字コード
  label: string; // 例: 発信型
  tagline: string;
}

export interface AxisDef {
  key: AxisKey;
  name: string; // 軸名
  poles: [Pole, Pole]; // [0], [1]
}

export const TRAIT_AXES: AxisDef[] = [
  {
    key: "social",
    name: "対人スタンス",
    poles: [
      { code: "E", label: "発信型", tagline: "自分から動き、場に働きかける" },
      { code: "R", label: "傾聴型", tagline: "まず聞き、相手を理解してから動く" },
    ],
  },
  {
    key: "judge",
    name: "判断軸",
    poles: [
      { code: "L", label: "論理型", tagline: "事実とロジックで筋を通す" },
      { code: "K", label: "共感型", tagline: "相手の気持ちと関係を大切にする" },
    ],
  },
  {
    key: "drive",
    name: "進め方",
    poles: [
      { code: "P", label: "計画型", tagline: "段取りを整えて着実に進める" },
      { code: "F", label: "即興型", tagline: "状況を見て柔軟に動く" },
    ],
  },
  {
    key: "scope",
    name: "視野",
    poles: [
      { code: "B", label: "俯瞰型", tagline: "全体像と方向性を描く" },
      { code: "G", label: "現場型", tagline: "具体と細部を詰め切る" },
    ],
  },
];

export interface TraitQuestion {
  id: string;
  axis: AxisKey;
  prompt: string;
  choices: [{ label: string; pole: 0 | 1 }, { label: string; pole: 0 | 1 }];
}

export const TRAIT_QUESTIONS: TraitQuestion[] = [
  { id: "t1", axis: "social", prompt: "初対面の場でのあなたは?", choices: [
    { label: "自分から話しかけることが多い", pole: 0 },
    { label: "相手の話をよく聞く方だ", pole: 1 }] },
  { id: "t2", axis: "social", prompt: "会議やMTGでは?", choices: [
    { label: "積極的に発言して進める", pole: 0 },
    { label: "聞いて要点を捉える", pole: 1 }] },
  { id: "t3", axis: "judge", prompt: "判断するとき重視するのは?", choices: [
    { label: "事実とロジック", pole: 0 },
    { label: "相手の気持ちや状況", pole: 1 }] },
  { id: "t4", axis: "judge", prompt: "意見が対立したとき?", choices: [
    { label: "筋を通すことを優先する", pole: 0 },
    { label: "関係を保つことを優先する", pole: 1 }] },
  { id: "t5", axis: "drive", prompt: "仕事の進め方は?", choices: [
    { label: "計画を立ててから進める", pole: 0 },
    { label: "状況を見ながら動く", pole: 1 }] },
  { id: "t6", axis: "drive", prompt: "予定の変更に対して?", choices: [
    { label: "事前に整えておきたい", pole: 0 },
    { label: "その場で柔軟に対応できる", pole: 1 }] },
  { id: "t7", axis: "scope", prompt: "物事を見るとき、まず?", choices: [
    { label: "全体像から入る", pole: 0 },
    { label: "具体的なところから入る", pole: 1 }] },
  { id: "t8", axis: "scope", prompt: "得意なのは?", choices: [
    { label: "方向性を描くこと", pole: 0 },
    { label: "細部を詰めること", pole: 1 }] },
];

export interface AxisResult {
  key: AxisKey;
  name: string;
  poleIndex: 0 | 1; // 優勢な極
  pole: Pole;
  strength: number; // 0〜100(偏り。50=拮抗)
}

export interface TraitResult {
  code: string; // 例: ELPB(4文字)
  typeName: string;
  tagline: string;
  axes: AxisResult[];
}

// 回答(questionId -> choiceのpole 0|1)から結果を算出(コード側固定採点)
export function scoreTraits(answers: Record<string, 0 | 1>): TraitResult {
  const axes: AxisResult[] = TRAIT_AXES.map((axis) => {
    const qs = TRAIT_QUESTIONS.filter((q) => q.axis === axis.key);
    let p0 = 0;
    let p1 = 0;
    let answered = 0;
    for (const q of qs) {
      const a = answers[q.id];
      if (a !== 0 && a !== 1) continue;
      answered += 1;
      if (a === 0) p0 += 1;
      else p1 += 1;
    }
    const poleIndex: 0 | 1 = p1 > p0 ? 1 : 0; // 同点は0側
    const diff = Math.abs(p0 - p1);
    const strength = answered > 0 ? Math.round(50 + (diff / answered) * 50) : 50;
    return { key: axis.key, name: axis.name, poleIndex, pole: axis.poles[poleIndex], strength };
  });

  const code = axes.map((a) => a.pole.code).join("");
  // タイプ名は最も偏りが大きい軸の極ラベルから導く(参考)
  const dominant = [...axes].sort((a, b) => b.strength - a.strength)[0];
  const typeName = dominant.pole.label;
  const tagline = axes.map((a) => a.pole.label).join(" × ");

  return { code, typeName, tagline, axes };
}
