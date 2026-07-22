"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  CompanyCardView,
  DrilldownModal,
  MeCardView,
  type DrillTarget,
} from "@/components/card";
import { ProgressSquares, Eyebrow, Seal } from "@/components/ui";
import { readSignals } from "@/lib/completeness";
import { DEMO_PROFILE_V2, DEMO_TRANSCRIPT } from "@/lib/demoProfile";
import {
  filledSlotCount,
  TOTAL_SLOTS,
  type InterviewState,
} from "@/lib/interviewEngine";
import { C, mono, sans, serif } from "@/lib/theme";
import type {
  CandidateBasics,
  CandidateInput,
  ChatMessage,
  ProfileV2,
} from "@/lib/types";

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

// 第1部(基礎情報)のチップ選択肢 (パッケージB-4)
const INDUSTRY_OPTIONS = ["IT・ソフトウェア", "メーカー", "商社・流通", "金融", "医療・福祉", "建設・不動産", "その他"];
const TEAM_SIZE_OPTIONS = ["1人(個人)", "2〜5名", "6〜20名", "21名以上"];
const MGMT_OPTIONS = ["なし", "リーダー経験あり", "マネジメント経験あり"];

const ANALYZE_STEPS = [
  "会話を読み込んでいます",
  "強みとスキルを抽出しています",
  "根拠となる発言を照合しています",
  "キャリアカードに仕上げています",
];

type Screen = "landing" | "form" | "interview" | "analyzing" | "result";
type SavedCard = {
  profile: ProfileV2;
  ts: number;
  id?: string;
  transcript?: ChatMessage[];
  consent?: boolean;
};

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
  // 面談ステートマシン(B-2): サーバーと往復する面談状態と回答ガイド
  const [interviewState, setInterviewState] = useState<InterviewState | null>(null);
  const [guide, setGuide] = useState<{ chips: string[]; placeholder: string } | null>(null);
  // 根拠ドリルダウン(C-2): 表示中の引用と、その出典となる会話ログ
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [cardTranscript, setCardTranscript] = useState<ChatMessage[]>([]);
  // 発言ログの企業開示への本人同意(面談終了時に取得)
  const [logConsent, setLogConsent] = useState(true);

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

  // 進捗はスロット充足で測る(浅い6問ではなく深さ優先)
  const slotsFilled = interviewState ? filledSlotCount(interviewState) : 0;

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
              setSavedCard({
                profile: card.profile,
                ts: Date.parse(card.created_at),
                id,
                transcript: Array.isArray(card.transcript) ? card.transcript : [],
                consent: Boolean(card.log_disclosure_consent),
              });
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

  // 第2部の開始: サーバーから挨拶 + 1本目の導入質問と初期状態を受け取る
  async function startInterview() {
    setMessages([]);
    setInterviewState(null);
    setGuide(null);
    setInterviewDone(false);
    setError(null);
    setScreen("interview");
    setLoading(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: pInput }),
      });
      if (!res.ok) throw new Error("interview failed");
      const data = (await res.json()) as {
        message: string;
        state: InterviewState;
        done: boolean;
        guide: { chips: string[]; placeholder: string } | null;
      };
      setMessages([{ role: "assistant", content: data.message }]);
      setInterviewState(data.state);
      setGuide(data.guide);
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || !interviewState) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setGuide(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: pInput, state: interviewState, answer: text }),
      });
      if (!res.ok) throw new Error("interview failed");
      const data = (await res.json()) as {
        message: string;
        state: InterviewState;
        done: boolean;
        guide: { chips: string[]; placeholder: string } | null;
      };
      setMessages([...next, { role: "assistant", content: data.message }]);
      setInterviewState(data.state);
      setGuide(data.guide);
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
        body: JSON.stringify({ candidate: pInput, messages, logConsent, signals: readSignals() }),
      });
      if (!res.ok) throw new Error("analyze failed");
      const data = (await res.json()) as {
        saved: boolean;
        id: string | null;
        profile: ProfileV2;
      };
      setProfile(data.profile);
      setCardTranscript(messages);
      // 永続化: DB保存成功ならカードIDだけを端末に残す。
      // DB未設定・保存失敗時はプロファイル本体をローカルに残す
      try {
        if (data.saved && data.id) {
          localStorage.setItem(CARD_ID_KEY, data.id);
          localStorage.removeItem(STORAGE_KEY);
          setCardId(data.id);
          setSavedCard({
            profile: data.profile,
            ts: Date.now(),
            id: data.id,
            transcript: messages,
            consent: logConsent,
          });
        } else {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              profile: data.profile,
              ts: Date.now(),
              transcript: messages,
              consent: logConsent,
            }),
          );
          setCardId(null);
          setSavedCard({
            profile: data.profile,
            ts: Date.now(),
            transcript: messages,
            consent: logConsent,
          });
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
      setCardTranscript(savedCard.transcript ?? []);
      setLogConsent(savedCard.consent ?? false);
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
    setCardTranscript(DEMO_TRANSCRIPT);
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
            {/* F1: クイック層(3分診断)が拡散のフック。導線を最前面に */}
            <a href="/quiz" style={{ textDecoration: "none", display: "block" }}>
              <button style={btnPrimary}>まずは3分診断からはじめる</button>
            </a>
            <button onClick={() => setScreen("form")} style={{ ...btnGhost, marginTop: 10 }}>
              本格的なAI面談をはじめる
            </button>
            <button onClick={openDemo} style={{ ...btnGhost, marginTop: 10 }}>
              デモカードを見る(サンプル)
            </button>
            <a href="/resume" style={{ textDecoration: "none", display: "block" }}>
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 12.5,
                  color: C.muted,
                  textAlign: "center",
                  marginTop: 14,
                  textDecoration: "underline",
                }}
              >
                履歴書・職務経歴書で基礎情報を裏取り
              </div>
            </a>
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

  // 選択式チップ(第1部の基礎情報収集。タイプ量を減らす)
  function BasicChips({
    options,
    value,
    onSelect,
  }: {
    options: string[];
    value?: string;
    onSelect: (v: string) => void;
  }) {
    return (
      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              onClick={() => onSelect(active ? "" : o)}
              style={{
                fontFamily: sans,
                fontSize: 12.5,
                color: active ? "#fff" : C.ink,
                background: active ? C.indigo : C.surface,
                border: `1.5px solid ${active ? C.indigo : C.line}`,
                borderRadius: 999,
                padding: "7px 13px",
                cursor: "pointer",
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  function renderForm() {
    const ok = pInput.name.trim() && pInput.role.trim();
    const basics = pInput.basics ?? {};
    const setBasic = (patch: Partial<CandidateBasics>) =>
      setPInput({ ...pInput, basics: { ...basics, ...patch } });
    const labelStyle: CSSProperties = {
      fontFamily: sans,
      fontSize: 12.5,
      fontWeight: 600,
      color: C.ink,
    };
    return (
      <div style={{ animation: "fadeUp 0.4s ease both" }}>
        {renderHeader(true)}
        <div style={{ padding: "30px 24px" }}>
          <Eyebrow>STEP 1 / 2 — 基礎情報(約3分)</Eyebrow>
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
            まず基礎情報を選択で。この後の面談では、具体的なエピソードを2つ深掘りします。
          </p>

          <div style={{ marginTop: 24 }}>
            <label style={labelStyle}>お名前(ニックネーム可)</label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={pInput.name}
              onChange={(e) => setPInput({ ...pInput, name: e.target.value })}
              placeholder="例: 佐藤"
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>現在の職種</label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={pInput.role}
              onChange={(e) => setPInput({ ...pInput, role: e.target.value })}
              placeholder="例: 法人営業 / 経理 / エンジニア"
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>社会人経験</label>
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

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>業界</label>
            <BasicChips
              options={INDUSTRY_OPTIONS}
              value={basics.industry}
              onSelect={(v) => setBasic({ industry: v })}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>チーム規模</label>
            <BasicChips
              options={TEAM_SIZE_OPTIONS}
              value={basics.team_size}
              onSelect={(v) => setBasic({ team_size: v })}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>マネジメント経験</label>
            <BasicChips
              options={MGMT_OPTIONS}
              value={basics.management}
              onSelect={(v) => setBasic({ management: v })}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>主要KPI・指標(任意)</label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={basics.kpi ?? ""}
              onChange={(e) => setBasic({ kpi: e.target.value })}
              placeholder="例: 売上 / 解約率 / 開発リードタイム"
            />
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
            <ProgressSquares filled={slotsFilled} total={TOTAL_SLOTS} />
            <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>
              {slotsFilled}/{TOTAL_SLOTS}
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
              {/* 発言ログの企業開示への同意トグル(C-2) */}
              <button
                onClick={() => setLogConsent((v) => !v)}
                className="flex items-center"
                style={{
                  gap: 10,
                  width: "100%",
                  background: C.paper,
                  border: `1.5px solid ${logConsent ? C.indigo : C.line}`,
                  borderRadius: 10,
                  padding: "11px 14px",
                  marginBottom: 10,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 20,
                    borderRadius: 999,
                    background: logConsent ? C.indigo : C.line,
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: logConsent ? 16 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s",
                    }}
                  />
                </span>
                <span style={{ fontFamily: sans, fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
                  面談での発言原文を、応募先企業に開示することに同意する
                  <span style={{ display: "block", fontSize: 10.5, color: C.muted }}>
                    未同意の場合、企業には要約のみが届き、引用は「非開示」と表示されます
                  </span>
                </span>
              </button>
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
              {slotsFilled >= 3 && (
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
              {/* 回答ガイド (B-5): この質問に含めると良い要素 */}
              {guide && !listening && (
                <div className="flex flex-wrap items-center" style={{ gap: 6, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: sans,
                      fontSize: 11,
                      color: C.muted,
                    }}
                  >
                    含めると良い:
                  </span>
                  {guide.chips.map((c) => (
                    <span
                      key={c}
                      style={{
                        fontFamily: sans,
                        fontSize: 11.5,
                        color: C.indigo,
                        background: C.paper,
                        border: `1px solid ${C.line}`,
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
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
                  placeholder={guide?.placeholder ?? "普段の言葉で入力"}
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

  // ---------- 結果: キャリアカード (components/card.tsx) ----------

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
        {resultTab === "me" ? (
          <MeCardView
            p={profile}
            onDrill={setDrill}
            onCompany={() => setResultTab("company")}
            onRedo={() => setScreen("form")}
            onReset={resetAll}
            onCloseDemo={closeDemo}
          />
        ) : (
          <CompanyCardView
            p={profile}
            consent={logConsent}
            offerSent={offerSent}
            onOffer={() => setOfferSent(true)}
            onBack={() => setResultTab("me")}
            onDrill={setDrill}
          />
        )}
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
        {drill && (
          <DrilldownModal
            target={drill}
            transcript={cardTranscript}
            onClose={() => setDrill(null)}
          />
        )}
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
