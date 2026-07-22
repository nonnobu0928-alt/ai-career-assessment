import { getMembership, getUserFromRequest } from "@/lib/companyAuth";
import { isBenefit } from "@/lib/offers";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// オファーの構造化送信 (F3-3)。選択候補者にまとめて送る。
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });
  const membership = await getMembership(user.id);
  if (!membership) return Response.json({ error: "企業登録が必要です。" }, { status: 403 });

  const body = (await req.json()) as {
    card_ids?: string[];
    salary_min?: number;
    salary_max?: number;
    benefits?: string[];
    role_description?: string;
  };

  const cardIds = (body.card_ids ?? []).filter((id) => UUID_RE.test(id));
  if (cardIds.length === 0) {
    return Response.json({ error: "対象候補者がありません。" }, { status: 400 });
  }
  const salaryMin = Math.max(0, Math.min(100000, Math.round(Number(body.salary_min) || 0)));
  const salaryMaxRaw = Math.max(0, Math.min(100000, Math.round(Number(body.salary_max) || 0)));
  const salaryMax = Math.max(salaryMin, salaryMaxRaw);
  const benefits = (body.benefits ?? []).filter(isBenefit);
  const role = String(body.role_description ?? "").trim().slice(0, 2000);

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  const rows = cardIds.map((card_id) => ({
    company_id: membership.company_id,
    card_id,
    salary_min: salaryMin || null,
    salary_max: salaryMax || null,
    benefits,
    role_description: role || null,
    status: "sent",
  }));

  const { error } = await supabase.from("offers").insert(rows);
  if (error) {
    console.error("offers insert error:", error.message);
    return Response.json({ error: "オファー送信に失敗しました。" }, { status: 500 });
  }
  return Response.json({ ok: true, sent: rows.length });
}
