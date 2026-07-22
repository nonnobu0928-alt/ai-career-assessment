import Anthropic from "@anthropic-ai/sdk";
import {
  isResumeMediaType,
  normalizeResume,
  RESUME_PROMPT,
  RESUME_SCHEMA,
  RESUME_SYSTEM_PROMPT,
  type DocumentKind,
} from "@/lib/resume";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB上限

// 履歴書/職務経歴書のパース (F2-1)。
// PDF・画像を Anthropic の文書/画像読み取りに渡し、structured outputs で
// 事実項目のみ抽出する(新規APIキー不要・既存SDKで完結)。
// 抽出結果は confirmed_by_user=false で保存し、本人確認後に確定させる。
export async function POST(req: Request) {
  const { kind, mediaType, data, cardId } = (await req.json()) as {
    kind: DocumentKind;
    mediaType: string;
    data: string; // base64(データURLのプレフィックスは含めない)
    cardId?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY が設定されていません。" }, { status: 500 });
  }
  if ((kind !== "resume" && kind !== "cv") || !isResumeMediaType(mediaType) || typeof data !== "string") {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }
  // base64 のおおよそのバイト数を検査
  if ((data.length * 3) / 4 > MAX_BYTES) {
    return Response.json({ error: "ファイルが大きすぎます(8MBまで)。" }, { status: 413 });
  }

  const client = new Anthropic();

  // PDF は document ブロック、画像は image ブロックで渡す
  const fileBlock =
    mediaType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType as "image/png" | "image/jpeg" | "image/webp", data },
        };

  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: RESUME_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: RESUME_PROMPT }] }],
      output_config: { format: { type: "json_schema", schema: RESUME_SCHEMA } },
    });
  } catch (e) {
    console.error("resume parse error:", e);
    return Response.json({ error: "書類の読み取りに失敗しました。" }, { status: 502 });
  }

  if (res.stop_reason === "refusal") {
    return Response.json({ error: "読み取りが拒否されました。" }, { status: 502 });
  }
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  let parsed;
  try {
    parsed = normalizeResume(JSON.parse(text));
  } catch {
    return Response.json({ error: "抽出結果のパースに失敗しました。" }, { status: 502 });
  }

  // 保存(DB設定時のみ)。parsed=AI抽出、confirmed_by_user=false で確定前を表す
  let id: string | null = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data: row, error } = await supabase
      .from("documents")
      .insert({ card_id: cardId ?? null, kind, parsed, confirmed_by_user: false })
      .select("id")
      .single();
    if (error) console.error("documents insert error:", error.message);
    else id = row.id;
  }

  return Response.json({ ok: true, id, parsed });
}
