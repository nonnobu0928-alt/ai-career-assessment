# 一気 IKKI — AIキャリアエージェント

「面接まで、一気通貫。」— AIと10分話すだけで、キャリアの棚卸しからキャリアカード(職務経歴書の再発明)、一次面接までが終わる転職サービスのプロトタイプを、Next.js + DB構成に移植したものです。

デザイン思想: **「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)**。縦書きの見出し、Zen Old Mincho × IBM Plex Sans JP。詳細は各ファイル冒頭のコメントに残しています。

v0.2 で「会話を要約するチャット」から「検証可能な構造化面接エンジン」へ改修。設計原則は **トレーサビリティ / グラウンディング / 比較可能性 / 誠実な欠損 / 質問の分解** の5つ(`ikki-v0.2-spec.md`)。

v0.3 フェーズ1で **「バイラルな診断体験」(B2C)** を追加。3分のクイック診断・偏差値・シェアで求職者を集める入口を作る(`ikki-v0.3-spec.md` / `docs/v0.3-plan.md`)。

v0.3 フェーズ2で **「評価の深化」** を追加(`docs/v0.3-phase2-plan.md`)。履歴書パース・独自特性診断・音声面接・一次代替充足度で、企業に出せる根拠を厚くする。

v0.3 フェーズ3で **「企業ダッシュボード(B2B)」** を追加(`docs/v0.3-phase3-plan.md`)。Supabase Auth で企業アカウントを分離し、合格基準による候補者の推薦/条件付/非推薦分類、オファーの構造化入力、条件の相対評価まで。

## 体験フロー

1. **基礎情報(第1部・約3分)** — 業界 / チーム規模 / マネジメント経験 / 主要KPI をチップ選択で収集
2. **エピソード深掘り(第2部・約10分)** — スロット充足型のステートマシンで、STARの必須5スロット(状況/課題/行動/結果/再現性)が埋まるまでエピソードを2本やり切る。音声入力対応
3. **キャリアカード生成** — 会話ログを解析し、定量実績・コンピテンシー評価・強み・エピソードを構造化。**全記述に本人の発言からの逐語引用を付与**し、サーバーで会話ログと照合する
4. **企業ビュー** — 匿名・マッチ度・根拠引用つきでカードが届く。カード上の記述をタップすると本人の発言原文(前後文脈つき)に遡れる

## v0.2 の柱

- **ハルシネーション根絶(A)** — デモデータのフォールバックマージを完全撤去。全項目に `evidence_quote`(逐語引用)を必須化し、サーバーで「引用がログに存在するか」「カード上の数字が本人の発言由来か」を照合。不一致は破棄し1回だけ再生成、なお不一致なら欠損(`insufficient`)として正直に空欄表示する
- **面接エンジン(B)** — 固定コンピテンシーモデル(課題解決/実行・完遂/対人影響/学習・適応/主体性 × BARS行動基準)。面談は「抽出→方針決定(コード側)→質問整形(LLM)」の3段処理で、抽象質問を禁止した質問バンクから深掘りする
- **カードの客観化(C)** — 3層構造(発言事実の逐語引用 / 構造化データ / AI所見ラベル+確信度)。発言原文へのドリルダウン、ログ開示同意トグル、想定年収の参考バッジ
- **音声入力の作り直し(D)** — 途中確定を廃止。タップ開始→灰色プレビュー枠にリアルタイム表示→■で確定して編集後に送信。沈黙で切れない自動再開
- **品質計測(E)** — Card Quality Score(引用カバー率/STAR完全率/スロット充足率/定量数)を算出し、ユーザーには充足度、運営にはKPIとして提示

## UI/UX（案B ネオ和ポップ・二層ブランド）

求職者が触る面(診断/結果/シェア)を若手向けに刷新。企業面(`/company`)は端正・信頼のダーク基調を維持する二層ブランド。詳細は `docs/design-system.md`。

- **デザイントークン一元化**: `lib/design.ts`(求職者面・藍×生成り×朱の色面/タイポ/余白/角丸/影/モーション)。企業面は `lib/theme.ts`。個別ハードコードを排除し全画面が参照
- **遷移基盤**: `components/motion.tsx`(方向つき遷移=前進右/戻る左/階層スケール、色面ワイプ=おみくじ開封、朱印スタンプ、カウントアップ、バー描画)
- **状態/マイクロインタラクション**: `components/feedback.tsx`(スケルトン/空/エラー/トースト/押下)
- **制約**: モバイル縦・片手(主要操作は下部)、`prefers-reduced-motion`で全アニメ無効、タップ44px、コントラスト4.5:1、初回表示を軽く
- 刷新済み: ランディング / `/quiz`(1問1画面・進捗・残問数・即時FB・結果クライマックス) / 公開ページ `/r`。他の求職者面(`/comm-test` `/traits` `/resume` `/voice` `/offers`)は共通パレットで統一

## v0.3 フェーズ1 の柱（バイラルな診断・B2C）

- **クイック層診断（F1-1）** — `/quiz`。10問の選択式・1問1画面・3〜4分。採点根拠はコード側に固定（LLM採点しない）。中断・再開に対応（localStorage、DB非依存）
- **ゲーミフィケーションUI（F1-2）** — framer-motion による設問遷移・スコアカウントアップ・達成トースト。`prefers-reduced-motion` で即時表示にフォールバック。モバイル縦・片手操作前提
- **結果とシェア（F1-3）** — 匿名要約の公開ページ `/r/[shareId]`（発言ログ・企業向け評価は非表示）と、動的OGP画像 `/r/[shareId]/opengraph-image.tsx`。共有IDは本人カードUUIDと分離（nanoid）
- **偏差値・相対評価（F1-4）** — 匿名スコア分布から偏差値=50+10×(x−mean)/sd・上位%を算出。サンプル<100は「参考値」バッジ。**能力スコアのみ対象**（性格タイプには偏差値を出さない）
- **コミュ試験（F1-5）** — `/comm-test`。実務シチュエーションへの自由記述を固定4軸+BARSで採点し、**採点根拠を本人の記述から逐語引用**（v0.2グラウンディング流用）

## v0.3 フェーズ2 の柱（評価の深化）

- **履歴書パース（F2-1）** — `/resume`。PDF/画像を **Anthropic の文書/画像読み取り**で構造化（新規APIキー不要）。**必ず本人が確認・編集して確定**し、AI抽出値(`parsed`)と本人確定値(`confirmed`)をDBで区別。事実の裏取り用途に限定
- **特性診断（F2-2）** — `/traits`。**独自4軸**（既存MBTIの商標・設問は不使用）・コード側固定採点。**合否には使わない参考特性**、偏差値は出さない
- **一次代替充足度（F2-4）** — 面接の質 + 書類提出済/コミュ試験済/音声面接済のフラグを合算し、企業が並べ替えに使える1指標(`substitutability`)に集約
- **音声面接（F2-3）** — `/voice`。**録音前に同意取得**（音声は文字化のみ・保存しない旨を明示）。ブラウザ標準 `SpeechRecognition` で文字起こし（新規APIキー不要）。**発話内容**を既存コンピテンシーで根拠つき評価（発話の逐語引用を照合）。話速・フィラー率は**参考指標**として別枠表示。**表情・声質からの推定はしない**

## v0.3 フェーズ3 の柱（企業ダッシュボード・B2B）

- **企業アカウント + 認証（F3-1）** — `/company`。**Supabase Auth を企業側のみ**に導入（求職者は匿名+端末保存のまま）。候補者は「企業に公開」に**明示同意したカード**だけが企業プールに載る。企業に渡すのは**匿名要約のみ**（氏名・発言ログ・逐語引用は含めない）
- **合格基準 + 自動分類（F3-2）** — 企業が必須コンピテンシー下限点・必須書類を登録 → 候補者を**推薦/条件付/非推薦**に**根拠つき**で分類（コード側判定）。スコア順一覧・削減工数・フィルタ・複数選択・一括アクション
- **オファー構造化入力（F3-3）** — 給与・福利厚生・仕事内容を**項目化**して入力・一括送信（求人クローリングの代替。無差別クロールはしない）
- **オファー条件の相対評価（F3-4）** — `/offers`。受信オファーの給与を全体分布に照らし「上位◯%」バッジ。サンプル不足時は参考値

### RLS / 情報開示の方針（フェーズ3）

- 企業側の書き込み・読み取りは **JWT を検証したサーバーAPI（service_role）** 経由。全テーブルで RLS を有効化し、anon キーからの直接アクセスを塞ぐ
- **氏名・発言ログ全文・逐語引用は、マッチ成立 かつ 本人同意（`log_disclosure_consent`）時のみ**。マッチ前の候補者プールには構造上これらを載せない（`lib/anonymize.ts`）

### ガードレール（意図的な再設計・元に戻さない）

- 動画/音声は**表情・声質から合否/性格を推定しない**。発話内容評価（根拠引用つき）＋伝わりやすさの参考指標に限定（フェーズ2で実装）
- 求人情報は**無差別クローリングしない**。企業の構造化入力＋許可ソースのみ（フェーズ3）
- **B2CとB2Bを時間軸で分離**。母集団が育つまで企業機能は開かない
- 全スコアに根拠発言を紐付ける v0.2 原則を維持

### 使用ライブラリの選定理由

- `framer-motion` — 仕様指定。`useReducedMotion` で reduced-motion フォールバックが容易
- `@vercel/og`（satori/resvg） — Next.js公式のOGP動的生成。**日本語グリフには追加フォントが必要で不安定**なため、OGP画像は横組み・Latinラベル＋朱印モチーフ＋藍/朱のブランド色で生成する（日本語のタイプ名は公開HTMLページ側で表示）
- `nanoid` — URL安全・短い共有ID。本人カードUUIDと分離し漏洩リスクを下げる

## 技術スタック

- **Next.js 16 (App Router / TypeScript) + Tailwind CSS + Recharts**
- **Anthropic SDK (`@anthropic-ai/sdk`)** — 面談AI + structured outputsによるカード解析
- **Supabase (PostgreSQL)** — キャリアカードと面談ログの永続化

## セットアップ

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を設定
npm run dev
```

http://localhost:3000 を開くと面談が始まります。

### DB (Supabase)

1. Supabaseプロジェクトを作成し、SQL Editorで `supabase/schema.sql` を実行
2. `.env.local` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を設定

DB未設定でも動作します（カード・診断は端末のlocalStorageに保存されるフォールバックモード）。ただし **v0.3 の偏差値・シェア公開ページはDBが必須**です（未設定時はシェアリンクを発行せず、診断結果はローカル閲覧のみ）。

#### v0.3 で追加した実行SQL（既存DBに適用する場合）

`supabase/schema.sql` は冪等なので全体を再実行しても安全です。v0.2からの差分だけ適用する場合は以下：

```sql
-- 匿名スコア分布（偏差値 F1-4）
create table if not exists score_distributions (
  metric text primary key,
  samples jsonb not null default '[]',
  updated_at timestamptz default now()
);
alter table score_distributions enable row level security;

-- クイック診断の公開シェア（F1-3・匿名要約のみ）
create table if not exists quick_shares (
  share_id text primary key,
  type_name text not null,
  type_en text not null,
  overall int not null,
  by_metric jsonb not null,
  deviation jsonb,
  top_strengths jsonb not null,
  created_at timestamptz default now()
);
alter table quick_shares enable row level security;

-- 履歴書/職務経歴書のパース結果（F2-1）
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references career_cards(id),
  kind text not null,
  parsed jsonb,
  confirmed jsonb,
  confirmed_by_user boolean default false,
  created_at timestamptz default now()
);
alter table documents enable row level security;

-- フェーズ3: 企業(B2B)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, created_at timestamptz default now()
);
alter table companies enable row level security;
create table if not exists company_members (
  user_id uuid primary key, company_id uuid references companies(id),
  role text not null default 'member', created_at timestamptz default now()
);
alter table company_members enable row level security;
alter table career_cards add column if not exists discoverable boolean not null default false;
create table if not exists hiring_criteria (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id), name text not null,
  min_competencies jsonb not null default '{}',
  required_documents jsonb not null default '[]',
  preferred_traits jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table hiring_criteria enable row level security;
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id), card_id uuid references career_cards(id),
  salary_min int, salary_max int, benefits jsonb not null default '[]',
  role_description text, status text default 'sent', created_at timestamptz default now()
);
alter table offers enable row level security;
create index if not exists offers_card_idx on offers (card_id);
```

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー ([platform.claude.com](https://platform.claude.com/) で取得) |
| `ANTHROPIC_MODEL` | — | モデル上書き(デフォルト `claude-opus-4-8`) |
| `SUPABASE_URL` | 推奨 | SupabaseプロジェクトのURL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 推奨 | Supabaseの `service_role` キー。**サーバー専用の秘密鍵**なので `NEXT_PUBLIC_` を付けないこと |
| `NEXT_PUBLIC_SUPABASE_URL` | 企業機能に必要 | 同じProject URL。ブラウザの企業認証用(公開可) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 企業機能に必要 | Supabaseの `anon` `public` キー。**公開可**(`service_role`ではない方) |

> フェーズ3の企業ログイン(`/company`)には `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` の2つが必要です。未設定でも求職者フローは動きます(企業画面は「認証が未設定」と表示)。あわせて Supabaseダッシュボードの **Authentication → Providers → Email** を有効化してください。

Supabase 2変数は両方設定したときのみDB保存が有効になります。未設定ならローカル保存フォールバックで動作します。

## Vercelへのデプロイ

Next.jsのゼロコンフィグ構成のまま動きます(`vercel.json` 不要)。

1. **Supabaseの準備(推奨)**
   1. [supabase.com](https://supabase.com/) でプロジェクトを作成
   2. SQL Editorで `supabase/schema.sql` を実行し `career_cards` テーブルを作成
   3. Project Settings → API から `URL` と `service_role` キーを控える
2. **Vercelにインポート**
   1. [vercel.com/new](https://vercel.com/new) でこのGitHubリポジトリをインポート(Framework Presetは自動で Next.js になる)
   2. デプロイ対象のProduction Branchが `main` になっていることを確認(Settings → Git)
3. **環境変数を設定** — Project Settings → Environment Variables で上の表の変数を登録
   - `ANTHROPIC_API_KEY`(必須)
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`(DB保存を有効にする場合)
4. **Deploy** — 以後 `main` へのpushで自動デプロイされます

補足:

- APIルートは `runtime = "nodejs"` / `maxDuration = 120` を指定済み。Vercelの既定(Fluid Compute)ではHobbyプランでも120秒の面談・解析リクエストをそのまま処理できます
- 環境変数を変更したら再デプロイが必要です
- `.env*` はgitignore済み。キーは必ずVercelの環境変数として設定してください

## 構成

```
app/
  page.tsx                  … LP / 基礎情報 / 面談 / 解析中 / カード(v0.2)
  quiz/page.tsx             … クイック層診断(v0.3 F1-1/2/3)
  comm-test/page.tsx        … コミュ試験(v0.3 F1-5)
  traits/page.tsx           … 特性診断(v0.3 F2-2・参考特性)
  resume/page.tsx           … 履歴書アップロード・確認(v0.3 F2-1)
  voice/page.tsx            … 音声面接・同意・録音・評価(v0.3 F2-3)
  r/[shareId]/page.tsx      … 公開結果ページ(匿名要約のみ・F1-3)
  r/[shareId]/opengraph-image.tsx … 動的OGP画像(横組み・朱印)
  layout.tsx                … 和文フォント(Zen Old Mincho / IBM Plex)
  api/interview|analyze|cards … v0.2 面談・解析・カード
  api/comm-test/route.ts    … コミュ試験の採点(根拠引用照合)
  api/deviation/route.ts    … 偏差値算出(匿名分布・F1-4)
  api/quick-result/route.ts … クイック結果を匿名シェア保存 + 偏差値
  api/resume/route.ts       … 履歴書のパース(Anthropic文書読み取り・F2-1)
  api/documents/[id]/route.ts … 履歴書の本人確定(F2-1)
  api/voice-eval/route.ts   … 音声の発話内容評価(根拠照合)+ 補助指標(F2-3)
  api/health/route.ts       … 設定診断(Supabase/鍵の有無・値は出さない)
components/
  ui.tsx / card.tsx         … 朱印・キャリアカード表示(v0.2)
  diagnostic/motion.tsx     … reduced-motion対応の演出部品(F1-2)
lib/
  grounding.ts              … 引用・数字の照合検証(全スコアの根拠主義の中核)
  competencyModel.ts / interviewEngine.ts / questionBank.ts / prompts.ts … v0.2 面接
  quality.ts / demoProfile.ts … カード品質・デモ
  quizBank.ts               … クイック層 設問+採点(コード側固定)
  commTest.ts               … コミュ試験 軸+BARS+採点スキーマ
  deviation.ts              … 偏差値・パーセンタイル
  shares.ts                 … 公開シェアの取得(匿名要約のみ)
  diagnostic/types.ts       … 診断の共有型
  supabase.ts / theme.ts / types.ts
supabase/schema.sql         … career_cards / interview_sessions / score_distributions / quick_shares
docs/v0.3-plan.md           … v0.3 実装計画(合意済み)
```

## 設計方針

- **AI呼び出しはすべてサーバー経由** — APIキー・プロンプト・スキーマをクライアントに出さない
- **グラウンディング** — LLM出力はstructured outputsでスキーマ強制した上で、`lib/grounding.ts` が引用の逐語一致と数字の発言由来をサーバー照合する。プロンプトだけを信用しない
- **誠実な欠損** — 根拠のない項目はデモデータで埋めず、`null` を保持して「面談で十分に聴取できませんでした」と正直に表示する
- **端末にはカードIDだけを保存** — カード本体と会話ログはDB側。UUIDを知る本人だけが取得・削除できる(デモ版。本番はセッション認証 + RLSに置き換える想定)
- **DBなしでも動く** — Supabase未設定時はローカル保存にフォールバック。面談状態(`InterviewState`)もリクエストで往復するためDB非依存
