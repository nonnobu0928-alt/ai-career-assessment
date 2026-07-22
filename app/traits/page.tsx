"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ProgressBar, QuestionTransition } from "@/components/diagnostic/motion";
import { Eyebrow, Seal } from "@/components/ui";
import { scoreTraits, TRAIT_AXES, TRAIT_QUESTIONS, type TraitResult } from "@/lib/traitModel";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 特性診断 (F2-2)
// 独自4軸・コード側採点。合否には使わない参考特性。偏差値は出さない。
// ============================================================

const STORAGE_KEY = "ikki-traits-v1";

export default function TraitsPage() {
  const [phase, setPhase] = useState<"intro" | "q" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, 0 | 1>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<TraitResult | null>(null);

  const btnPrimary: CSSProperties = {
    background: C.indigo, color: "#fff", fontFamily: sans, fontWeight: 600,
    borderRadius: 10, padding: "15px 20px", width: "100%", fontSize: 15, border: "none", cursor: "pointer",
  };
  const btnGhost: CSSProperties = {
    background: "transparent", color: C.indigo, fontFamily: sans, fontWeight: 500,
    borderRadius: 10, padding: "13px 20px", width: "100%", fontSize: 14, border: `1.5px solid ${C.line}`, cursor: "pointer",
  };
  const wrap: CSSProperties = {
    maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.paper, padding: "24px 20px 36px",
  };

  function choose(pole: 0 | 1) {
    const q = TRAIT_QUESTIONS[index];
    const next = { ...answers, [q.id]: pole };
    setAnswers(next);
    if (index + 1 >= TRAIT_QUESTIONS.length) {
      const r = scoreTraits(next);
      setResult(r);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ result: r }));
      } catch {}
      setPhase("result");
    } else {
      setIndex(index + 1);
    }
  }

  if (phase === "intro") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap, justifyContent: "center", display: "flex", flexDirection: "column" }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 20 }}>
            <Seal text="一" size={30} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>一気</span>
            <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>TRAITS</span>
          </div>
          <Eyebrow>特性診断(参考)</Eyebrow>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: C.ink, margin: "8px 0 12px", lineHeight: 1.5 }}>
            あなたの<br />仕事のタイプは?
          </h1>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9, margin: 0 }}>
            {TRAIT_QUESTIONS.length}問で、チームでの動き方の傾向がわかります。
            <br />
            <strong style={{ color: C.ink }}>これは参考情報で、合否には使いません。</strong>
          </p>
          <div style={{ marginTop: 26 }}>
            <button onClick={() => setPhase("q")} style={btnPrimary}>診断をはじめる</button>
            <Link href="/" style={{ textDecoration: "none" }}>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, textAlign: "center", marginTop: 16 }}>← トップに戻る</div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "q") {
    const q = TRAIT_QUESTIONS[index];
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <button onClick={() => index > 0 && setIndex(index - 1)} disabled={index === 0}
              style={{ background: "none", border: "none", color: index === 0 ? C.mutedLight : C.muted, fontFamily: sans, fontSize: 13, cursor: index === 0 ? "default" : "pointer", padding: 4 }}>← 戻る</button>
            <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>TRAIT DIAGNOSIS</span>
          </div>
          <ProgressBar value={index + 1} total={TRAIT_QUESTIONS.length} />
          <div style={{ marginTop: 28 }}>
            <QuestionTransition qKey={q.id}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.12em", color: C.indigo, marginBottom: 10 }}>Q{index + 1}</div>
              <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.6, color: C.ink, margin: "0 0 20px" }}>{q.prompt}</h2>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {q.choices.map((c, i) => (
                  <button key={i} onClick={() => choose(c.pole)}
                    style={{ textAlign: "left", fontFamily: sans, fontSize: 14.5, lineHeight: 1.6, color: C.ink, background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "16px", cursor: "pointer", width: "100%" }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </QuestionTransition>
          </div>
        </div>
      </div>
    );
  }

  const r = result!;
  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
          <Seal text="診断済" size={40} animate />
          <div>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: C.ink }}>あなたの仕事タイプ</div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>REFERENCE TRAITS</div>
          </div>
        </div>

        <div style={{ background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.2em", color: C.indigo }}>{r.code}</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: C.ink, marginTop: 6 }}>{r.typeName}</div>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, marginTop: 6 }}>{r.tagline}</div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Eyebrow>4つの軸</Eyebrow>
          {r.axes.map((a) => {
            const axisDef = TRAIT_AXES.find((x) => x.key === a.key)!;
            // 0側を左、1側を右に。優勢極に応じてバー位置を決める
            const leftPct = a.poleIndex === 0 ? 50 - (a.strength - 50) : 50 + (a.strength - 50);
            return (
              <div key={a.key} style={{ marginBottom: 16 }}>
                <div className="flex justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: a.poleIndex === 0 ? 700 : 400, color: a.poleIndex === 0 ? C.indigo : C.muted }}>{axisDef.poles[0].label}</span>
                  <span style={{ fontFamily: sans, fontSize: 10.5, color: C.mutedLight }}>{axisDef.name}</span>
                  <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: a.poleIndex === 1 ? 700 : 400, color: a.poleIndex === 1 ? C.indigo : C.muted }}>{axisDef.poles[1].label}</span>
                </div>
                <div style={{ position: "relative", height: 8, borderRadius: 4, background: C.paper, border: `1px solid ${C.line}` }}>
                  <div style={{ position: "absolute", left: `calc(${leftPct}% - 6px)`, top: -3, width: 12, height: 12, borderRadius: "50%", background: C.indigo }} />
                </div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: C.muted, lineHeight: 1.6, marginTop: 6 }}>{a.pole.tagline}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 8, background: C.paper, border: `1px dashed ${C.line}`, borderRadius: 10, padding: "12px 14px", fontFamily: sans, fontSize: 11.5, color: C.muted, lineHeight: 1.7 }}>
          この結果は「向き・傾向」の参考です。優劣ではなく、合否の判断にも使いません。企業には「参考特性」として、評価スコアとは分けて表示されます。
        </div>

        <div style={{ marginTop: 22 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <button style={btnPrimary}>トップに戻る</button>
          </Link>
          <button onClick={() => { setAnswers({}); setIndex(0); setResult(null); setPhase("intro"); }} style={{ ...btnGhost, marginTop: 10 }}>もう一度診断する</button>
        </div>
      </div>
    </div>
  );
}
