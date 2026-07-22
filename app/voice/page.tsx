"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Eyebrow, ProgressSquares, Seal } from "@/components/ui";
import { VOICE_QUESTIONS, type VoiceAnswer, type VoiceMetrics } from "@/lib/voice";
import type { CompetencyEval } from "@/lib/types";
import { C, mono, sans, serif } from "@/lib/theme";

type VoiceMetric = VoiceMetrics & { questionId: string };

// ============================================================
// 一気 IKKI — 音声面接: 同意・録音・文字起こし (F2-3a)
// ブラウザ標準 SpeechRecognition。音声データは保存せず文字化のみ。
// 発話内容の評価と補助指標は F2-3b で付与。
// ============================================================

const STORAGE_KEY = "ikki-voice-v1";

// 経過時間計測用(録音の実時間)。イベントハンドラ内で使う
const nowMs = () => Date.now();

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
  // 評価結果(F2-3b): 発話内容のコンピテンシー + 補助指標(参考値)
  const [evalState, setEvalState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [competencies, setCompetencies] = useState<CompetencyEval[]>([]);
  const [metrics, setMetrics] = useState<VoiceMetric[]>([]);

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
      startedAtRef.current = nowMs();
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
    const durationMs = startedAtRef.current ? nowMs() - startedAtRef.current : 0;
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
      void runEval(all);
    } else {
      setIndex(index + 1);
    }
  }

  // 発話内容の評価(主軸)+ 補助指標(参考値)を取得
  async function runEval(all: VoiceAnswer[]) {
    setEvalState("loading");
    try {
      const res = await fetch("/api/voice-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: all }),
      });
      if (!res.ok) throw new Error("voice-eval failed");
      const data = (await res.json()) as { competencies: CompetencyEval[]; metrics: VoiceMetric[] };
      setCompetencies(data.competencies);
      setMetrics(data.metrics);
      setEvalState("ready");
    } catch {
      setEvalState("error");
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
          {/* 主軸: 発話内容の評価(根拠つき) */}
          <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted, borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 8, marginBottom: 12 }}>
            発話内容の評価 — CONTENT
          </div>
          {evalState === "loading" && (
            <div style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>評価中…</div>
          )}
          {evalState === "error" && (
            <div style={{ fontFamily: sans, fontSize: 13, color: C.seal }}>評価に失敗しました。文字起こしは保存されています。</div>
          )}
          {evalState === "ready" &&
            competencies.map((c) => (
              <div key={c.key} style={{ marginBottom: 12 }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>{c.name}</span>
                  {c.score !== null ? (
                    <span style={{ fontFamily: mono, fontSize: 12, color: C.indigo }}>{c.score} / 5</span>
                  ) : (
                    <span style={{ fontFamily: sans, fontSize: 11.5, color: C.muted }}>評価保留</span>
                  )}
                </div>
                {c.score !== null && c.bars_text && (
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.7, marginTop: 3 }}>基準: {c.bars_text}</div>
                )}
                {c.evidence_quote && (
                  <div style={{ fontFamily: serif, fontSize: 12.5, lineHeight: 1.8, color: C.ink, borderLeft: `2.5px solid ${C.seal}`, paddingLeft: 10, marginTop: 5 }}>
                    「{c.evidence_quote}」
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginLeft: 6 }}>あなたの発話</span>
                  </div>
                )}
              </div>
            ))}

          {/* 補助: 伝わりやすさの参考指標(合否には使わない) */}
          {evalState === "ready" && (
            <>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted, borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 16, marginBottom: 4 }}>
                伝わりやすさ — 参考指標
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.mutedLight, marginBottom: 10 }}>
                合否には使いません。話し方のフィードバックです。
              </div>
              {metrics.map((m, i) => (
                <div key={m.questionId} className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>Q{i + 1}</span>
                  <span style={{ fontFamily: mono, fontSize: 11.5, color: C.ink }}>
                    話速 {m.charsPerSec}字/秒 ・ フィラー {m.fillerCount}回
                  </span>
                </div>
              ))}
            </>
          )}

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
