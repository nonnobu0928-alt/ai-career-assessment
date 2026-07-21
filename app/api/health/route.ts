import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// 診断用ヘルスチェック。秘密情報(値)は返さず、設定の有無・稼働デプロイの
// 識別子だけを返す。シェア発行不可(available:false)の原因切り分けに使う。
export async function GET() {
  const env = process.env;
  const present = (v: string | undefined) => Boolean(v && v.trim().length > 0);

  const supabase = getSupabase();
  const supabase_configured = Boolean(supabase);

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

  // よくある取り違え(NEXT_PUBLIC_ 接頭辞や別名)を検知して指摘する
  const misnamed: string[] = [];
  if (!present(env.SUPABASE_URL)) {
    if (present(env.NEXT_PUBLIC_SUPABASE_URL)) misnamed.push("NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL に直す");
  }
  if (!present(env.SUPABASE_SERVICE_ROLE_KEY)) {
    if (present(env.SUPABASE_KEY)) misnamed.push("SUPABASE_KEY → SUPABASE_SERVICE_ROLE_KEY に直す");
    if (present(env.SUPABASE_SERVICE_KEY)) misnamed.push("SUPABASE_SERVICE_KEY → SUPABASE_SERVICE_ROLE_KEY に直す");
    if (present(env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY))
      misnamed.push("NEXT_PUBLIC_ 接頭辞を外す");
  }

  let hint: string;
  if (!present(env.SUPABASE_URL) || !present(env.SUPABASE_SERVICE_ROLE_KEY)) {
    hint = "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY をVercelに設定し、必ずRedeployしてください";
  } else if (!quick_shares_ok || !score_distributions_ok) {
    hint = "Supabaseで schema.sql (quick_shares / score_distributions) を実行してください";
  } else {
    hint = "設定は正常です";
  }

  return Response.json({
    ok: true,
    // 稼働中デプロイの識別(古いデプロイを見ていないかの確認用)
    running_commit: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    vercel_env: env.VERCEL_ENV ?? null,
    // 各変数の「有無」(値は出さない)
    anthropic_key_present: present(env.ANTHROPIC_API_KEY),
    supabase_url_present: present(env.SUPABASE_URL),
    supabase_service_role_key_present: present(env.SUPABASE_SERVICE_ROLE_KEY),
    supabase_configured,
    quick_shares_ok,
    score_distributions_ok,
    table_error,
    misnamed_env: misnamed,
    hint,
  });
}
