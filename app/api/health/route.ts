import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// 診断用ヘルスチェック。秘密情報は返さず、設定の有無とテーブル到達性だけを
// 真偽で返す。シェア発行不可(available:false)の原因切り分けに使う:
// - supabase_configured=false → VercelにSUPABASE_URL/SERVICE_ROLE_KEY未設定
// - supabase_configured=true かつ quick_shares_ok=false → SQL未適用(表なし)
export async function GET() {
  const supabase = getSupabase();
  const supabase_configured = Boolean(supabase);
  const anthropic_key_present = Boolean(process.env.ANTHROPIC_API_KEY);

  let quick_shares_ok = false;
  let score_distributions_ok = false;
  let table_error: string | null = null;

  if (supabase) {
    try {
      const q = await supabase.from("quick_shares").select("share_id", { count: "exact", head: true });
      quick_shares_ok = !q.error;
      if (q.error) table_error = q.error.message;
    } catch (e) {
      table_error = String(e);
    }
    try {
      const d = await supabase
        .from("score_distributions")
        .select("metric", { count: "exact", head: true });
      score_distributions_ok = !d.error;
      if (d.error && !table_error) table_error = d.error.message;
    } catch (e) {
      if (!table_error) table_error = String(e);
    }
  }

  return Response.json({
    ok: true,
    anthropic_key_present,
    supabase_configured,
    quick_shares_ok,
    score_distributions_ok,
    table_error,
    hint: !supabase_configured
      ? "VercelにSUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定し再デプロイしてください"
      : !quick_shares_ok || !score_distributions_ok
        ? "Supabaseで supabase/schema.sql (quick_shares / score_distributions) を実行してください"
        : "設定は正常です",
  });
}
