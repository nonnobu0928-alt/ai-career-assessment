import type { AnonymizedCard } from "./anonymize";
import { COMPETENCY_MODEL, type CompetencyKey } from "./competencyModel";

// ============================================================
// 一気 IKKI — 候補者×合格基準の照合エンジン (v0.3 F3-2)
//
// 企業の合格基準に候補者カードを照らし、推薦/条件付/非推薦を根拠つきで
// 判定する。判定はコード側ルール(恣意性排除)。各判定の根拠(どの軸が
// 基準を満たす/満たさないか)を必ず添える(v0.2の根拠主義)。
// ============================================================

export type DocKey = "resume" | "comm_test" | "voice";

export interface HiringCriteria {
  id?: string;
  name: string;
  min_competencies: Partial<Record<CompetencyKey, number>>; // 各軸の下限点(1〜5)
  required_documents: DocKey[];
  preferred_traits: string[];
}

export type Verdict = "recommend" | "conditional" | "reject";

export interface MatchReason {
  ok: boolean;
  label: string;
  detail: string;
}

export interface MatchResult {
  verdict: Verdict;
  score: number; // 基準充足率 0〜100(並べ替え用)
  reasons: MatchReason[];
}

const DOC_LABELS: Record<DocKey, string> = {
  resume: "履歴書提出",
  comm_test: "コミュ試験",
  voice: "音声面接",
};

export function classifyCandidate(card: AnonymizedCard, criteria: HiringCriteria): MatchResult {
  const reasons: MatchReason[] = [];
  const compByKey = new Map(card.competencies.map((c) => [c.key, c.score] as const));

  // コンピテンシー基準
  const reqComp = Object.entries(criteria.min_competencies).filter(([, v]) => (v ?? 0) > 0) as [
    CompetencyKey,
    number,
  ][];
  let compMet = 0;
  for (const [key, min] of reqComp) {
    const score = compByKey.get(key) ?? null;
    const name = COMPETENCY_MODEL.find((c) => c.key === key)?.name ?? key;
    const ok = score !== null && score >= min;
    if (ok) compMet += 1;
    reasons.push({
      ok,
      label: `${name} ≥ ${min}`,
      detail: score === null ? "評価保留(根拠不足)" : `実績 ${score}/5`,
    });
  }

  // 必須書類・試験
  let docMet = 0;
  for (const doc of criteria.required_documents) {
    const c = card.completeness;
    const ok =
      doc === "resume" ? Boolean(c?.resume_confirmed)
      : doc === "comm_test" ? Boolean(c?.comm_test_taken)
      : Boolean(c?.voice_taken);
    if (ok) docMet += 1;
    reasons.push({ ok, label: DOC_LABELS[doc], detail: ok ? "提出済み" : "未提出" });
  }

  const totalReq = reqComp.length + criteria.required_documents.length;
  const totalMet = compMet + docMet;
  const score = totalReq > 0 ? Math.round((totalMet / totalReq) * 100) : 0;

  // 判定: コンピテンシーを全て満たす=推薦(書類のみ不足なら条件付)
  const compAllMet = reqComp.length === 0 || compMet === reqComp.length;
  const docAllMet = criteria.required_documents.length === 0 || docMet === criteria.required_documents.length;

  let verdict: Verdict;
  if (compAllMet && docAllMet) verdict = "recommend";
  else if (compAllMet && !docAllMet) verdict = "conditional"; // 実力は基準到達、書類待ち
  else if (reqComp.length > 0 && compMet >= Math.ceil(reqComp.length / 2)) verdict = "conditional";
  else verdict = "reject";

  return { verdict, score, reasons };
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  recommend: "推薦",
  conditional: "条件付き",
  reject: "非推薦",
};
