"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { ProgressSquares, Eyebrow, SectionLabel, Seal } from "@/components/ui";
import { DEMO_PROFILE_V2 } from "@/lib/demoProfile";
import { C, mono, sans, serif } from "@/lib/theme";
import type { CandidateInput, ChatMessage, Confidence, ProfileV2 } from "@/lib/types";

// ============================================================
// 一気 IKKI — AIキャリアエージェント
// デザイン: 「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)
//
// v0.2 (パッケージA): 検証可能なカード表示
// - カードの全記述は evidence_quote で会話ログに遡れる。
//   表示は3層(発言事実「」/ 構造化データ / AI所見ラベル)を区別する
// - 聴取できなかった項目は「面談で十分に聴取できませんでした」と
//   正直に表示する。デモデータでの補完はしない
// - デモカードはLPの「デモカードを見る」経由のみ。常時サンプルバッジ
// ============================================================

// DBに保存されたカードのID(本命の永続化)
const CARD_ID_KEY = "ikki-card-id-v1";
// DB未設定時のフォールバック: プロファイル本体をローカル保存
const STORAGE_KEY = "ikki-career-card-v1";

const YEARS_OPTIONS = ["3年未満", "3〜5年", "5〜10年", "10年以上"];

const ANALYZE_STEPS = [
  "会話を読み込んでいます",
  "強みとスキルを抽出しています",
  "根拠となる発言を照合しています",
  "キャリアカードに仕上げています",
];

// insufficient のキー → 表示名
const INSUFFICIENT_LABELS: Record<string, string> = {
  catchcopy: "キャッチコピー",
  summary: "サマリー",
  strengths: "強み",
  quant_facts: "定量実績",
  episode: "エピソード",
  highlight: "面談ハイライト",
  salary: "想定年収",
};

const CONFIDENCE_JA: Record<Confidence, string> = {
  high: "高",
  med: "中",
  low: "低",
};

type Screen = "landing" | "form" | "interview" | "analyzing" | "result";
type SavedCard = { profile: ProfileV2; ts: number; id?: string };

// Web Speech API (実験的APIのため最小限の型だけ定義)
type SRResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<SRResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

// 初回マイクガイドの既読フラグ
const MIC_GUIDE_KEY = "ikki-mic-guide-v1";

function isProfileV2(p: unknown): p is ProfileV2 {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as { schema_version?: number }).schema_version === 2
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [pInput, setPInput] = useState<CandidateInput>({ name: "", role: "", years: "3〜5年" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [profile, setProfile] = useState<ProfileV2 | null>(null);
  const [resultTab, setResultTab] = useState<"me" | "company">("me");
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [offerSent, setOfferSent] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState(""); // 認識途中テキスト(プレビュー枠のみに表示)
  const [micGuideOpen, setMicGuideOpen] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const analyzeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 音声認識: listeningの最新値(onendでの自動再開判定に使う)
  const listeningRef = useRef(false);
  // 自動再開をまたいで確定済みテキストを蓄積するバッファ
  const accumulatedRef = useRef("");
  // 現在の認識セッション内の確定済みテキスト
  const sessionFinalRef = useRef("");

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

  // 保存済みカードの読み込み: まずDB(カードID)、なければローカル。
  // v2スキーマ以外の保存データは互換性がないため無視する
  useEffect(() => {
    (async () => {
      try {
        const id = localStorage.getItem(CARD_ID_KEY);
        if (id) {
          const res = await fetch(`/api/cards/${id}`);
          if (res.ok) {
            const { card } = await res.json();
            if (isProfileV2(card.profile)) {
              setSavedCard({ profile: card.profile, ts: Date.parse(card.created_at), id });
              return;
            }
          }
          if (res.status === 404) localStorage.removeItem(CARD_ID_KEY);
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && isProfileV2(parsed.profile)) setSavedCard(parsed);
        }
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
        profile: ProfileV2;
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

  // デモカード: LPからのみ到達。保存・削除の対象にしない
  function openDemo() {
    setProfile(DEMO_PROFILE_V2);
    setResultTab("me");
    setOfferSent(false);
    setScreen("result");
  }

  function closeDemo() {
    setProfile(null);
    setScreen("landing");
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

  // ---------- 音声入力 (パッケージD) ----------
  // 方式: タップで開始 → 話し終わったら■で確定。
  // - 認識途中のテキストは入力欄に入れず、灰色プレビュー枠に表示
  // - ■を押した時点で初めて入力欄に入り、ユーザーが編集してから送信できる
  // - 無音でブラウザが認識を打ち切っても、listening中なら自動でstart()を
  //   再実行する(考え込む沈黙で切れない)

  function startMic() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.lang = "ja-JP";
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (ev) => {
        // 毎イベントで全resultsから確定分/途中分を組み立て直す
        let finals = "";
        let interims = "";
        for (const res of Array.from(ev.results)) {
          if (res.isFinal) finals += res[0].transcript;
          else interims += res[0].transcript;
        }
        sessionFinalRef.current = finals;
        setInterim(accumulatedRef.current + finals + interims);
      };
      r.onend = () => {
        // 沈黙などによるブラウザ側の打ち切り。■が押されるまでは自動再開する
        accumulatedRef.current += sessionFinalRef.current;
        sessionFinalRef.current = "";
        if (listeningRef.current) {
          try {
            r.start();
          } catch {
            listeningRef.current = false;
            setListening(false);
          }
        }
      };
      r.onerror = (ev) => {
        // 権限系のエラーのみ停止。no-speech等はonendの自動再開に任せる
        if (
          ev.error === "not-allowed" ||
          ev.error === "service-not-allowed" ||
          ev.error === "audio-capture"
        ) {
          listeningRef.current = false;
          setListening(false);
          setInterim("");
        }
      };
      recogRef.current = r;
      accumulatedRef.current = "";
      sessionFinalRef.current = "";
      setInterim("");
      r.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      listeningRef.current = false;
      setListening(false);
    }
  }

  // ■停止: ここで初めて確定テキストを入力欄に入れる
  function stopMic() {
    listeningRef.current = false;
    setListening(false);
    try {
      recogRef.current?.stop();
    } catch {}
    const text = (accumulatedRef.current + sessionFinalRef.current).trim() || interim.trim();
    accumulatedRef.current = "";
    sessionFinalRef.current = "";
    setInterim("");
    if (text) setInput((v) => (v ? v + " " : "") + text);
  }

  function toggleMic() {
    if (listening) {
      stopMic();
      return;
    }
    // 初回のみガイド(ボトムシート)を表示
    try {
      if (!localStorage.getItem(MIC_GUIDE_KEY)) {
        setMicGuideOpen(true);
        return;
      }
    } catch {}
    startMic();
  }

  function dismissMicGuideAndStart() {
    try {
      localStorage.setItem(MIC_GUIDE_KEY, "1");
    } catch {}
    setMicGuideOpen(false);
    startMic();
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

  // ---------- 3層構造の表示部品 ----------

  // 層3: AI所見ラベル(推定であることを常に明示)
  function AiLabel({ confidence, light = false }: { confidence?: Confidence | null; light?: boolean }) {
    return (
      <span
        style={{
          fontFamily: mono,
          fontSize: 9.5,
          letterSpacing: "0.08em",
          color: light ? C.mutedLight : C.muted,
          border: `1px solid ${light ? C.navyLine : C.line}`,
          borderRadius: 999,
          padding: "2px 8px",
          verticalAlign: "middle",
        }}
      >
        AIによる推定{confidence ? ` ・ 確信度 ${CONFIDENCE_JA[confidence]}` : ""}
      </span>
    );
  }

  // 層1: 発言事実(逐語引用)。「」つき・明朝で表示する
  function QuoteBlock({ quote, light = false }: { quote: string; light?: boolean }) {
    return (
      <div
        style={{
          fontFamily: serif,
          fontSize: 13,
          lineHeight: 1.85,
          color: light ? "#EDF2F8" : C.ink,
          borderLeft: `2.5px solid ${C.seal}`,
          paddingLeft: 10,
          marginTop: 6,
        }}
      >
        「{quote}」
        <span
          style={{
            fontFamily: mono,
            fontSize: 9.5,
            color: light ? C.mutedLight : C.muted,
            marginLeft: 6,
          }}
        >
          本人の発言
        </span>
      </div>
    );
  }

  // 誠実な欠損: 聴取できなかった項目の表示
  function InsufficientNote({ light = false }: { light?: boolean }) {
    return (
      <div
        style={{
          fontFamily: sans,
          fontSize: 12.5,
          color: light ? C.mutedLight : C.muted,
          background: light ? "rgba(255,255,255,0.04)" : C.paper,
          border: `1px dashed ${light ? C.navyLine : C.line}`,
          borderRadius: 8,
          padding: "10px 12px",
          lineHeight: 1.7,
        }}
      >
        面談で十分に聴取できませんでした
      </div>
    );
  }

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
              ["02", "キャリアカードが完成", "全記述に本人の発言の根拠つき"],
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
            <button onClick={openDemo} style={{ ...btnGhost, marginTop: 10 }}>
              デモカードを見る(サンプル)
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
              {listening && (
                <div
                  style={{
                    background: C.paper,
                    border: `1.5px dashed ${C.mutedLight}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}
                >
                  <div
                    className="flex items-center"
                    style={{ gap: 6, marginBottom: 4 }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: C.seal,
                        animation: "blink 1.2s infinite",
                      }}
                    />
                    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: C.muted }}>
                      認識中… ■で確定します
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: sans,
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      color: interim ? C.muted : C.mutedLight,
                      whiteSpace: "pre-wrap",
                      minHeight: 20,
                    }}
                  >
                    {interim || "どうぞお話しください。考え込む沈黙で切れることはありません。"}
                  </div>
                </div>
              )}
              <div className="flex items-end" style={{ gap: 8 }}>
                {srAvailable && (
                  <button
                    onClick={toggleMic}
                    aria-label={listening ? "音声入力を確定" : "音声入力を開始"}
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
                  placeholder="普段の言葉で入力"
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
              {!srAvailable && (
                <div
                  style={{
                    fontFamily: sans,
                    fontSize: 11,
                    color: C.mutedLight,
                    marginTop: 8,
                  }}
                >
                  このブラウザは音声入力に対応していません
                </div>
              )}
            </div>
          )}
        </div>

        {micGuideOpen && renderMicGuide()}
      </div>
    );
  }

  // 初回マイクガイド(ボトムシート)
  function renderMicGuide() {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,30,51,0.55)",
          zIndex: 50,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
        onClick={() => setMicGuideOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: C.surface,
            borderRadius: "16px 16px 0 0",
            padding: "24px 24px 28px",
            width: "100%",
            maxWidth: 480,
            animation: "fadeUp 0.3s ease both",
          }}
        >
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, color: C.ink }}>
            音声入力のつかいかた
          </div>
          <div style={{ marginTop: 16 }}>
            {[
              "マイクを押して、話し始める",
              "考え込む沈黙はOK。自動では切れません",
              "話し終わったら ■ を押す",
              "文字を確認・修正して送信",
            ].map((t, i) => (
              <div key={i} className="flex items-baseline" style={{ gap: 10, marginBottom: 10 }}>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    color: C.indigo,
                    letterSpacing: "0.08em",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontFamily: sans, fontSize: 14, color: C.ink, lineHeight: 1.7 }}>
                  {t}
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              fontFamily: sans,
              fontSize: 11.5,
              color: C.muted,
              lineHeight: 1.7,
              margin: "10px 0 0",
            }}
          >
            音声は文字化のみに使用し、音声データそのものは保存されません。
          </p>
          <button onClick={dismissMicGuideAndStart} style={{ ...btnPrimary, marginTop: 16 }}>
            マイクをはじめる
          </button>
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

  function renderMeView(p: ProfileV2) {
    const axisMin = 300;
    const axisMax = 1200;
    const leftPct = p.salary
      ? Math.max(0, ((p.salary.min - axisMin) / (axisMax - axisMin)) * 100)
      : 0;
    const widthPct = p.salary
      ? Math.min(100 - leftPct, ((p.salary.max - p.salary.min) / (axisMax - axisMin)) * 100)
      : 0;
    const insufficientLabels = (p.insufficient || [])
      .map((k) => INSUFFICIENT_LABELS[k])
      .filter(Boolean);

    return (
      <div style={{ padding: "22px 20px 8px" }}>
        <div className="flex items-center justify-between">
          <Eyebrow>CAREER CARD{p.is_demo ? " — SAMPLE" : " — No.0001"}</Eyebrow>
          {p.is_demo && (
            <span
              style={{
                fontFamily: sans,
                fontSize: 11,
                fontWeight: 700,
                color: C.seal,
                border: `1.5px solid ${C.seal}`,
                borderRadius: 999,
                padding: "3px 10px",
                marginBottom: 8,
              }}
            >
              サンプル
            </span>
          )}
        </div>
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
            {p.catchcopy ? (
              <div>
                <div
                  style={{
                    fontFamily: serif,
                    fontWeight: 700,
                    fontSize: 21,
                    lineHeight: 1.5,
                    color: C.ink,
                  }}
                >
                  {p.catchcopy.text}
                </div>
                <div style={{ marginTop: 6 }}>
                  <AiLabel confidence={p.catchcopy.confidence} />
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontFamily: serif,
                  fontWeight: 700,
                  fontSize: 21,
                  lineHeight: 1.5,
                  color: C.ink,
                }}
              >
                キャリアカード
              </div>
            )}
            <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 8 }}>
              {p.name} 様 ・ {p.role} ・ 経験{p.years}
            </div>
          </div>

          {p.summary ? (
            <div style={{ marginTop: 16 }}>
              <p
                style={{
                  fontFamily: sans,
                  fontSize: 13.5,
                  lineHeight: 1.9,
                  color: C.ink,
                  margin: 0,
                }}
              >
                {p.summary.text}
              </p>
              <div style={{ marginTop: 6 }}>
                <AiLabel confidence={p.summary.confidence} />
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <InsufficientNote />
            </div>
          )}

          <SectionLabel>強み — STRENGTHS(根拠つき)</SectionLabel>
          {p.strengths.length > 0 ? (
            p.strengths.map((s, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: C.indigo,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13.5, color: C.ink }}>
                    {s.title}
                  </span>
                  <AiLabel confidence={s.confidence} />
                </div>
                <QuoteBlock quote={s.evidence_quote} />
                <div
                  style={{
                    fontFamily: sans,
                    fontSize: 12.5,
                    color: C.muted,
                    lineHeight: 1.7,
                    marginTop: 4,
                  }}
                >
                  {s.interpretation}
                </div>
              </div>
            ))
          ) : (
            <InsufficientNote />
          )}

          <SectionLabel>定量実績 — FACTS(発言から抽出)</SectionLabel>
          {p.quant_facts.length > 0 ? (
            p.quant_facts.map((f, i) => (
              <div
                key={i}
                style={{
                  borderLeft: `2.5px solid ${C.indigo}`,
                  paddingLeft: 12,
                  marginBottom: 12,
                }}
              >
                <div className="flex items-baseline" style={{ gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>{f.label}</span>
                  <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 500, color: C.ink }}>
                    {f.value}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: serif,
                    fontSize: 11.5,
                    color: C.muted,
                    lineHeight: 1.7,
                    marginTop: 2,
                  }}
                >
                  出典:「{f.evidence_quote}」
                </div>
              </div>
            ))
          ) : (
            <InsufficientNote />
          )}

          <SectionLabel>代表エピソード — EPISODE</SectionLabel>
          {p.episodes.length > 0 ? (
            p.episodes.map((ep, ei) => (
              <div key={ei} style={{ marginBottom: 8 }}>
                {(
                  [
                    ["状況", ep.situation],
                    ["課題", ep.challenge],
                    ["行動", ep.action],
                    ["結果", ep.result_quant],
                    ["再現性", ep.reproducibility],
                  ] as const
                ).map(([label, text], i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: `2.5px solid ${text ? C.indigo : C.line}`,
                      paddingLeft: 12,
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: sans,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: text ? C.indigo : C.mutedLight,
                      }}
                    >
                      {label}
                    </span>
                    <div
                      style={{
                        fontFamily: sans,
                        fontSize: 13,
                        color: text ? C.ink : C.mutedLight,
                        lineHeight: 1.7,
                        marginTop: 2,
                      }}
                    >
                      {text ?? "未聴取"}
                    </div>
                  </div>
                ))}
                {ep.evidence_quote && <QuoteBlock quote={ep.evidence_quote} />}
              </div>
            ))
          ) : (
            <InsufficientNote />
          )}

          <SectionLabel>想定年収 — MARKET VALUE(参考)</SectionLabel>
          {p.salary ? (
            <div>
              <div className="flex items-center" style={{ gap: 8 }}>
                <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, color: C.ink }}>
                  {p.salary.min}
                  <span style={{ fontSize: 15, color: C.muted }}> – </span>
                  {p.salary.max}
                  <span style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginLeft: 6 }}>
                    万円
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.muted,
                    border: `1px solid ${C.line}`,
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  参考
                </span>
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
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 11,
                  color: C.muted,
                  lineHeight: 1.6,
                  marginTop: 8,
                }}
              >
                {p.salary.basis}
              </div>
            </div>
          ) : (
            <InsufficientNote />
          )}

          <SectionLabel>価値観 / 適職 — FIT</SectionLabel>
          {p.values.length + p.match_roles.length > 0 ? (
            <div>
              <div style={{ marginBottom: 6 }}>
                <AiLabel />
              </div>
              {p.values.map((v, i) => (
                <span key={"v" + i} style={{ ...chip, borderColor: C.indigo, color: C.indigo }}>
                  {v}
                </span>
              ))}
              {p.match_roles.map((r, i) => (
                <span key={"r" + i} style={chip}>
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <InsufficientNote />
          )}

          {insufficientLabels.length > 0 && (
            <div
              style={{
                marginTop: 20,
                background: C.paper,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: "10px 12px",
                fontFamily: sans,
                fontSize: 11.5,
                color: C.muted,
                lineHeight: 1.7,
              }}
            >
              聴取が不足している項目: {insufficientLabels.join(" / ")}
              <br />
              もう一度面談すると、カードがより充実します。
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={() => setResultTab("company")} style={btnPrimary}>
            企業からの見え方を見る
          </button>
          {p.is_demo ? (
            <button onClick={closeDemo} style={{ ...btnGhost, marginTop: 10 }}>
              デモを閉じる
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- 結果: 企業ビュー ----------

  function renderCompanyView(p: ProfileV2) {
    const initial = (p.name || "K").slice(0, 1);
    return (
      <div style={{ background: C.navyBg, padding: "22px 20px 28px", minHeight: 400 }}>
        <div className="flex items-center justify-between">
          <Eyebrow light>RECRUITER VIEW — 採用担当者の画面(デモ)</Eyebrow>
          {p.is_demo && (
            <span
              style={{
                fontFamily: sans,
                fontSize: 11,
                fontWeight: 700,
                color: C.seal,
                border: `1.5px solid ${C.seal}`,
                borderRadius: 999,
                padding: "3px 10px",
                marginBottom: 8,
              }}
            >
              サンプル
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: sans,
            fontSize: 12.5,
            color: C.mutedLight,
            lineHeight: 1.8,
            margin: "0 0 16px",
          }}
        >
          企業側には、あなたのカードがこう届きます。全記述に本人の発言の根拠がつき、書類選考と一次面接を省略して「口説き」から始められます。
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
                {p.match_score ?? "—"}
              </span>
              <span style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight }}>
                マッチ度 / 100{p.match_score === null ? "(情報不足)" : ""}
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
            {["AI面談 完了", "根拠引用 照合済", "本人入力データ"].map((b) => (
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

          <SectionLabel light>定量実績(発言から抽出)</SectionLabel>
          {p.quant_facts.length > 0 ? (
            p.quant_facts.map((f, i) => (
              <div key={i} className="flex items-baseline" style={{ gap: 10, marginBottom: 9 }}>
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 12,
                    color: "#DDE6F2",
                    width: 110,
                    flexShrink: 0,
                  }}
                >
                  {f.label}
                </span>
                <span style={{ fontFamily: mono, fontSize: 14, color: "#FFFFFF" }}>{f.value}</span>
              </div>
            ))
          ) : (
            <InsufficientNote light />
          )}

          <SectionLabel light>強み(根拠つき)</SectionLabel>
          {p.strengths.length > 0 ? (
            p.strengths.map((s, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: "#FFFFFF" }}>
                    {s.title}
                  </span>
                  <AiLabel light confidence={s.confidence} />
                </div>
                <QuoteBlock light quote={s.evidence_quote} />
              </div>
            ))
          ) : (
            <InsufficientNote light />
          )}

          <SectionLabel light>面談ハイライト</SectionLabel>
          {p.highlight ? (
            <div>
              <QuoteBlock light quote={p.highlight.evidence_quote} />
              <div
                className="flex items-center"
                style={{ gap: 8, marginTop: 6 }}
              >
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 12,
                    color: C.mutedLight,
                    lineHeight: 1.7,
                  }}
                >
                  {p.highlight.interpretation}
                </span>
                <AiLabel light confidence={p.highlight.confidence} />
              </div>
            </div>
          ) : (
            <InsufficientNote light />
          )}

          <SectionLabel light>希望条件</SectionLabel>
          {p.salary ? (
            <div>
              <div style={{ fontFamily: mono, fontSize: 20, color: "#FFFFFF" }}>
                {p.salary.min} – {p.salary.max}
                <span style={{ fontFamily: sans, fontSize: 12, color: C.mutedLight, marginLeft: 6 }}>
                  万円(参考)
                </span>
              </div>
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 11,
                  color: C.mutedLight,
                  lineHeight: 1.6,
                  marginTop: 4,
                }}
              >
                {p.salary.basis}
              </div>
            </div>
          ) : (
            <InsufficientNote light />
          )}

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
