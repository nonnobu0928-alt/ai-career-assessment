import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// 一気 IKKI — ブラウザ用Supabaseクライアント (v0.3 F3-1)
//
// 企業ユーザーの認証(Supabase Auth)専用。公開可能な anon キーを使う
// (NEXT_PUBLIC_ 接頭辞で明示)。未設定なら null を返し、企業機能は
// 「認証が未設定」と案内する(求職者側の匿名フローには影響しない)。
// ============================================================

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key);
  return cached;
}

export function isCompanyAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
