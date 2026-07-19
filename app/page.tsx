"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REPORT_MARKER = "ポータブルスキル・コア";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREETING =
  "こんにちは!私はあなたのキャリアの強みを言語化するAIエージェントです。\n\nこれから10分ほどの対話を通じて、あなた自身も気づいていない「ポータブルスキル」と「行動スタンス」を構造化し、レポートとしてお渡しします。\n\nまずは、現在(または直近)のご職種と、「今いちばん自信のあるスキル」を1つだけ教えてください。";

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isReport = !isUser && message.content.includes(REPORT_MARKER);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-4`}>
      {!isUser && (
        <div className="mr-2 flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-emerald-500 text-white"
            : isReport
              ? "rounded-bl-md border-2 border-amber-300 bg-amber-50 text-gray-900"
              : "rounded-bl-md bg-white text-gray-900"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const assessmentSent = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveAssessment = useCallback(async (history: ChatMessage[]) => {
    if (assessmentSent.current) return;
    assessmentSent.current = true;
    try {
      await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
    } catch {
      // 裏側の評価保存の失敗はユーザー体験に影響させない
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || reportDone) return;

    setError(null);
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `サーバーエラー (${res.status})`);
      }

      let assistantText = "";
      setMessages([...history, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          const parsed = JSON.parse(payload) as { text?: string; error?: string };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            assistantText += parsed.text;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          }
        }
      }

      const finalHistory: ChatMessage[] = [
        ...history,
        { role: "assistant", content: assistantText },
      ];

      // フィードバックレポートが出力されたら、裏側で評価JSONを生成・保存
      if (assistantText.includes(REPORT_MARKER)) {
        setReportDone(true);
        void saveAssessment(finalHistory);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
      setMessages(messages.concat({ role: "user", content: text }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, reportDone, messages, saveAssessment]);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-[#8cabd8]">
      <header className="flex items-center gap-3 bg-white/90 px-4 py-3 shadow backdrop-blur">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 font-bold text-white">
          AI
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">
            AIキャリア面談 — 強みの言語化セッション
          </h1>
          <p className="text-xs text-gray-500">
            {reportDone
              ? "セッション完了 — レポートが生成されました 🎉"
              : loading
                ? "入力中…"
                : "オンライン"}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start px-4">
            <div className="mr-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              AI
            </div>
            <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <span className="inline-flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="px-4 text-center text-sm font-medium text-red-100">
            ⚠️ {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <footer className="bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        {reportDone ? (
          <p className="py-2 text-center text-sm text-gray-500">
            セッションは終了しました。レポートを上でご確認ください。
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="メッセージを入力(Enterで送信 / Shift+Enterで改行)"
              className="max-h-32 flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-[15px] text-gray-900 outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 font-bold text-white transition enabled:hover:bg-emerald-600 disabled:opacity-40"
            >
              送信
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
