import { getSupabase } from "./supabase";

// ============================================================
// 一気 IKKI — 企業ユーザーのサーバー側検証 (v0.3 F3-1)
//
// ブラウザから Authorization: Bearer <access_token> を受け取り、
// service_role クライアントで JWT を検証してユーザーを特定する。
// 検証済みの user_id を使って service_role で操作する(RLSは保険)。
// ============================================================

export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function getUserFromRequest(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// ユーザーの所属企業を返す(なければ null)
export async function getMembership(
  userId: string,
): Promise<{ company_id: string; role: string; company_name: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("company_members")
    .select("company_id, role, companies(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const company = data.companies as unknown as { name?: string } | null;
  return { company_id: data.company_id, role: data.role, company_name: company?.name ?? "" };
}
