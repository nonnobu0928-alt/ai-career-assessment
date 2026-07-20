// ============================================================
// 一気 IKKI — デザイントークン
// デザイン: 「履歴書の再発明」— 藍(信頼) × 朱印(本人性の証明)
// 縦書きの見出し / Zen Old Mincho × IBM Plex Sans JP
// ============================================================

export const C = {
  paper: "#F4F5F2",
  surface: "#FFFFFF",
  ink: "#191C21",
  indigo: "#17406F",
  indigoDeep: "#0F2A4A",
  navyBg: "#0F1E33",
  navySurface: "#182C46",
  navyLine: "#2B4568",
  seal: "#C13B2E",
  line: "#E0E3DE",
  muted: "#697077",
  mutedLight: "#9AAABC",
};

export const serif = '"Zen Old Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
export const sans =
  '"IBM Plex Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
export const mono = '"IBM Plex Mono","SFMono-Regular",Consolas,monospace';

// 共通ボタン・チップ(CSSProperties互換のプレーンオブジェクト)
export const btnPrimaryStyle = {
  background: C.indigo,
  color: "#FFFFFF",
  fontFamily: sans,
  fontWeight: 600,
  borderRadius: 10,
  padding: "15px 20px",
  width: "100%",
  fontSize: 15,
  border: "none",
  cursor: "pointer",
  letterSpacing: "0.02em",
} as const;

export const btnGhostStyle = {
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
} as const;

export const chipStyle = {
  display: "inline-block",
  border: `1px solid ${C.line}`,
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 12.5,
  fontFamily: sans,
  color: C.ink,
  marginRight: 6,
  marginBottom: 6,
  background: C.surface,
} as const;
