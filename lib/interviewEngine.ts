import {
  CLOSING_MESSAGE,
  EPISODE_OPENERS,
  SLOT_ORDER,
  SLOT_QUESTIONS,
  type QuestionDef,
  type SlotKey,
} from "./questionBank";

// ============================================================
// 一気 IKKI — 面談ステートマシン (パッケージB-2)
//
// スロット充足型の深掘り:
// - エピソード2本。各エピソードに必須5スロット(状況/課題/行動/結果/再現性)
// - 毎ターン: (1)抽出=LLM (2)方針=このファイルのコードルール (3)質問生成=LLM整形
// - 「次に何を聞くか」はLLM任せにせず、未充足スロットの優先順で決める
// - 深掘りは1エピソードにつき最大3問。埋まらないスロットは欠損として確定
//   (誠実な欠損: カード側で「未聴取」になる)
// ============================================================

export const MAX_PROBES_PER_EPISODE = 3;
export const EPISODE_COUNT = 2;

export type SlotState = Record<SlotKey, string | null>;

export interface EpisodeState {
  slots: SlotState;
  probes: number; // このエピソードで行った追い質問の数(導入質問は含まない)
}

export interface InterviewState {
  version: 1;
  episodeIndex: number; // 0 | 1
  episodes: EpisodeState[];
  done: boolean;
}

export function emptySlots(): SlotState {
  return {
    situation: null,
    challenge: null,
    action: null,
    result_quant: null,
    reproducibility: null,
  };
}

export function initInterviewState(): InterviewState {
  return {
    version: 1,
    episodeIndex: 0,
    episodes: Array.from({ length: EPISODE_COUNT }, () => ({
      slots: emptySlots(),
      probes: 0,
    })),
    done: false,
  };
}

export function isInterviewState(v: unknown): v is InterviewState {
  const s = v as InterviewState | null;
  return (
    typeof s === "object" &&
    s !== null &&
    s.version === 1 &&
    Array.isArray(s.episodes) &&
    s.episodes.length === EPISODE_COUNT
  );
}

export function unfilledSlots(ep: EpisodeState): SlotKey[] {
  return SLOT_ORDER.filter((k) => !ep.slots[k]);
}

// 抽出結果をマージする。既に埋まったスロットは上書きしない
export function mergeExtraction(
  ep: EpisodeState,
  extracted: Partial<Record<SlotKey, string>>,
): void {
  for (const key of SLOT_ORDER) {
    const v = (extracted[key] ?? "").trim();
    if (v && !ep.slots[key]) ep.slots[key] = v;
  }
}

export type NextMove =
  | { kind: "probe"; slot: SlotKey; question: QuestionDef }
  | { kind: "next_episode"; question: QuestionDef }
  | { kind: "close"; message: string };

// (2) 方針決定: コード側のルール。LLMには委ねない
export function decideNextMove(state: InterviewState): NextMove {
  const ep = state.episodes[state.episodeIndex];
  const missing = unfilledSlots(ep);

  // 現エピソードを続ける条件: 未充足スロットがあり、追い質問が3問未満
  if (missing.length > 0 && ep.probes < MAX_PROBES_PER_EPISODE) {
    const slot = missing[0]; // SLOT_ORDER = 重要度順
    ep.probes += 1;
    return { kind: "probe", slot, question: SLOT_QUESTIONS[slot] };
  }

  // 打ち切り or 完了 → 次のエピソードへ
  if (state.episodeIndex < EPISODE_COUNT - 1) {
    state.episodeIndex += 1;
    return { kind: "next_episode", question: EPISODE_OPENERS[state.episodeIndex] };
  }

  // 全エピソード終了
  state.done = true;
  return { kind: "close", message: CLOSING_MESSAGE };
}

// 進捗表示用: 充足済みスロット数(全エピソード合算)
export function filledSlotCount(state: InterviewState): number {
  return state.episodes.reduce(
    (n, ep) => n + SLOT_ORDER.filter((k) => ep.slots[k]).length,
    0,
  );
}

export const TOTAL_SLOTS = EPISODE_COUNT * SLOT_ORDER.length;
