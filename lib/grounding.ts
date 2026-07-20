import type { ChatMessage, ProfileV2 } from "./types";

// ============================================================
// 一気 IKKI — グラウンディング検証(サーバー専用)
//
// 受け入れ基準: 完成カードの全記述について「これは本人が言ったことか?」
// が Yes になること。ログにない数字・単語が1つでも表示されたら不合格。
//
// 2つの検証を行う:
// 1. 引用照合: evidence_quote が候補者の発言ログに(正規化後の)
//    部分一致で存在するか。不一致の項目は破棄する
// 2. 数字照合: カード上の全テキストに現れる数字が、候補者の発言に
//    現れた数字の集合に含まれるか。含まれない数字を持つ項目は破棄する
//    (想定年収・マッチ度は市場推定値のため対象外)
// ============================================================

// 空白・改行・句読点・記号を除去して照合用に正規化する。
// LLMが引用時に句読点を落とす程度の揺れは許容し、語の改変は許容しない
export function normalizeForMatch(s: string): string {
  return toHalfWidthDigits(s)
    .replace(/[\s　]/g, "")
    .replace(/[、。,.!?！？「」『』()（）［\[\]］・…‥:：;；\-—–~〜]/g, "")
    .toLowerCase();
}

function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

// 候補者(user)の発言だけを照合対象にする
export function candidateLogText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

export function quoteInLog(quote: string, logNormalized: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length < 4) return false; // 短すぎる引用は根拠として認めない
  return logNormalized.includes(q);
}

// テキスト中の数字トークンを抽出(全角→半角、桁区切り除去済み)
export function extractNumbers(s: string): string[] {
  const cleaned = toHalfWidthDigits(s).replace(/(\d),(?=\d{3})/g, "$1");
  return cleaned.match(/\d+(?:\.\d+)?/g) ?? [];
}

// text中の全ての数字が、候補者ログの数字集合に含まれるか
export function numbersGrounded(text: string, logNumbers: Set<string>): boolean {
  return extractNumbers(text).every((n) => logNumbers.has(n));
}

export interface VerifyResult {
  profile: ProfileV2;
  dropped: string[]; // 破棄された項目の説明(再生成プロンプトに使う)
}

// プロフィールを検証し、根拠のない項目を破棄(null化)して返す。
// 破棄内容は dropped に列挙し、insufficient に項目キーを積む
export function verifyAndPrune(
  profile: ProfileV2,
  messages: ChatMessage[],
): VerifyResult {
  const logNorm = normalizeForMatch(candidateLogText(messages));
  const logNumbers = new Set(extractNumbers(candidateLogText(messages)));
  const dropped: string[] = [];
  const insufficient = new Set(profile.insufficient ?? []);

  const textOk = (text: string) => numbersGrounded(text, logNumbers);

  // AI所見(引用なし)は数字照合のみ
  const pruneInsight = (key: "catchcopy" | "summary") => {
    const v = profile[key];
    if (v && !textOk(v.text)) {
      dropped.push(`${key}: ログにない数字を含む「${v.text}」`);
      profile[key] = null;
      insufficient.add(key);
    }
  };
  pruneInsight("catchcopy");
  pruneInsight("summary");

  // 強み: 引用照合 + 数字照合
  const strengths = profile.strengths.filter((s) => {
    const ok =
      quoteInLog(s.evidence_quote, logNorm) &&
      textOk(s.title) &&
      textOk(s.interpretation);
    if (!ok) dropped.push(`strengths: 引用不一致または未発言の数字「${s.evidence_quote}」`);
    return ok;
  });
  if (strengths.length < profile.strengths.length) insufficient.add("strengths");
  profile.strengths = strengths;
  if (strengths.length === 0) insufficient.add("strengths");

  // 定量実績: 引用照合 + 数字照合(value内の数字は必ずログ由来)
  const quantFacts = profile.quant_facts.filter((f) => {
    const ok =
      quoteInLog(f.evidence_quote, logNorm) &&
      textOk(f.label) &&
      textOk(f.value);
    if (!ok) dropped.push(`quant_facts: 引用不一致または未発言の数字「${f.value}」`);
    return ok;
  });
  if (quantFacts.length < profile.quant_facts.length) insufficient.add("quant_facts");
  profile.quant_facts = quantFacts;

  // エピソード: 引用照合。スロットごとに数字照合し、違反スロットのみnull化
  profile.episodes = profile.episodes.map((ep) => {
    if (ep.evidence_quote && !quoteInLog(ep.evidence_quote, logNorm)) {
      dropped.push(`episode: 引用不一致「${ep.evidence_quote}」`);
      ep.evidence_quote = null;
      insufficient.add("episode");
    }
    const slots = ["situation", "challenge", "action", "result_quant", "reproducibility"] as const;
    for (const slot of slots) {
      const v = ep[slot];
      if (v && !textOk(v)) {
        dropped.push(`episode.${slot}: ログにない数字を含む「${v}」`);
        ep[slot] = null;
        insufficient.add("episode");
      }
    }
    return ep;
  });
  if (profile.episodes.length === 0) insufficient.add("episode");

  // ハイライト: 引用照合 + 数字照合
  if (profile.highlight) {
    const h = profile.highlight;
    if (!quoteInLog(h.evidence_quote, logNorm) || !textOk(h.interpretation)) {
      dropped.push(`highlight: 引用不一致「${h.evidence_quote}」`);
      profile.highlight = null;
      insufficient.add("highlight");
    }
  } else {
    insufficient.add("highlight");
  }

  // チップ類: 数字照合のみ(解釈語は許容、未発言の数字は不可)
  profile.values = profile.values.filter((v) => {
    const ok = textOk(v);
    if (!ok) dropped.push(`values: ログにない数字を含む「${v}」`);
    return ok;
  });
  profile.match_roles = profile.match_roles.filter((r) => {
    const ok = textOk(r);
    if (!ok) dropped.push(`match_roles: ログにない数字を含む「${r}」`);
    return ok;
  });

  // コンピテンシー評価(パッケージB): 引用が照合できないものは評価保留
  if (profile.competencies) {
    profile.competencies = profile.competencies.map((c) => {
      if (c.score !== null && (!c.evidence_quote || !quoteInLog(c.evidence_quote, logNorm))) {
        dropped.push(`competency.${c.key}: 引用不一致`);
        return { ...c, score: null, bars_text: null, evidence_quote: null, confidence: null };
      }
      return c;
    });
  }

  profile.insufficient = Array.from(insufficient);
  return { profile, dropped };
}
