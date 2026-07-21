"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ProgressBar } from "@/components/diagnostic/motion";
import { Eyebrow, Seal } from "@/components/ui";
import { COMM_SITUATIONS, type CommResult } from "@/lib/commTest";
import { C, mono, sans, serif } from "@/lib/theme";

// ============================================================
// 一気 IKKI — コミュニケーション能力テスト(F1-5)UI
//
// 実務シチュエーションに自由記述で応答 → サーバーで固定4軸採点。
// 採点は本人の記述からの根拠引用つき(照合済み)。評価保留の軸は正直に表示。
// ============================================================

const STORAGE_KEY = "ikki-commtest-results-v1";

export default function CommTestPage() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommResult | null>(null);
  const [results, setResults] = useState<CommResult[]>([]);
  const [done, setDone] = useState(false);

  const situation = COMM_SITUATIONS[idx];

  const btnPrimary: CSSProperties = {
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
  };
  const btnGhost: CSSProperties = {
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
  };
  const wrap: CSSProperties = {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    background: C.paper,
    padding: "20px 20px 32px",
  };

  async function submit() {
    if (text.trim().length < 10 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/comm-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situationId: situation.id, response: text.trim() }),
      });
      if (!res.ok) throw new Error("comm-test failed");
      const data = (await res.json()) as { result: CommResult };
      setResult(data.result);
    } catch {
      setError("採点に失敗しました。通信環境を確認して、もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    if (!result) return;
    const all = [...results, result];
    setResults(all);
    setResult(null);
    setText("");
    if (idx + 1 >= COMM_SITUATIONS.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {}
      setDone(true);
    } else {
      setIdx(idx + 1);
    }
  }

  // ---------- 完了画面 ----------
  if (done) {
    return (
      <div style={{ background: C.paper }}>
        <div style={{ ...wrap }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
            <Seal text="受験済" size={40} animate />
            <div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: C.ink }}>
                コミュ試験 完了
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                COMMUNICATION TEST
              </div>
            </div>
          </div>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, lineHeight: 1.9 }}>
            {results.length}問すべて採点しました。各シチュエーションの評価は、あなたが実際に書いた文章の該当箇所を根拠にしています。
          </p>
          <div style={{ marginTop: 22 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button style={btnPrimary}>本格的なキャリア面談に進む</button>
            </Link>
            <Link href="/quiz" style={{ textDecoration: "none" }}>
              <button style={{ ...btnGhost, marginTop: 10 }}>3分診断に戻る</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.paper }}>
      <div style={{ ...wrap }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>
            COMMUNICATION TEST
          </span>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>やめる</span>
          </Link>
        </div>
        <ProgressBar value={idx + (result ? 1 : 0)} total={COMM_SITUATIONS.length} />

        <div style={{ marginTop: 22 }}>
          <Eyebrow>シチュエーション {idx + 1}</Eyebrow>
          <h2
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 18,
              lineHeight: 1.7,
              color: C.ink,
              margin: "6px 0 16px",
            }}
          >
            {situation.prompt}
          </h2>

          {!result ? (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={situation.placeholder}
                rows={6}
                style={{
                  width: "100%",
                  background: C.surface,
                  border: `1.5px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "13px 14px",
                  fontSize: 15,
                  fontFamily: sans,
                  lineHeight: 1.7,
                  color: C.ink,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <div style={{ fontFamily: sans, fontSize: 11, color: C.mutedLight, marginTop: 6 }}>
                実際に送る文面で書いてください(10文字以上)
              </div>
              {error && (
                <div style={{ fontFamily: sans, fontSize: 13, color: C.seal, marginTop: 10 }}>
                  {error}
                </div>
              )}
              <button
                onClick={submit}
                disabled={text.trim().length < 10 || loading}
                style={{
                  ...btnPrimary,
                  marginTop: 14,
                  opacity: text.trim().length < 10 || loading ? 0.4 : 1,
                }}
              >
                {loading ? "採点中…" : "採点する"}
              </button>
            </div>
          ) : (
            <div>
              {/* 採点結果 */}
              {result.overall !== null && (
                <div
                  style={{
                    background: C.surface,
                    border: `1.5px solid ${C.line}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    textAlign: "center",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>このシチュエーションの評価</div>
                  <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 500, color: C.indigo }}>
                    {result.overall}
                    <span style={{ fontFamily: sans, fontSize: 13, color: C.mutedLight }}> / 100</span>
                  </div>
                </div>
              )}
              {result.axes.map((a) => (
                <div key={a.key} style={{ marginBottom: 14 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>
                      {a.name}
                    </span>
                    {a.score !== null ? (
                      <span style={{ fontFamily: mono, fontSize: 12, color: C.indigo }}>{a.score} / 5</span>
                    ) : (
                      <span style={{ fontFamily: sans, fontSize: 11.5, color: C.muted }}>評価保留</span>
                    )}
                  </div>
                  {a.score !== null && a.bars_text && (
                    <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.7, marginTop: 3 }}>
                      基準: {a.bars_text}
                    </div>
                  )}
                  {a.evidence_quote && (
                    <div
                      style={{
                        fontFamily: serif,
                        fontSize: 12.5,
                        lineHeight: 1.8,
                        color: C.ink,
                        borderLeft: `2.5px solid ${C.seal}`,
                        paddingLeft: 10,
                        marginTop: 5,
                      }}
                    >
                      「{a.evidence_quote}」
                      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginLeft: 6 }}>
                        あなたの記述
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={next} style={{ ...btnPrimary, marginTop: 8 }}>
                {idx + 1 >= COMM_SITUATIONS.length ? "結果を確定する" : "次のシチュエーションへ"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
