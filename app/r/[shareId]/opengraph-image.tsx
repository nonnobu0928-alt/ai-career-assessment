import { ImageResponse } from "next/og";
import { getPublicShare } from "@/lib/shares";

// ============================================================
// 一気 IKKI — 公開結果のOGP画像 (F1-3)
//
// satori(@vercel/og)は日本語グリフに追加フォントが必要で不安定なため、
// 合意方針どおり「横組み・Latinラベル + 朱印モチーフ + 藍/朱のブランド色」で
// 生成する(日本語のタイプ名は公開HTMLページ側で見せる)。
// ============================================================

export const runtime = "nodejs";
export const alt = "IKKI Career Diagnosis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#191C21";
const PAPER = "#F4F5F2";
const INDIGO = "#17406F";
const SEAL = "#C13B2E";
const MUTED = "#697077";

export default async function Image({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getPublicShare(shareId);

  const overall = share?.overall ?? 0;
  const typeEn = share?.typeEn ?? "CAREER";
  const dev = share?.deviation ?? null;
  const devLabel = dev
    ? dev.provisional
      ? "REFERENCE"
      : `DEVIATION ${dev.deviation}`
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          padding: "72px 80px",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        {/* ヘッダー: ブランド + 朱印 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 9999,
                border: `5px solid ${SEAL}`,
                color: SEAL,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
                transform: "rotate(-8deg)",
                marginRight: 22,
              }}
            >
              IKKI
            </div>
            <div style={{ color: INK, fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
              CAREER DIAGNOSIS
            </div>
          </div>
          <div style={{ color: MUTED, fontSize: 22, letterSpacing: 4 }}>IKKI.APP</div>
        </div>

        {/* 中央: タイプ + スコア */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: INDIGO, fontSize: 40, fontWeight: 700, letterSpacing: 6 }}>
            {typeEn} TYPE
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 8 }}>
            <div style={{ color: INK, fontSize: 200, fontWeight: 800, lineHeight: 1 }}>{overall}</div>
            <div style={{ color: MUTED, fontSize: 40, fontWeight: 600, marginBottom: 28, marginLeft: 14 }}>
              / 100
            </div>
          </div>
        </div>

        {/* フッター: 偏差値バッジ */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {devLabel ? (
            <div
              style={{
                background: INDIGO,
                color: "#fff",
                fontSize: 30,
                fontWeight: 700,
                borderRadius: 9999,
                padding: "12px 30px",
                letterSpacing: 2,
              }}
            >
              {devLabel}
            </div>
          ) : (
            <div style={{ color: MUTED, fontSize: 28 }}>Quick Career Diagnosis</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
