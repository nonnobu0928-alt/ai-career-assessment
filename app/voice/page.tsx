"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Eyebrow, ProgressSquares, Seal } from "@/components/ui";
import { VOICE_QUESTIONS, type VoiceAnswer } from "@/lib/voice";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 音声面接: 同意・録音・文字起こし (F2-3a)
// ブラウザ標準 SpeechRecognition。音声データは保存せず文字化のみ。
// 発話内容の評価と補助指標は F2-3b で付与。
// ============================================================

const STORAGE_KEY = "ikki-voice-v1";

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

export default function VoicePage() {
  const [phase, setPhase] = useState<"consent" | "record" | "done">("consent");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<VoiceAnswer[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const accumulatedRef = useRef("");
  const sessionFinalRef = useRef("");
  const startedAtRef = useRef(0);

  const srAvailable = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as Record<string, unknown>;
      return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
    },
    () => false,
  );

  const q = VOICE_QUESTIONS[index];

  const btnPrimary: CSSProperties = {
    background: C.indigo, color: "#fff", fontFamily: sans, fontWeight: 600,
    borderRadius: 10, padding: "15px 20px", width: "100%", fontSize: 15, border: "none", cursor: "pointer",
  };
  const wrap: CSSProperties = {
    maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.paper, padding: "24px 20px 36px",
  };

  function startRec() {
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
        accumulatedRef.current += sessionFinalRef.current;
        sessionFinalRef.current = "";
        if (listeningRef.current) {
          try { r.start(); } catch { listeningRef.current = false; setListening(false); }
        }
      };
      r.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") {
          listeningRef.current = false; setListening(false);
        }
      };
      recogRef.current = r;
      accumulatedRef.current = "";
      sessionFinalRef.current = "";
      setInterim("");
      startedAtRef.current = Date.now();
      r.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      listeningRef.current = false; setListening(false);
    }
  }

  function stopRec() {
    listeningRef.current = false;
    setListening(false);
    try { recogRef.current?.stop(); } catch {}
    const transcript = (accumulatedRef.current + sessionFinalRef.current).trim() || interim.trim();
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    accumulatedRef.current = "";
    sessionFinalRef.current = "";
    const answer: VoiceAnswer = { questionId: q.id, transcript, durationMs };
    const all = [...answers, answer];
    setAnswers(all);
    setInterim("");
    if (index + 1 >= VOICE_QUESTIONS.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: true, answers: all }));
      } catch {}
      setPhase("done");
    } else {
      setIndex(index + 1);
    }
  }

  // ---------- 同意 ----------
  if (phase === "consent") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 20 }}>
            <Seal text="一" size={30} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>一気</span>
            <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>VOICE</span>
          </div>
          <Eyebrow>音声面接(録音前の確認)</Eyebrow>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 23, color: C.ink, margin: "6px 0 12px" }}>
            はじめる前に
          </h1>
          <div style={{ background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", fontFamily: sans, fontSize: 13, color: C.ink, lineHeight: 1.9 }}>
            <div style={{ marginBottom: 8 }}>・ 短い質問に声で答えます({VOICE_QUESTIONS.length}問)。</div>
            <div style={{ marginBottom: 8 }}>・ <strong>音声は文字化のみに使用し、音声データそのものは保存されません。</strong></div>
            <div style={{ marginBottom: 8 }}>・ 評価は<strong>発話の内容</strong>に対して、あなたの発言を根拠に行います。</div>
            <div>・ 話速や間などの「伝わりやすさ」は<strong>参考情報</strong>で、合否には使いません。表情や声の質は評価しません。</div>
          </div>
          {!srAvailable && (
            <div style={{ fontFamily: sans, fontSize: 12, color: C.seal, marginTop: 12 }}>
              このブラウザは音声入力に対応していません。Chrome等でお試しください。
            </div>
          )}
          <div style={{ marginTop: 22 }}>
            <button onClick={() => setPhase("record")} disabled={!srAvailable} style={{ ...btnPrimary, opacity: srAvailable ? 1 : 0.4 }}>
              同意して録音をはじめる
            </button>
            <Link href="/" style={{ textDecoration: "none" }}>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, textAlign: "center", marginTop: 16 }}>← やめる</div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 完了 ----------
  if (phase === "done") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
            <Seal text="録音済" size={40} animate />
            <div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: C.ink }}>文字起こしが完了しました</div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>VOICE CAPTURED</div>
            </div>
          </div>
          {answers.map((a, i) => (
            <div key={a.questionId} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.indigo }}>Q{i + 1}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.ink, lineHeight: 1.8, whiteSpace: "pre-wrap", marginTop: 4 }}>
                {a.transcript || "(認識できませんでした)"}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8, background: C.paper, border: `1px dashed ${C.line}`, borderRadius: 10, padding: "12px 14px", fontFamily: sans, fontSize: 11.5, color: C.muted, lineHeight: 1.7 }}>
            発話内容の評価と、話速・フィラー率などの参考指標は、キャリアカードに反映されます。
          </div>
          <div style={{ marginTop: 20 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button style={btnPrimary}>トップに戻る</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 録音 ----------
  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>VOICE INTERVIEW</span>
          <div className="flex items-center" style={{ gap: 8 }}>
            <ProgressSquares filled={index} total={VOICE_QUESTIONS.length} />
            <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{index + 1}/{VOICE_QUESTIONS.length}</span>
          </div>
        </div>

        <Eyebrow>Q{index + 1}</Eyebrow>
        <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.6, color: C.ink, margin: "6px 0 6px" }}>{q.prompt}</h2>
        <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginBottom: 18 }}>{q.hint}</div>

        <div style={{ background: C.surface, border: `1.5px ${listening ? "solid" : "dashed"} ${listening ? C.seal : C.mutedLight}`, borderRadius: 12, padding: "16px 16px", minHeight: 120 }}>
          {listening && (
            <div className="flex items-center" style={{ gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.seal, animation: "blink 1.2s infinite" }} />
              <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: C.muted }}>録音中… 話し終えたら停止</span>
            </div>
          )}
          <div style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.8, color: interim ? C.ink : C.mutedLight, whiteSpace: "pre-wrap" }}>
            {interim || "マイクを押して話し始めてください。考え込む沈黙で切れることはありません。"}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {!listening ? (
            <button onClick={startRec} style={btnPrimary}>🎙 録音をはじめる</button>
          ) : (
            <button onClick={stopRec} style={{ ...btnPrimary, background: C.seal }}>■ 停止してこの回答を確定</button>
          )}
        </div>
      </div>
    </div>
  );
}
