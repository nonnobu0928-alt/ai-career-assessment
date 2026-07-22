"use client";

import { normalizeForMatch } from "@/lib/grounding";
import {
  btnGhostStyle,
  btnPrimaryStyle,
  C,
  chipStyle,
  mono,
  sans,
  serif,
} from "@/lib/theme";
import type {
  ChatMessage,
  Confidence,
  EpisodeV2,
  ProfileV2,
} from "@/lib/types";
import { Eyebrow, SectionLabel, Seal } from "./ui";

// ============================================================
// 一気 IKKI — キャリアカード表示 (パッケージC: 客観化)
//
// セクション構成(本人ビュー・企業ビュー共通):
// 1. 基本情報(事実のみ・形容詞なし) 2. 定量実績(出典つき)
// 3. コンピテンシー評価(点数+BARS+根拠+確信度) 4. エピソード(STAR完全のみ)
// 5. AI所見(推定ラベル明示) 6. 情報充足度メーター
//
// 根拠ドリルダウン: カード上の記述をタップすると、根拠となった本人の
// 発言原文(前後1往復の文脈つき)がモーダルで表示される。
// 「要約」と「原文」の両方を企業に渡す、この製品の核となる機能。
// 企業ビューの引用は本人の開示同意(log_disclosure_consent)がある場合のみ。
// ============================================================

const CONFIDENCE_JA: Record<Confidence, string> = {
  high: "高",
  med: "中",
  low: "低",
};

const EPISODE_SLOTS = [
  ["situation", "状況"],
  ["challenge", "課題"],
  ["action", "行動"],
  ["result_quant", "結果"],
  ["reproducibility", "再現性"],
] as const;

export function isEpisodeComplete(ep: EpisodeV2): boolean {
  return EPISODE_SLOTS.every(([key]) => ep[key] !== null);
}

export type DrillTarget = { quote: string; label: string };

// ---------- 充足度 ----------

export interface CoverageRow {
  label: string;
  pct: number;
}

export function computeCoverage(p: ProfileV2): CoverageRow[] {
  const slotsFilled = p.episodes.reduce(
    (n, ep) => n + EPISODE_SLOTS.filter(([key]) => ep[key] !== null).length,
    0,
  );
  const episodePct =
    p.episodes.length > 0
      ? Math.round((slotsFilled / (p.episodes.length * EPISODE_SLOTS.length)) * 100)
      : 0;
  const comps = p.competencies ?? [];
  const compPct =
    comps.length > 0
      ? Math.round((comps.filter((c) => c.score !== null).length / comps.length) * 100)
      : 0;
  const insightPct = Math.round(
    ([p.catchcopy, p.summary, p.highlight].filter(Boolean).length / 3) * 100,
  );
  return [
    { label: "基本情報", pct: 100 },
    { label: "定量実績", pct: Math.min(100, Math.round((p.quant_facts.length / 3) * 100)) },
    { label: "コンピテンシー", pct: compPct },
    { label: "エピソード", pct: episodePct },
    { label: "AI所見", pct: insightPct },
  ];
}

// ---------- 3層構造の表示部品 ----------

export function AiLabel({
  confidence,
  light = false,
}: {
  confidence?: Confidence | null;
  light?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: 9.5,
        letterSpacing: "0.08em",
        color: light ? C.mutedLight : C.muted,
        border: `1px solid ${light ? C.navyLine : C.line}`,
        borderRadius: 999,
        padding: "2px 8px",
        verticalAlign: "middle",
        whiteSpace: "nowrap",
      }}
    >
      AIによる推定{confidence ? ` ・ 確信度 ${CONFIDENCE_JA[confidence]}` : ""}
    </span>
  );
}

// 層1: 発言事実(逐語引用)。タップで原文ドリルダウン
export function QuoteBlock({
  quote,
  label = "強みの根拠",
  light = false,
  onDrill,
}: {
  quote: string;
  label?: string;
  light?: boolean;
  onDrill?: (t: DrillTarget) => void;
}) {
  const clickable = Boolean(onDrill);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => onDrill?.({ quote, label })}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onDrill?.({ quote, label });
        }
      }}
      style={{
        fontFamily: serif,
        fontSize: 13,
        lineHeight: 1.85,
        color: light ? "#EDF2F8" : C.ink,
        borderLeft: `2.5px solid ${C.seal}`,
        paddingLeft: 10,
        marginTop: 6,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      「{quote}」
      <span
        style={{
          fontFamily: mono,
          fontSize: 9.5,
          color: light ? C.mutedLight : C.muted,
          marginLeft: 6,
          whiteSpace: "nowrap",
        }}
      >
        本人の発言{clickable ? " ・ タップで原文" : ""}
      </span>
    </div>
  );
}

export function InsufficientNote({
  text = "面談で十分に聴取できませんでした",
  light = false,
}: {
  text?: string;
  light?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: sans,
        fontSize: 12.5,
        color: light ? C.mutedLight : C.muted,
        background: light ? "rgba(255,255,255,0.04)" : C.paper,
        border: `1px dashed ${light ? C.navyLine : C.line}`,
        borderRadius: 8,
        padding: "10px 12px",
        lineHeight: 1.7,
      }}
    >
      {text}
    </div>
  );
}

// 企業ビュー: 本人が開示に同意していない場合の表示
function NonDisclosureNote() {
  return (
    <div
      style={{
        fontFamily: sans,
        fontSize: 12.5,
        color: C.mutedLight,
        background: "rgba(255,255,255,0.04)",
        border: `1px dashed ${C.navyLine}`,
        borderRadius: 8,
        padding: "10px 12px",
        lineHeight: 1.7,
      }}
    >
      本人の同意により非開示
    </div>
  );
}

function SampleBadge() {
  return (
    <span
      style={{
        fontFamily: sans,
        fontSize: 11,
        fontWeight: 700,
        color: C.seal,
        border: `1.5px solid ${C.seal}`,
        borderRadius: 999,
        padding: "3px 10px",
        marginBottom: 8,
      }}
    >
      サンプル
    </span>
  );
}

function CoverageMeter({ p, light = false }: { p: ProfileV2; light?: boolean }) {
  const rows = computeCoverage(p);
  const comp = p.quality?.completeness;
  const flags: { label: string; on: boolean }[] = comp
    ? [
        { label: "面接受験済", on: comp.interview_taken },
        { label: "書類提出済", on: comp.resume_confirmed },
        { label: "コミュ試験済", on: comp.comm_test_taken },
        { label: "音声面接済", on: comp.voice_taken },
      ]
    : [];
  return (
    <div>
      {/* 一次代替充足度 (F2-4) */}
      {comp && (
        <div style={{ marginBottom: 14 }}>
          <div className="flex items-baseline" style={{ gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: light ? "#FFFFFF" : C.ink }}>
              {comp.substitutability}
            </span>
            <span style={{ fontFamily: sans, fontSize: 11.5, color: light ? C.mutedLight : C.muted }}>
              / 100 ・ 一次代替充足度
            </span>
          </div>
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
            {flags.map((f) => (
              <span
                key={f.label}
                style={{
                  fontFamily: sans,
                  fontSize: 11,
                  color: f.on ? (light ? "#DDE6F2" : C.indigo) : light ? C.navyLine : C.mutedLight,
                  border: `1px solid ${f.on ? (light ? "#5B84B8" : C.indigo) : light ? C.navyLine : C.line}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  opacity: f.on ? 1 : 0.6,
                }}
              >
                {f.on ? "✓ " : ""}
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {p.quality && (
        <div className="flex items-baseline" style={{ gap: 8, marginBottom: 12 }}>
          <span
            style={{
              fontFamily: mono,
              fontSize: 20,
              fontWeight: 500,
              color: light ? "#FFFFFF" : C.ink,
            }}
          >
            {p.quality.total}
          </span>
          <span style={{ fontFamily: sans, fontSize: 11.5, color: light ? C.mutedLight : C.muted }}>
            / 100 ・ 面接の質(引用照合パス率 {Math.round(p.quality.quote_pass_rate * 100)}%)
          </span>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
          <span
            style={{
              fontFamily: sans,
              fontSize: 11.5,
              color: light ? "#DDE6F2" : C.muted,
              width: 96,
              flexShrink: 0,
            }}
          >
            {r.label}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: light ? "rgba(255,255,255,0.08)" : C.paper,
              border: light ? "none" : `1px solid ${C.line}`,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: light ? 0 : -1,
                bottom: light ? 0 : -1,
                width: `${r.pct}%`,
                borderRadius: 3,
                background: r.pct >= 60 ? (light ? "#5B84B8" : C.indigo) : C.seal,
                opacity: r.pct === 0 ? 0 : 1,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: mono,
              fontSize: 10.5,
              color: light ? C.mutedLight : C.muted,
              width: 36,
              textAlign: "right",
            }}
          >
            {r.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

// コンピテンシー評価セクション(点数 + BARS基準文 + 根拠引用 + 確信度)
function CompetencySection({
  p,
  light = false,
  onDrill,
}: {
  p: ProfileV2;
  light?: boolean;
  onDrill?: (t: DrillTarget) => void;
}) {
  const comps = p.competencies ?? [];
  if (comps.length === 0) {
    return (
      <InsufficientNote
        light={light}
        text="コンピテンシー評価は根拠が揃った面談でのみ生成されます"
      />
    );
  }
  return (
    <div>
      {comps.map((c) => (
        <div key={c.key} style={{ marginBottom: 14 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <span
              style={{
                fontFamily: sans,
                fontWeight: 700,
                fontSize: 13,
                color: light ? "#FFFFFF" : C.ink,
                width: 84,
                flexShrink: 0,
              }}
            >
              {c.name}
            </span>
            {c.score !== null ? (
              <>
                <div className="flex" style={{ gap: 4, flex: 1 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      style={{
                        height: 8,
                        flex: 1,
                        borderRadius: 2,
                        background:
                          n <= (c.score ?? 0)
                            ? light
                              ? "#5B84B8"
                              : C.indigo
                            : light
                              ? "rgba(255,255,255,0.08)"
                              : C.paper,
                        border: light || n <= (c.score ?? 0) ? "none" : `1px solid ${C.line}`,
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    color: light ? C.mutedLight : C.muted,
                    width: 24,
                    textAlign: "right",
                  }}
                >
                  {c.score}
                </span>
              </>
            ) : (
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 11.5,
                  color: light ? C.mutedLight : C.muted,
                }}
              >
                評価保留(根拠不足)
              </span>
            )}
          </div>
          {c.score !== null && c.bars_text && (
            <div
              style={{
                fontFamily: sans,
                fontSize: 12,
                color: light ? "#DDE6F2" : C.ink,
                lineHeight: 1.7,
                marginTop: 4,
              }}
            >
              基準: {c.bars_text}
              <span style={{ marginLeft: 6 }}>
                <AiLabel light={light} confidence={c.confidence} />
              </span>
            </div>
          )}
          {c.score !== null && c.evidence_quote && (
            <QuoteBlock
              light={light}
              quote={c.evidence_quote}
              label={`コンピテンシー: ${c.name}`}
              onDrill={onDrill}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// エピソード(STAR完全形のみ掲載)
function EpisodeSection({
  p,
  light = false,
  onDrill,
  quotesVisible = true,
}: {
  p: ProfileV2;
  light?: boolean;
  onDrill?: (t: DrillTarget) => void;
  quotesVisible?: boolean;
}) {
  const complete = p.episodes.filter(isEpisodeComplete);
  const incomplete = p.episodes.length - complete.length;
  if (p.episodes.length === 0) return <InsufficientNote light={light} />;
  return (
    <div>
      {complete.map((ep, ei) => (
        <div key={ei} style={{ marginBottom: 12 }}>
          {EPISODE_SLOTS.map(([key, label]) => (
            <div
              key={key}
              style={{
                borderLeft: `2.5px solid ${light ? "#5B84B8" : C.indigo}`,
                paddingLeft: 12,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: light ? "#5B84B8" : C.indigo,
                }}
              >
                {label}
              </span>
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  color: light ? "#EDF2F8" : C.ink,
                  lineHeight: 1.7,
                  marginTop: 2,
                }}
              >
                {ep[key]}
              </div>
            </div>
          ))}
          {ep.evidence_quote &&
            (quotesVisible ? (
              <QuoteBlock
                light={light}
                quote={ep.evidence_quote}
                label="エピソードの根拠"
                onDrill={onDrill}
              />
            ) : (
              <NonDisclosureNote />
            ))}
        </div>
      ))}
      {complete.length === 0 && (
        <InsufficientNote
          light={light}
          text="STARの必須スロットが揃ったエピソードがまだありません(不完全なエピソードは掲載されません)"
        />
      )}
      {complete.length > 0 && incomplete > 0 && (
        <div
          style={{
            fontFamily: sans,
            fontSize: 11,
            color: light ? C.mutedLight : C.muted,
            marginTop: 4,
          }}
        >
          ほか{incomplete}件はスロット不足のため非掲載
        </div>
      )}
    </div>
  );
}

// 定量実績(出典発言つき)
function QuantSection({
  p,
  light = false,
  onDrill,
  quotesVisible = true,
}: {
  p: ProfileV2;
  light?: boolean;
  onDrill?: (t: DrillTarget) => void;
  quotesVisible?: boolean;
}) {
  if (p.quant_facts.length === 0) return <InsufficientNote light={light} />;
  return (
    <div>
      {p.quant_facts.map((f, i) => (
        <div
          key={i}
          role={onDrill && quotesVisible ? "button" : undefined}
          tabIndex={onDrill && quotesVisible ? 0 : undefined}
          onClick={() => quotesVisible && onDrill?.({ quote: f.evidence_quote, label: f.label })}
          onKeyDown={(e) => {
            if (onDrill && quotesVisible && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onDrill({ quote: f.evidence_quote, label: f.label });
            }
          }}
          style={{
            borderLeft: `2.5px solid ${light ? "#5B84B8" : C.indigo}`,
            paddingLeft: 12,
            marginBottom: 12,
            cursor: onDrill && quotesVisible ? "pointer" : "default",
          }}
        >
          <div className="flex items-baseline" style={{ gap: 8 }}>
            <span style={{ fontFamily: sans, fontSize: 12, color: light ? "#DDE6F2" : C.muted }}>
              {f.label}
            </span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 15,
                fontWeight: 500,
                color: light ? "#FFFFFF" : C.ink,
              }}
            >
              {f.value}
            </span>
          </div>
          {quotesVisible ? (
            <div
              style={{
                fontFamily: serif,
                fontSize: 11.5,
                color: light ? C.mutedLight : C.muted,
                lineHeight: 1.7,
                marginTop: 2,
              }}
            >
              出典:「{f.evidence_quote}」
              {onDrill && (
                <span style={{ fontFamily: mono, fontSize: 9.5, marginLeft: 6 }}>
                  タップで原文
                </span>
              )}
            </div>
          ) : (
            <div
              style={{
                fontFamily: sans,
                fontSize: 11,
                color: C.mutedLight,
                marginTop: 2,
              }}
            >
              出典: 本人の同意により非開示
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 本人ビュー ----------

export function MeCardView({
  p,
  onDrill,
  onCompany,
  onRedo,
  onReset,
  onCloseDemo,
  discoverable,
  onToggleDiscoverable,
}: {
  p: ProfileV2;
  onDrill: (t: DrillTarget) => void;
  onCompany: () => void;
  onRedo: () => void;
  onReset: () => void;
  onCloseDemo: () => void;
  discoverable?: boolean;
  onToggleDiscoverable?: (v: boolean) => void;
}) {
  const axisMin = 300;
  const axisMax = 1200;
  const leftPct = p.salary
    ? Math.max(0, ((p.salary.min - axisMin) / (axisMax - axisMin)) * 100)
    : 0;
  const widthPct = p.salary
    ? Math.min(100 - leftPct, ((p.salary.max - p.salary.min) / (axisMax - axisMin)) * 100)
    : 0;

  return (
    <div style={{ padding: "22px 20px 8px" }}>
      <div className="flex items-center justify-between">
        <Eyebrow>CAREER CARD{p.is_demo ? " — SAMPLE" : " — No.0001"}</Eyebrow>
        {p.is_demo && <SampleBadge />}
      </div>
      <div
        style={{
          position: "relative",
          background: C.surface,
          border: `1.5px solid ${C.line}`,
          borderRadius: 14,
          padding: "24px 20px 22px",
        }}
      >
        <div style={{ position: "absolute", top: 18, right: 18 }}>
          <Seal text="面談済" size={62} animate />
        </div>

        {/* 1. 基本情報 — 事実のみ。形容詞・キャッチコピーは使わない */}
        <div style={{ paddingRight: 76 }}>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 21,
              lineHeight: 1.5,
              color: C.ink,
            }}
          >
            {p.name} 様
          </div>
          <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 8 }}>
            {p.role} ・ 経験{p.years}
          </div>
        </div>

        <SectionLabel>定量実績 — FACTS(発言から抽出)</SectionLabel>
        <QuantSection p={p} onDrill={onDrill} />

        <SectionLabel>コンピテンシー評価 — COMPETENCIES</SectionLabel>
        <CompetencySection p={p} onDrill={onDrill} />

        <SectionLabel>強み — STRENGTHS(根拠つき)</SectionLabel>
        {p.strengths.length > 0 ? (
          p.strengths.map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: C.indigo,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13.5, color: C.ink }}>
                  {s.title}
                </span>
                <AiLabel confidence={s.confidence} />
              </div>
              <QuoteBlock quote={s.evidence_quote} label={`強み: ${s.title}`} onDrill={onDrill} />
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 12.5,
                  color: C.muted,
                  lineHeight: 1.7,
                  marginTop: 4,
                }}
              >
                {s.interpretation}
              </div>
            </div>
          ))
        ) : (
          <InsufficientNote />
        )}

        <SectionLabel>エピソード — EPISODE(STAR完全形のみ)</SectionLabel>
        <EpisodeSection p={p} onDrill={onDrill} />

        {/* 5. AI所見 — 推定ラベルを明示した上での総合コメント */}
        <SectionLabel>AI所見 — OBSERVATIONS</SectionLabel>
        <div style={{ marginBottom: 8 }}>
          <AiLabel />
        </div>
        {p.catchcopy && (
          <div
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 17,
              lineHeight: 1.6,
              color: C.ink,
              marginBottom: 6,
            }}
          >
            {p.catchcopy.text}
            <span style={{ marginLeft: 8 }}>
              <AiLabel confidence={p.catchcopy.confidence} />
            </span>
          </div>
        )}
        {p.summary ? (
          <p
            style={{
              fontFamily: sans,
              fontSize: 13.5,
              lineHeight: 1.9,
              color: C.ink,
              margin: "0 0 10px",
            }}
          >
            {p.summary.text}
          </p>
        ) : (
          !p.catchcopy && <InsufficientNote />
        )}
        {p.highlight && (
          <QuoteBlock
            quote={p.highlight.evidence_quote}
            label="面談ハイライト"
            onDrill={onDrill}
          />
        )}
        {(p.values.length > 0 || p.match_roles.length > 0) && (
          <div style={{ marginTop: 10 }}>
            {p.values.map((v, i) => (
              <span key={"v" + i} style={{ ...chipStyle, borderColor: C.indigo, color: C.indigo }}>
                {v}
              </span>
            ))}
            {p.match_roles.map((r, i) => (
              <span key={"r" + i} style={chipStyle}>
                {r}
              </span>
            ))}
          </div>
        )}

        <SectionLabel>想定年収 — MARKET VALUE(参考)</SectionLabel>
        {p.salary ? (
          <div>
            <div className="flex items-center" style={{ gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, color: C.ink }}>
                {p.salary.min}
                <span style={{ fontSize: 15, color: C.muted }}> – </span>
                {p.salary.max}
                <span style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginLeft: 6 }}>
                  万円
                </span>
              </div>
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
                参考
              </span>
            </div>
            <div
              style={{
                position: "relative",
                height: 6,
                borderRadius: 3,
                background: C.paper,
                border: `1px solid ${C.line}`,
                marginTop: 10,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: -1,
                  bottom: -1,
                  borderRadius: 3,
                  background: C.indigo,
                }}
              />
            </div>
            <div
              className="flex justify-between"
              style={{ fontFamily: mono, fontSize: 10, color: C.mutedLight, marginTop: 5 }}
            >
              <span>300</span>
              <span>750</span>
              <span>1200</span>
            </div>
            <div
              style={{
                fontFamily: sans,
                fontSize: 11,
                color: C.muted,
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              {p.salary.basis}
            </div>
          </div>
        ) : (
          <InsufficientNote />
        )}

        <SectionLabel>情報充足度 — COVERAGE</SectionLabel>
        <CoverageMeter p={p} />
        <div
          style={{
            fontFamily: sans,
            fontSize: 11,
            color: C.muted,
            lineHeight: 1.7,
            marginTop: 6,
          }}
        >
          充足度が低い項目は、もう一度面談すると充実します。
        </div>
      </div>

      {/* 企業への公開同意(F3-1b)。同意したカードだけが企業プールに載る */}
      {!p.is_demo && onToggleDiscoverable && (
        <button
          onClick={() => onToggleDiscoverable(!discoverable)}
          className="flex items-center"
          style={{
            gap: 10,
            width: "100%",
            background: C.surface,
            border: `1.5px solid ${discoverable ? C.indigo : C.line}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginTop: 16,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 34, height: 20, borderRadius: 999, background: discoverable ? C.indigo : C.line,
              position: "relative", flexShrink: 0, transition: "background 0.2s",
            }}
          >
            <span style={{ position: "absolute", top: 2, left: discoverable ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </span>
          <span style={{ fontFamily: sans, fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>
            このカードを企業に公開する
            <span style={{ display: "block", fontSize: 10.5, color: C.muted }}>
              匿名要約のみ。氏名・発言ログは同意なしに出ません
            </span>
          </span>
        </button>
      )}

      <div style={{ marginTop: 16 }}>
        <button onClick={onCompany} style={btnPrimaryStyle}>
          企業からの見え方を見る
        </button>
        {p.is_demo ? (
          <button onClick={onCloseDemo} style={{ ...btnGhostStyle, marginTop: 10 }}>
            デモを閉じる
          </button>
        ) : (
          <>
            <button onClick={onRedo} style={{ ...btnGhostStyle, marginTop: 10 }}>
              もう一度面談する
            </button>
            <button
              onClick={onReset}
              style={{
                background: "none",
                border: "none",
                color: C.muted,
                fontFamily: sans,
                fontSize: 12,
                cursor: "pointer",
                width: "100%",
                padding: "14px 0 4px",
                textDecoration: "underline",
              }}
            >
              カードを削除してはじめから
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 企業ビュー ----------

export function CompanyCardView({
  p,
  consent,
  offerSent,
  onOffer,
  onBack,
  onDrill,
}: {
  p: ProfileV2;
  consent: boolean; // 面談ログの開示同意
  offerSent: boolean;
  onOffer: () => void;
  onBack: () => void;
  onDrill: (t: DrillTarget) => void;
}) {
  const initial = (p.name || "K").slice(0, 1);
  const quotesVisible = consent || Boolean(p.is_demo);
  const drill = quotesVisible ? onDrill : undefined;
  return (
    <div style={{ background: C.navyBg, padding: "22px 20px 28px", minHeight: 400 }}>
      <div className="flex items-center justify-between">
        <Eyebrow light>RECRUITER VIEW — 採用担当者の画面(デモ)</Eyebrow>
        {p.is_demo && <SampleBadge />}
      </div>
      <p
        style={{
          fontFamily: sans,
          fontSize: 12.5,
          color: C.mutedLight,
          lineHeight: 1.8,
          margin: "0 0 16px",
        }}
      >
        企業側には、あなたのカードがこう届きます。全記述はタップで本人の発言原文まで遡れます。一次面接の「代替」ではなく「上位互換」です。
      </p>

      <div
        style={{
          position: "relative",
          background: C.navySurface,
          border: `1.5px solid ${C.navyLine}`,
          borderRadius: 14,
          padding: "22px 20px",
        }}
      >
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <Seal text="一次済" size={56} />
        </div>

        {/* 1. 基本情報(匿名・事実のみ) */}
        <div style={{ paddingRight: 70 }}>
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 34, fontWeight: 500, color: "#FFFFFF" }}>
              {p.match_score ?? "—"}
            </span>
            <span style={{ fontFamily: sans, fontSize: 11.5, color: C.mutedLight }}>
              マッチ度 / 100{p.match_score === null ? "(情報不足)" : ""}
            </span>
          </div>
          <div
            style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: "#FFFFFF", marginTop: 10 }}
          >
            {initial} さん(匿名)
          </div>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.mutedLight, marginTop: 3 }}>
            {p.role} ・ 経験{p.years} ・ 氏名はマッチ成立後に開示
          </div>
        </div>

        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 14 }}>
          {[
            "AI面談 完了",
            "根拠引用 照合済",
            quotesVisible ? "回答ログ 開示同意済" : "回答ログ 非開示",
          ].map((b) => (
            <span
              key={b}
              style={{
                fontFamily: sans,
                fontSize: 11,
                color: C.mutedLight,
                border: `1px solid ${C.navyLine}`,
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              {b}
            </span>
          ))}
        </div>

        <SectionLabel light>定量実績(発言から抽出)</SectionLabel>
        <QuantSection p={p} light onDrill={drill} quotesVisible={quotesVisible} />

        <SectionLabel light>コンピテンシー評価</SectionLabel>
        <CompetencySection p={p} light onDrill={drill} />

        <SectionLabel light>強み(根拠つき)</SectionLabel>
        {p.strengths.length > 0 ? (
          p.strengths.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: "#FFFFFF" }}>
                  {s.title}
                </span>
                <AiLabel light confidence={s.confidence} />
              </div>
              {quotesVisible ? (
                <QuoteBlock light quote={s.evidence_quote} label={`強み: ${s.title}`} onDrill={drill} />
              ) : (
                <NonDisclosureNote />
              )}
            </div>
          ))
        ) : (
          <InsufficientNote light />
        )}

        <SectionLabel light>エピソード(STAR完全形のみ)</SectionLabel>
        <EpisodeSection p={p} light onDrill={drill} quotesVisible={quotesVisible} />

        <SectionLabel light>面談ハイライト</SectionLabel>
        {p.highlight ? (
          quotesVisible ? (
            <div>
              <QuoteBlock
                light
                quote={p.highlight.evidence_quote}
                label="面談ハイライト"
                onDrill={drill}
              />
              <div className="flex items-center" style={{ gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: sans, fontSize: 12, color: C.mutedLight, lineHeight: 1.7 }}>
                  {p.highlight.interpretation}
                </span>
                <AiLabel light confidence={p.highlight.confidence} />
              </div>
            </div>
          ) : (
            <NonDisclosureNote />
          )
        ) : (
          <InsufficientNote light />
        )}

        <SectionLabel light>希望条件</SectionLabel>
        {p.salary ? (
          <div>
            <div style={{ fontFamily: mono, fontSize: 20, color: "#FFFFFF" }}>
              {p.salary.min} – {p.salary.max}
              <span style={{ fontFamily: sans, fontSize: 12, color: C.mutedLight, marginLeft: 6 }}>
                万円(参考)
              </span>
            </div>
            <div
              style={{
                fontFamily: sans,
                fontSize: 11,
                color: C.mutedLight,
                lineHeight: 1.6,
                marginTop: 4,
              }}
            >
              {p.salary.basis}
            </div>
          </div>
        ) : (
          <InsufficientNote light />
        )}

        <SectionLabel light>情報充足度</SectionLabel>
        <CoverageMeter p={p} light />

        <div style={{ marginTop: 22 }}>
          {offerSent ? (
            <div
              style={{
                border: `1.5px solid #5B84B8`,
                color: "#DDE6F2",
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 14,
                borderRadius: 10,
                padding: "14px 20px",
                textAlign: "center",
              }}
            >
              最終面接のオファーを送信しました(デモ)
            </div>
          ) : (
            <button
              onClick={onOffer}
              style={{
                ...btnPrimaryStyle,
                background: "#FFFFFF",
                color: C.navyBg,
              }}
            >
              最終面接をオファーする
            </button>
          )}
          <div
            style={{
              fontFamily: sans,
              fontSize: 11.5,
              color: C.mutedLight,
              textAlign: "center",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            発言原文は、候補者の同意範囲でのみ閲覧できます
          </div>
        </div>
      </div>

      <button
        onClick={onBack}
        style={{
          background: "none",
          border: `1.5px solid ${C.navyLine}`,
          color: "#DDE6F2",
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 14,
          borderRadius: 10,
          padding: "13px 20px",
          width: "100%",
          marginTop: 16,
          cursor: "pointer",
        }}
      >
        自分のカードに戻る
      </button>
    </div>
  );
}

// ---------- 根拠ドリルダウンモーダル ----------

// 引用に対応する本人の発言を会話ログから探し、前後1往復の文脈つきで返す
function findContext(
  quote: string,
  transcript: ChatMessage[],
): { before: string | null; utterance: string; after: string | null } | null {
  const q = normalizeForMatch(quote);
  for (let i = 0; i < transcript.length; i++) {
    const m = transcript[i];
    if (m.role !== "user") continue;
    if (normalizeForMatch(m.content).includes(q)) {
      const before = i > 0 && transcript[i - 1].role === "assistant" ? transcript[i - 1].content : null;
      const after =
        i + 1 < transcript.length && transcript[i + 1].role === "assistant"
          ? transcript[i + 1].content
          : null;
      return { before, utterance: m.content, after };
    }
  }
  return null;
}

export function DrilldownModal({
  target,
  transcript,
  onClose,
}: {
  target: DrillTarget;
  transcript: ChatMessage[];
  onClose: () => void;
}) {
  const ctx = findContext(target.quote, transcript);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,30,51,0.6)",
        zIndex: 60,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: "16px 16px 0 0",
          padding: "22px 22px 26px",
          width: "100%",
          maxWidth: 480,
          maxHeight: "78dvh",
          overflowY: "auto",
          animation: "fadeUp 0.3s ease both",
        }}
      >
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.muted }}>
            EVIDENCE — 発言原文
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            fontFamily: serif,
            fontWeight: 700,
            fontSize: 16,
            color: C.ink,
            marginTop: 8,
          }}
        >
          {target.label}
        </div>

        {ctx ? (
          <div style={{ marginTop: 14 }}>
            {ctx.before && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 9.5,
                    letterSpacing: "0.14em",
                    color: C.indigo,
                    marginBottom: 4,
                  }}
                >
                  一気 — AGENT
                </div>
                <div
                  style={{
                    fontFamily: sans,
                    fontSize: 12.5,
                    lineHeight: 1.8,
                    color: C.muted,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ctx.before}
                </div>
              </div>
            )}
            <div
              style={{
                background: C.paper,
                border: `1.5px solid ${C.seal}`,
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 9.5,
                  letterSpacing: "0.14em",
                  color: C.seal,
                  marginBottom: 4,
                }}
              >
                本人の発言(原文)
              </div>
              <div
                style={{
                  fontFamily: serif,
                  fontSize: 14,
                  lineHeight: 1.9,
                  color: C.ink,
                  whiteSpace: "pre-wrap",
                }}
              >
                {ctx.utterance}
              </div>
            </div>
            {ctx.after && (
              <div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 9.5,
                    letterSpacing: "0.14em",
                    color: C.indigo,
                    marginBottom: 4,
                  }}
                >
                  一気 — AGENT
                </div>
                <div
                  style={{
                    fontFamily: sans,
                    fontSize: 12.5,
                    lineHeight: 1.8,
                    color: C.muted,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ctx.after}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <InsufficientNote text="発言原文を表示できません(ログが端末にありません)" />
            <div
              style={{
                fontFamily: serif,
                fontSize: 13.5,
                lineHeight: 1.85,
                color: C.ink,
                marginTop: 10,
              }}
            >
              引用: 「{target.quote}」
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
