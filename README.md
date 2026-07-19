# AIキャリアアセスメント・チャット

「AI Career Assessment System Prompt Blueprint」に基づく、求職者向けAIキャリア面談チャットアプリのMVPです。

AIインタビュアーとの対話(1ターン1質問・仮説提示型の深掘り)を通じて、求職者の「ポータブルスキル」と「行動スタンス」を構造化し、対話終了時に:

1. **求職者向けフィードバックレポート**を画面に表示(感動体験・課金フック)
2. **企業向け構造化評価JSON**を裏側で自動生成し、Supabaseへ保存(任意設定)

## 技術スタック

- **Next.js 15 (App Router / TypeScript) + Tailwind CSS** — LINE風チャットUI
- **Anthropic SDK (`@anthropic-ai/sdk`)** — Claude Opus 4.8 のストリーミング出力(SSE)
- **Supabase (任意)** — 評価JSONのバックエンド保存

## セットアップ

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を設定
npm run dev
```

http://localhost:3000 を開くと面談が始まります。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー |
| `ANTHROPIC_MODEL` | — | モデル上書き(デフォルト `claude-opus-4-8`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | — | 設定時のみ評価JSONを `assessments` テーブルに保存 |

## Supabase テーブル (任意)

```sql
create table assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  transcript jsonb not null,
  assessment jsonb not null
);
```

## 仕組み

```
app/
  page.tsx               … LINE風チャットUI(ストリーミング表示・レポート検知)
  api/chat/route.ts      … 面談AI本体。システムプロンプト + SSEストリーミング
  api/assessment/route.ts … 対話全文から構造化評価JSONを生成(structured outputs)し、Supabaseへ保存
lib/
  systemPrompt.ts        … 面談プロトコル(3フェーズ / 5ステート / レポートフォーマット)
```

- 面談AIは INIT_STREAM → CONTEXT_DIG → DEEP_STAR → CASE_STRESS → REPORT_GEN の内部ステートで進行し、約10ターンでフィードバックレポートを出力します。
- フロントエンドはレポート出力(「ポータブルスキル・コア」マーカー)を検知すると、自動で `/api/assessment` を呼び出し評価JSONを生成します。
- AI生成の「盛った回答」をコピペした場合は、生々しいディテールを問う質問へ急カーブを切るカンニング防止ロジックをプロンプトに組み込み済みです。
