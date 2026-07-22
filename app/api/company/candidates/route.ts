import { toAnonymizedCard } from "@/lib/anonymize";
import { getMembership, getUserFromRequest } from "@/lib/companyAuth";
import { CARDS_TABLE, getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// 企業向け候補者プール (F3-1b)。
// - 企業ユーザーのJWTを検証(getUserFromRequest)
// - 本人が公開同意した discoverable=true のカードのみ
// - 氏名・会話ログ・逐語引用は含めない匿名要約に変換して返す
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });
  const membership = await getMembership(user.id);
  if (!membership) return Response.json({ error: "企業登録が必要です。" }, { status: 403 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select("id, name, role, years, profile, log_disclosure_consent")
    .eq("discoverable", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("candidates select error:", error.message);
    return Response.json({ error: "取得に失敗しました。" }, { status: 500 });
  }

  const candidates = (data ?? []).map(toAnonymizedCard);
  return Response.json({ ok: true, candidates });
}
