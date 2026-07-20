"use client";

import { C, mono, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 小さな部品
// Seal: 朱印。本人性の証明メタファー(面談済 / 一次済 / 解析中)
// ============================================================

export function Seal({
  text = "面談済",
  size = 64,
  animate = false,
}: {
  text?: string;
  size?: number;
  animate?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${C.seal}`,
        color: C.seal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: serif,
        fontWeight: 700,
        writingMode: "vertical-rl",
        letterSpacing: "0.12em",
        fontSize: Math.round(size * 0.28),
        transform: "rotate(-8deg)",
        opacity: 0.92,
        flexShrink: 0,
        animation: animate ? "stampIn 0.5s cubic-bezier(0.2,1.4,0.4,1) both" : "none",
      }}
    >
      {text}
    </div>
  );
}

export function Eyebrow({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: "0.14em",
        color: light ? C.mutedLight : C.muted,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: 10.5,
        letterSpacing: "0.16em",
        color: light ? C.mutedLight : C.muted,
        borderTop: `1px solid ${light ? C.navyLine : C.line}`,
        paddingTop: 14,
        marginTop: 20,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

export function ProgressSquares({
  filled,
  total = 6,
}: {
  filled: number;
  total?: number;
}) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: i < filled ? C.indigo : "transparent",
            border: `1.5px solid ${i < filled ? C.indigo : C.line}`,
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  );
}
