import Anthropic from "@anthropic-ai/sdk";
import { buildInterviewSystemPrompt, stripEndMarker } from "@/lib/prompts";
import type { CandidateInput, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// 面談の1ターン。会話履歴を受け取り、エージェントの返答と
// 面談終了フラグを返す。終了判定(【面談終了】マーカー)は
// クライアントに漏らさずサーバー側で処理する。
export async function POST(req: Request) {
  const { candidate, messages } = (await req.json()) as {
    candidate: CandidateInput;
    messages: ChatMessage[];
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。" },
      { status: 500 },
    );
  }
  if (!candidate?.name || !candidate?.role) {
    return Response.json({ error: "candidate が不正です。" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages が空です。" }, { status: 400 });
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: buildInterviewSystemPrompt(candidate),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const { reply, done } = stripEndMarker(text);
  return Response.json({ reply, done });
}
