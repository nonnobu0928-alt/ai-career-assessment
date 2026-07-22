"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { AnonymizedCard } from "@/lib/anonymize";
import { COMPETENCY_MODEL } from "@/lib/competencyModel";
import type { DocKey, HiringCriteria } from "@/lib/matching";
import { BENEFIT_OPTIONS, type Benefit } from "@/lib/offers";
import { C, mono, sans, serif } from "@/lib/theme";
import { CandidatePanel } from "./candidatePanel";

// ============================================================
// 一気 IKKI — 企業ダッシュボード (v0.3 F3-2)
// タブ: 合格基準の登録 / 候補者の推薦一覧(F3-2b: CandidatePanel)
// ============================================================

const DOC_OPTIONS: { key: DocKey; label: string }[] = [
  { key: "resume", label: "履歴書提出" },
  { key: "comm_test", label: "コミュ試験受験" },
  { key: "voice", label: "音声面接受験" },
];

type SavedCriteria = HiringCriteria & { id: string };

export function CompanyDashboard({
  companyName,
  getToken,
}: {
  companyName: string;
  getToken: () => Promise<string | null>;
}) {
  const [tab, setTab] = useState<"criteria" | "candidates">("criteria");
  const [list, setList] = useState<SavedCriteria[]>([]);
  const [name, setName] = useState("");
  const [minComp, setMinComp] = useState<Record<string, number>>({});
  const [docs, setDocs] = useState<DocKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // オファーモーダル(F3-3)
  const [offerFor, setOfferFor] = useState<AnonymizedCard[] | null>(null);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [roleDesc, setRoleDesc] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerSent, setOfferSent] = useState(0);

  async function authHeaders(): Promise<Record<string, string>> {
    const t = await getToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${t}` };
  }

  async function load() {
    try {
      const res = await fetch("/api/company/criteria", { headers: await authHeaders() });
      if (res.ok) {
        const data = (await res.json()) as { criteria: SavedCriteria[] };
        setList(data.criteria);
      }
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/company/criteria", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          name,
          min_competencies: minComp,
          required_documents: docs,
          preferred_traits: [],
        }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { criteria: SavedCriteria };
      setList((l) => [data.criteria, ...l]);
      setName("");
      setMinComp({});
      setDocs([]);
    } catch {
      setError("登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function sendOffer() {
    if (!offerFor || offerBusy) return;
    setOfferBusy(true);
    try {
      const res = await fetch("/api/company/offers", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          card_ids: offerFor.map((c) => c.id),
          salary_min: Number(salaryMin) || 0,
          salary_max: Number(salaryMax) || 0,
          benefits,
          role_description: roleDesc,
        }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { sent: number };
      setOfferSent(data.sent);
      setOfferFor(null);
      setSalaryMin(""); setSalaryMax(""); setBenefits([]); setRoleDesc("");
    } catch {
      setError("オファー送信に失敗しました。");
    } finally {
      setOfferBusy(false);
    }
  }

  const card: CSSProperties = {
    background: C.navySurface, border: `1.5px solid ${C.navyLine}`, borderRadius: 14, padding: "20px 18px",
  };
  const btnPrimary: CSSProperties = {
    background: "#fff", color: C.navyBg, fontFamily: sans, fontWeight: 600,
    borderRadius: 10, padding: "13px 20px", width: "100%", fontSize: 14, border: "none", cursor: "pointer",
  };
  const input: CSSProperties = {
    width: "100%", background: C.navyBg, border: `1.5px solid ${C.navyLine}`, borderRadius: 8,
    padding: "10px 12px", fontSize: 14, fontFamily: sans, color: "#fff", boxSizing: "border-box",
  };

  return (
    <div>
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        {([["criteria", "合格基準"], ["candidates", "候補者"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1, fontFamily: sans, fontSize: 13, fontWeight: tab === k ? 700 : 500,
              color: tab === k ? "#fff" : C.mutedLight,
              background: tab === k ? C.navySurface : "transparent",
              border: `1.5px solid ${tab === k ? "#5B84B8" : C.navyLine}`,
              borderRadius: 10, padding: "10px 0", cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "criteria" ? (
        <div>
          <div style={card}>
            <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.mutedLight, marginBottom: 12 }}>
              合格基準を登録
            </div>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="基準名(例: エンプラ営業 即戦力)" />

            <div style={{ fontFamily: sans, fontSize: 12, color: "#DDE6F2", marginTop: 16, marginBottom: 6 }}>必須コンピテンシー(下限点)</div>
            {COMPETENCY_MODEL.map((c) => (
              <div key={c.key} className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontFamily: sans, fontSize: 12.5, color: "#EDF2F8" }}>{c.name}</span>
                <div className="flex" style={{ gap: 4 }}>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMinComp((m) => ({ ...m, [c.key]: n }))}
                      style={{
                        width: 30, height: 28, borderRadius: 6, fontFamily: mono, fontSize: 12, cursor: "pointer",
                        border: `1px solid ${(minComp[c.key] ?? 0) === n ? "#5B84B8" : C.navyLine}`,
                        background: (minComp[c.key] ?? 0) === n ? "#5B84B8" : "transparent",
                        color: (minComp[c.key] ?? 0) === n ? "#fff" : C.mutedLight,
                      }}
                    >
                      {n === 0 ? "―" : n}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ fontFamily: sans, fontSize: 12, color: "#DDE6F2", marginTop: 14, marginBottom: 6 }}>必須書類・試験</div>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {DOC_OPTIONS.map((d) => {
                const on = docs.includes(d.key);
                return (
                  <button
                    key={d.key}
                    onClick={() => setDocs((ds) => (on ? ds.filter((x) => x !== d.key) : [...ds, d.key]))}
                    style={{
                      fontFamily: sans, fontSize: 12, cursor: "pointer", borderRadius: 999, padding: "6px 12px",
                      border: `1px solid ${on ? "#5B84B8" : C.navyLine}`,
                      background: on ? "#5B84B8" : "transparent", color: on ? "#fff" : C.mutedLight,
                    }}
                  >
                    {on ? "✓ " : ""}{d.label}
                  </button>
                );
              })}
            </div>

            {error && <div style={{ fontFamily: sans, fontSize: 12.5, color: "#F3A6A0", marginTop: 10 }}>{error}</div>}
            <button onClick={save} disabled={!name.trim() || busy} style={{ ...btnPrimary, marginTop: 16, opacity: !name.trim() || busy ? 0.5 : 1 }}>
              {busy ? "登録中…" : "この基準を登録"}
            </button>
          </div>

          {list.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.mutedLight, marginBottom: 8 }}>
                登録済みの基準
              </div>
              {list.map((c) => (
                <div key={c.id} style={{ ...card, marginBottom: 8, padding: "14px 16px" }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15, color: "#fff" }}>{c.name}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight, marginTop: 4, lineHeight: 1.7 }}>
                    {Object.entries(c.min_competencies).length > 0
                      ? Object.entries(c.min_competencies)
                          .map(([k, v]) => `${COMPETENCY_MODEL.find((m) => m.key === k)?.name ?? k}≥${v}`)
                          .join(" / ")
                      : "コンピテンシー基準なし"}
                    {c.required_documents.length > 0 && ` ・ 必須: ${c.required_documents.map((d) => DOC_OPTIONS.find((o) => o.key === d)?.label).join("・")}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <CandidatePanel criteria={list} getToken={getToken} onBulkOffer={(cs) => { setOfferSent(0); setOfferFor(cs); }} />
      )}

      {offerSent > 0 && (
        <div style={{ ...card, marginTop: 12, borderColor: "#5B84B8" }}>
          <div style={{ fontFamily: sans, fontSize: 13, color: "#DDE6F2" }}>{offerSent}名にオファーを送信しました。</div>
        </div>
      )}

      {/* オファー構造化入力モーダル (F3-3) */}
      {offerFor && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,30,51,0.7)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setOfferFor(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.navySurface, borderRadius: "16px 16px 0 0", padding: "22px 22px 28px", width: "100%", maxWidth: 460, maxHeight: "88dvh", overflowY: "auto" }}
          >
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, color: "#fff" }}>
              {offerFor.length}名にオファー
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight, marginTop: 4, marginBottom: 16 }}>
              条件を項目で入力します(自由記述の塊にしません)。
            </div>

            <div style={{ fontFamily: sans, fontSize: 12, color: "#DDE6F2", marginBottom: 6 }}>想定年収(万円)</div>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 16 }}>
              <input style={input} type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="下限" />
              <span style={{ color: C.mutedLight }}>–</span>
              <input style={input} type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="上限" />
            </div>

            <div style={{ fontFamily: sans, fontSize: 12, color: "#DDE6F2", marginBottom: 6 }}>福利厚生</div>
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 16 }}>
              {BENEFIT_OPTIONS.map((b) => {
                const on = benefits.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => setBenefits((bs) => (on ? bs.filter((x) => x !== b) : [...bs, b]))}
                    style={{
                      fontFamily: sans, fontSize: 11.5, cursor: "pointer", borderRadius: 999, padding: "6px 12px",
                      border: `1px solid ${on ? "#5B84B8" : C.navyLine}`, background: on ? "#5B84B8" : "transparent", color: on ? "#fff" : C.mutedLight,
                    }}
                  >
                    {on ? "✓ " : ""}{b}
                  </button>
                );
              })}
            </div>

            <div style={{ fontFamily: sans, fontSize: 12, color: "#DDE6F2", marginBottom: 6 }}>仕事内容</div>
            <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="担当業務・期待役割" />

            {error && <div style={{ fontFamily: sans, fontSize: 12.5, color: "#F3A6A0", marginTop: 10 }}>{error}</div>}
            <button onClick={sendOffer} disabled={offerBusy} style={{ ...btnPrimary, marginTop: 16, opacity: offerBusy ? 0.5 : 1 }}>
              {offerBusy ? "送信中…" : `${offerFor.length}名にオファーを送信`}
            </button>
            <button onClick={() => setOfferFor(null)} style={{ background: "none", border: "none", color: C.mutedLight, fontFamily: sans, fontSize: 12.5, cursor: "pointer", width: "100%", padding: "12px 0 0" }}>キャンセル</button>
          </div>
        </div>
      )}
      <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.14em", color: C.navyLine, textAlign: "center", marginTop: 20 }}>
        {companyName} ・ IKKI FOR BUSINESS
      </div>
    </div>
  );
}
