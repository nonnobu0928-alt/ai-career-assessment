import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// サーバー専用のSupabaseクライアント。
// 環境変数が未設定の場合はnullを返し、呼び出し側はDBなしで動作を続ける
// (デモ・ローカル開発をDBセットアップなしで回せるようにするため)。
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const CARDS_TABLE = "career_cards";
