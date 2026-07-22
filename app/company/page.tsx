"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Eyebrow, Seal } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabaseBrowser";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — 企業ダッシュボード入口 / 認証ガード (v0.3 F3-1)
//
// 企業ユーザーのみ Supabase Auth。求職者の匿名フローには影響しない。
// 状態: 未設定 / 未ログイン / 会社未登録 / ダッシュボード。
// ダッシュボード中身(基準・候補者一覧)は F3-2 で追加。
// ============================================================

type Membership = { company_id: string; role: string; company_name: string };
type Phase = "loading" | "unconfigured" | "auth" | "setup" | "dashboard";

export default function CompanyPage() {
  const supabase = getBrowserSupabase();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function token(): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadMe() {
    if (!supabase) {
      setPhase("unconfigured");
      return;
    }
    const t = await token();
    if (!t) {
      setPhase("auth");
      return;
    }
    try {
      const res = await fetch("/api/company/me", { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) {
        setPhase("auth");
        return;
      }
      const data = (await res.json()) as { membership: Membership | null };
      if (data.membership) {
        setMembership(data.membership);
        setPhase("dashboard");
      } else {
        setPhase("setup");
      }
    } catch {
      setPhase("auth");
    }
  }

  useEffect(() => {
    // 認証セッションの非同期ロード(外部システムとの同期)。
    // setStateはawait後に行うため、set-state-in-effectの誤検知を抑止する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAuth() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
      await loadMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "認証に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function submitSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await token();
      const res = await fetch("/api/company/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ name: companyName }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "failed");
      }
      const data = (await res.json()) as { membership: Membership };
      setMembership(data.membership);
      setPhase("dashboard");
    } catch (e) {
      setError(e instanceof Error && e.message !== "failed" ? e.message : "登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setMembership(null);
    setPhase("auth");
  }

  const btnPrimary: CSSProperties = {
    background: C.indigo, color: "#fff", fontFamily: sans, fontWeight: 600,
    borderRadius: 10, padding: "14px 20px", width: "100%", fontSize: 15, border: "none", cursor: "pointer",
  };
  const inputStyle: CSSProperties = {
    width: "100%", background: C.surface, border: `1.5px solid ${C.line}`, borderRadius: 10,
    padding: "12px 14px", fontSize: 15, fontFamily: sans, color: C.ink, boxSizing: "border-box", marginTop: 6,
  };
  const wrap: CSSProperties = {
    maxWidth: 460, margin: "0 auto", minHeight: "100dvh", background: C.navyBg, padding: "40px 24px",
  };
  const cardStyle: CSSProperties = {
    background: C.navySurface, border: `1.5px solid ${C.navyLine}`, borderRadius: 14, padding: "24px 22px",
  };

  const header = (
    <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
      <Seal text="企" size={30} />
      <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: "#fff" }}>一気</span>
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: C.mutedLight }}>FOR BUSINESS</span>
    </div>
  );

  if (phase === "loading") {
    return <div style={{ background: C.navyBg, minHeight: "100vh" }}><div style={{ ...wrap }}>{header}<div style={{ fontFamily: sans, color: C.mutedLight, fontSize: 13 }}>読み込み中…</div></div></div>;
  }

  if (phase === "unconfigured") {
    return (
      <div style={{ background: C.navyBg, minHeight: "100vh" }}>
        <div style={{ ...wrap }}>
          {header}
          <div style={cardStyle}>
            <Eyebrow light>企業向け管理画面</Eyebrow>
            <div style={{ fontFamily: sans, fontSize: 13.5, color: "#EDF2F8", lineHeight: 1.9, marginTop: 8 }}>
              企業ログインは現在準備中です(認証が未設定)。
              <br />
              運営者向け: <code style={{ color: C.mutedLight }}>NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
              <code style={{ color: C.mutedLight }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を設定してください。
            </div>
          </div>
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, textAlign: "center", marginTop: 20 }}>← トップに戻る</div>
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <div style={{ background: C.navyBg, minHeight: "100vh" }}>
        <div style={{ ...wrap }}>
          {header}
          <div style={cardStyle}>
            <Eyebrow light>{mode === "login" ? "企業ログイン" : "企業アカウント登録"}</Eyebrow>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "#fff", margin: "6px 0 4px" }}>
              採用担当者の方へ
            </h1>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, lineHeight: 1.8, margin: "0 0 16px" }}>
              候補者は根拠つきの評価カードで届きます。書類選考と一次面接を省いて「口説き」から始められます。
            </p>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" />
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード(6文字以上)" />
            {error && <div style={{ fontFamily: sans, fontSize: 12.5, color: "#F3A6A0", marginTop: 10 }}>{error}</div>}
            <button onClick={submitAuth} disabled={busy || !email || password.length < 6} style={{ ...btnPrimary, marginTop: 16, opacity: busy || !email || password.length < 6 ? 0.5 : 1 }}>
              {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録する"}
            </button>
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
              style={{ background: "none", border: "none", color: C.mutedLight, fontFamily: sans, fontSize: 12.5, cursor: "pointer", width: "100%", padding: "12px 0 0" }}
            >
              {mode === "login" ? "アカウントを新規登録する" : "既にアカウントをお持ちの方"}
            </button>
          </div>
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, textAlign: "center", marginTop: 20 }}>← 求職者トップに戻る</div>
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div style={{ background: C.navyBg, minHeight: "100vh" }}>
        <div style={{ ...wrap }}>
          {header}
          <div style={cardStyle}>
            <Eyebrow light>会社情報の登録</Eyebrow>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "#fff", margin: "6px 0 12px" }}>会社名を登録</h1>
            <input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="例: 株式会社一気" />
            {error && <div style={{ fontFamily: sans, fontSize: 12.5, color: "#F3A6A0", marginTop: 10 }}>{error}</div>}
            <button onClick={submitSetup} disabled={busy || !companyName.trim()} style={{ ...btnPrimary, marginTop: 16, opacity: busy || !companyName.trim() ? 0.5 : 1 }}>
              {busy ? "登録中…" : "登録して進む"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // dashboard
  return (
    <div style={{ background: C.navyBg, minHeight: "100vh" }}>
      <div style={{ ...wrap }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          {header}
          <button onClick={signOut} style={{ background: "none", border: `1px solid ${C.navyLine}`, color: C.mutedLight, fontFamily: sans, fontSize: 12, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>ログアウト</button>
        </div>
        <div style={cardStyle}>
          <Eyebrow light>ダッシュボード</Eyebrow>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "#fff", margin: "6px 0 4px" }}>
            {membership?.company_name} 様
          </h1>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, lineHeight: 1.8, margin: 0 }}>
            ようこそ。合格基準の登録と候補者の推薦は次のステップで開放されます。
          </p>
        </div>
        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontFamily: sans, fontSize: 13, color: "#EDF2F8", fontWeight: 600, marginBottom: 6 }}>これからできること</div>
          <ul style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
            <li>合格基準(必須コンピテンシー・書類・特性)の登録</li>
            <li>候補者を推薦/条件付/非推薦に根拠つきで自動分類</li>
            <li>条件を構造化入力してオファー送付</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
