import { CARDS_TABLE, getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 保存済みキャリアカードの取得・削除。
// 認証は設けず「UUIDを知っている本人だけが引ける」モデル(デモ版)。
// 本番ではセッション認証 + RLS に置き換える想定。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "不正なIDです。" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "DBが設定されていません。" }, { status: 503 });
  }
  // transcriptは本人ビューの根拠ドリルダウン(発言原文表示)に使う
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select("id, created_at, name, role, years, profile, transcript, log_disclosure_consent, discoverable")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Supabase select error:", error.message);
    return Response.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "カードが見つかりません。" }, { status: 404 });
  }
  return Response.json({ card: data });
}

// 本人が「企業に公開する(discoverable)」同意をトグルする (F3-1b)。
// UUIDを知る本人だけが変更できる(匿名フローのまま)。
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "不正なIDです。" }, { status: 400 });
  }
  const { discoverable } = (await req.json()) as { discoverable?: boolean };
  if (typeof discoverable !== "boolean") {
    return Response.json({ error: "discoverable が必要です。" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "DBが設定されていません。" }, { status: 503 });
  }
  const { error } = await supabase.from(CARDS_TABLE).update({ discoverable }).eq("id", id);
  if (error) {
    console.error("Supabase update error:", error.message);
    return Response.json({ error: "更新に失敗しました。" }, { status: 500 });
  }
  return Response.json({ ok: true, discoverable });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "不正なIDです。" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "DBが設定されていません。" }, { status: 503 });
  }
  const { error } = await supabase.from(CARDS_TABLE).delete().eq("id", id);
  if (error) {
    console.error("Supabase delete error:", error.message);
    return Response.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
