import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { color, font, radius, space } from "@/lib/design";
import { QUICK_METRICS } from "@/lib/diagnostic/types";
import { getPublicShare } from "@/lib/shares";

export const runtime = "nodejs";

// ============================================================
// 一気 IKKI — 公開結果ページ /r/[shareId] (F1-3)
//
// 匿名の要約のみ表示: タイプ名・偏差値バッジ・強み。
// 発言ログ・企業向け評価・氏名は一切出さない(quick_shares に存在しない)。
// フルカードは本人ログイン時のみ(将来のフェーズ3)。
// ============================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const share = await getPublicShare(shareId);
  if (!share) return { title: "一気 IKKI — 診断結果" };
  const title = `${share.typeName}｜一気 IKKI キャリア診断`;
  const desc = `総合スコア ${share.overall}／100・${share.topStrengths.join("・")}`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function PublicResultPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getPublicShare(shareId);
  if (!share) notFound();

  const dev = share.deviation;
  return (
    <div data-ikki style={{ background: color.paper, minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* 藍の色面(タイプ名を縦書きで主役に) */}
        <div style={{ background: color.indigo, padding: `${space.xxl}px ${space.xl}px ${space.xl}px` }}>
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.16em", color: color.mutedOnIndigo }}>
              一気 IKKI ・ CAREER TYPE
            </span>
            <div
              aria-hidden
              style={{
                width: 40, height: 40, borderRadius: "50%", border: `2.5px solid ${color.accent}`,
                color: color.accent, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: font.serif, fontWeight: 700, transform: "rotate(-8deg)",
                writingMode: "vertical-rl", fontSize: 12,
              }}
            >
              診断済
            </div>
          </div>
          <div className="flex justify-end" style={{ marginTop: space.lg }}>
            <h1
              style={{
                fontFamily: font.serif, fontWeight: 700, fontSize: 40, lineHeight: 1.35,
                letterSpacing: "0.1em", color: color.paper, writingMode: "vertical-rl", height: 220,
              }}
            >
              {share.typeName}
            </h1>
          </div>
          <div className="flex items-baseline" style={{ gap: space.sm, marginTop: space.md }}>
            <span style={{ fontFamily: font.mono, fontSize: 60, fontWeight: 500, color: color.accent, lineHeight: 1 }}>
              {share.overall}
            </span>
            <span style={{ fontFamily: font.sans, fontSize: 12.5, color: color.mutedOnIndigo }}>総合スコア / 100</span>
          </div>
          {dev && (
            <div className="flex items-center" style={{ gap: space.sm, marginTop: space.md }}>
              <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 700, color: color.white, background: color.accent, borderRadius: radius.pill, padding: "5px 14px" }}>
                偏差値 {dev.deviation}
              </span>
              <span style={{ fontFamily: font.sans, fontSize: 12.5, color: color.mutedOnIndigo }}>上位 {dev.percentileTop}%</span>
              {dev.provisional && (
                <span style={{ fontFamily: font.sans, fontSize: 10.5, fontWeight: 700, color: color.mutedOnIndigo, border: `1px solid ${color.lineOnIndigo}`, borderRadius: radius.pill, padding: "2px 8px" }}>参考値</span>
              )}
            </div>
          )}
        </div>

        {/* 生成りの面(5つの力) */}
        <div style={{ padding: `${space.xl}px ${space.xl}px ${space.xxxl}px` }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.14em", color: color.muted, marginBottom: space.md }}>
            5つの力
          </div>
          {QUICK_METRICS.map((m) => (
            <div key={m.key} style={{ marginBottom: space.md }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: font.sans, fontSize: 12.5, color: color.ink }}>{m.name}</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.muted }}>{share.byMetric[m.key] ?? 0}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: color.paperDeep, overflow: "hidden" }}>
                <div style={{ width: `${share.byMetric[m.key] ?? 0}%`, height: "100%", background: color.indigo }} />
              </div>
            </div>
          ))}

          <div style={{ marginTop: space.xxl }}>
            <Link href="/quiz" style={{ textDecoration: "none" }}>
              <button
                style={{
                  minHeight: 44, background: color.accent, color: color.white, fontFamily: font.sans, fontWeight: 700,
                  borderRadius: radius.md, padding: "15px 20px", width: "100%", fontSize: 15, border: "none", cursor: "pointer",
                }}
              >
                自分も3分診断してみる
              </button>
            </Link>
            <div style={{ fontFamily: font.sans, fontSize: 11.5, color: color.muted, textAlign: "center", marginTop: space.md, lineHeight: 1.7 }}>
              この結果は匿名の要約です。詳しいキャリアカードは本人のみ閲覧できます。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
