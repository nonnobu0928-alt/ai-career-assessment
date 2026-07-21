import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QUICK_METRICS } from "@/lib/diagnostic/types";
import { getPublicShare } from "@/lib/shares";
import { C, mono, sans, serif } from "@/lib/theme";

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
    <div style={{ background: C.paper, minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "36px 24px 40px" }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 20 }}>
          <div
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: `2.5px solid ${C.seal}`,
              color: C.seal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: serif,
              fontWeight: 700,
              transform: "rotate(-8deg)",
            }}
          >
            一
          </div>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>一気</span>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>
            IKKI
          </span>
        </div>

        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: C.muted }}>
          CAREER DIAGNOSIS — TYPE
        </div>
        <h1
          style={{
            fontFamily: serif,
            fontWeight: 700,
            fontSize: 30,
            color: C.ink,
            margin: "8px 0 0",
          }}
        >
          {share.typeName}
        </h1>

        <div
          style={{
            marginTop: 20,
            background: C.surface,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: "22px 20px",
          }}
        >
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 44, fontWeight: 500, color: C.indigo, lineHeight: 1 }}>
              {share.overall}
            </span>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: C.muted }}>総合スコア / 100</span>
          </div>

          {dev && (
            <div className="flex items-center" style={{ gap: 8, marginTop: 14 }}>
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  background: C.indigo,
                  borderRadius: 999,
                  padding: "5px 12px",
                }}
              >
                偏差値 {dev.deviation}
              </span>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: C.muted }}>
                上位 {dev.percentileTop}%
              </span>
              {dev.provisional && (
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.muted,
                    border: `1px solid ${C.line}`,
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  参考値
                </span>
              )}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {QUICK_METRICS.map((m) => (
              <div key={m.key} className="flex items-center" style={{ gap: 10, marginBottom: 9 }}>
                <span style={{ fontFamily: sans, fontSize: 12, color: C.ink, width: 76, flexShrink: 0 }}>
                  {m.name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 7,
                    borderRadius: 4,
                    background: C.paper,
                    border: `1px solid ${C.line}`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${share.byMetric[m.key] ?? 0}%`,
                      height: "100%",
                      background: C.indigo,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <Link href="/quiz" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: C.indigo,
                color: "#fff",
                fontFamily: sans,
                fontWeight: 600,
                borderRadius: 10,
                padding: "15px 20px",
                width: "100%",
                fontSize: 15,
                border: "none",
                cursor: "pointer",
              }}
            >
              友達も3分診断してみる
            </button>
          </Link>
          <div
            style={{
              fontFamily: sans,
              fontSize: 11.5,
              color: C.muted,
              textAlign: "center",
              marginTop: 12,
              lineHeight: 1.7,
            }}
          >
            この結果は匿名の要約です。詳しいキャリアカードは本人のみ閲覧できます。
          </div>
        </div>
      </div>
    </div>
  );
}
