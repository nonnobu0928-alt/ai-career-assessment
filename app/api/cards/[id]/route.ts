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
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select("id, created_at, name, role, years, profile")
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
