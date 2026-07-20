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
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー |
| `ANTHROPIC_MODEL` | — | モデル上書き(デフォルト `claude-opus-4-8`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 推奨 | 設定時、カードを `career_cards` テーブルに保存 |

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
