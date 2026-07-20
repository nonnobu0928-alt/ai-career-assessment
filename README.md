# 一気 IKKI — AIキャリアエージェント

「面接まで、一気通貫。」— AIと10分話すだけで、キャリアの棚卸しからキャリアカード(職務経歴書の再発明)、一次面接までが終わる転職サービスのプロトタイプを、Next.js + DB構成に移植したものです。

デザイン思想: **「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)**。縦書きの見出し、Zen Old Mincho × IBM Plex Sans JP。詳細は各ファイル冒頭のコメントに残しています。

## 体験フロー

1. **AI面談** — エージェントAIが全6問・1問ずつ、STARで深掘り(音声入力対応)
2. **キャリアカード生成** — 会話ログを解析し、強み・スキル・想定年収・価値観を構造化
3. **企業ビュー** — 採用担当者にカードがどう届くか(匿名・マッチ度・一次面接済の朱印)をプレビュー

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
  page.tsx                  … 全画面(LP / 基本情報 / 面談 / 解析中 / カード)
  layout.tsx                … next/fontによる和文フォント(Zen Old Mincho ほか)
  api/interview/route.ts    … 面談AIの1ターン。終了マーカー検出はサーバー側
  api/analyze/route.ts      … 会話ログ→キャリアカード生成(structured outputs) + DB保存
  api/cards/[id]/route.ts   … 保存済みカードの取得・削除
components/ui.tsx           … 朱印(Seal)などの小部品
lib/
  prompts.ts                … 面談・解析プロンプト / スキーマ / 正規化ロジック
  supabase.ts               … サーバー専用Supabaseクライアント
  theme.ts                  … デザイントークン(藍 × 朱)
  types.ts                  … 共有型定義
supabase/schema.sql         … career_cards テーブル定義
```

## DB化の設計方針

- **AI呼び出しはすべてサーバー経由** — APIキー・プロンプト・スキーマをクライアントに出さない
- **端末にはカードIDだけを保存** — カード本体と会話ログはDB側。UUIDを知る本人だけが取得・削除できる(デモ版。本番はセッション認証 + RLSに置き換える想定)
- **「壊れないカード」** — LLM出力はstructured outputsでスキーマ強制した上で、件数・数値レンジをサーバー側で必ずクランプしてから保存・返却する
- **DBなしでも動く** — Supabase未設定時はローカル保存にフォールバックし、プロトタイプの体験をそのまま維持
