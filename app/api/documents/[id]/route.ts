import { getSupabase } from "@/lib/supabase";
import { normalizeResume } from "@/lib/resume";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 履歴書の本人確定 (F2-1b)。本人が確認・編集した値を confirmed に保存し、
// confirmed_by_user=true にする。AI抽出値(parsed)は書き換えず区別を保つ。
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "不正なIDです。" }, { status: 400 });
  }
  const body = (await req.json()) as { confirmed?: unknown };
  if (!body?.confirmed) {
    return Response.json({ error: "confirmed が必要です。" }, { status: 400 });
  }
  const confirmed = normalizeResume(body.confirmed as Parameters<typeof normalizeResume>[0]);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "DBが設定されていません。" }, { status: 503 });
  }
  const { error } = await supabase
    .from("documents")
    .update({ confirmed, confirmed_by_user: true })
    .eq("id", id);
  if (error) {
    console.error("documents update error:", error.message);
    return Response.json({ error: "確定に失敗しました。" }, { status: 500 });
  }
  return Response.json({ ok: true, confirmed });
}
