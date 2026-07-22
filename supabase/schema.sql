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
  profile jsonb not null,
  -- 発言ログの企業開示に本人が同意したか(未同意なら企業ビューで引用非表示)
  log_disclosure_consent boolean not null default false,
  -- Card Quality Score(定量数/STAR完全率/引用カバー率/スロット充足率/総合)。
  -- 運営はSupabaseのテーブルビューでこの列を直接確認する運用
  quality jsonb
);

-- 既存テーブルへの追加(v0.1からの移行用)
alter table career_cards
  add column if not exists log_disclosure_consent boolean not null default false;
alter table career_cards
  add column if not exists quality jsonb;

alter table career_cards enable row level security;

create index if not exists career_cards_created_at_idx
  on career_cards (created_at desc);

-- 面談ステート保存テーブル (パッケージB-2)
-- サーバーがスロット充足型の面談状態を保持する。state は InterviewState
-- (エピソード2本 × 必須5スロット + 各エピソードの追い質問回数)のJSON。
-- 機能上の正はリクエストで往復する state 側にあり、この表は監査・分析用。
create table if not exists interview_sessions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references career_cards(id),
  state jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table interview_sessions enable row level security;

-- 匿名スコア分布 (v0.3 F1-4: 偏差値・相対評価)
-- 個人特定情報は持たず、匿名スコアの配列だけを metric ごとに保持する。
-- サンプル数が閾値(100)未満の間はUI側で「参考値」として扱う。
create table if not exists score_distributions (
  metric text primary key,             -- 'quick_overall' | 'competency_overall' | 'communication'
  samples jsonb not null default '[]',
  updated_at timestamptz default now()
);

alter table score_distributions enable row level security;

-- クイック診断の公開シェア (v0.3 F1-3)
-- 公開ページ /r/[share_id] が参照する。氏名・発言ログ・企業向け評価は
-- 一切持たず、匿名の要約(タイプ名・スコア・偏差値・強み)だけを保存する。
create table if not exists quick_shares (
  share_id text primary key,           -- nanoid(本人カードUUIDとは分離)
  type_name text not null,
  type_en text not null,
  overall int not null,
  by_metric jsonb not null,            -- { metricKey: 0..100 }
  deviation jsonb,                     -- { deviation, percentileTop, samples, provisional } | null
  top_strengths jsonb not null,        -- ["主体性","課題解決"] (メトリクス名のみ)
  created_at timestamptz default now()
);

alter table quick_shares enable row level security;

-- 履歴書/職務経歴書のパース結果 (v0.3 F2-1)
-- parsed=AI抽出、confirmed=本人確定値(区別して保持)。
-- confirmed_by_user が true になって初めて「本人確認済み」として扱う。
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references career_cards(id),
  kind text not null,                  -- 'resume' | 'cv'
  parsed jsonb,                        -- AI抽出(確定前)
  confirmed jsonb,                     -- 本人が確認・編集して確定した値
  confirmed_by_user boolean default false,
  created_at timestamptz default now()
);

alter table documents enable row level security;

-- ============================================================
-- v0.3 フェーズ3: 企業アカウント(B2B)
-- 認証はここで初めて本格化(Supabase Auth)。企業ユーザーを分離する。
-- 書き込みは JWT を検証したサーバーAPI(service_role)経由。RLSは
-- anonキーからの直接アクセスを塞ぐ保険として有効化する。
-- ============================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
alter table companies enable row level security;

create table if not exists company_members (
  user_id uuid primary key,            -- auth.users.id
  company_id uuid references companies(id),
  role text not null default 'member',
  created_at timestamptz default now()
);
alter table company_members enable row level security;

-- 候補者が「企業に公開」を明示同意したカードだけを企業プールに載せる(F3合意)
alter table career_cards add column if not exists discoverable boolean not null default false;

-- 合格基準テンプレート (F3-2)
create table if not exists hiring_criteria (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name text not null,
  min_competencies jsonb not null default '{}',   -- {problem_solving:3,...}
  required_documents jsonb not null default '[]',  -- ['resume','comm_test','voice']
  preferred_traits jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table hiring_criteria enable row level security;

-- オファー(構造化入力) (F3-3)。条件データの第一ソース。
-- 給与・福利厚生・仕事内容を項目化して保持する(無差別クローリングの代替)。
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  card_id uuid references career_cards(id),
  salary_min int,
  salary_max int,
  benefits jsonb not null default '[]',   -- 構造化された福利厚生
  role_description text,
  status text default 'sent',
  created_at timestamptz default now()
);
alter table offers enable row level security;
create index if not exists offers_card_idx on offers (card_id);
