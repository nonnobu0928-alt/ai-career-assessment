"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { ProgressSquares, Eyebrow, SectionLabel, Seal } from "@/components/ui";
import { C, mono, sans, serif } from "@/lib/theme";
import type { CandidateInput, ChatMessage, Profile } from "@/lib/types";

// ============================================================
// 一気 IKKI — AIキャリアエージェント
// デザイン: 「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)
// 縦書きの見出し / Zen Old Mincho × IBM Plex Sans JP
//
// Next.js + DB版の設計:
// - AI呼び出しはすべてサーバー(/api/interview, /api/analyze)経由。
//   APIキー・プロンプト・スキーマはクライアントに出さない
// - カードはSupabaseに保存し、端末にはカードIDだけを持つ
//   (DB未設定時はプロファイル本体をローカル保存にフォールバック)
// ============================================================

// DBに保存されたカードのID(本命の永続化)
const CARD_ID_KEY = "ikki-card-id-v1";
// DB未設定時のフォールバック: プロファイル本体をローカル保存
const STORAGE_KEY = "ikki-career-card-v1";

const YEARS_OPTIONS = ["3年未満", "3〜5年", "5〜10年", "10年以上"];

const ANALYZE_STEPS = [
  "会話を読み込んでいます",
  "強みとスキルを抽出しています",
  "想定年収を算出しています",
  "キャリアカードに仕上げています",
];

type Screen = "landing" | "form" | "interview" | "analyzing" | "result";
type SavedCard = { profile: Profile; ts: number; id?: string };

// Web Speech API (実験的APIのため最小限の型だけ定義)
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [pInput, setPInput] = useState<CandidateInput>({ name: "", role: "", years: "3〜5年" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resultTab, setResultTab] = useState<"me" | "company">("me");
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [offerSent, setOfferSent] = useState(false);
  const [listening, setListening] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const analyzeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 音声入力の対応可否。SSRではfalse、クライアントで実際に判定する
  const srAvailable = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as Record<string, unknown>;
      return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
    },
    () => false,
  );

  const userTurns = messages.filter((m) => m.role === "user").length;

  // 保存済みカードの読み込み: まずDB(カードID)、なければローカル
  useEffect(() => {
    (async () => {
      try {
        const id = localStorage.getItem(CARD_ID_KEY);
        if (id) {
          const res = await fetch(`/api/cards/${id}`);
          if (res.ok) {
            const { card } = await res.json();
            setSavedCard({ profile: card.profile, ts: Date.parse(card.created_at), id });
            return;
          }
          if (res.status === 404) localStorage.removeItem(CARD_ID_KEY);
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setSavedCard(JSON.parse(raw));
      } catch {
        /* 保存なし */
      }
    })();
  }, []);

  // チャット自動スクロール
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  // 解析ステップ演出
  useEffect(() => {
    if (screen === "analyzing") {
      analyzeTimer.current = setInterval(
        () => setAnalyzeStep((s) => Math.min(s + 1, ANALYZE_STEPS.length - 1)),
        1600,
      );
      return () => {
        if (analyzeTimer.current) clearInterval(analyzeTimer.current);
      };
    }
  }, [screen]);

  // ---------- アクション ----------

  function startInterview() {
    const first = `${pInput.name}さん、はじめまして。キャリアエージェントの「一気」です。ここからは面接ではなく、キャリアの棚卸しの時間です。肩の力を抜いて、普段の言葉でお話しください。\n\nまずは、現在のお仕事について教えてください。日々どんな業務を、どんな役割で担当されていますか?`;
    setMessages([{ role: "assistant", content: first }]);
    setInterviewDone(false);
    setError(null);
    setScreen("interview");
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: pInput, messages: next }),
      });
      if (!res.ok) throw new Error("interview failed");
      const data = (await res.json()) as { reply: string; done: boolean };
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.done) setInterviewDone(true);
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    setAnalyzeStep(0);
    setScreen("analyzing");
    setOfferSent(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: pInput, messages }),
      });
      if (!res.ok) throw new Error("analyze failed");
      const data = (await res.json()) as {
        saved: boolean;
        id: string | null;
        profile: Profile;
      };
      setProfile(data.profile);
      // 永続化: DB保存成功ならカードIDだけを端末に残す。
      // DB未設定・保存失敗時はプロファイル本体をローカルに残す
      try {
        if (data.saved && data.id) {
          localStorage.setItem(CARD_ID_KEY, data.id);
          localStorage.removeItem(STORAGE_KEY);
          setCardId(data.id);
          setSavedCard({ profile: data.profile, ts: Date.now(), id: data.id });
        } else {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ profile: data.profile, ts: Date.now() }),
          );
          setCardId(null);
          setSavedCard({ profile: data.profile, ts: Date.now() });
        }
      } catch {
        /* 保存失敗は無視 */
      }
      setResultTab("me");
      setScreen("result");
    } catch {
      setError("解析に失敗しました。通信環境を確認して、もう一度お試しください。");
      setScreen("interview");
    }
  }

  function openSaved() {
    if (savedCard && savedCard.profile) {
      setProfile(savedCard.profile);
      setCardId(savedCard.id ?? null);
      setPInput({
        name: savedCard.profile.name || "",
        role: savedCard.profile.role || "",
        years: savedCard.profile.years || "3〜5年",
      });
      setResultTab("me");
      setOfferSent(false);
      setScreen("result");
    }
  }

  async function resetAll() {
    // DB上のカードも一緒に削除する(本人による削除権)
    try {
      const id = cardId ?? localStorage.getItem(CARD_ID_KEY);
      if (id) await fetch(`/api/cards/${id}`, { method: "DELETE" });
    } catch {
      /* noop */
    }
    try {
      localStorage.removeItem(CARD_ID_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setSavedCard(null);
    setCardId(null);
    setProfile(null);
    setMessages([]);
    setInput("");
    setInterviewDone(false);
    setError(null);
    setOfferSent(false);
    setScreen("landing");
  }

  function toggleMic() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {}
      setListening(false);
      return;
    }
    try {
      const r = new SR();
      r.lang = "ja-JP";
      r.interimResults = false;
      r.continuous = false;
      r.onresult = (ev) => {
        const t = Array.from(ev.results, (x) => x[0].transcript).join("");
        setInput((v) => (v ? v + " " : "") + t);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recogRef.current = r;
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  // ---------- 共通スタイル ----------

  const btnPrimary: CSSProperties = {
    background: C.indigo,
    color: "#FFFFFF",
    fontFamily: sans,
    fontWeight: 600,
    borderRadius: 10,
    padding: "15px 20px",
    width: "100%",
    fontSize: 15,
    border: "none",
    cursor: "pointer",
    letterSpacing: "0.02em",
  };
  const btnGhost: CSSProperties = {
    background: "transparent",
    color: C.indigo,
    fontFamily: sans,
    fontWeight: 500,
    borderRadius: 10,
    padding: "13px 20px",
    width: "100%",
    fontSize: 14,
    border: `1.5px solid ${C.line}`,
    cursor: "pointer",
  };
  const inputStyle: CSSProperties = {
    width: "100%",
    background: C.surface,
    border: `1.5px solid ${C.line}`,
    borderRadius: 10,
    padding: "13px 14px",
    fontSize: 15,
    fontFamily: sans,
    color: C.ink,
    boxSizing: "border-box",
  };
  const chip: CSSProperties = {
    display: "inline-block",
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 12.5,
    fontFamily: sans,
    color: C.ink,
    marginRight: 6,
    marginBottom: 6,
    background: C.surface,
  };

  // ---------- 画面 ----------

  function renderHeader(backable: boolean) {
    return (
      <div
        className="flex items-center justify-between"
        style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}` }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          <Seal text="一" size={30} />
          <div>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>
              一気
            </span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: C.muted,
                marginLeft: 8,
              }}
            >
              IKKI
            </span>
          </div>
        </div>
        {backable ? (
          <button
            onClick={() => setScreen("landing")}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontFamily: sans,
              fontSize: 13,
              cursor: "pointer",
              padding: 6,
            }}
          >
            やめる
          </button>
        ) : (
          <span
            style={{
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.14em",
              color: C.muted,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: "4px 10px",
            }}
          >
            PROTOTYPE
          </span>
        )}
      </div>
    );
  }

  function renderLanding() {
    return (
      <div style={{ animation: "fadeUp 0.4s ease both" }}>
        {renderHeader(false)}
        <div style={{ padding: "36px 24px 28px" }}>
          <div className="flex justify-between items-start" style={{ gap: 16 }}>
            <div style={{ paddingTop: 6, flex: 1 }}>
              <Eyebrow>AI CAREER AGENT</Eyebrow>
              <p
                style={{
                  fontFamily: sans,
                  fontSize: 14.5,
                  lineHeight: 1.95,
                  color: C.ink,
                  margin: "14px 0 0",
                }}
              >
                AIと10分話すだけで、
                <br />
                キャリアの棚卸しから
                <br />
                職務経歴書、そして
                <br />
                一次面接までが終わる。
              </p>
              <p
                style={{
                  fontFamily: sans,
                  fontSize: 12.5,
                  lineHeight: 1.8,
                  color: C.muted,
                  margin: "14px 0 0",
                }}
              >
                あなたの言葉が、
                <br />
                そのまま選考データになる。
              </p>
            </div>
            <div
              style={{
                writingMode: "vertical-rl",
                fontFamily: serif,
                fontWeight: 700,
                fontSize: 40,
                lineHeight: 1.32,
                letterSpacing: "0.16em",
                color: C.ink,
                height: 300,
                flexShrink: 0,
              }}
            >
              <span>面接まで、</span>
              <span style={{ color: C.indigo }}>一気通貫。</span>
            </div>
          </div>

          <div style={{ marginTop: 30 }}>
            {[
              ["01", "AIと話す", "約10分。音声入力にも対応"],
              ["02", "キャリアカードが完成", "強み・スキル・想定年収を自動生成"],
              ["03", "一次面接を省略", "企業はカードを見て、最終面接からオファー"],
            ].map(([n, t, d]) => (
              <div
                key={n}
                className="flex items-baseline"
                style={{ gap: 14, padding: "13px 0", borderTop: `1px solid ${C.line}` }}
              >
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    color: C.indigo,
                    letterSpacing: "0.1em",
                  }}
                >
                  {n}
                </span>
                <div>
                  <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 14.5, color: C.ink }}>
                    {t}
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    {d}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {savedCard && savedCard.profile && (
            <div
              style={{
                marginTop: 22,
                background: C.surface,
                border: `1.5px solid ${C.line}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ fontFamily: sans, fontSize: 13.5, color: C.ink, fontWeight: 600 }}>
                前回のキャリアカードが保存されています
              </div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, marginTop: 3 }}>
                {savedCard.profile.name}さん / {savedCard.profile.role}
              </div>
              <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                <button onClick={openSaved} style={{ ...btnPrimary, padding: "11px 16px", fontSize: 13.5 }}>
                  カードを開く
                </button>
                <button
                  onClick={() => setScreen("form")}
                  style={{ ...btnGhost, padding: "11px 16px", fontSize: 13.5 }}
                >
                  新しく面談する
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 26 }}>
            <button onClick={() => setScreen("form")} style={btnPrimary}>
              AI面談をはじめる
            </button>
            <div
              style={{
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: "0.14em",
                color: C.muted,
                textAlign: "center",
                marginTop: 12,
              }}
            >
              POWERED BY CLAUDE ・ 無料
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderForm() {
    const ok = pInput.name.trim() && pInput.role.trim();
    return (
      <div style={{ animation: "fadeUp 0.4s ease both" }}>
        {renderHeader(true)}
        <div style={{ padding: "30px 24px" }}>
          <Eyebrow>STEP 1 / 3 — 基本情報</Eyebrow>
          <h2
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 24,
              color: C.ink,
              margin: "6px 0 6px",
            }}
          >
            はじめまして。
          </h2>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>
            面談で呼びかけるお名前と、現在のお仕事を教えてください。
          </p>

          <div style={{ marginTop: 24 }}>
            <label style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              お名前(ニックネーム可)
            </label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={pInput.name}
              onChange={(e) => setPInput({ ...pInput, name: e.target.value })}
              placeholder="例: 佐藤"
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              現在の職種
            </label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={pInput.role}
              onChange={(e) => setPInput({ ...pInput, role: e.target.value })}
              placeholder="例: 法人営業 / 経理 / エンジニア"
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              社会人経験
            </label>
            <select
              style={{ ...inputStyle, marginTop: 6 }}
              value={pInput.years}
              onChange={(e) => setPInput({ ...pInput, years: e.target.value })}
            >
              {YEARS_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 28 }}>
            <button
              onClick={startInterview}
              disabled={!ok}
              style={{ ...btnPrimary, opacity: ok ? 1 : 0.4 }}
            >
              面談をはじめる(約10分)
            </button>
            <p
              style={{
                fontFamily: sans,
                fontSize: 11.5,
                color: C.muted,
                lineHeight: 1.7,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              面談の回答は、キャリアカードの生成と保存のためだけに使われます
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderInterview() {
    return (
      <div className="flex flex-col" style={{ height: "100dvh", animation: "fadeUp 0.3s ease both" }}>
        {renderHeader(true)}
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 20px", borderBottom: `1px solid ${C.line}`, background: C.surface }}
        >
          <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>
            CAREER INTERVIEW
          </span>
          <div className="flex items-center" style={{ gap: 10 }}>
            <ProgressSquares filled={Math.min(userTurns, 6)} />
            <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>
              {Math.min(userTurns, 6)}/6
            </span>
          </div>
        </div>

        <div ref={chatRef} className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 12px" }}>
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} style={{ marginBottom: 20, maxWidth: "92%" }}>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: C.indigo,
                    marginBottom: 6,
                  }}
                >
                  一気 — AGENT
                </div>
                <div
                  style={{
                    fontFamily: sans,
                    fontSize: 14.5,
                    lineHeight: 1.9,
                    color: C.ink,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end" style={{ marginBottom: 20 }}>
                <div
                  style={{
                    background: C.indigo,
                    color: "#FFFFFF",
                    fontFamily: sans,
                    fontSize: 14,
                    lineHeight: 1.8,
                    padding: "12px 16px",
                    borderRadius: "16px 16px 4px 16px",
                    maxWidth: "85%",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ),
          )}
          {loading && (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  color: C.indigo,
                  marginBottom: 6,
                }}
              >
                一気 — AGENT
              </div>
              <div className="flex" style={{ gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: C.mutedLight,
                      animation: `blink 1.2s ${i * 0.18}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {error && (
            <div
              style={{
                fontFamily: sans,
                fontSize: 13,
                color: C.seal,
                padding: "10px 0",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${C.line}`, background: C.surface, padding: "12px 16px 16px" }}>
          {interviewDone ? (
            <div>
              <button onClick={analyze} style={btnPrimary}>
                キャリアカードを生成する
              </button>
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 11.5,
                  color: C.muted,
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                面談おつかれさまでした。回答をもとにカードを作成します。
              </div>
            </div>
          ) : (
            <div>
              {userTurns >= 2 && (
                <button
                  onClick={analyze}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.indigo,
                    fontFamily: sans,
                    fontSize: 12.5,
                    cursor: "pointer",
                    padding: "0 0 10px",
                    textDecoration: "underline",
                  }}
                >
                  ここまでの内容でカードを生成する
                </button>
              )}
              <div className="flex items-end" style={{ gap: 8 }}>
                {srAvailable && (
                  <button
                    onClick={toggleMic}
                    aria-label="音声入力"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      border: `1.5px solid ${listening ? C.seal : C.line}`,
                      background: listening ? "#FBEDEB" : C.surface,
                      color: listening ? C.seal : C.muted,
                      fontSize: 18,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {listening ? "■" : "🎙"}
                  </button>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={listening ? "聞き取り中…" : "普段の言葉で入力"}
                  rows={Math.min(4, Math.max(1, input.split("\n").length))}
                  style={{
                    ...inputStyle,
                    resize: "none",
                    lineHeight: 1.6,
                    flex: 1,
                  }}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  aria-label="送信"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    border: "none",
                    background: C.indigo,
                    color: "#fff",
                    fontSize: 16,
                    cursor: "pointer",
                    opacity: !input.trim() || loading ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderAnalyzing() {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ height: "100dvh", padding: 24, animation: "fadeUp 0.3s ease both" }}
      >
        <div style={{ animation: "pulseSoft 1.6s ease-in-out infinite" }}>
          <Seal text="解析中" size={92} />
        </div>
        <div
          style={{
            fontFamily: serif,
            fontWeight: 700,
            fontSize: 19,
            color: C.ink,
            marginTop: 28,
          }}
        >
          {ANALYZE_STEPS[analyzeStep]}
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 10.5,
            letterSpacing: "0.16em",
            color: C.muted,
            marginTop: 10,
          }}
        >
          GENERATING CAREER CARD
        </div>
      </div>
    );
  }

  // ---------- 結果: 本人ビュー ----------

  function renderMeView(p: Profile) {
    const axisMin = 300;
    const axisMax = 1200;
    const leftPct = Math.max(0, ((p.salaryMin - axisMin) / (axisMax - axisMin)) * 100);
    const widthPct = Math.min(100 - leftPct, ((p.salaryMax - p.salaryMin) / (axisMax - axisMin)) * 100);
    const radarData = (p.skills || []).map((s) => ({ subject: s.name, v: s.score }));

    return (
      <div style={{ padding: "22px 20px 8px" }}>
        <Eyebrow>CAREER CARD — No.0001</Eyebrow>
        <div
          style={{
            position: "relative",
            background: C.surface,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: "24px 20px 22px",
          }}
        >
          <div style={{ position: "absolute", top: 18, right: 18 }}>
            <Seal text="面談済" size={62} animate />
          </div>

          <div style={{ paddingRight: 76 }}>
            <div
              style={{
                fontFamily: serif,
                fontWeight: 700,
                fontSize: 21,
                lineHeight: 1.5,
                color: C.ink,
              }}
            >
              {p.catchcopy}
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 8 }}>
              {p.name} 様 ・ {p.role} ・ 経験{p.years}
            </div>
          </div>

          <p
            style={{
              fontFamily: sans,
              fontSize: 13.5,
              lineHeight: 1.9,
              color: C.ink,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            {p.summary}
          </p>

          <SectionLabel>強み — STRENGTHS</SectionLabel>
          {(p.strengths || []).map((s, i) => (
            <div key={i} className="flex" style={{ gap: 10, marginBottom: 12 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: C.indigo,
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13.5, color: C.ink }}>
                  {s.title}
                </div>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginTop: 2 }}>
                  {s.desc}
                </div>
              </div>
            </div>
          ))}

          <SectionLabel>スキル — SKILLS</SectionLabel>
          <div style={{ width: "100%", height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke={C.line} />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 10.5, fill: C.muted, fontFamily: sans }}
                />
                <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke={C.indigo} strokeWidth={2} fill={C.indigo} fillOpacity={0.16} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <SectionLabel>代表エピソード — STAR</SectionLabel>
          {[
            ["状況", p.episode?.situation],
            ["行動", p.episode?.action],
            ["成果", p.episode?.result],
          ].map(([label, text], i) => (
            <div
              key={i}
              style={{
                borderLeft: `2.5px solid ${C.indigo}`,
                paddingLeft: 12,
                marginBottom: 10,
              }}
            >
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: C.indigo }}>
                {label}
              </span>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.ink, lineHeight: 1.7, marginTop: 2 }}>
                {text}
              </div>
            </div>
          ))}

          <SectionLabel>想定年収 — MARKET VALUE</SectionLabel>
          <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, color: C.ink }}>
            {p.salaryMin}
            <span style={{ fontSize: 15, color: C.muted }}> – </span>
            {p.salaryMax}
            <span style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginLeft: 6 }}>万円</span>
          </div>
          <div
            style={{
              position: "relative",
              height: 6,
              borderRadius: 3,
              background: C.paper,
              border: `1px solid ${C.line}`,
              marginTop: 10,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: -1,
                bottom: -1,
                borderRadius: 3,
                background: C.indigo,
              }}
            />
          </div>
          <div
            className="flex justify-between"
            style={{ fontFamily: mono, fontSize: 10, color: C.mutedLight, marginTop: 5 }}
          >
            <span>300</span>
            <span>750</span>
            <span>1200</span>
          </div>

          <SectionLabel>価値観 / 適職 — FIT</SectionLabel>
          <div>
            {(p.values || []).map((v, i) => (
              <span key={"v" + i} style={{ ...chip, borderColor: C.indigo, color: C.indigo }}>
                {v}
              </span>
            ))}
            {(p.matchRoles || []).map((r, i) => (
              <span key={"r" + i} style={chip}>
                {r}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={() => setResultTab("company")} style={btnPrimary}>
            企業からの見え方を見る
          </button>
          <button onClick={() => setScreen("form")} style={{ ...btnGhost, marginTop: 10 }}>
            もう一度面談する
          </button>
          <button
            onClick={resetAll}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontFamily: sans,
              fontSize: 12,
              cursor: "pointer",
              width: "100%",
              padding: "14px 0 4px",
              textDecoration: "underline",
            }}
          >
            カードを削除してはじめから
          </button>
        </div>
      </div>
    );
  }

  // ---------- 結果: 企業ビュー ----------

  function renderCompanyView(p: Profile) {
    const initial = (p.name || "K").slice(0, 1);
    return (
      <div style={{ background: C.navyBg, padding: "22px 20px 28px", minHeight: 400 }}>
        <Eyebrow light>RECRUITER VIEW — 採用担当者の画面(デモ)</Eyebrow>
        <p
          style={{
            fontFamily: sans,
            fontSize: 12.5,
            color: C.mutedLight,
            lineHeight: 1.8,
            margin: "0 0 16px",
          }}
        >
          企業側には、あなたのカードがこう届きます。書類選考と一次面接を省略し、企業は「口説き」から始められます。
        </p>

        <div
          style={{
            position: "relative",
            background: C.navySurface,
            border: `1.5px solid ${C.navyLine}`,
            borderRadius: 14,
            padding: "22px 20px",
          }}
        >
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <Seal text="一次済" size={56} />
          </div>

          <div style={{ paddingRight: 70 }}>
            <div className="flex items-baseline" style={{ gap: 10 }}>
              <span style={{ fontFamily: mono, fontSize: 34, fontWeight: 500, color: "#FFFFFF" }}>
                {p.matchScore}
              </span>
              <span style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight }}>
                マッチ度 / 100
              </span>
            </div>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: "#FFFFFF", marginTop: 10 }}>
              {initial} さん(匿名)
            </div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, marginTop: 3 }}>
              {p.role} ・ 経験{p.years} ・ 氏名はマッチ成立後に開示
            </div>
          </div>

          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 14 }}>
            {["AI面談 完了", "回答ログ 開示同意済", "本人入力データ"].map((b) => (
              <span
                key={b}
                style={{
                  fontFamily: sans,
                  fontSize: 11,
                  color: C.mutedLight,
                  border: `1px solid ${C.navyLine}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                {b}
              </span>
            ))}
          </div>

          <SectionLabel light>スキル評価</SectionLabel>
          {(p.skills || []).map((s, i) => (
            <div key={i} className="flex items-center" style={{ gap: 10, marginBottom: 9 }}>
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 12,
                  color: "#DDE6F2",
                  width: 76,
                  flexShrink: 0,
                }}
              >
                {s.name}
              </span>
              <div className="flex" style={{ gap: 4, flex: 1 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    style={{
                      height: 8,
                      flex: 1,
                      borderRadius: 2,
                      background: n <= s.score ? "#5B84B8" : "rgba(255,255,255,0.08)",
                    }}
                  />
                ))}
              </div>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.mutedLight, width: 26, textAlign: "right" }}>
                {s.score}.0
              </span>
            </div>
          ))}

          <SectionLabel light>面談ハイライト</SectionLabel>
          <div
            style={{
              fontFamily: serif,
              fontSize: 14,
              lineHeight: 1.9,
              color: "#EDF2F8",
              borderLeft: `2.5px solid #5B84B8`,
              paddingLeft: 12,
            }}
          >
            {p.highlight}
          </div>

          <SectionLabel light>希望条件</SectionLabel>
          <div style={{ fontFamily: mono, fontSize: 20, color: "#FFFFFF" }}>
            {p.salaryMin} – {p.salaryMax}
            <span style={{ fontFamily: sans, fontSize: 12, color: C.mutedLight, marginLeft: 6 }}>
              万円(想定)
            </span>
          </div>
          <div className="flex flex-wrap" style={{ marginTop: 10 }}>
            {(p.strengths || []).map((s, i) => (
              <span
                key={i}
                style={{
                  ...chip,
                  background: "transparent",
                  borderColor: C.navyLine,
                  color: "#DDE6F2",
                }}
              >
                {s.title}
              </span>
            ))}
          </div>

          <div style={{ marginTop: 22 }}>
            {offerSent ? (
              <div
                style={{
                  border: `1.5px solid #5B84B8`,
                  color: "#DDE6F2",
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 14,
                  borderRadius: 10,
                  padding: "14px 20px",
                  textAlign: "center",
                }}
              >
                最終面接のオファーを送信しました(デモ)
              </div>
            ) : (
              <button
                onClick={() => setOfferSent(true)}
                style={{
                  ...btnPrimary,
                  background: "#FFFFFF",
                  color: C.navyBg,
                }}
              >
                最終面接をオファーする
              </button>
            )}
            <div
              style={{
                fontFamily: sans,
                fontSize: 11.5,
                color: C.mutedLight,
                textAlign: "center",
                marginTop: 10,
                lineHeight: 1.7,
              }}
            >
              一次面接の会話ログは、候補者の同意範囲でのみ閲覧できます
            </div>
          </div>
        </div>

        <button
          onClick={() => setResultTab("me")}
          style={{
            background: "none",
            border: `1.5px solid ${C.navyLine}`,
            color: "#DDE6F2",
            fontFamily: sans,
            fontWeight: 500,
            fontSize: 14,
            borderRadius: 10,
            padding: "13px 20px",
            width: "100%",
            marginTop: 16,
            cursor: "pointer",
          }}
        >
          自分のカードに戻る
        </button>
      </div>
    );
  }

  function renderResult() {
    if (!profile) return null;
    return (
      <div style={{ animation: "fadeUp 0.4s ease both" }}>
        {renderHeader(true)}
        <div
          className="flex"
          style={{ borderBottom: `1px solid ${C.line}`, background: C.surface }}
        >
          {(
            [
              ["me", "あなたのカード"],
              ["company", "企業からの見え方"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setResultTab(key)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                borderBottom: `2.5px solid ${resultTab === key ? C.indigo : "transparent"}`,
                color: resultTab === key ? C.ink : C.muted,
                fontFamily: sans,
                fontWeight: resultTab === key ? 700 : 500,
                fontSize: 13.5,
                padding: "13px 0",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {resultTab === "me" ? renderMeView(profile) : renderCompanyView(profile)}
        <div
          style={{
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: C.muted,
            textAlign: "center",
            padding: "20px 0 26px",
            background: resultTab === "company" ? C.navyBg : "transparent",
          }}
        >
          一気 IKKI — PROTOTYPE ・ POWERED BY CLAUDE
        </div>
      </div>
    );
  }

  // ---------- ルート ----------

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", background: C.paper, minHeight: "100vh" }}>
        {screen === "landing" && renderLanding()}
        {screen === "form" && renderForm()}
        {screen === "interview" && renderInterview()}
        {screen === "analyzing" && renderAnalyzing()}
        {screen === "result" && renderResult()}
      </div>
    </div>
  );
}
