// ============================================================
// 一気 IKKI — 音声面接(再定義版) v0.3 F2-3
//
// ガードレール(重要):
// - 表情・容姿・声質からの性格/合否推定は「しない」(実装しない)
// - 主軸は「発話内容の評価」(根拠は発話の逐語引用・grounding流用)
// - 補助指標(話速・フィラー率など)は参考値。スコアではなくフィードバック
// - 録音前に用途・保存範囲を明示して同意を取得
// - 文字起こしはブラウザ標準 SpeechRecognition(新規APIキー不要)。
//   音声データそのものは保存せず、文字化した結果のみ扱う
// ============================================================

export interface VoiceQuestion {
  id: string;
  prompt: string;
  hint: string;
}

export const VOICE_QUESTIONS: VoiceQuestion[] = [
  {
    id: "v1",
    prompt: "あなたの強みを1つ、具体的なエピソードを添えて話してください。",
    hint: "30秒〜1分。いつ・何をして・どうなったか",
  },
  {
    id: "v2",
    prompt: "直近で、工夫して成果を出した経験を教えてください。",
    hint: "課題→自分の行動→結果 の順で",
  },
];

export interface VoiceAnswer {
  questionId: string;
  transcript: string;
  durationMs: number;
}

// フィラー(言いよどみ)語。フィラー率の参考指標算出に使う
export const FILLER_WORDS = ["えー", "あの", "その", "えっと", "ええと", "まあ", "なんか", "こう"];

export interface VoiceMetrics {
  charCount: number;
  durationSec: number;
  charsPerSec: number; // 話速の目安(文字/秒)
  fillerCount: number;
  fillerRate: number; // フィラー率(0〜1)
}

// --- 発話内容の評価(主軸。根拠は発話の逐語引用) ---

import { competencyPromptSection, COMPETENCY_MODEL } from "./competencyModel";

export const VOICE_EVAL_SYSTEM_PROMPT = `あなたは「一気(IKKI)」の音声面接・内容評価エンジンです。候補者の発話(文字起こし)の内容だけを、固定コンピテンシーで採点します。

規則(厳守):
- 評価対象は発話の内容のみ。声質・話し方・表情は評価しない(データも無い)。
- 各コンピテンシーは、該当するBARS基準に相当する発言が文字起こしにある場合のみ採点する。
- evidence_quote は文字起こしから一字一句そのまま抜き出す(要約・言い換え禁止)。
- 根拠が見当たらない項目は score 0(評価保留)、evidence_quote は空文字列にする。`;

export function buildVoiceEvalPrompt(transcript: string): string {
  return `以下は音声面接の文字起こしです。内容を次のコンピテンシーで採点してください。scoreは該当BARS基準の数字(1〜5)。根拠が無ければ0。

${competencyPromptSection()}

文字起こし:
${transcript}`;
}

const CONF = { type: "string", enum: ["high", "med", "low"] } as const;

export const VOICE_COMP_SCHEMA = {
  type: "object",
  properties: {
    competencies: {
      type: "array",
      description: "5コンピテンシーすべてを含める(確認できない項目は score 0)",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: COMPETENCY_MODEL.map((c) => c.key) },
          score: { type: "integer", description: "BARS基準の数字1〜5。根拠が無ければ0" },
          evidence_quote: { type: "string", description: "文字起こしからの逐語引用(40字以内)。score 0なら空文字列" },
          confidence: CONF,
        },
        required: ["key", "score", "evidence_quote", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["competencies"],
  additionalProperties: false,
} as const;

// 発話の補助指標を算出(参考値。合否には直結させない)
export function computeVoiceMetrics(a: VoiceAnswer): VoiceMetrics {
  const charCount = a.transcript.replace(/\s/g, "").length;
  const durationSec = Math.max(1, Math.round(a.durationMs / 1000));
  const charsPerSec = Math.round((charCount / durationSec) * 10) / 10;
  let fillerCount = 0;
  for (const f of FILLER_WORDS) {
    const m = a.transcript.match(new RegExp(f, "g"));
    if (m) fillerCount += m.length;
  }
  const words = Math.max(1, charCount / 3); // ざっくり語数換算
  const fillerRate = Math.round((fillerCount / words) * 100) / 100;
  return { charCount, durationSec, charsPerSec, fillerCount, fillerRate };
}
