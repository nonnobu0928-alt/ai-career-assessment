import { getMembership, getUserFromRequest } from "@/lib/companyAuth";

export const runtime = "nodejs";

// ログイン中の企業ユーザーと所属企業を返す (F3-1)
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });
  const membership = await getMembership(user.id);
  return Response.json({ ok: true, user, membership });
}
