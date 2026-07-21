// ============================================================
// 一気 IKKI — 質問バンク (パッケージB-3)
//
// 設計原則5「質問の分解」: 解釈の余地が大きい抽象質問
// (例:「何に苦労しましたか?」)を禁止し、事実を尋ねる小さな質問に
// 分解する。全質問に回答ガイド(チップ)と記入例(プレースホルダ)を持つ。
// ============================================================

export type SlotKey =
  | "situation"
  | "challenge"
  | "action"
  | "result_quant"
  | "reproducibility";

export const SLOT_ORDER: SlotKey[] = [
  "situation",
  "challenge",
  "action",
  "result_quant",
  "reproducibility",
];

export const SLOT_LABELS: Record<SlotKey, string> = {
  situation: "状況",
  challenge: "課題",
  action: "行動",
  result_quant: "結果(数字)",
  reproducibility: "再現性",
};

export interface QuestionDef {
  text: string;
  chips: string[]; // 回答に含めると良い要素
  placeholder: string; // 入力欄に出す1行の記入例
}

// エピソードの導入質問(2本)。抽象的な「頑張ったこと」を聞かない
export const EPISODE_OPENERS: QuestionDef[] = [
  {
    text: "直近1年で、最も時間を使った仕事は何ですか? 内容と、その中でのあなたの役割を教えてください。",
    chips: ["いつ", "チーム人数", "あなたの役割"],
    placeholder: "例: 新システムの導入。現場5名との要件調整を担当",
  },
  {
    text: "もう1つ伺います。直近1年で、計画通りに進まなかった仕事を1つ教えてください。どんな仕事で、何が起きましたか?",
    chips: ["いつ", "何が起きたか", "あなたの役割"],
    placeholder: "例: 4月の新商品導入で、初月の売上が計画の6割だった",
  },
];

// スロット別フォローアップ質問(未充足スロットへの追い質問)
export const SLOT_QUESTIONS: Record<SlotKey, QuestionDef> = {
  situation: {
    text: "チームは何名で、その中であなたの担当範囲はどこまででしたか? 期間もわかれば教えてください。",
    chips: ["チーム人数", "あなたの役割", "期間"],
    placeholder: "例: チーム6名。私は進行管理担当で、期間は約3か月",
  },
  challenge: {
    text: "その仕事の中で、計画通りに進まなかった場面や一番の障害を1つ教えてください。",
    chips: ["何が問題か", "いつ起きたか"],
    placeholder: "例: 発注ミスが月に3回起きていて、現場が疲弊していた",
  },
  action: {
    text: "そのとき、あなたが最初に取った行動は何ですか? あなた自身が手を動かした部分を教えてください。",
    chips: ["あなたの行動", "最初の一手"],
    placeholder: "例: まず現場3店舗を回って、作業手順を全部書き出した",
  },
  result_quant: {
    text: "その結果はどうなりましたか? 数字で言える範囲で構いません。概算で大丈夫です。",
    chips: ["数字", "概算OK"],
    placeholder: "例: ミスが月3回から0になり、残業が週5時間減った",
  },
  reproducibility: {
    text: "振り返って、なぜ上手くいった(いかなかった)と思いますか? 工夫した点を言葉にしてください。",
    chips: ["工夫した点", "理由"],
    placeholder: "例: 先に現場の信頼を取ってから仕組みを変えたのが効いた",
  },
};

// 面談冒頭の挨拶(エピソード1の導入質問に添える)
export function buildIntro(name: string): string {
  return `${name}さん、はじめまして。キャリアエージェントの「一気」です。ここからは面接ではなく、キャリアの棚卸しの時間です。具体的なエピソードを2つ、一緒に深掘りしていきます。肩の力を抜いて、普段の言葉でお話しください。`;
}

// 面談終了メッセージ(テンプレート)
export const CLOSING_MESSAGE =
  "ありがとうございました。エピソードを具体的に伺えたので、根拠のあるキャリアカードを作れます。下のボタンからカードを生成してください。";
