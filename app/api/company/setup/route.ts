import { getMembership, getUserFromRequest } from "@/lib/companyAuth";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// 企業の初期登録 (F3-1)。ログインユーザーに所属企業が無ければ作成する。
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });

  const { name } = (await req.json()) as { name: string };
  if (!name || name.trim().length === 0) {
    return Response.json({ error: "会社名を入力してください。" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  // 既に所属があればそれを返す(二重作成防止)
  const existing = await getMembership(user.id);
  if (existing) return Response.json({ ok: true, membership: existing });

  const { data: company, error: e1 } = await supabase
    .from("companies")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (e1 || !company) {
    console.error("companies insert error:", e1?.message);
    return Response.json({ error: "会社の作成に失敗しました。" }, { status: 500 });
  }

  const { error: e2 } = await supabase
    .from("company_members")
    .insert({ user_id: user.id, company_id: company.id, role: "owner" });
  if (e2) {
    console.error("company_members insert error:", e2.message);
    return Response.json({ error: "登録に失敗しました。" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    membership: { company_id: company.id, role: "owner", company_name: company.name },
  });
}
