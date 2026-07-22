"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { AnonymizedCard } from "@/lib/anonymize";
import {
  classifyCandidate,
  VERDICT_LABELS,
  type HiringCriteria,
  type Verdict,
} from "@/lib/matching";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 候補者の推薦一覧 (v0.3 F3-2b)
// 合格基準に照らして 推薦/条件付/非推薦 を根拠つきで提示。
// スコア順に並べ、一次面接スキップの削減工数を可視化。
// ============================================================

type SavedCriteria = HiringCriteria & { id: string };

const VERDICT_COLOR: Record<Verdict, string> = {
  recommend: "#5B84B8",
  conditional: "#C9A24B",
  reject: C.navyLine,
};

// 一次面接1件あたりの想定工数(分)。推薦をスキップできた前提の削減目安
const MINUTES_PER_INTERVIEW = 45;

export function CandidatePanel({
  criteria,
  getToken,
  onBulkOffer,
}: {
  criteria: SavedCriteria[];
  getToken: () => Promise<string | null>;
  onBulkOffer?: (candidates: AnonymizedCard[]) => void;
}) {
  const [candidates, setCandidates] = useState<AnonymizedCard[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const res = await fetch("/api/company/candidates", { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) {
          const data = (await res.json()) as { candidates: AnonymizedCard[] };
          setCandidates(data.candidates);
        }
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = criteria.find((c) => c.id === selectedId) ?? criteria[0] ?? null;

  const card: CSSProperties = {
    background: C.navySurface, border: `1.5px solid ${C.navyLine}`, borderRadius: 12, padding: "14px 16px",
  };

  if (loading) return <div style={{ fontFamily: sans, fontSize: 13, color: C.mutedLight }}>候補者を読み込み中…</div>;

  if (criteria.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontFamily: sans, fontSize: 13, color: "#EDF2F8", lineHeight: 1.8 }}>
          まず「合格基準」タブで基準を1つ登録してください。基準に照らして候補者を推薦/条件付/非推薦に分類します。
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontFamily: sans, fontSize: 13, color: "#EDF2F8", lineHeight: 1.8 }}>
          公開に同意した候補者がまだいません。候補者が増えると、ここに基準充足順で表示されます。
        </div>
      </div>
    );
  }

  // 分類してスコア順に並べる
  const classified = candidates
    .map((c) => ({ c, m: active ? classifyCandidate(c, active) : null }))
    .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0));

  const recommendCount = classified.filter((x) => x.m?.verdict === "recommend").length;
  const savedMinutes = recommendCount * MINUTES_PER_INTERVIEW;

  const visible = classified.filter((x) => filter === "all" || x.m?.verdict === filter);
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickAllRecommended = () =>
    setPicked(new Set(classified.filter((x) => x.m?.verdict === "recommend").map((x) => x.c.id)));
  const pickedCards = candidates.filter((c) => picked.has(c.id));

  return (
    <div style={{ paddingBottom: picked.size > 0 ? 72 : 0 }}>
      {/* 基準セレクタ */}
      {criteria.length > 1 && (
        <select
          value={active?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            width: "100%", background: C.navyBg, border: `1.5px solid ${C.navyLine}`, borderRadius: 8,
            padding: "10px 12px", fontSize: 13, fontFamily: sans, color: "#fff", marginBottom: 12,
          }}
        >
          {criteria.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {/* サマリー: 基準を満たす人数 + 削減工数 */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, color: "#fff" }}>{recommendCount}</span>
          <span style={{ fontFamily: sans, fontSize: 12, color: C.mutedLight }}>名が「{active?.name}」の推薦基準を充足</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight, marginTop: 4 }}>
          一次面接スキップで <strong style={{ color: "#DDE6F2" }}>約{Math.round(savedMinutes / 60 * 10) / 10}時間</strong> の削減見込み(1件{MINUTES_PER_INTERVIEW}分換算)
        </div>
        {recommendCount > 0 && (
          <button
            onClick={pickAllRecommended}
            style={{ background: "none", border: `1px solid ${C.navyLine}`, color: "#DDE6F2", fontFamily: sans, fontSize: 11.5, borderRadius: 8, padding: "6px 12px", cursor: "pointer", marginTop: 10 }}
          >
            推薦{recommendCount}名をまとめて選択
          </button>
        )}
      </div>

      {/* 判定フィルタ */}
      <div className="flex" style={{ gap: 6, marginBottom: 12 }}>
        {([["all", "すべて"], ["recommend", "推薦"], ["conditional", "条件付"], ["reject", "非推薦"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              flex: 1, fontFamily: sans, fontSize: 11.5, fontWeight: filter === k ? 700 : 500,
              color: filter === k ? "#fff" : C.mutedLight,
              background: filter === k ? C.navySurface : "transparent",
              border: `1px solid ${filter === k ? "#5B84B8" : C.navyLine}`, borderRadius: 8, padding: "7px 0", cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 候補者一覧 */}
      {visible.map(({ c, m }) => (
        <div key={c.id} style={{ ...card, marginBottom: 8 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center" style={{ gap: 10 }}>
              <button
                onClick={() => togglePick(c.id)}
                aria-label="選択"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                  border: `1.5px solid ${picked.has(c.id) ? "#5B84B8" : C.navyLine}`,
                  background: picked.has(c.id) ? "#5B84B8" : "transparent",
                  color: "#fff", fontSize: 12, lineHeight: 1,
                }}
              >
                {picked.has(c.id) ? "✓" : ""}
              </button>
              <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 15, color: "#fff" }}>{c.initial} さん</span>
              <span style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight }}>{c.role} ・ 経験{c.years}</span>
            </div>
            {m && (
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: "#fff", background: VERDICT_COLOR[m.verdict], borderRadius: 999, padding: "3px 10px" }}>
                {VERDICT_LABELS[m.verdict]}
              </span>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.navyBg, overflow: "hidden" }}>
              <div style={{ width: `${m?.score ?? 0}%`, height: "100%", background: "#5B84B8" }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 11, color: C.mutedLight }}>{m?.score ?? 0}%</span>
          </div>
          <button
            onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            style={{ background: "none", border: "none", color: C.mutedLight, fontFamily: sans, fontSize: 11.5, cursor: "pointer", padding: "8px 0 0" }}
          >
            {expanded === c.id ? "根拠を閉じる" : "判定の根拠を見る"}
          </button>
          {expanded === c.id && m && (
            <div style={{ marginTop: 6 }}>
              {m.reasons.map((r, i) => (
                <div key={i} className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ color: r.ok ? "#5B84B8" : "#C97A70", fontSize: 12 }}>{r.ok ? "✓" : "✕"}</span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: "#EDF2F8" }}>{r.label}</span>
                  <span style={{ fontFamily: sans, fontSize: 11, color: C.mutedLight }}>{r.detail}</span>
                </div>
              ))}
              <div style={{ fontFamily: sans, fontSize: 10.5, color: C.mutedLight, marginTop: 6, lineHeight: 1.6 }}>
                氏名・発言原文は、マッチ成立かつ本人同意の範囲でのみ開示されます。
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 一括アクションバー */}
      {picked.size > 0 && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, background: C.navySurface,
            borderTop: `1.5px solid ${C.navyLine}`, padding: "12px 20px", zIndex: 30,
          }}
        >
          <div style={{ maxWidth: 460, margin: "0 auto" }} className="flex items-center justify-between">
            <span style={{ fontFamily: sans, fontSize: 13, color: "#fff" }}>{picked.size}名を選択中</span>
            <div className="flex items-center" style={{ gap: 8 }}>
              <button onClick={() => setPicked(new Set())} style={{ background: "none", border: `1px solid ${C.navyLine}`, color: C.mutedLight, fontFamily: sans, fontSize: 12, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>解除</button>
              <button
                onClick={() => onBulkOffer?.(pickedCards)}
                style={{ background: "#fff", border: "none", color: C.navyBg, fontFamily: sans, fontWeight: 600, fontSize: 13, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
              >
                一括でオファー準備
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
