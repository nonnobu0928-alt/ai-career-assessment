import type { CompetencyEval, ProfileV2 } from "./types";

// ============================================================
// 一気 IKKI — 企業向け匿名カード (v0.3 F3-1b)
//
// 企業プールに出すのは匿名要約のみ。氏名・会話ログ全文・発言の逐語引用は
// 含めない(引用はマッチ成立 かつ log_disclosure_consent 時に別途開示)。
// マッチ前の「探す」段階での情報漏洩を構造的に防ぐ。
// ============================================================

export interface AnonymizedCard {
  id: string;
  initial: string; // 氏名の頭文字のみ
  role: string;
  years: string;
  catchcopy: string | null; // AI所見(氏名を含まない)
  summary: string | null;
  // コンピテンシーは点数のみ(根拠引用は載せない)
  competencies: { key: string; name: string; score: number | null }[];
  quant_facts: { label: string; value: string }[]; // 数値のみ・出典引用は載せない
  values: string[];
  match_roles: string[];
  match_score: number | null;
  salary: { min: number; max: number } | null;
  substitutability: number | null; // 一次代替充足度
  log_disclosure_consent: boolean; // 発言原文の開示に同意済みか
}

type CardRow = {
  id: string;
  name: string;
  role: string;
  years: string;
  profile: ProfileV2;
  log_disclosure_consent?: boolean;
};

export function toAnonymizedCard(row: CardRow): AnonymizedCard {
  const p = row.profile;
  const comp = (p.competencies ?? []) as CompetencyEval[];
  return {
    id: row.id,
    initial: (row.name || "—").trim().slice(0, 1),
    role: row.role,
    years: row.years,
    catchcopy: p.catchcopy?.text ?? null,
    summary: p.summary?.text ?? null,
    competencies: comp.map((c) => ({ key: c.key, name: c.name, score: c.score })),
    quant_facts: (p.quant_facts ?? []).map((f) => ({ label: f.label, value: f.value })),
    values: p.values ?? [],
    match_roles: p.match_roles ?? [],
    match_score: p.match_score,
    salary: p.salary ? { min: p.salary.min, max: p.salary.max } : null,
    substitutability: p.quality?.completeness?.substitutability ?? null,
    log_disclosure_consent: Boolean(row.log_disclosure_consent),
  };
}
