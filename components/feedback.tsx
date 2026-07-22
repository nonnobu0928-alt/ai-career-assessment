"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { accentButton, color, font, ghostButton, motion as M, primaryButton, radius, space } from "@/lib/design";

// ============================================================
// 一気 IKKI — 状態部品 & マイクロインタラクション(求職者面 / 案B)
// ローディング(スケルトン)/空/エラー/完了 と、押下・トーストの感触。
// すべてトークン参照・reduced-motion対応・タップ44px。
// ============================================================

type Variant = "primary" | "accent" | "ghost";

// 押した感触のあるボタン(whileTapで軽く沈む)
export function Pressable({
  children,
  onClick,
  variant = "primary",
  disabled,
  style,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const baseStyle = variant === "accent" ? accentButton() : variant === "ghost" ? ghostButton() : primaryButton();
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: M.dur.fast, ease: M.ease.standard }}
      style={{ ...baseStyle, opacity: disabled ? 0.45 : 1, ...style }}
    >
      {children}
    </motion.button>
  );
}

// スケルトン(ローディング)。reduced-motion では静的
export function Skeleton({ height = 16, width = "100%", style }: { height?: number | string; width?: number | string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      initial={reduce ? false : { opacity: 0.5 }}
      animate={reduce ? {} : { opacity: [0.5, 0.85, 0.5] }}
      transition={reduce ? undefined : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      style={{ height, width, borderRadius: radius.sm, background: color.paperDeep, ...style }}
    />
  );
}

// カード型スケルトン(結果待ちなどのプレースホルダ)
export function SkeletonCard() {
  return (
    <div style={{ background: color.paper, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space.xl }}>
      <Skeleton height={12} width={80} />
      <div style={{ height: space.md }} />
      <Skeleton height={48} width={140} />
      <div style={{ height: space.xl }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ marginBottom: space.md }}>
          <Skeleton height={8} />
        </div>
      ))}
    </div>
  );
}

function StateShell({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: `${space.xxxl}px ${space.xl}px` }}>
      <div style={{ fontFamily: font.serif, fontWeight: 700, fontSize: 20, color: color.ink }}>{title}</div>
      <div style={{ fontFamily: font.sans, fontSize: 13.5, color: color.muted, lineHeight: 1.9, marginTop: space.sm }}>{body}</div>
      {action && <div style={{ marginTop: space.xl }}>{action}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <StateShell title={title} body={body} action={action} />;
}

export function ErrorState({ title = "うまく読み込めませんでした", body, action }: { title?: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: `${space.xxxl}px ${space.xl}px` }}>
      <div aria-hidden style={{ width: 8, height: 40, background: color.accent, borderRadius: 4, margin: "0 auto", marginBottom: space.lg }} />
      <div style={{ fontFamily: font.serif, fontWeight: 700, fontSize: 19, color: color.ink }}>{title}</div>
      <div style={{ fontFamily: font.sans, fontSize: 13.5, color: color.muted, lineHeight: 1.9, marginTop: space.sm }}>{body}</div>
      {action && <div style={{ marginTop: space.xl }}>{action}</div>}
    </div>
  );
}

// トースト(下部・自動消滅は呼び出し側で制御)
export function Toast({ show, message, tone = "indigo" }: { show: boolean; message: string; tone?: "indigo" | "accent" }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: M.dur.fast, ease: M.ease.standard }}
          style={{
            position: "fixed",
            left: "50%",
            bottom: 92,
            transform: "translateX(-50%)",
            background: tone === "accent" ? color.accent : color.indigo,
            color: color.white,
            fontFamily: font.sans,
            fontSize: 13,
            fontWeight: 700,
            borderRadius: radius.pill,
            padding: "10px 18px",
            zIndex: 50,
            whiteSpace: "nowrap",
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
