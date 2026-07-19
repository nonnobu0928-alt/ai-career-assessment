import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

type ChatMessage = { role: "user" | "assistant"; content: string };

// システム・企業向け構造化データ(裏側格納用JSON)のスキーマ
const ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    candidate_assessment: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "候補者を一言で表すサマリー(例: 自律駆動型のハイパフォーマー。課題の構造化が早い。)",
        },
        skills: {
          type: "object",
          properties: {
            structuring_score: { type: "integer", description: "構造化能力 0-100" },
            communication_score: { type: "integer", description: "コミュニケーション能力 0-100" },
            ownership_score: { type: "integer", description: "当事者意識 0-100" },
          },
          required: ["structuring_score", "communication_score", "ownership_score"],
          additionalProperties: false,
        },
        behavioral_traits: {
          type: "object",
          properties: {
            motivation_trigger: { type: "string", description: "モチベーションの源泉" },
            stress_tolerance: { type: "string", description: "ストレス耐性と対処傾向" },
          },
          required: ["motivation_trigger", "stress_tolerance"],
          additionalProperties: false,
        },
        first_interview_substitute_verified: {
          type: "boolean",
          description: "一次面接を代替可能な情報が揃ったか",
        },
        raw_insight_log_summary: {
          type: "string",
          description: "対話から確認できた具体的ファクトと再現性の評価",
        },
      },
      required: [
        "summary",
        "skills",
        "behavioral_traits",
        "first_interview_substitute_verified",
        "raw_insight_log_summary",
      ],
      additionalProperties: false,
    },
  },
  required: ["candidate_assessment"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY が設定されていません。" }, { status: 500 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages が空です。" }, { status: 400 });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "求職者" : "面接AI"}: ${m.content}`)
    .join("\n\n");

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "あなたは採用アセスメントの評価エンジンです。キャリア面談の全文トランスクリプトから、企業向けデータベースに格納する構造化評価JSONを生成します。対話中に確認できた具体的ファクトのみを根拠とし、盛った自己申告は割り引いて評価してください。",
    messages: [
      {
        role: "user",
        content: `以下のキャリア面談トランスクリプトを評価し、指定スキーマのJSONを生成してください。\n\n<transcript>\n${transcript}\n</transcript>`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: ASSESSMENT_SCHEMA },
    },
  });

  if (response.stop_reason === "refusal") {
    return Response.json({ error: "評価の生成が拒否されました。" }, { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let assessment: unknown;
  try {
    assessment = JSON.parse(text);
  } catch {
    return Response.json({ error: "評価JSONのパースに失敗しました。" }, { status: 502 });
  }

  // Supabase が設定されていればバックエンドに保存(なければスキップ)
  let saved = false;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from("assessments").insert({
      transcript: messages,
      assessment,
    });
    if (error) {
      console.error("Supabase insert error:", error.message);
    } else {
      saved = true;
    }
  }

  return Response.json({ ok: true, saved, assessment });
}
