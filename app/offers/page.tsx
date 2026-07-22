"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Eyebrow, Seal } from "@/components/ui";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — オファー受信画面 (v0.3 F3-4)
// 受け取ったオファーを表示し、条件の相対評価(好条件度=上位%)を添える。
// サンプル不足時は「参考値」。cardId は端末localStorageから取得。
// ============================================================

const CARD_ID_KEY = "ikki-card-id-v1";

interface Offer {
  id: string;
  company_name: string;
  salary_min: number | null;
  salary_max: number | null;
  benefits: string[];
  role_description: string | null;
  salary_percentile_top: number | null;
  provisional: boolean;
}

export default function OffersPage() {
  const [state, setState] = useState<"loading" | "nocard" | "ready">("loading");
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    (async () => {
      const id = (() => {
        try {
          return localStorage.getItem(CARD_ID_KEY);
        } catch {
          return null;
        }
      })();
      if (!id) {
        setState("nocard");
        return;
      }
      try {
        const res = await fetch(`/api/offers/${id}`);
        if (res.ok) {
          const data = (await res.json()) as { offers: Offer[] };
          setOffers(data.offers);
        }
      } catch {
        /* noop */
      }
      setState("ready");
    })();
  }, []);

  const wrap: CSSProperties = {
    maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.paper, padding: "28px 20px 40px",
  };
  const card: CSSProperties = {
    background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "20px 18px", marginBottom: 12,
  };

  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
          <Seal text="一" size={30} />
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>一気</span>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>OFFERS</span>
        </div>
        <Eyebrow>受け取ったオファー</Eyebrow>

        {state === "loading" && <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 16 }}>読み込み中…</div>}

        {state === "nocard" && (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ fontFamily: sans, fontSize: 13.5, color: C.ink, lineHeight: 1.9 }}>
              この端末にキャリアカードが見つかりません。まず面談でカードを作成し、企業に公開すると、オファーがここに届きます。
            </div>
            <Link href="/" style={{ textDecoration: "none" }}>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.indigo, marginTop: 12 }}>トップへ →</div>
            </Link>
          </div>
        )}

        {state === "ready" && offers.length === 0 && (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9 }}>
              まだオファーはありません。カードを「企業に公開」にしておくと、条件つきのオファーが届きます。
            </div>
          </div>
        )}

        {state === "ready" &&
          offers.map((o) => (
            <div key={o.id} style={card}>
              <div className="flex items-center justify-between">
                <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>{o.company_name}</span>
                <span style={{ fontFamily: sans, fontSize: 11, color: "#fff", background: C.indigo, borderRadius: 999, padding: "3px 10px" }}>オファー</span>
              </div>

              {(o.salary_min || o.salary_max) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 500, color: C.ink }}>
                    {o.salary_min ?? "—"} – {o.salary_max ?? "—"}
                    <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginLeft: 6 }}>万円</span>
                  </div>
                  {o.salary_percentile_top !== null && (
                    <div className="flex items-center" style={{ gap: 8, marginTop: 6 }}>
                      <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: "#fff", background: C.seal, borderRadius: 999, padding: "4px 12px" }}>
                        給与 上位 {o.salary_percentile_top}%
                      </span>
                      {o.provisional && (
                        <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "2px 8px" }}>参考値</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {o.benefits.length > 0 && (
                <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
                  {o.benefits.map((b) => (
                    <span key={b} style={{ fontFamily: sans, fontSize: 12, color: C.indigo, border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 10px", background: C.paper }}>{b}</span>
                  ))}
                </div>
              )}

              {o.role_description && (
                <div style={{ fontFamily: sans, fontSize: 12.5, color: C.ink, lineHeight: 1.8, marginTop: 12 }}>{o.role_description}</div>
              )}
            </div>
          ))}

        <Link href="/" style={{ textDecoration: "none" }}>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, textAlign: "center", marginTop: 16 }}>← トップに戻る</div>
        </Link>
      </div>
    </div>
  );
}
