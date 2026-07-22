"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { CountUp, DirectionalTransition, GrowBar, type Dir } from "@/components/motion";
import { Pressable, Toast } from "@/components/feedback";
import { color, font, radius, space, type as T } from "@/lib/design";
import { deriveQuickType, QUICK_QUESTIONS, scoreQuiz } from "@/lib/quizBank";
import { QUICK_METRICS, type QuickResult } from "@/lib/diagnostic/types";
import type { DeviationResult } from "@/lib/deviation";

// ============================================================
// 一気 IKKI — クイック診断(案B ネオ和ポップ / F1・UI刷新)
// 1問1画面・方向つき遷移・色面・縦書き明朝・即時フィードバック・
// 残問数の安心感・中断再開。結果のクライマックス演出はD5で強化。
// ============================================================

const SESSION_KEY = "ikki-quiz-session-v1";

type SavedSession = { answers: Record<string, number>; index: number };
type Phase = "intro" | "question" | "result";

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<Dir>("forward");
  const [result, setResult] = useState<QuickResult | null>(null);
  const [toast, setToast] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [deviation, setDeviation] = useState<DeviationResult | null>(null);
  const [shareState, setShareState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [copied, setCopied] = useState(false);

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
      localStorage.setItem(SESSION_KEY, JSON.stringify({ answers: next, index: nextIndex }));
    } catch {}
  }

  function start(fresh: boolean) {
    setDir("forward");
    if (fresh) {
      setAnswers({});
      setIndex(0);
      try { localStorage.removeItem(SESSION_KEY); } catch {}
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
    window.setTimeout(() => setToast(false), 850);
    const nextIndex = index + 1;
    if (nextIndex >= QUICK_QUESTIONS.length) {
      persist(next, QUICK_QUESTIONS.length - 1);
      const r = scoreQuiz(next);
      setResult(r);
      setPhase("result");
      void finish(r);
    } else {
      persist(next, nextIndex);
      setDir("forward");
      setIndex(nextIndex);
    }
  }

  function back() {
    if (index > 0) {
      setDir("back");
      setIndex(index - 1);
    }
  }

  async function finish(r: QuickResult) {
    setShareState("loading");
    try {
      const res = await fetch("/api/quick-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: r }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { available: boolean; shareId: string | null; deviation: DeviationResult | null };
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
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  // ---------- 画面共通 ----------
  const page = (bg: string): CSSProperties => ({
    minHeight: "100dvh",
    background: bg,
    maxWidth: 480,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
  });
  const label: CSSProperties = { fontFamily: font.mono, ...T.label, textTransform: "uppercase" };

  // ---------- イントロ(藍の色面) ----------
  if (phase === "intro") {
    return (
      <div data-ikki style={{ background: color.indigoDeep }}>
        <div style={{ ...page(color.indigo), justifyContent: "space-between", padding: `${space.xxxl}px ${space.xl}px ${space.xxl}px` }}>
          <div>
            <div style={{ ...label, color: color.mutedOnIndigo }}>一気 IKKI ・ 3分診断</div>
            <div className="flex" style={{ justifyContent: "flex-end", marginTop: space.xxl }}>
              <h1
                style={{
                  fontFamily: font.serif,
                  fontWeight: 700,
                  fontSize: 46,
                  lineHeight: 1.3,
                  letterSpacing: "0.12em",
                  color: color.paper,
                  writingMode: "vertical-rl",
                  height: 300,
                }}
              >
                <span>あなたの強み、</span>
                <span style={{ color: color.accent }}>三分で。</span>
              </h1>
            </div>
          </div>
          <div>
            <p style={{ fontFamily: font.sans, fontSize: 14, lineHeight: 1.9, color: color.mutedOnIndigo, margin: `0 0 ${space.xl}px` }}>
              {QUICK_QUESTIONS.length}問、直感で選ぶだけ。
              <br />
              終わると、あなたのタイプと5つの力が出ます。
            </p>
            <Pressable variant="accent" onClick={() => start(true)}>診断をはじめる</Pressable>
            {hasSaved && (
              <div style={{ marginTop: space.md }}>
                <Pressable variant="ghost" onClick={() => start(false)} style={{ color: color.paper, borderColor: color.lineOnIndigo }}>
                  前回の続きから
                </Pressable>
              </div>
            )}
            <Link href="/" style={{ textDecoration: "none" }}>
              <div style={{ fontFamily: font.sans, fontSize: 12.5, color: color.mutedOnIndigo, textAlign: "center", marginTop: space.lg }}>
                本格的なキャリア面談へ →
              </div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 設問(生成りの面 / 1問1画面) ----------
  if (phase === "question") {
    const q = QUICK_QUESTIONS[index];
    const chosen = answers[q.id];
    const remaining = QUICK_QUESTIONS.length - index;
    const pct = ((index + 1) / QUICK_QUESTIONS.length) * 100;
    return (
      <div data-ikki style={{ background: color.paper }}>
        <div style={{ ...page(color.paper), padding: `${space.lg}px ${space.xl}px ${space.xxl}px` }}>
          {/* 進捗 + 残問数の安心感 */}
          <div className="flex items-center justify-between" style={{ marginBottom: space.md }}>
            <Pressable
              variant="ghost"
              onClick={back}
              disabled={index === 0}
              style={{ width: "auto", minHeight: 44, padding: "8px 12px", border: "none", color: color.muted, fontSize: 13 }}
            >
              ← 戻る
            </Pressable>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.accentDeep, fontWeight: 500 }}>
              あと{remaining}問
            </span>
          </div>
          <GrowBar pct={pct} height={6} track={color.paperDeep} fill={color.accent} />
          <div style={{ ...label, color: color.muted, marginTop: space.xs }}>
            {index + 1} / {QUICK_QUESTIONS.length}
          </div>

          {/* 設問(方向つき遷移) */}
          <div style={{ flex: 1, marginTop: space.xxl }}>
            <DirectionalTransition vKey={q.id} dir={dir}>
              <div style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: "0.1em", color: color.accent, marginBottom: space.sm }}>
                Q{index + 1}
              </div>
              <h2 style={{ fontFamily: font.serif, fontWeight: 700, fontSize: 24, lineHeight: 1.55, color: color.ink, margin: `0 0 ${space.xl}px` }}>
                {q.prompt}
              </h2>
            </DirectionalTransition>
          </div>

          {/* 選択肢は下部(親指の届く位置) */}
          <div className="flex flex-col" style={{ gap: space.sm }}>
            {q.choices.map((c, i) => {
              const active = chosen === i;
              return (
                <Pressable
                  key={i}
                  onClick={() => choose(i)}
                  variant="ghost"
                  style={{
                    textAlign: "left",
                    fontSize: 15,
                    lineHeight: 1.6,
                    fontWeight: 500,
                    color: active ? color.paper : color.ink,
                    background: active ? color.indigo : color.white,
                    border: `1.5px solid ${active ? color.indigo : color.line}`,
                    borderRadius: radius.md,
                    padding: "16px",
                  }}
                >
                  {c.label}
                </Pressable>
              );
            })}
          </div>
        </div>
        <Toast show={toast} message="回答を記録" />
      </div>
    );
  }

  // ---------- 結果(D5でクライマックス強化) ----------
  const r = result!;
  const type = deriveQuickType(r);
  return (
    <div data-ikki style={{ background: color.paper }}>
      <div style={{ ...page(color.paper), padding: `${space.xxl}px ${space.xl}px ${space.xxxl}px` }}>
        <div style={{ ...label, color: color.muted }}>QUICK RESULT</div>

        {/* タイプ名(縦書き明朝)+ スコア(数字主役) */}
        <div className="flex justify-between" style={{ gap: space.lg, marginTop: space.lg }}>
          <div>
            <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.16em", color: color.accent }}>{type.en} TYPE</div>
            <div style={{ fontFamily: font.mono, fontSize: 72, fontWeight: 500, color: color.indigo, lineHeight: 1 }}>
              <CountUp to={r.overall} />
            </div>
            <div style={{ fontFamily: font.sans, fontSize: 12, color: color.muted }}>総合スコア / 100</div>
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 700,
              fontSize: 30,
              lineHeight: 1.4,
              letterSpacing: "0.1em",
              color: color.ink,
              writingMode: "vertical-rl",
              height: 150,
            }}
          >
            {type.name}
          </h1>
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 12.5, color: color.muted, marginTop: space.sm }}>{type.tagline}</div>

        {/* 偏差値バッジ */}
        {deviation && (
          <div className="flex items-center" style={{ gap: space.sm, marginTop: space.md }}>
            <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 700, color: color.white, background: color.accent, borderRadius: radius.pill, padding: "5px 14px" }}>
              偏差値 {deviation.deviation}
            </span>
            <span style={{ fontFamily: font.sans, fontSize: 12, color: color.muted }}>上位 {deviation.percentileTop}%</span>
            {deviation.provisional && (
              <span style={{ fontFamily: font.sans, fontSize: 10.5, fontWeight: 700, color: color.muted, border: `1px solid ${color.line}`, borderRadius: radius.pill, padding: "2px 8px" }}>参考値</span>
            )}
          </div>
        )}

        {/* 5つの力(バー描画) */}
        <div style={{ marginTop: space.xxl }}>
          <div style={{ ...label, color: color.muted, marginBottom: space.md }}>5つの力</div>
          {QUICK_METRICS.map((m, i) => (
            <div key={m.key} style={{ marginBottom: space.md }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: font.sans, fontSize: 12.5, color: color.ink }}>{m.name}</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.muted }}>{r.byMetric[m.key]}</span>
              </div>
              <GrowBar pct={r.byMetric[m.key]} delay={0.05 * i} />
            </div>
          ))}
        </div>

        {/* シェア導線を最上位に */}
        <div style={{ marginTop: space.xxl }}>
          {shareState === "ready" && (
            <Pressable variant="accent" onClick={share}>{copied ? "リンクをコピーしました" : "結果をシェアする"}</Pressable>
          )}
          {shareState === "loading" && <Pressable variant="accent" disabled>シェアを準備中…</Pressable>}
          {shareState === "unavailable" && (
            <div style={{ fontFamily: font.sans, fontSize: 11.5, color: color.muted, textAlign: "center", lineHeight: 1.7, marginBottom: space.md }}>
              この環境ではシェアリンクを発行できません(結果はこの端末で確認できます)
            </div>
          )}
          <div style={{ marginTop: space.md }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Pressable variant="primary">本格的なキャリア面談に進む</Pressable>
            </Link>
          </div>
          <div className="flex" style={{ gap: space.sm, marginTop: space.md }}>
            <Link href="/comm-test" style={{ textDecoration: "none", flex: 1 }}>
              <Pressable variant="ghost">コミュ力診断</Pressable>
            </Link>
            <Link href="/traits" style={{ textDecoration: "none", flex: 1 }}>
              <Pressable variant="ghost">仕事タイプ診断</Pressable>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
