import Anthropic from "@anthropic-ai/sdk";
import { computeCompleteness } from "@/lib/completeness";
import { verifyAndPrune } from "@/lib/grounding";
import { computeQuality } from "@/lib/quality";
import type { CompletenessSignals } from "@/lib/types";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildRetryNote,
  PROFILE_SCHEMA_V2,
  toProfileV2,
} from "@/lib/prompts";
import { CARDS_TABLE, getSupabase } from "@/lib/supabase";
import type { CandidateInput, ChatMessage, ProfileV2 } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// 会話ログからキャリアカード(ProfileV2)を生成し、DBに保存する。
//
// v0.2フロー(パッケージA):
// 1. structured outputs でスキーマ強制した解析を実行
// 2. サーバー側でグラウンディング照合(引用の逐語一致 + 数字の発言由来)
// 3. 破棄が発生した場合のみ1回だけ再生成 → 再照合。再度不一致の項目は
//    欠損として確定(insufficient)
// デモデータへのフォールバック・マージは行わない。
export async function POST(req: Request) {
  const { candidate, messages, logConsent, signals } = (await req.json()) as {
    candidate: CandidateInput;
    messages: ChatMessage[];
    logConsent?: boolean;
    signals?: CompletenessSignals;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }
  if (!candidate?.name || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const client = new Anthropic();

  async function generate(extraNote: string): Promise<ProfileV2 | null> {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildAnalysisPrompt(candidate, messages) + extraNote,
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: PROFILE_SCHEMA_V2 },
      },
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return toProfileV2(JSON.parse(text), candidate);
    } catch {
      return null;
    }
  }

  // 1回目の生成 + 照合
  const first = await generate("");
  if (!first) {
    return Response.json({ error: "解析に失敗しました。" }, { status: 502 });
  }
  let verified = verifyAndPrune(first, messages);

  // 破棄が発生した場合のみ、破棄内容を明示して1回だけ再生成
  if (verified.dropped.length > 0) {
    const second = await generate(buildRetryNote(verified.dropped));
    if (second) {
      verified = verifyAndPrune(second, messages); // 再度不一致なら欠損として確定
    }
  }
  const profile = verified.profile;

  // Card Quality Score (パッケージE): カードに埋め込み + DB列にも保存
  const quality = computeQuality(profile, verified.quotesChecked, verified.quotesPassed);
  // 一次代替充足度 (F2-4): 面接の質 + 書類/コミュ/音声の充足フラグを合算
  quality.completeness = computeCompleteness(quality.total, {
    interview_taken: true,
    resume_confirmed: Boolean(signals?.resume_confirmed),
    comm_test_taken: Boolean(signals?.comm_test_taken),
    voice_taken: Boolean(signals?.voice_taken),
  });
  profile.quality = quality;

  // DB保存(Supabase設定時のみ)
  let saved = false;
  let id: string | null = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from(CARDS_TABLE)
      .insert({
        name: profile.name,
        role: profile.role,
        years: profile.years,
        transcript: messages,
        profile,
        log_disclosure_consent: Boolean(logConsent),
        quality,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Supabase insert error:", error.message);
    } else {
      saved = true;
      id = data.id;
    }
  }

  return Response.json({
    ok: true,
    saved,
    id,
    profile,
    log_disclosure_consent: Boolean(logConsent),
  });
}
