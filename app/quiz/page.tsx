"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  AchievementToast,
  CountUp,
  ProgressBar,
  QuestionTransition,
} from "@/components/diagnostic/motion";
import { Eyebrow, Seal } from "@/components/ui";
import { deriveQuickType, QUICK_QUESTIONS, scoreQuiz } from "@/lib/quizBank";
import { QUICK_METRICS, type QuickResult } from "@/lib/diagnostic/types";
import type { DeviationResult } from "@/lib/deviation";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — クイック層診断(F1-1 / F1-2)
//
// 3〜4分・選択式中心・1問1画面。SNS拡散のフック。
// 中断・再開に対応(localStorageにセッション保存。DB非依存で完結)。
// 演出は framer-motion、prefers-reduced-motion 尊重。
// 結果の共有・偏差値・公開ページは後続コミット(F1-3/F1-4)で追加。
// ============================================================

const SESSION_KEY = "ikki-quiz-session-v1";

type SavedSession = { answers: Record<string, number>; index: number };
type Phase = "intro" | "question" | "result";

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<QuickResult | null>(null);
  const [toast, setToast] = useState(false);
  // シェア(F1-3): DB保存できた場合のみ公開URLが得られる
  const [shareId, setShareId] = useState<string | null>(null);
  const [deviation, setDeviation] = useState<DeviationResult | null>(null);
  const [shareState, setShareState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [copied, setCopied] = useState(false);

  // 中断セッションの有無(再開ボタンの表示判定)。
  // SSRではfalse、クライアントでlocalStorageを参照する
  const hasSaved = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw) as SavedSession;
        return Boolean(s?.answers && Object.keys(s.answers).length > 0);
      } catch {
        return false;
      }
    },
    () => false,
  );

  function persist(next: Record<string, number>, nextIndex: number) {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ answers: next, index: nextIndex }),
      );
    } catch {
      /* 保存失敗は無視 */
    }
  }

  function start(fresh: boolean) {
    if (fresh) {
      setAnswers({});
      setIndex(0);
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
    } else {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw) as SavedSession;
          setAnswers(s.answers ?? {});
          setIndex(Math.min(s.index ?? 0, QUICK_QUESTIONS.length - 1));
        }
      } catch {}
    }
    setPhase("question");
  }

  function choose(choiceIndex: number) {
    const q = QUICK_QUESTIONS[index];
    const next = { ...answers, [q.id]: choiceIndex };
    setAnswers(next);
    setToast(true);
    window.setTimeout(() => setToast(false), 900);

    const nextIndex = index + 1;
    if (nextIndex >= QUICK_QUESTIONS.length) {
      persist(next, QUICK_QUESTIONS.length - 1);
      const r = scoreQuiz(next);
      setResult(r);
      setPhase("result");
      void finish(r);
    } else {
      persist(next, nextIndex);
      setIndex(nextIndex);
    }
  }

  // 結果を匿名シェアとして保存し、公開URL・偏差値を取得(DB設定時のみ)
  async function finish(r: QuickResult) {
    setShareState("loading");
    try {
      const res = await fetch("/api/quick-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: r }),
      });
      if (!res.ok) throw new Error("quick-result failed");
      const data = (await res.json()) as {
        available: boolean;
        shareId: string | null;
        deviation: DeviationResult | null;
      };
      setDeviation(data.deviation);
      if (data.available && data.shareId) {
        setShareId(data.shareId);
        setShareState("ready");
      } else {
        setShareState("unavailable");
      }
    } catch {
      setShareState("unavailable");
    }
  }

  async function share() {
    if (!shareId) return;
    const url = `${window.location.origin}/r/${shareId}`;
    const type = result ? deriveQuickType(result) : null;
    const text = type ? `私の診断タイプは「${type.name}」でした！` : "キャリア診断をやってみた";
    try {
      if (navigator.share) {
        await navigator.share({ title: "一気 IKKI キャリア診断", text, url });
        return;
      }
    } catch {
      /* キャンセル等 */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }

  function back() {
    if (index > 0) setIndex(index - 1);
  }

  // ---------- 共通スタイル ----------
  const wrap: CSSProperties = {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    background: C.paper,
    display: "flex",
    flexDirection: "column",
  };
  const btnPrimary: CSSProperties = {
    background: C.indigo,
    color: "#fff",
    fontFamily: sans,
    fontWeight: 600,
    borderRadius: 10,
    padding: "15px 20px",
    width: "100%",
    fontSize: 15,
    border: "none",
    cursor: "pointer",
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

  // ---------- イントロ ----------
  if (phase === "intro") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap, justifyContent: "center", padding: "40px 24px" }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
            <Seal text="一" size={30} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>
              一気
            </span>
            <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>
              QUICK
            </span>
          </div>
          <Eyebrow>3分キャリア診断</Eyebrow>
          <h1
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 27,
              lineHeight: 1.5,
              color: C.ink,
              margin: "8px 0 12px",
            }}
          >
            あなたの強み、
            <br />
            3分で見えます。
          </h1>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9, margin: 0 }}>
            {QUICK_QUESTIONS.length}問の選択式。直感で選ぶだけ。
            <br />
            終わると、あなたのタイプと5つの力が出ます。
          </p>

          <div style={{ marginTop: 28 }}>
            <button onClick={() => start(true)} style={btnPrimary}>
              診断をはじめる
            </button>
            {hasSaved && (
              <button onClick={() => start(false)} style={{ ...btnGhost, marginTop: 10 }}>
                前回の続きから再開する
              </button>
            )}
            <Link href="/" style={{ textDecoration: "none" }}>
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 12.5,
                  color: C.muted,
                  textAlign: "center",
                  marginTop: 16,
                }}
              >
                本格的なキャリア面談へ →
              </div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 設問(1問1画面) ----------
  if (phase === "question") {
    const q = QUICK_QUESTIONS[index];
    const chosen = answers[q.id];
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap, padding: "20px 20px 28px" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <button
              onClick={back}
              disabled={index === 0}
              style={{
                background: "none",
                border: "none",
                color: index === 0 ? C.mutedLight : C.muted,
                fontFamily: sans,
                fontSize: 13,
                cursor: index === 0 ? "default" : "pointer",
                padding: 4,
              }}
            >
              ← 戻る
            </button>
            <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>
              QUICK DIAGNOSIS
            </span>
          </div>
          <ProgressBar value={index + 1} total={QUICK_QUESTIONS.length} />

          <div style={{ flex: 1, marginTop: 28 }}>
            <QuestionTransition qKey={q.id}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: C.indigo,
                  marginBottom: 10,
                }}
              >
                Q{index + 1}
              </div>
              <h2
                style={{
                  fontFamily: serif,
                  fontWeight: 700,
                  fontSize: 20,
                  lineHeight: 1.6,
                  color: C.ink,
                  margin: "0 0 20px",
                }}
              >
                {q.prompt}
              </h2>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {q.choices.map((c, i) => {
                  const active = chosen === i;
                  return (
                    <button
                      key={i}
                      onClick={() => choose(i)}
                      style={{
                        textAlign: "left",
                        fontFamily: sans,
                        fontSize: 14.5,
                        lineHeight: 1.6,
                        color: active ? "#fff" : C.ink,
                        background: active ? C.indigo : C.surface,
                        border: `1.5px solid ${active ? C.indigo : C.line}`,
                        borderRadius: 12,
                        padding: "15px 16px",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </QuestionTransition>
          </div>
        </div>
        <AchievementToast message="回答を記録しました" show={toast} />
      </div>
    );
  }

  // ---------- 結果(クイック層のローカル要約) ----------
  const r = result!;
  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap, padding: "28px 24px 36px" }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
          <Seal text="診断済" size={40} animate />
          <div>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: C.ink }}>
              クイック診断 結果
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
              QUICK RESULT
            </div>
          </div>
        </div>

        <div
          style={{
            background: C.surface,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: "24px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: C.ink }}>
            {deriveQuickType(r).name}
          </div>
          <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 2 }}>
            {deriveQuickType(r).tagline}
          </div>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, marginTop: 14 }}>総合スコア</div>
          <div style={{ fontFamily: mono, fontSize: 52, fontWeight: 500, color: C.indigo, lineHeight: 1.1 }}>
            <CountUp to={r.overall} />
          </div>
          <div style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight }}>/ 100</div>

          {/* 偏差値バッジ(DB設定時のみ・サンプル不足は参考値) */}
          {deviation && (
            <div className="flex items-center justify-center" style={{ gap: 8, marginTop: 12 }}>
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  background: C.indigo,
                  borderRadius: 999,
                  padding: "5px 12px",
                }}
              >
                偏差値 {deviation.deviation}
              </span>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>
                上位 {deviation.percentileTop}%
              </span>
              {deviation.provisional && (
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
                  参考値
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <Eyebrow>5つの力</Eyebrow>
          {QUICK_METRICS.map((m) => (
            <div key={m.key} className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: C.ink, width: 76, flexShrink: 0 }}>
                {m.name}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${r.byMetric[m.key]}%`,
                    height: "100%",
                    background: C.indigo,
                    borderRadius: 4,
                  }}
                />
              </div>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, width: 28, textAlign: "right" }}>
                {r.byMetric[m.key]}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            background: C.paper,
            border: `1px dashed ${C.line}`,
            borderRadius: 10,
            padding: "12px 14px",
            fontFamily: sans,
            fontSize: 11.5,
            color: C.muted,
            lineHeight: 1.7,
          }}
        >
          これは自己申告ベースの参考スコアです。本格的なキャリア面談に進むと、あなたの発言を根拠にした精密なカードが作れます。
        </div>

        <div style={{ marginTop: 22 }}>
          {/* シェア: DB保存できた場合のみ公開URLでシェア可能 */}
          {shareState === "ready" && (
            <button onClick={share} style={btnPrimary}>
              {copied ? "リンクをコピーしました" : "結果をシェアする"}
            </button>
          )}
          {shareState === "loading" && (
            <button disabled style={{ ...btnPrimary, opacity: 0.5 }}>
              シェアを準備中…
            </button>
          )}
          {shareState === "unavailable" && (
            <div
              style={{
                fontFamily: sans,
                fontSize: 11.5,
                color: C.muted,
                textAlign: "center",
                lineHeight: 1.7,
                marginBottom: 10,
              }}
            >
              この環境ではシェアリンクを発行できません(結果はこの端末で確認できます)
            </div>
          )}
          <Link href="/" style={{ textDecoration: "none" }}>
            <button style={{ ...btnPrimary, marginTop: shareState === "ready" || shareState === "loading" ? 10 : 0 }}>
              本格的なキャリア面談に進む
            </button>
          </Link>
          <Link href="/comm-test" style={{ textDecoration: "none" }}>
            <button style={{ ...btnGhost, marginTop: 10 }}>コミュ力もテストする(3分)</button>
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setAnswers({});
              setIndex(0);
              try {
                localStorage.removeItem(SESSION_KEY);
              } catch {}
              setPhase("intro");
            }}
            style={{ ...btnGhost, marginTop: 10 }}
          >
            もう一度診断する
          </button>
        </div>
      </div>
    </div>
  );
}
