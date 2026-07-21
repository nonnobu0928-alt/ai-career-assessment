import type { Confidence } from "./types";

// ============================================================
// 一気 IKKI — コミュニケーション能力テスト(F1-5)
//
// 実務想定のシチュエーションに自由記述で応答させ、固定4軸で採点する。
// v0.2原則を踏襲:
// - 評価軸とBARS(行動基準)はコード側に固定(恣意性・優劣の押し付けを排除)
// - 採点には「本人の記述からの逐語引用」を必ず紐付ける(grounding照合)
// - 引用が本人の記述に無い軸は score null(評価保留)にする
// ============================================================

export type CommAxisKey = "intent" | "clarity" | "alternative" | "consideration";

export interface CommAxisDef {
  key: CommAxisKey;
  name: string;
  bars: Record<1 | 2 | 3 | 4 | 5, string>;
}

export const COMM_AXES: CommAxisDef[] = [
  {
    key: "intent",
    name: "相手意図の汲み取り",
    bars: {
      1: "相手の発言をそのまま受け取り、背景を考慮していない",
      2: "相手の要望は理解しているが、その理由までは踏み込んでいない",
      3: "相手が本当に困っている点を推し量って応答している",
      4: "言葉にされていない懸念まで汲み、先回りして触れている",
      5: "相手の立場・利害を構造的に捉え、関係全体を見て応答している",
    },
  },
  {
    key: "clarity",
    name: "結論の明快さ",
    bars: {
      1: "何を伝えたいのか要点が定まっていない",
      2: "結論はあるが、説明が長く要点が埋もれている",
      3: "結論を先に、簡潔に伝えている",
      4: "結論と理由が整理され、相手が判断しやすい",
      5: "結論・根拠・次の行動が一読で明快に伝わる",
    },
  },
  {
    key: "alternative",
    name: "代替案の提示",
    bars: {
      1: "できない/困る、で終わり代替がない",
      2: "対応を約束するが具体策がない",
      3: "実行可能な代替案を1つ示している",
      4: "複数の選択肢を、条件とともに提示している",
      5: "相手の利害に沿った現実的な着地案まで設計している",
    },
  },
  {
    key: "consideration",
    name: "配慮・関係構築",
    bars: {
      1: "一方的で、相手への配慮が感じられない",
      2: "形式的な丁寧さはあるが心情に触れていない",
      3: "相手の状況に配慮した言葉を添えている",
      4: "相手の面子・感情に配慮しつつ率直に伝えている",
      5: "配慮と誠実さを両立し、長期の信頼につながる伝え方",
    },
  },
];

export interface CommSituation {
  id: string;
  prompt: string;
  placeholder: string;
}

export const COMM_SITUATIONS: CommSituation[] = [
  {
    id: "s1",
    prompt:
      "取引先から「納期に間に合わないなら他社に頼む」と強い口調で言われました。あなたの最初の返信を、実際に送る文面で書いてください。",
    placeholder: "例: ご連絡ありがとうございます。まず現状をお伝えすると…",
  },
  {
    id: "s2",
    prompt:
      "後輩が締め切りを守れず、チーム全体に影響が出ています。あなたが後輩に最初にかける言葉を、実際の会話の文面で書いてください。",
    placeholder: "例: 少し話せる? 今回の遅れについて一緒に整理したくて…",
  },
];

export interface CommAxisEval {
  key: CommAxisKey;
  name: string;
  score: number | null; // 1〜5。評価保留は null
  bars_text: string | null;
  evidence_quote: string | null; // 本人の記述からの逐語引用
  confidence: Confidence | null;
}

export interface CommResult {
  situationId: string;
  response: string;
  axes: CommAxisEval[];
  overall: number | null; // 0〜100(評価できた軸の平均)。全て保留なら null
}

export function commBarsText(key: string, score: number): string | null {
  const def = COMM_AXES.find((a) => a.key === key);
  if (!def || score < 1 || score > 5) return null;
  return def.bars[score as 1 | 2 | 3 | 4 | 5];
}

// 採点プロンプトに埋め込むBARS定義
function axesPromptSection(): string {
  return COMM_AXES.map(
    (a) =>
      `- ${a.key}(${a.name}):\n` +
      ([1, 2, 3, 4, 5] as const).map((n) => `  ${n}: ${a.bars[n]}`).join("\n"),
  ).join("\n");
}

export const COMM_SYSTEM_PROMPT = `あなたは「一気(IKKI)」のコミュニケーション評価エンジンです。実務シチュエーションへの候補者の記述を、固定4軸で採点します。

規則(厳守):
- 採点は候補者が実際に書いた文章のみを根拠にする。書かれていない意図を忖度しない。
- 各軸で、該当するBARS基準に相当する記述が本人の文章にある場合のみ採点する。
- evidence_quote は候補者の記述から一字一句そのまま抜き出す(要約・言い換え禁止)。
- 根拠が本人の記述に見当たらない軸は score 0(評価保留)、evidence_quote は空文字列にする。`;

export function buildCommPrompt(situationPrompt: string, response: string): string {
  return `シチュエーション:
${situationPrompt}

候補者の記述:
${response}

上記の記述を次の4軸で採点してください。scoreは該当するBARS基準の数字(1〜5)。根拠が無ければ0。
${axesPromptSection()}`;
}

const CONFIDENCE = { type: "string", enum: ["high", "med", "low"] } as const;

export const COMM_SCHEMA = {
  type: "object",
  properties: {
    axes: {
      type: "array",
      description: "4軸すべてを含める(評価できない軸は score 0)",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: COMM_AXES.map((a) => a.key) },
          score: { type: "integer", description: "BARS基準の数字1〜5。根拠が無ければ0" },
          evidence_quote: {
            type: "string",
            description: "本人の記述からの逐語引用(40字以内)。score 0なら空文字列",
          },
          confidence: CONFIDENCE,
        },
        required: ["key", "score", "evidence_quote", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["axes"],
  additionalProperties: false,
} as const;
