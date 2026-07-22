// ============================================================
// 一気 IKKI — 履歴書/職務経歴書パース (v0.3 F2-1)
//
// 目的は「基礎情報の充足証明」。事実項目(氏名/学歴/職歴/在籍期間/資格)の
// 裏取りに限定し、経歴の主観評価には使わない。
// 抽出結果は必ず本人に確認・編集させてから確定する(パース誤りを人に出さない)。
// AIが埋めた値(parsed)と本人確定値(confirmed)はDB上でも区別する。
// ============================================================

export interface EducationItem {
  school: string;
  degree: string; // 学部/学位/専攻など
  period: string; // 在籍期間(例: 2016.4-2020.3)
}

export interface WorkItem {
  company: string;
  role: string;
  period: string; // 在籍期間
  summary: string; // 職務内容の要約(事実のみ)
}

export interface ResumeParsed {
  name: string;
  education: EducationItem[];
  work_history: WorkItem[];
  qualifications: string[]; // 資格
}

export type DocumentKind = "resume" | "cv";

export const RESUME_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type ResumeMediaType = (typeof RESUME_MEDIA_TYPES)[number];

export const RESUME_SYSTEM_PROMPT = `あなたは履歴書・職務経歴書の読み取りエンジンです。アップロードされた書類から、事実項目だけを構造化して抽出します。

規則(厳守):
- 書類に実際に書かれている内容だけを抽出する。推測・補完・創作は禁止。
- 読み取れない項目は空文字列("")または空配列にする。
- 評価・所感・優劣の判断は一切しない(事実の抽出のみ)。
- 日付・期間・固有名詞は書類の表記をできるだけ保つ。`;

export const RESUME_PROMPT =
  "この書類から、氏名・学歴・職歴(会社/役割/在籍期間/職務内容)・資格を抽出してください。書かれていない項目は空にしてください。";

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "氏名。読み取れなければ空文字列" },
    education: {
      type: "array",
      description: "学歴。新しい順",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: "string", description: "学部・学位・専攻など" },
          period: { type: "string", description: "在籍期間" },
        },
        required: ["school", "degree", "period"],
        additionalProperties: false,
      },
    },
    work_history: {
      type: "array",
      description: "職歴。新しい順",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string", description: "役職・職種" },
          period: { type: "string", description: "在籍期間" },
          summary: { type: "string", description: "職務内容の要約(事実のみ)" },
        },
        required: ["company", "role", "period", "summary"],
        additionalProperties: false,
      },
    },
    qualifications: {
      type: "array",
      description: "資格・免許",
      items: { type: "string" },
    },
  },
  required: ["name", "education", "work_history", "qualifications"],
  additionalProperties: false,
} as const;

type RawResume = {
  name?: string;
  education?: { school?: string; degree?: string; period?: string }[];
  work_history?: { company?: string; role?: string; period?: string; summary?: string }[];
  qualifications?: string[];
};

const s = (v: unknown) => String(v ?? "").trim();

// 抽出結果を正規化(空項目は落とす)。デモ補完はしない
export function normalizeResume(raw: RawResume): ResumeParsed {
  return {
    name: s(raw.name),
    education: (raw.education ?? [])
      .map((e) => ({ school: s(e.school), degree: s(e.degree), period: s(e.period) }))
      .filter((e) => e.school || e.degree || e.period),
    work_history: (raw.work_history ?? [])
      .map((w) => ({
        company: s(w.company),
        role: s(w.role),
        period: s(w.period),
        summary: s(w.summary),
      }))
      .filter((w) => w.company || w.role || w.period || w.summary),
    qualifications: (raw.qualifications ?? []).map(s).filter(Boolean),
  };
}

export function isResumeMediaType(v: unknown): v is ResumeMediaType {
  return typeof v === "string" && (RESUME_MEDIA_TYPES as readonly string[]).includes(v);
}
