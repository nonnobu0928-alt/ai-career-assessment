"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { color, font, motion as M } from "@/lib/design";

// ============================================================
// 一気 IKKI — 遷移基盤 & 演出部品(求職者面 / 案B)
//
// 遷移に方向と意味を持たせる:
//   forward=右から / back=左から / down=スケール小→大 / up=大→小
// reduced-motion では全アニメを即時表示にフォールバック。
// duration/easing は lib/design.ts の M を参照(ハードコードしない)。
// ============================================================

export type Dir = "forward" | "back" | "down" | "up";

const base: Transition = { duration: M.dur.base, ease: M.ease.standard };

const variants: Record<Dir, { initial: Record<string, number | string>; exit: Record<string, number | string> }> = {
  forward: { initial: { x: "38%", opacity: 0 }, exit: { x: "-28%", opacity: 0 } },
  back: { initial: { x: "-38%", opacity: 0 }, exit: { x: "28%", opacity: 0 } },
  down: { initial: { scale: 0.92, opacity: 0 }, exit: { scale: 1.03, opacity: 0 } },
  up: { initial: { scale: 1.06, opacity: 0 }, exit: { scale: 0.96, opacity: 0 } },
};

// 画面/設問の方向つき遷移。vKey が変わると切り替わる
export function DirectionalTransition({
  vKey,
  dir = "forward",
  children,
}: {
  vKey: string;
  dir?: Dir;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const v = variants[dir];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={vKey}
        initial={reduce ? false : v.initial}
        animate={{ x: 0, scale: 1, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : v.exit}
        transition={reduce ? { duration: 0 } : base}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// おみくじ開封: 色面が上→下にワイプして結果を現す
export function ColorWipe({ show, plane = color.indigo }: { show: boolean; plane?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scaleY: 1 }}
          animate={{ scaleY: 1 }}
          exit={{ scaleY: 0 }}
          transition={{ duration: M.dur.slow, ease: M.ease.decel }}
          style={{
            position: "fixed",
            inset: 0,
            background: plane,
            transformOrigin: "top",
            zIndex: 60,
            pointerEvents: "none",
          }}
        />
      )}
    </AnimatePresence>
  );
}

// 朱印が押される演出(スタンプ)。reduced-motion では即時表示
export function Stamp({
  text = "診断済",
  size = 84,
  delay = 0,
}: {
  text?: string;
  size?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      initial={reduce ? false : { opacity: 0, scale: 1.8, rotate: -8 }}
      animate={{ opacity: 0.94, scale: 1, rotate: -8 }}
      transition={reduce ? { duration: 0 } : { duration: M.dur.slow, ease: M.ease.stamp, delay }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `3px solid ${color.accent}`,
        color: color.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.serif,
        fontWeight: 700,
        writingMode: "vertical-rl",
        letterSpacing: "0.12em",
        fontSize: Math.round(size * 0.26),
        flexShrink: 0,
      }}
    >
      {text}
    </motion.div>
  );
}

// 数値カウントアップ(結果のクライマックス用)。reduced-motion は即時
export function CountUp({ to, durationMs = 1100, suffix = "" }: { to: number; durationMs?: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(reduce ? to : 0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const dur = reduce ? 0 : durationMs;
    const start = performance.now();
    const tick = (now: number) => {
      const t = dur <= 0 ? 1 : Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, durationMs, reduce]);
  return (
    <span>
      {val}
      {suffix}
    </span>
  );
}

// バーの描画アニメ(左から伸びる)
export function GrowBar({ pct, height = 8, track = color.paperDeep, fill = color.indigo, delay = 0 }: { pct: number; height?: number; track?: string; fill?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height, borderRadius: 4, background: track, overflow: "hidden" }}>
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={reduce ? { duration: 0 } : { duration: M.dur.slow, ease: M.ease.decel, delay }}
        style={{ height: "100%", background: fill, borderRadius: 4 }}
      />
    </div>
  );
}
