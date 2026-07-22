import type { CompletenessSignals, Completeness } from "./types";

// ============================================================
// 一気 IKKI — 一次代替充足度 (v0.3 F2-4)
//
// v0.2 の Card Quality Score(引用カバー率等)に、書類提出済/コミュ試験
// 受験済/面接受験済の充足フラグを合算し、「このカードは一次面接を代替
// できる充足度か」を1指標(substitutability 0〜100)に集約する。
// 企業側の足切り・並べ替えに使えるようにする。
// ============================================================

// クライアントのlocalStorageから充足シグナルを読む(本人の活動履歴)
export function readSignals(): CompletenessSignals {
  const has = (key: string, check: (v: unknown) => boolean) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      return check(JSON.parse(raw));
    } catch {
      return false;
    }
  };
  return {
    interview_taken: true, // カード生成時は面接済み
    resume_confirmed: has("ikki-resume-v1", (v) => Boolean((v as { confirmed_by_user?: boolean })?.confirmed_by_user)),
    comm_test_taken: has("ikki-commtest-results-v1", (v) => Array.isArray(v) && v.length > 0),
    voice_taken: has("ikki-voice-v1", (v) => Boolean((v as { done?: boolean })?.done)),
  };
}

// 品質総合(0〜100)と充足シグナルから一次代替充足度を算出。
// 内訳: 面接の質 60% + 各充足フラグ 各10pt(書類/コミュ/音声/面接実施)
export function computeCompleteness(
  qualityTotal: number,
  s: CompletenessSignals,
): Completeness {
  const substitutability = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        0.6 * qualityTotal +
          (s.interview_taken ? 10 : 0) +
          (s.resume_confirmed ? 10 : 0) +
          (s.comm_test_taken ? 10 : 0) +
          (s.voice_taken ? 10 : 0),
      ),
    ),
  );
  return { ...s, substitutability };
}
