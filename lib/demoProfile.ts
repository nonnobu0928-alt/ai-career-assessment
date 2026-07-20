import type { ChatMessage, ProfileV2 } from "./types";

// ============================================================
// 一気 IKKI — デモカード(サンプルデータ)
//
// v0.2方針: デモデータは解析結果の補完には一切使わない。
// LPの「デモカードを見る」ボタン経由でのみ表示し、カード上部に
// 「サンプル」バッジを常時表示する(is_demo: true)。
// ============================================================

// デモカードの根拠引用の出典となる架空の面談ログ(ドリルダウン用)
export const DEMO_TRANSCRIPT: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "佐藤さん、はじめまして。まずは現在のお仕事について教えてください。",
  },
  {
    role: "user",
    content:
      "SaaSの法人営業を5年やっています。チームは8名で、私は新規開拓と大手顧客の深耕を担当しています。直近は12四半期連続で目標達成しています。",
  },
  {
    role: "assistant",
    content: "最も成果を出した経験を教えてください。",
  },
  {
    role: "user",
    content:
      "大手顧客の利用が低迷して、更新停止の危機になったことがあります。利用データを分析して、月次の活用会を自分で企画して実施しました。結果として解約を回避して、契約額1.4倍で更新をもらえました。",
  },
  {
    role: "assistant",
    content: "その経験で工夫した点はどこですか?",
  },
  {
    role: "user",
    content:
      "失注した商談ほど、翌年の最大の資産になると思っていて、断られた理由を全部記録して翌年の提案に活かしています。CSと連携した導入設計で、担当顧客の解約率も半分にできました。",
  },
];

export const DEMO_PROFILE_V2: ProfileV2 = {
  schema_version: 2,
  is_demo: true,
  name: "佐藤(サンプル)",
  role: "SaaS法人営業",
  years: "5〜10年",
  catchcopy: { text: "信頼を積み上げる提案型セールス", confidence: "high" },
  summary: {
    text: "SaaS法人営業5年。新規開拓から大手深耕まで担当し、12四半期連続で目標達成。数字と誠実さの両立が持ち味。",
    confidence: "high",
  },
  strengths: [
    {
      title: "継続力",
      evidence_quote: "直近は12四半期連続で目標達成しています",
      interpretation: "長期にわたり安定して成果を出し続けている",
      confidence: "high",
    },
    {
      title: "データ起点の行動",
      evidence_quote: "利用データを分析して、月次の活用会を自分で企画して実施しました",
      interpretation: "危機に対しデータ分析から自律的に打ち手を実行できる",
      confidence: "high",
    },
    {
      title: "学習姿勢",
      evidence_quote: "断られた理由を全部記録して翌年の提案に活かしています",
      interpretation: "失敗を構造化して次の成果につなげる習慣がある",
      confidence: "med",
    },
  ],
  quant_facts: [
    {
      label: "目標達成の継続",
      value: "12四半期連続",
      evidence_quote: "直近は12四半期連続で目標達成しています",
    },
    {
      label: "チーム規模",
      value: "8名",
      evidence_quote: "チームは8名で、私は新規開拓と大手顧客の深耕を担当しています",
    },
    {
      label: "契約額の伸長",
      value: "1.4倍",
      evidence_quote: "解約を回避して、契約額1.4倍で更新をもらえました",
    },
    {
      label: "解約率の改善",
      value: "半減",
      evidence_quote: "CSと連携した導入設計で、担当顧客の解約率も半分にできました",
    },
  ],
  episodes: [
    {
      situation: "大手顧客の利用が低迷し、更新停止の危機に",
      challenge: "利用低迷の原因が掴めず、解約が迫っていた",
      action: "利用データを分析し、月次の活用会を自ら企画・実施",
      result_quant: "解約を回避し、契約額1.4倍で更新を獲得",
      reproducibility: "失注理由を記録し翌年の提案に活かす習慣",
      evidence_quote: "利用データを分析して、月次の活用会を自分で企画して実施しました",
    },
  ],
  highlight: {
    evidence_quote: "失注した商談ほど、翌年の最大の資産になると思っていて",
    interpretation: "失敗を資産と捉える営業観が一貫している",
    confidence: "high",
  },
  values: ["顧客起点", "誠実さ", "継続"],
  match_roles: ["エンタープライズ営業", "カスタマーサクセス", "営業企画"],
  match_score: 92,
  salary: {
    min: 550,
    max: 720,
    basis: "SaaS法人営業 × 経験5〜10年の一般的な市場レンジに基づく参考値",
  },
  insufficient: [],
};
