import { barsText, competencyPromptSection } from "./competencyModel";
import type {
  CandidateInput,
  ChatMessage,
  CompetencyEval,
  Confidence,
  ProfileV2,
} from "./types";
import { COMPETENCY_MODEL } from "./competencyModel";

// ============================================================
// 一気 IKKI — プロンプトと正規化(サーバー専用)
//
// v0.2設計思想:
// - グラウンディング: 会話ログに存在しない事実・数字・固有名詞・
//   エピソードを一切生成させない。evidence_quote は逐語引用を強制し、
//   lib/grounding.ts でサーバー照合する(プロンプトだけを信用しない)
// - 誠実な欠損: 根拠のない項目は空(→null)にさせる。
//   デモデータによる補完・マージは行わない
// - 面接エンジン(パッケージB): 質問の決定はコード側(interviewEngine)。
//   LLMは「回答からのスロット抽出」と「質問テンプレの温かい整形」のみ担当
// ============================================================

function basicsLine(p: CandidateInput): string {
  const b = p.basics;
  if (!b) return "";
  const parts = [
    b.industry && `業界: ${b.industry}`,
    b.team_size && `チーム規模: ${b.team_size}`,
    b.management && `マネジメント経験: ${b.management}`,
    b.kpi && `主要KPI: ${b.kpi}`,
  ].filter(Boolean);
  return parts.length ? `\n基礎情報(本人申告): ${parts.join(" / ")}` : "";
}

// ---------- 面接エンジン: スロット抽出 ----------

export const EXTRACTION_SYSTEM_PROMPT = `あなたは面談回答の抽出エンジンです。候補者の直前の回答から、エピソードの各スロットに該当する内容だけを抽出します。

規則(厳守):
- 回答に実際に含まれている情報だけを抽出する。推測・补完は禁止。
- 数字は回答に出てきたものをそのまま使う。
- 該当する内容が回答に含まれないスロットは空文字列("")にする。
- 各スロットは35字以内に要約する(数字・固有名詞は落とさない)。`;

export function buildExtractionPrompt(answer: string): string {
  return `候補者の回答:
${answer}

この回答から各スロットに該当する内容を抽出してください。
- situation: 組織規模・本人の役割・期間
- challenge: 何が問題だったか
- action: 本人自身の行動(他者の行動は含めない)
- result_quant: 定量的な結果(数字を含む場合のみ)
- reproducibility: なぜ上手くいったか・工夫の言語化`;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    situation: { type: "string", description: "組織規模/役割/期間。なければ空文字列" },
    challenge: { type: "string", description: "何が問題だったか。なければ空文字列" },
    action: { type: "string", description: "本人の行動。なければ空文字列" },
    result_quant: { type: "string", description: "定量的な結果。数字がなければ空文字列" },
    reproducibility: { type: "string", description: "工夫・上手くいった理由。なければ空文字列" },
  },
  required: ["situation", "challenge", "action", "result_quant", "reproducibility"],
  additionalProperties: false,
} as const;

// ---------- 面接エンジン: 質問の整形 ----------

export const QUESTION_FORMAT_SYSTEM_PROMPT = `あなたは転職サービス「一気(IKKI)」のキャリアエージェントAIです。評価者ではなく、候補者の味方・代理人として振る舞います。

タスク: 与えられた「次の質問」を、直前の回答への短い共感・受け止めを一言添えた、温かい言い回しに整形してください。

規則(厳守):
- 質問の意味・聞いている内容は一切変えない。質問は1つだけ。
- 全体で2〜4文、簡潔に。丁寧だが堅すぎない敬語。
- 候補者の回答にない事実を勝手に言及しない。
- 整形後のメッセージだけを出力する(前置き・説明は不要)。`;

export function buildQuestionFormatPrompt(
  p: CandidateInput,
  lastAnswer: string | null,
  questionText: string,
): string {
  return `候補者: ${p.name}さん / 職種: ${p.role} / 経験: ${p.years}${basicsLine(p)}

直前の候補者の回答:
${lastAnswer ?? "(まだ回答はありません)"}

次の質問(この内容を変えずに整形):
${questionText}`;
}

// ---------- 解析(キャリアカード生成) ----------

export const ANALYSIS_SYSTEM_PROMPT = `あなたは転職サービス「一気(IKKI)」の解析エンジンです。キャリア面談の会話ログから、候補者のキャリアカードを生成します。

規則(厳守):
- 会話ログに存在しない事実・数字・固有名詞・エピソードを生成してはならない。
- evidence_quote は「候補者:」の発言から一字一句そのまま抜き出す。要約・言い換え・語尾の変更・複数発言の結合は禁止。
- カード上のすべての数字は、候補者が実際に発言した数字だけを使う(想定年収を除く)。
- 根拠となる発言が見つからない項目は、文字列は空文字列("")、数値は0、配列は空にする。推測・一般論・埋め草での補完は禁止。埋めた嘘より、正直な空欄が信頼を作る。
- interpretation や summary などの解釈文も、引用した発言から直接言えることだけを書く。
- コンピテンシー採点は、指定のBARS基準に該当する行動が発言から確認できる場合のみ行う。基準文と引用が揃わない項目は score 0 (評価保留)にする。`;

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
- episodes: 面談で扱ったエピソードを最大2件。各スロット35字以内。該当する発言がないスロットは空文字列
- values / match_roles: 各最大3件(6字/12字以内)
- salary_min / salary_max: 職種と経験年数の一般的な市場レンジによる万円の整数(これのみログ外の推定を許可)
- match_score: 75〜96の整数。会話の情報量が少ない場合は0

コンピテンシー採点(BARS行動基準。scoreは該当する基準の数字。確認できなければ0):
${competencyPromptSection()}

候補者: ${p.name} / ${p.role} / 経験${p.years}${basicsLine(p)}
会話ログ:
${transcript}`;
}

// 引用照合に失敗した項目がある場合の再生成指示(1回だけ)
export function buildRetryNote(dropped: string[]): string {
  return `

【重要】前回の出力には、会話ログと一致しない引用、または候補者が発言していない数字が含まれていました:
${dropped.map((d) => "- " + d).join("\n")}
すべての evidence_quote を候補者の発言から一字一句そのまま抜き出し直してください。根拠となる発言が存在しない項目は空文字列(scoreは0)にしてください。`;
}

const CONFIDENCE = { type: "string", enum: ["high", "med", "low"] } as const;

const EPISODE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    situation: { type: "string", description: "組織規模・役割・期間(35字以内)" },
    challenge: { type: "string", description: "何が問題だったか(35字以内)" },
    action: { type: "string", description: "本人の行動(35字以内)" },
    result_quant: { type: "string", description: "定量的な結果(35字以内・発言した数字のみ)" },
    reproducibility: { type: "string", description: "なぜ上手くいったか・工夫(35字以内)" },
    evidence_quote: { type: "string", description: "エピソードの中核となる逐語引用(40字以内)" },
  },
  required: [
    "situation",
    "challenge",
    "action",
    "result_quant",
    "reproducibility",
    "evidence_quote",
  ],
  additionalProperties: false,
} as const;

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
    episodes: {
      type: "array",
      description: "面談で扱ったエピソード。最大2件",
      items: EPISODE_ITEM_SCHEMA,
    },
    competencies: {
      type: "array",
      description: "コンピテンシー採点。5項目すべてを含める(確認できない項目はscore 0)",
      items: {
        type: "object",
        properties: {
          key: {
            type: "string",
            enum: COMPETENCY_MODEL.map((c) => c.key),
          },
          score: {
            type: "integer",
            description: "該当するBARS基準の数字1〜5。基準と引用が揃わなければ0",
          },
          evidence_quote: {
            type: "string",
            description: "採点根拠となる逐語引用(40字以内)。score 0なら空文字列",
          },
          confidence: CONFIDENCE,
        },
        required: ["key", "score", "evidence_quote", "confidence"],
        additionalProperties: false,
      },
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
    "episodes",
    "competencies",
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
type RawEpisode = {
  situation?: string;
  challenge?: string;
  action?: string;
  result_quant?: string;
  reproducibility?: string;
  evidence_quote?: string;
};

type RawAnalysis = {
  catchcopy?: { text?: string; confidence?: Confidence };
  summary?: { text?: string; confidence?: Confidence };
  strengths?: { title?: string; evidence_quote?: string; interpretation?: string; confidence?: Confidence }[];
  quant_facts?: { label?: string; value?: string; evidence_quote?: string }[];
  episodes?: RawEpisode[];
  competencies?: { key?: string; score?: number; evidence_quote?: string; confidence?: Confidence }[];
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

// コンピテンシー: BARS基準文は必ず定数から引く(LLM出力を使わない)。
// score 0 や未知キーは評価保留にする
function toCompetencies(raw: RawAnalysis["competencies"]): CompetencyEval[] {
  const byKey = new Map(
    (raw ?? []).map((c) => [String(c.key ?? ""), c] as const),
  );
  return COMPETENCY_MODEL.map((def) => {
    const r = byKey.get(def.key);
    const score = Math.round(Number(r?.score ?? 0));
    const quote = orNull(r?.evidence_quote);
    const text = score >= 1 && score <= 5 ? barsText(def.key, score) : null;
    if (!r || !text || !quote) {
      return {
        key: def.key,
        name: def.name,
        score: null,
        bars_text: null,
        evidence_quote: null,
        confidence: null,
      };
    }
    return {
      key: def.key,
      name: def.name,
      score,
      bars_text: text,
      evidence_quote: quote,
      confidence: conf(r.confidence),
    };
  });
}

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

  const episodes = (raw.episodes ?? [])
    .slice(0, 2)
    .map((ep) => ({
      situation: orNull(ep.situation),
      challenge: orNull(ep.challenge),
      action: orNull(ep.action),
      result_quant: orNull(ep.result_quant),
      reproducibility: orNull(ep.reproducibility),
      evidence_quote: orNull(ep.evidence_quote),
    }))
    .filter((ep) => Object.values(ep).some((v) => v !== null));
  if (episodes.length === 0) insufficient.push("episode");

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
    basics: candidate.basics,
    catchcopy: catchText ? { text: catchText, confidence: conf(raw.catchcopy?.confidence) } : null,
    summary: summaryText ? { text: summaryText, confidence: conf(raw.summary?.confidence) } : null,
    strengths,
    quant_facts: quantFacts,
    episodes,
    competencies: toCompetencies(raw.competencies),
    highlight,
    values: (raw.values ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
    match_roles: (raw.match_roles ?? []).map((r) => String(r).trim()).filter(Boolean).slice(0, 3),
    match_score: clampInt(raw.match_score, 75, 96),
    salary,
    insufficient,
  };
}
