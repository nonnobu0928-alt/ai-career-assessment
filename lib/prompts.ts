import type {
  CandidateInput,
  ChatMessage,
  Confidence,
  ProfileV2,
} from "./types";

// ============================================================
// 一気 IKKI — プロンプトと正規化(サーバー専用)
//
// v0.2設計思想:
// - グラウンディング: 会話ログに存在しない事実・数字・固有名詞・
//   エピソードを一切生成させない。evidence_quote は逐語引用を強制し、
//   lib/grounding.ts でサーバー照合する(プロンプトだけを信用しない)
// - 誠実な欠損: 根拠のない項目は空(→null)にさせる。
//   デモデータによる補完・マージは行わない(v0.1から完全撤去済み)
// - structured outputs でスキーマを強制する。null相当は空文字列で
//   出力させ、サーバー側で null に変換する(スキーマのユニオン型に
//   依存しないため出力が安定する)
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

export const ANALYSIS_SYSTEM_PROMPT = `あなたは転職サービス「一気(IKKI)」の解析エンジンです。キャリア面談の会話ログから、候補者のキャリアカードを生成します。

規則(厳守):
- 会話ログに存在しない事実・数字・固有名詞・エピソードを生成してはならない。
- evidence_quote は「候補者:」の発言から一字一句そのまま抜き出す。要約・言い換え・語尾の変更・複数発言の結合は禁止。
- カード上のすべての数字は、候補者が実際に発言した数字だけを使う(想定年収を除く)。
- 根拠となる発言が見つからない項目は、文字列は空文字列("")、数値は0、配列は空にする。推測・一般論・埋め草での補完は禁止。埋めた嘘より、正直な空欄が信頼を作る。
- interpretation や summary などの解釈文も、引用した発言から直接言えることだけを書く。`;

export function buildAnalysisPrompt(
  p: CandidateInput,
  messages: ChatMessage[],
): string {
  const transcript = messages
    .map((m) => (m.role === "user" ? "候補者: " : "エージェント: ") + m.content)
    .join("\n");
  return `以下のキャリア面談の会話ログを分析し、指定スキーマのJSONを出力してください。すべて日本語。

文字数の目安:
- catchcopy 18字以内 / summary 90字以内
- strengths: 最大3件。title 8字以内 / evidence_quote 40字以内(逐語) / interpretation 45字以内
- quant_facts: ログに現れた定量的な事実(数字・規模・期間)を最大6件。labelは項目名、valueは数字を含む値
- episode: 各スロット35字以内。該当する発言がないスロットは空文字列
- values / match_roles: 各最大3件(6字/12字以内)
- salary_min / salary_max: 職種と経験年数の一般的な市場レンジによる万円の整数(これのみログ外の推定を許可)
- match_score: 75〜96の整数。会話の情報量が少ない場合は0

候補者: ${p.name} / ${p.role} / 経験${p.years}
会話ログ:
${transcript}`;
}

// 引用照合に失敗した項目がある場合の再生成指示(1回だけ)
export function buildRetryNote(dropped: string[]): string {
  return `

【重要】前回の出力には、会話ログと一致しない引用、または候補者が発言していない数字が含まれていました:
${dropped.map((d) => "- " + d).join("\n")}
すべての evidence_quote を候補者の発言から一字一句そのまま抜き出し直してください。根拠となる発言が存在しない項目は空文字列にしてください。`;
}

const CONFIDENCE = { type: "string", enum: ["high", "med", "low"] } as const;

export const PROFILE_SCHEMA_V2 = {
  type: "object",
  properties: {
    catchcopy: {
      type: "object",
      description: "候補者を一言で表すキャッチコピー(AI所見)。根拠が薄ければtextは空文字列",
      properties: { text: { type: "string" }, confidence: CONFIDENCE },
      required: ["text", "confidence"],
      additionalProperties: false,
    },
    summary: {
      type: "object",
      description: "経歴と強みのサマリー(AI所見)。ログから言えることのみ",
      properties: { text: { type: "string" }, confidence: CONFIDENCE },
      required: ["text", "confidence"],
      additionalProperties: false,
    },
    strengths: {
      type: "array",
      description: "強み。根拠引用が取れるものだけ。最大3件",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "強みの名称(8字以内)" },
          evidence_quote: {
            type: "string",
            description: "候補者の発言からの逐語引用(40字以内・一字一句そのまま)",
          },
          interpretation: { type: "string", description: "引用から言える解釈(45字以内)" },
          confidence: CONFIDENCE,
        },
        required: ["title", "evidence_quote", "interpretation", "confidence"],
        additionalProperties: false,
      },
    },
    quant_facts: {
      type: "array",
      description: "ログに現れた定量的事実。数字は発言どおり。最大6件",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "項目名(例: 担当顧客数)" },
          value: { type: "string", description: "値(例: 30社)。候補者が発言した数字のみ" },
          evidence_quote: { type: "string", description: "出典となる逐語引用(40字以内)" },
        },
        required: ["label", "value", "evidence_quote"],
        additionalProperties: false,
      },
    },
    episode: {
      type: "object",
      description: "代表エピソード。該当発言がないスロットは空文字列",
      properties: {
        situation: { type: "string", description: "組織規模・役割・期間(35字以内)" },
        challenge: { type: "string", description: "何が問題だったか(35字以内)" },
        action: { type: "string", description: "本人の行動(35字以内)" },
        result_quant: { type: "string", description: "定量的な結果(35字以内・発言した数字のみ)" },
        reproducibility: { type: "string", description: "なぜ上手くいったか・工夫(35字以内)" },
        evidence_quote: { type: "string", description: "エピソードの中核となる逐語引用(40字以内)" },
      },
      required: ["situation", "challenge", "action", "result_quant", "reproducibility", "evidence_quote"],
      additionalProperties: false,
    },
    values: {
      type: "array",
      description: "仕事で大切にする価値観(各6字以内)。発言から読み取れるもののみ。最大3件",
      items: { type: "string" },
    },
    match_roles: {
      type: "array",
      description: "適性の高い職種(各12字以内)。最大3件",
      items: { type: "string" },
    },
    highlight: {
      type: "object",
      description: "面談で最も印象的だった発言。引用が取れなければevidence_quoteは空文字列",
      properties: {
        evidence_quote: { type: "string", description: "候補者の発言からの逐語引用(40字以内)" },
        interpretation: { type: "string", description: "その発言が示すこと(45字以内)" },
        confidence: CONFIDENCE,
      },
      required: ["evidence_quote", "interpretation", "confidence"],
      additionalProperties: false,
    },
    salary_min: { type: "integer", description: "想定年収下限(万円)。算出不能なら0" },
    salary_max: { type: "integer", description: "想定年収上限(万円)。算出不能なら0" },
    match_score: { type: "integer", description: "マッチ度75〜96。情報不足なら0" },
  },
  required: [
    "catchcopy",
    "summary",
    "strengths",
    "quant_facts",
    "episode",
    "values",
    "match_roles",
    "highlight",
    "salary_min",
    "salary_max",
    "match_score",
  ],
  additionalProperties: false,
} as const;

// LLMの生出力(構造は上のスキーマ)をProfileV2へ正規化する。
// デモデータによる補完・マージは行わない。空文字列/0はnullにする
type RawAnalysis = {
  catchcopy?: { text?: string; confidence?: Confidence };
  summary?: { text?: string; confidence?: Confidence };
  strengths?: { title?: string; evidence_quote?: string; interpretation?: string; confidence?: Confidence }[];
  quant_facts?: { label?: string; value?: string; evidence_quote?: string }[];
  episode?: {
    situation?: string;
    challenge?: string;
    action?: string;
    result_quant?: string;
    reproducibility?: string;
    evidence_quote?: string;
  };
  values?: string[];
  match_roles?: string[];
  highlight?: { evidence_quote?: string; interpretation?: string; confidence?: Confidence };
  salary_min?: number;
  salary_max?: number;
  match_score?: number;
};

const orNull = (s: unknown): string | null => {
  const t = String(s ?? "").trim();
  return t === "" ? null : t;
};

const conf = (c: unknown): Confidence =>
  c === "high" || c === "med" || c === "low" ? c : "low";

export function toProfileV2(raw: RawAnalysis, candidate: CandidateInput): ProfileV2 {
  const insufficient: string[] = [];

  const catchText = orNull(raw.catchcopy?.text);
  const summaryText = orNull(raw.summary?.text);
  if (!catchText) insufficient.push("catchcopy");
  if (!summaryText) insufficient.push("summary");

  const strengths = (raw.strengths ?? [])
    .filter((s) => orNull(s.title) && orNull(s.evidence_quote))
    .slice(0, 3)
    .map((s) => ({
      title: String(s.title).trim(),
      evidence_quote: String(s.evidence_quote).trim(),
      interpretation: String(s.interpretation ?? "").trim(),
      confidence: conf(s.confidence),
    }));
  if (strengths.length === 0) insufficient.push("strengths");

  const quantFacts = (raw.quant_facts ?? [])
    .filter((f) => orNull(f.label) && orNull(f.value) && orNull(f.evidence_quote))
    .slice(0, 6)
    .map((f) => ({
      label: String(f.label).trim(),
      value: String(f.value).trim(),
      evidence_quote: String(f.evidence_quote).trim(),
    }));
  if (quantFacts.length === 0) insufficient.push("quant_facts");

  const ep = raw.episode ?? {};
  const episode = {
    situation: orNull(ep.situation),
    challenge: orNull(ep.challenge),
    action: orNull(ep.action),
    result_quant: orNull(ep.result_quant),
    reproducibility: orNull(ep.reproducibility),
    evidence_quote: orNull(ep.evidence_quote),
  };
  const epHasContent = Object.values(episode).some((v) => v !== null);
  if (!epHasContent) insufficient.push("episode");

  const hq = orNull(raw.highlight?.evidence_quote);
  const highlight = hq
    ? {
        evidence_quote: hq,
        interpretation: String(raw.highlight?.interpretation ?? "").trim(),
        confidence: conf(raw.highlight?.confidence),
      }
    : null;
  if (!highlight) insufficient.push("highlight");

  const clampInt = (v: unknown, min: number, max: number): number | null => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(min, Math.min(max, n));
  };
  const salaryMin = clampInt(raw.salary_min, 200, 3000);
  const salaryMaxRaw = clampInt(raw.salary_max, 200, 3000);
  const salary =
    salaryMin && salaryMaxRaw
      ? {
          min: salaryMin,
          max: Math.max(salaryMin, salaryMaxRaw),
          basis: `${candidate.role || "同職種"} × 経験${candidate.years}の一般的な市場レンジに基づく参考値`,
        }
      : null;
  if (!salary) insufficient.push("salary");

  return {
    schema_version: 2,
    name: candidate.name || "候補者",
    role: candidate.role || "—",
    years: candidate.years || "—",
    catchcopy: catchText ? { text: catchText, confidence: conf(raw.catchcopy?.confidence) } : null,
    summary: summaryText ? { text: summaryText, confidence: conf(raw.summary?.confidence) } : null,
    strengths,
    quant_facts: quantFacts,
    episodes: epHasContent ? [episode] : [],
    highlight,
    values: (raw.values ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
    match_roles: (raw.match_roles ?? []).map((r) => String(r).trim()).filter(Boolean).slice(0, 3),
    match_score: clampInt(raw.match_score, 75, 96),
    salary,
    insufficient,
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
