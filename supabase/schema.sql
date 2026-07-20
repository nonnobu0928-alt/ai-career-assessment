-- 一気 IKKI — キャリアカード保存テーブル
-- Supabase SQL Editor で実行してください。
--
-- 設計:
-- - profile: フロントに表示するキャリアカード本体(正規化済みJSON)
-- - transcript: 面談の会話ログ全文。カードの根拠として保持し、
--   企業側には「候補者の同意範囲でのみ」開示する想定
-- - アクセスはサーバー(service_role)経由のみ。anonキーからの
--   直接アクセスは想定しないため RLS を有効化し、ポリシーは作らない

create table if not exists career_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  role text not null,
  years text not null,
  transcript jsonb not null,
  profile jsonb not null
);

alter table career_cards enable row level security;

create index if not exists career_cards_created_at_idx
  on career_cards (created_at desc);
