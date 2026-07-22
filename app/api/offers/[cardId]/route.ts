import { computeDeviation } from "@/lib/deviation";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 候補者が受け取ったオファーと、その条件の相対評価 (F3-4)。
// - 好条件度: 蓄積された全オファーを母集団に、給与の上位何%を算出
// - サンプル不足時は provisional(参考値)。誤った相対評価で信頼を壊さない
// - UUID(cardId)を知る本人だけが引ける(匿名フローのまま)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;
  if (!UUID_RE.test(cardId)) {
    return Response.json({ error: "不正なIDです。" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DBが設定されていません。" }, { status: 503 });

  // 母集団: 全オファーの給与(上限優先)
  const { data: all } = await supabase.from("offers").select("salary_min, salary_max");
  const population = (all ?? [])
    .map((o) => o.salary_max ?? o.salary_min ?? 0)
    .filter((v) => v > 0);

  // 本人宛のオファー(企業名つき)
  const { data, error } = await supabase
    .from("offers")
    .select("id, salary_min, salary_max, benefits, role_description, status, created_at, companies(name)")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("offers select error:", error.message);
    return Response.json({ error: "取得に失敗しました。" }, { status: 500 });
  }

  const offers = (data ?? []).map((o) => {
    const salary = o.salary_max ?? o.salary_min ?? 0;
    const company = o.companies as unknown as { name?: string } | null;
    const rel = salary > 0 && population.length > 0 ? computeDeviation(salary, population) : null;
    return {
      id: o.id,
      company_name: company?.name ?? "企業",
      salary_min: o.salary_min,
      salary_max: o.salary_max,
      benefits: Array.isArray(o.benefits) ? o.benefits : [],
      role_description: o.role_description,
      status: o.status,
      // 好条件度: 上位% と 参考値フラグ
      salary_percentile_top: rel ? rel.percentileTop : null,
      provisional: rel ? rel.provisional : true,
    };
  });

  return Response.json({ ok: true, offers });
}
