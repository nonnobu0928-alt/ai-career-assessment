# 一気 IKKI — AIキャリアエージェント

「面接まで、一気通貫。」— AIと10分話すだけで、キャリアの棚卸しからキャリアカード(職務経歴書の再発明)、一次面接までが終わる転職サービスのプロトタイプを、Next.js + DB構成に移植したものです。

デザイン思想: **「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)**。縦書きの見出し、Zen Old Mincho × IBM Plex Sans JP。詳細は各ファイル冒頭のコメントに残しています。

v0.2 で「会話を要約するチャット」から「検証可能な構造化面接エンジン」へ改修。設計原則は **トレーサビリティ / グラウンディング / 比較可能性 / 誠実な欠損 / 質問の分解** の5つ(`ikki-v0.2-spec.md`)。

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

DB未設定でも動作します(カードは端末のlocalStorageに保存されるフォールバックモード)。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー ([platform.claude.com](https://platform.claude.com/) で取得) |
| `ANTHROPIC_MODEL` | — | モデル上書き(デフォルト `claude-opus-4-8`) |
| `SUPABASE_URL` | 推奨 | SupabaseプロジェクトのURL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 推奨 | Supabaseの `service_role` キー。**サーバー専用の秘密鍵**なので `NEXT_PUBLIC_` を付けないこと |

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
  page.tsx                  … 全画面(LP / 基礎情報 / 面談 / 解析中 / カード)
  layout.tsx                … 和文フォント(Zen Old Mincho / IBM Plex)
  api/interview/route.ts    … 面談ステートマシン(抽出→方針→質問整形の3段)
  api/analyze/route.ts      … 会話ログ→カード生成 + グラウンディング照合 + 品質算出 + DB保存
  api/cards/[id]/route.ts   … 保存済みカードの取得・削除(transcript同梱)
components/
  ui.tsx                    … 朱印(Seal)などの小部品
  card.tsx                  … キャリアカード表示(本人/企業ビュー・ドリルダウン)
lib/
  prompts.ts                … 面談・解析・抽出プロンプト / スキーマ / 正規化
  grounding.ts              … 引用・数字の照合検証(ハルシネーション根絶の中核)
  competencyModel.ts        … 固定5コンピテンシー × BARS行動基準
  interviewEngine.ts        … スロット充足型ステートマシン
  questionBank.ts           … 事実ベースの質問バンク + 回答ガイド
  quality.ts                … Card Quality Score算出
  demoProfile.ts            … デモカード(サンプルバッジ付き。補完には使わない)
  supabase.ts / theme.ts / types.ts
supabase/schema.sql         … career_cards / interview_sessions テーブル定義
```

## 設計方針

- **AI呼び出しはすべてサーバー経由** — APIキー・プロンプト・スキーマをクライアントに出さない
- **グラウンディング** — LLM出力はstructured outputsでスキーマ強制した上で、`lib/grounding.ts` が引用の逐語一致と数字の発言由来をサーバー照合する。プロンプトだけを信用しない
- **誠実な欠損** — 根拠のない項目はデモデータで埋めず、`null` を保持して「面談で十分に聴取できませんでした」と正直に表示する
- **端末にはカードIDだけを保存** — カード本体と会話ログはDB側。UUIDを知る本人だけが取得・削除できる(デモ版。本番はセッション認証 + RLSに置き換える想定)
- **DBなしでも動く** — Supabase未設定時はローカル保存にフォールバック。面談状態(`InterviewState`)もリクエストで往復するためDB非依存
