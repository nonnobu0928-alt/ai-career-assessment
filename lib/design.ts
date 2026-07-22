import type { CSSProperties } from "react";
// ============================================================
// 一気 IKKI — デザイントークン単一ソース(求職者面 / 案B ネオ和ポップ)
//
// 色・タイポ・余白・角丸・影・モーションをここに一元定義する。
// 求職者が触る画面(診断/結果/シェア)はすべてこの D を参照し、
// 個別のハードコードを置かない。企業面は lib/theme.ts(端正)を維持。
// 詳細方針は docs/design-system.md。
// ============================================================

export const color = {
  // 基調2(色面)
  indigo: "#123A5A",
  indigoDeep: "#0E2C46",
  paper: "#F2ECDD",
  paperDeep: "#E7DBC0",
  // 文字
  ink: "#1A1712",
  onIndigo: "#F2ECDD",
  // アクセント1(朱)
  accent: "#EB4B2F",
  accentDeep: "#C43A22", // 生成り上の小さな文字用(コントラスト確保)
  // 補助
  muted: "#6E655A", // 生成り上
  mutedOnIndigo: "#9DB0C2", // 藍上
  line: "#D8CDB4", // 生成り上のヘアライン
  lineOnIndigo: "rgba(242,236,221,0.16)",
  white: "#FFFFFF",
} as const;

export const font = {
  serif: '"Zen Old Mincho","Hiragino Mincho ProN","Yu Mincho",serif',
  sans: '"IBM Plex Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
  mono: '"IBM Plex Mono","SFMono-Regular",Consolas,monospace',
} as const;

// タイポ階層(px / lineHeight)。数字と見出しを強く、本文は控えめに
export const type = {
  display: { fontSize: 40, lineHeight: 1.18, fontWeight: 700 },
  h1: { fontSize: 30, lineHeight: 1.3, fontWeight: 700 },
  h2: { fontSize: 22, lineHeight: 1.45, fontWeight: 700 },
  bodyLg: { fontSize: 16, lineHeight: 1.85, fontWeight: 400 },
  body: { fontSize: 14, lineHeight: 1.85, fontWeight: 400 },
  label: { fontSize: 11, lineHeight: 1.4, fontWeight: 500, letterSpacing: "0.14em" },
  numHero: { fontSize: 68, lineHeight: 1, fontWeight: 500 },
  num: { fontSize: 28, lineHeight: 1.1, fontWeight: 500 },
} as const;

// 余白スケール(px)
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

// 影は原則使わない。オーバーレイ(シート/モーダル)のみ最小限
export const shadow = {
  none: "none",
  overlay: "0 8px 30px rgba(14,44,70,0.28)",
} as const;

// モーション(ms / cubic-bezier)。遷移に方向と意味を持たせる基盤
export const motion = {
  dur: { fast: 0.16, base: 0.28, slow: 0.44 },
  ease: {
    standard: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
    decel: [0, 0.7, 0.2, 1] as [number, number, number, number],
    accel: [0.4, 0, 1, 0.4] as [number, number, number, number],
    stamp: [0.2, 1.4, 0.4, 1] as [number, number, number, number],
  },
} as const;

// タップ領域の最小
export const TAP_MIN = 44;

// 求職者面の共通ボタン(タップ44px以上・トークン参照)
export function primaryButton(): CSSProperties {
  return {
    minHeight: TAP_MIN,
    background: color.indigo,
    color: color.onIndigo,
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: 15,
    border: "none",
    borderRadius: radius.md,
    padding: "15px 20px",
    width: "100%",
    cursor: "pointer",
    letterSpacing: "0.02em",
  };
}

export function accentButton(): CSSProperties {
  return { ...primaryButton(), background: color.accent, color: color.white };
}

export function ghostButton(): CSSProperties {
  return {
    minHeight: TAP_MIN,
    background: "transparent",
    color: color.indigo,
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: 14,
    border: `1.5px solid ${color.indigo}`,
    borderRadius: radius.md,
    padding: "13px 20px",
    width: "100%",
    cursor: "pointer",
  };
}

// 集約エクスポート(使い勝手用)
export const D = { color, font, type, space, radius, shadow, motion, TAP_MIN } as const;
