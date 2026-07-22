import { getMembership, getUserFromRequest } from "@/lib/companyAuth";
import { getSupabase } from "@/lib/supabase";
import type { DocKey } from "@/lib/matching";
import { COMPETENCY_MODEL } from "@/lib/competencyModel";

export const runtime = "nodejs";

const VALID_DOCS: DocKey[] = ["resume", "comm_test", "voice"];
const VALID_COMP = new Set(COMPETENCY_MODEL.map((c) => c.key));

// 合格基準の一覧取得 / 登録 (F3-2)
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });
  const membership = await getMembership(user.id);
  if (!membership) return Response.json({ error: "企業登録が必要です。" }, { status: 403 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  const { data, error } = await supabase
    .from("hiring_criteria")
    .select("id, name, min_competencies, required_documents, preferred_traits, created_at")
    .eq("company_id", membership.company_id)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: "取得に失敗しました。" }, { status: 500 });
  return Response.json({ ok: true, criteria: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "未認証です。" }, { status: 401 });
  const membership = await getMembership(user.id);
  if (!membership) return Response.json({ error: "企業登録が必要です。" }, { status: 403 });

  const body = (await req.json()) as {
    name?: string;
    min_competencies?: Record<string, number>;
    required_documents?: string[];
    preferred_traits?: string[];
  };
  if (!body.name || body.name.trim().length === 0) {
    return Response.json({ error: "基準名を入力してください。" }, { status: 400 });
  }

  // 入力を検証(未知キー・範囲外を落とす)
  const min: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.min_competencies ?? {})) {
    if (VALID_COMP.has(k as never) && Number.isFinite(v) && v >= 1 && v <= 5) {
      min[k] = Math.round(v);
    }
  }
  const docs = (body.required_documents ?? []).filter((d): d is DocKey =>
    VALID_DOCS.includes(d as DocKey),
  );
  const traits = (body.preferred_traits ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8);

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  const { data, error } = await supabase
    .from("hiring_criteria")
    .insert({
      company_id: membership.company_id,
      name: body.name.trim(),
      min_competencies: min,
      required_documents: docs,
      preferred_traits: traits,
    })
    .select("id, name, min_competencies, required_documents, preferred_traits, created_at")
    .single();
  if (error) {
    console.error("hiring_criteria insert error:", error.message);
    return Response.json({ error: "登録に失敗しました。" }, { status: 500 });
  }
  return Response.json({ ok: true, criteria: data });
}
