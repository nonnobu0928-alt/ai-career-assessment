"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Eyebrow, Seal } from "@/components/ui";
import type { ResumeParsed } from "@/lib/resume";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 履歴書アップロード・確認 (F2-1b)
//
// アップロード → AI抽出 → 本人が確認・編集して確定。
// 事実の裏取り用途。確定するまで「AI抽出(未確認)」と明示し、
// 誤ったパース結果を人(企業)に出さない。確定後は充足フラグを立てる。
// ============================================================

const STORAGE_KEY = "ikki-resume-v1";

const empty: ResumeParsed = { name: "", education: [], work_history: [], qualifications: [] };

export default function ResumePage() {
  const [phase, setPhase] = useState<"upload" | "edit" | "done">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [data, setData] = useState<ResumeParsed>(empty);

  const btnPrimary: CSSProperties = {
    background: C.indigo, color: "#fff", fontFamily: sans, fontWeight: 600,
    borderRadius: 10, padding: "15px 20px", width: "100%", fontSize: 15, border: "none", cursor: "pointer",
  };
  const btnGhost: CSSProperties = {
    background: "transparent", color: C.indigo, fontFamily: sans, fontWeight: 500,
    borderRadius: 10, padding: "13px 20px", width: "100%", fontSize: 14, border: `1.5px solid ${C.line}`, cursor: "pointer",
  };
  const input: CSSProperties = {
    width: "100%", background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 8,
    padding: "10px 12px", fontSize: 14, fontFamily: sans, color: C.ink, boxSizing: "border-box",
  };
  const wrap: CSSProperties = {
    maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.paper, padding: "24px 20px 36px",
  };
  const label: CSSProperties = { fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.ink };

  async function onFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result);
          resolve(s.slice(s.indexOf(",") + 1)); // データURLのプレフィックス除去
        };
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "resume", mediaType: file.type, data: base64 }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "failed");
      }
      const json = (await res.json()) as { id: string | null; parsed: ResumeParsed };
      setDocId(json.id);
      setData(json.parsed);
      setPhase("edit");
    } catch (e) {
      setError(e instanceof Error && e.message !== "failed" ? e.message : "読み取りに失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      if (docId) {
        const res = await fetch(`/api/documents/${docId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: data }),
        });
        if (!res.ok) throw new Error("confirm failed");
      }
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ docId, confirmed: data, confirmed_by_user: true, ts: Date.now() }),
        );
      } catch {}
      setPhase("done");
    } catch {
      setError("確定に失敗しました。通信環境を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  // ---------- アップロード ----------
  if (phase === "upload") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 20 }}>
            <Seal text="一" size={30} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: C.ink }}>一気</span>
            <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.muted }}>RESUME</span>
          </div>
          <Eyebrow>履歴書・職務経歴書</Eyebrow>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, color: C.ink, margin: "6px 0 8px" }}>
            書類で基礎情報を裏取り
          </h1>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9, margin: 0 }}>
            PDFまたは画像をアップロードすると、氏名・学歴・職歴・資格を読み取ります。
            <br />
            <strong style={{ color: C.ink }}>読み取り結果は必ずご自身で確認・修正してから確定</strong>します。評価には使いません。
          </p>

          <label
            style={{
              display: "block", marginTop: 24, background: C.surface, border: `1.5px dashed ${C.mutedLight}`,
              borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer",
            }}
          >
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.indigo }}>
              {loading ? "読み取り中…" : "ファイルを選ぶ(PDF / 画像)"}
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.muted, marginTop: 4 }}>最大8MB</div>
          </label>
          {error && <div style={{ fontFamily: sans, fontSize: 13, color: C.seal, marginTop: 12 }}>{error}</div>}

          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, textAlign: "center", marginTop: 20 }}>
              ← トップに戻る
            </div>
          </Link>
        </div>
      </div>
    );
  }

  // ---------- 確定完了 ----------
  if (phase === "done") {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
            <Seal text="確認済" size={40} animate />
            <div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: C.ink }}>書類を確定しました</div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>RESUME CONFIRMED</div>
            </div>
          </div>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9 }}>
            本人確認済みの基礎情報として保存しました。企業には「書類提出済み」として表示され、中身の開示は本人の同意範囲でのみ行われます。
          </p>
          <div style={{ marginTop: 22 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button style={btnPrimary}>トップに戻る</button>
            </Link>
            <button onClick={() => { setData(empty); setDocId(null); setPhase("upload"); }} style={{ ...btnGhost, marginTop: 10 }}>
              別の書類をアップロード
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 確認・編集 ----------
  const setEdu = (i: number, patch: Partial<ResumeParsed["education"][number]>) =>
    setData({ ...data, education: data.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setWork = (i: number, patch: Partial<ResumeParsed["work_history"][number]>) =>
    setData({ ...data, work_history: data.work_history.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap }}>
        <Eyebrow>STEP 2 / 2 — 確認・修正</Eyebrow>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: C.ink, margin: "6px 0 4px" }}>
          読み取り結果の確認
        </h1>
        <div
          style={{
            fontFamily: sans, fontSize: 11.5, color: C.seal, background: "#FBEDEB",
            border: `1px solid ${C.seal}`, borderRadius: 8, padding: "8px 12px", marginBottom: 16, marginTop: 8, lineHeight: 1.6,
          }}
        >
          これはAIが読み取った下書きです。誤りを直してから確定してください。確定するまで企業には出ません。
        </div>

        <label style={label}>氏名</label>
        <input style={{ ...input, marginTop: 4, marginBottom: 16 }} value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="氏名" />

        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={label}>学歴</span>
          <button
            onClick={() => setData({ ...data, education: [...data.education, { school: "", degree: "", period: "" }] })}
            style={{ background: "none", border: "none", color: C.indigo, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
          >+ 追加</button>
        </div>
        {data.education.map((e, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <input style={{ ...input, marginBottom: 6 }} value={e.school} onChange={(ev) => setEdu(i, { school: ev.target.value })} placeholder="学校名" />
            <input style={{ ...input, marginBottom: 6 }} value={e.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} placeholder="学部・学位" />
            <div className="flex" style={{ gap: 6 }}>
              <input style={input} value={e.period} onChange={(ev) => setEdu(i, { period: ev.target.value })} placeholder="在籍期間" />
              <button onClick={() => setData({ ...data, education: data.education.filter((_, j) => j !== i) })}
                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "0 12px" }}>削除</button>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between" style={{ marginBottom: 6, marginTop: 12 }}>
          <span style={label}>職歴</span>
          <button
            onClick={() => setData({ ...data, work_history: [...data.work_history, { company: "", role: "", period: "", summary: "" }] })}
            style={{ background: "none", border: "none", color: C.indigo, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
          >+ 追加</button>
        </div>
        {data.work_history.map((w, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <input style={{ ...input, marginBottom: 6 }} value={w.company} onChange={(ev) => setWork(i, { company: ev.target.value })} placeholder="会社名" />
            <input style={{ ...input, marginBottom: 6 }} value={w.role} onChange={(ev) => setWork(i, { role: ev.target.value })} placeholder="役職・職種" />
            <input style={{ ...input, marginBottom: 6 }} value={w.period} onChange={(ev) => setWork(i, { period: ev.target.value })} placeholder="在籍期間" />
            <textarea style={{ ...input, minHeight: 54, resize: "vertical" }} value={w.summary} onChange={(ev) => setWork(i, { summary: ev.target.value })} placeholder="職務内容(事実)" />
            <button onClick={() => setData({ ...data, work_history: data.work_history.filter((_, j) => j !== i) })}
              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 12px", marginTop: 6, fontFamily: sans, fontSize: 12 }}>この職歴を削除</button>
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <span style={label}>資格</span>
          <textarea
            style={{ ...input, marginTop: 4, minHeight: 54, resize: "vertical" }}
            value={data.qualifications.join("\n")}
            onChange={(e) => setData({ ...data, qualifications: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            placeholder="1行に1つ(例: TOEIC 850)"
          />
        </div>

        {error && <div style={{ fontFamily: sans, fontSize: 13, color: C.seal, marginTop: 12 }}>{error}</div>}
        <button onClick={confirm} disabled={loading} style={{ ...btnPrimary, marginTop: 20, opacity: loading ? 0.5 : 1 }}>
          {loading ? "保存中…" : "この内容で確定する"}
        </button>
      </div>
    </div>
  );
}
