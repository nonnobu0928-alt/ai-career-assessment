"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { C, mono, sans } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 診断ゲーミフィケーション部品(F1-2)
//
// 抑制的な演出のみ。prefers-reduced-motion を尊重し、オフ時は
// 即時表示にフォールバックする(framer-motion の useReducedMotion)。
// モバイル縦画面・片手操作前提。
// ============================================================

const EASE: Transition = { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] };

// 1問1画面のスワイプ/フェード遷移。keyが変わると切り替わる
export function QuestionTransition({
  qKey,
  children,
}: {
  qKey: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={qKey}
        initial={reduce ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
        transition={reduce ? { duration: 0 } : EASE}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// プログレスバー(常時表示)。幅をアニメーション
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const reduce = useReducedMotion();
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: C.paper,
          border: `1px solid ${C.line}`,
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : EASE}
          style={{ height: "100%", background: C.indigo, borderRadius: 3 }}
        />
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 10.5,
          color: C.muted,
          marginTop: 6,
          textAlign: "right",
        }}
      >
        {value} / {total}
      </div>
    </div>
  );
}

// 数値のカウントアップ(結果画面)。reduced-motion 時は即時表示
export function CountUp({
  to,
  suffix = "",
  durationMs = 900,
}: {
  to: number;
  suffix?: string;
  durationMs?: number;
}) {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(reduce ? to : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // reduced-motion 時は duration 0 とし、最初のフレームで即 to にする
    // (effect本体では setState せず rAF コールバック内でのみ更新)
    const dur = reduce ? 0 : durationMs;
    const start = performance.now();
    const tick = (now: number) => {
      const t = dur <= 0 ? 1 : Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(Math.round(to * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [to, durationMs, reduce]);

  return (
    <span>
      {val}
      {suffix}
    </span>
  );
}

// 回答直後のマイクロフィードバック・トースト(達成感)。数秒で自動消滅
export function AchievementToast({
  message,
  show,
}: {
  message: string;
  show: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2 }}
          style={{
            position: "fixed",
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            background: C.indigo,
            color: "#fff",
            fontFamily: sans,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 999,
            padding: "9px 18px",
            boxShadow: "0 6px 20px rgba(15,30,51,0.25)",
            zIndex: 40,
            whiteSpace: "nowrap",
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
