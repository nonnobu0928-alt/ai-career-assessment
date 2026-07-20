import type { CandidateInput, ChatMessage, Profile } from "./types";

// ============================================================
// 一気 IKKI — プロンプトと解析ロジック(サーバー専用)
//
// 設計思想:
// - 面談AIは「評価者ではなく候補者の味方・代理人」。全6問・1問ずつ、
//   STARで深掘りし、終了時に必ず「【面談終了】」マーカーを出す。
// - 解析はstructured outputs(JSONスキーマ強制)で行い、フロントには
//   正規化済みのProfileだけを返す。プロンプト・スキーマ・APIキーは
//   クライアントに一切出さない。
// - LLM出力は信用しすぎない: 件数・数値レンジはサーバー側で必ず
//   クランプし、欠損はデモプロファイルで埋める(プロトタイプ由来の
//   「壊れないカード」思想)。
// ============================================================

export function buildInterviewSystemPrompt(p: CandidateInput): string {
  return `あなたは転職サービス「一気(IKKI)」のキャリアエージェントAIです。求職者とのキャリア棚卸し面談を担当します。

候補者: ${p.name}さん / 職種: ${p.role} / 経験: ${p.years}

進め方(厳守):
- 一度に必ず1つだけ質問する。あなたの発言は3〜5文で簡潔に。
- 相手の回答への短い共感や要約を一言添えてから、次の質問へ移る。
- 成果の話はSTAR(状況・課題・行動・結果)を意識して深掘りし、可能なら具体的な数字を尋ねる。
- 全6問。順序: (1)現在の業務内容と役割 (2)最も成果を出した経験 (3)その経験の深掘り(工夫・行動) (4)苦労したことと乗り越え方 (5)転職で実現したいこと・大切にする価値観 (6)希望条件(年収・働き方)。
- 6問目の回答を受け取ったら、感謝と面談の短い総括(2文)を述べ、最後に必ず改行して「【面談終了】」とだけ書く。
- 丁寧だが堅すぎない敬語。評価者ではなく、候補者の味方・代理人として振る舞う。`;
}

export function buildAnalysisPrompt(
  p: CandidateInput,
  messages: ChatMessage[],
): string {
  const transcript = messages
    .map((m) => (m.role === "user" ? "候補者: " : "エージェント: ") + m.content)
    .join("\n");
  return `以下はキャリア面談の会話ログです。内容を分析し、指定スキーマのJSONを出力してください。すべて日本語。

制約:
- catchcopyは18字以内 / summaryは90字以内
- strengthsはちょうど3件(title 8字以内・descは会話から読み取れた根拠45字以内)
- skillsはちょうど5件(name 6字以内・scoreは1〜5の整数)
- valuesはちょうど3件(各6字以内) / matchRolesはちょうど3件(各12字以内)
- episodeは各35字以内 / highlightは45字以内
- salaryMin・salaryMaxは万円の整数 / matchScoreは75〜96の整数

候補者: ${p.name} / ${p.role} / 経験${p.years}
会話ログ:
${transcript}`;
}

// structured outputs 用スキーマ。件数制約はモデル任せにせず
// normalizeProfile() で最終保証する
export const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    catchcopy: { type: "string", description: "候補者を一言で表すキャッチコピー(18字以内)" },
    summary: { type: "string", description: "経歴と強みのサマリー(90字以内)" },
    strengths: {
      type: "array",
      description: "強み。ちょうど3件",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "強み(8字以内)" },
          desc: { type: "string", description: "会話から読み取れた根拠(45字以内)" },
        },
        required: ["title", "desc"],
        additionalProperties: false,
      },
    },
    skills: {
      type: "array",
      description: "スキル評価。ちょうど5件",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "スキル名(6字以内)" },
          score: { type: "integer", description: "1〜5の整数" },
        },
        required: ["name", "score"],
        additionalProperties: false,
      },
    },
    values: {
      type: "array",
      description: "仕事で大切にする価値観(各6字以内)。ちょうど3件",
      items: { type: "string" },
    },
    episode: {
      type: "object",
      properties: {
        situation: { type: "string", description: "状況(35字以内)" },
        action: { type: "string", description: "行動(35字以内)" },
        result: { type: "string", description: "成果(35字以内)" },
      },
      required: ["situation", "action", "result"],
      additionalProperties: false,
    },
    salaryMin: { type: "integer", description: "想定年収下限(万円)" },
    salaryMax: { type: "integer", description: "想定年収上限(万円)" },
    matchRoles: {
      type: "array",
      description: "適性の高い職種(各12字以内)。ちょうど3件",
      items: { type: "string" },
    },
    highlight: { type: "string", description: "面談で最も印象的だった発言の要約(45字以内)" },
    matchScore: { type: "integer", description: "企業とのマッチ度想定(75〜96の整数)" },
  },
  required: [
    "catchcopy",
    "summary",
    "strengths",
    "skills",
    "values",
    "episode",
    "salaryMin",
    "salaryMax",
    "matchRoles",
    "highlight",
    "matchScore",
  ],
  additionalProperties: false,
} as const;

// 解析に失敗・欠損した場合の埋め草(プロトタイプのデモデータ)
export const DEMO_PROFILE: Omit<Profile, "name" | "role" | "years"> = {
  catchcopy: "信頼を積み上げる提案型セールス",
  summary:
    "SaaS法人営業5年。新規開拓から大手深耕まで一貫して担当し、直近は12四半期連続で目標達成。数字と誠実さの両立が持ち味。",
  strengths: [
    { title: "仮説提案力", desc: "顧客の決算資料から課題を先回りし、初回商談で提案まで持ち込む" },
    { title: "社内巻き込み", desc: "CSと連携した導入設計で、担当顧客の解約率を半減させた" },
    { title: "継続力", desc: "12四半期連続で目標達成。失注商談も翌年の資産に変える" },
  ],
  skills: [
    { name: "新規開拓", score: 5 },
    { name: "提案構築", score: 4 },
    { name: "交渉", score: 4 },
    { name: "顧客深耕", score: 5 },
    { name: "育成", score: 3 },
  ],
  values: ["顧客起点", "誠実さ", "挑戦"],
  episode: {
    situation: "大手顧客が利用低迷し、更新停止の危機に",
    action: "利用データを分析し、月次の活用会を自ら企画・実施",
    result: "解約を回避し、契約額1.4倍で更新を獲得",
  },
  salaryMin: 550,
  salaryMax: 720,
  matchRoles: ["エンタープライズ営業", "カスタマーサクセス責任者", "営業企画"],
  highlight: "「失注した商談ほど、翌年の最大の資産になる」という言葉に営業観が表れていた",
  matchScore: 92,
};

// LLM出力をカードとして「壊れない」形に正規化する
export function normalizeProfile(
  raw: Partial<Profile>,
  candidate: CandidateInput,
): Profile {
  const merged = { ...DEMO_PROFILE, ...raw };
  const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  const salaryMin = clampInt(merged.salaryMin, 200, 3000, 450);
  const salaryMax = Math.max(salaryMin, clampInt(merged.salaryMax, 200, 3000, 650));

  return {
    catchcopy: String(merged.catchcopy),
    summary: String(merged.summary),
    strengths: (merged.strengths ?? []).slice(0, 3).map((s) => ({
      title: String(s.title ?? ""),
      desc: String(s.desc ?? ""),
    })),
    skills: (merged.skills ?? []).slice(0, 5).map((s) => ({
      name: String(s.name ?? ""),
      score: clampInt(s.score, 1, 5, 3),
    })),
    values: (merged.values ?? []).slice(0, 3).map(String),
    episode: {
      situation: String(merged.episode?.situation ?? ""),
      action: String(merged.episode?.action ?? ""),
      result: String(merged.episode?.result ?? ""),
    },
    salaryMin,
    salaryMax,
    matchRoles: (merged.matchRoles ?? []).slice(0, 3).map(String),
    highlight: String(merged.highlight),
    matchScore: clampInt(merged.matchScore, 75, 96, 88),
    name: candidate.name || "候補者",
    role: candidate.role || "—",
    years: candidate.years || "3〜5年",
  };
}

// 面談終了マーカーの検出と除去
export function stripEndMarker(reply: string): { reply: string; done: boolean } {
  const done = reply.includes("【面談終了】") || reply.includes("【面接終了】");
  return {
    reply: reply.replace("【面談終了】", "").replace("【面接終了】", "").trim(),
    done,
  };
}
