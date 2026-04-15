"use client";

interface ClassWeights {
  delta: Record<string, number>;
  epoch: number;
  effectiveWeights: Record<string, number>;
}

interface OptHistoryEntry {
  date: string;
  weights: Record<string, number>;
  classWeights?: Record<string, Record<string, number>>;
  accuracy: number;
  accuracyBefore?: number;
  epoch: number;
  assetClass?: string;
}

interface OptimizationState {
  sourceWeights: Record<string, number>;
  classDeltas: Record<string, ClassWeights>;
  epoch: number;
  weightLR: number;
  history: OptHistoryEntry[];
}

interface DailyRecord {
  date: string;
  postmortem?: string;
  accuracy: number | null;
}

interface Props {
  optimization: OptimizationState | null;
  records: DailyRecord[];
}

const SRC_COLORS: Record<string, string> = {
  Polymarket: "#a855f7", "Market Data": "#3b82f6", "News Sentiment": "#f59e0b", "X / Twitter": "#06b6d4",
};
const SRC_SHORT: Record<string, string> = {
  Polymarket: "Poly", "Market Data": "Market", "News Sentiment": "News", "X / Twitter": "Twitter",
};

// --- Horizontal weight bars ---
function WeightBars({ weights, label }: { weights: Record<string, number>; label: string }) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <span className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</span>
      <div className="space-y-1 mt-1">
        {sorted.map(([source, weight]) => (
          <div key={source} className="flex items-center gap-1.5">
            <span className="text-[8px] text-zinc-500 w-10 text-right shrink-0">{SRC_SHORT[source] || source}</span>
            <div className="flex-1 h-2.5 bg-zinc-800/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, weight * 100)}%`, backgroundColor: SRC_COLORS[source] || "#71717a" }} />
            </div>
            <span className="text-[9px] font-mono text-zinc-400 w-9 text-right">{(weight * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Weight evolution chart (auto-scaled Y) ---
function WeightChart({ history, field }: { history: OptHistoryEntry[]; field: "weights" | "classWeights" }) {
  if (history.length < 2) return null;

  const getW = (entry: OptHistoryEntry, source: string) => {
    if (field === "classWeights") {
      return entry.classWeights?.["general"]?.[source] ?? entry.weights[source] ?? 0.25;
    }
    return entry.weights[source] ?? 0.25;
  };

  const sources = Object.keys(history[0].weights);
  const cw = 260, ch = 80, padL = 22, padR = 4, padY = 6;

  let minW = 1, maxW = 0;
  for (const e of history) for (const s of sources) { const w = getW(e, s); if (w < minW) minW = w; if (w > maxW) maxW = w; }
  const rPad = Math.max(0.04, (maxW - minW) * 0.25);
  const yMin = Math.max(0, minW - rPad), yMax = Math.min(1, maxW + rPad), yRange = yMax - yMin || 0.1;
  const toY = (w: number) => padY + ((yMax - w) / yRange) * (ch - padY * 2);
  const toX = (i: number) => padL + (i / (history.length - 1)) * (cw - padL - padR);

  return (
    <div>
      <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} className="w-full">
        <text x={1} y={toY(yMax)} fontSize="7" fill="#52525b" dominantBaseline="middle" fontFamily="monospace">{(yMax * 100).toFixed(0)}%</text>
        <text x={1} y={toY(yMin)} fontSize="7" fill="#52525b" dominantBaseline="middle" fontFamily="monospace">{(yMin * 100).toFixed(0)}%</text>
        <line x1={padL} y1={toY(0.25)} x2={cw - padR} y2={toY(0.25)} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 3" />

        {sources.map((source) => {
          const pts = history.map((e, i) => ({ x: toX(i), y: toY(getW(e, source)) }));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return <path key={source} d={d} fill="none" stroke={SRC_COLORS[source] || "#71717a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
        })}

        {/* End labels */}
        {sources.map((source) => {
          const lastW = getW(history[history.length - 1], source);
          return (
            <text key={source} x={cw - padR + 1} y={toY(lastW)} fontSize="6" fill={SRC_COLORS[source]} dominantBaseline="middle" fontFamily="monospace">
              {(lastW * 100).toFixed(0)}
            </text>
          );
        })}
      </svg>
      <div className="flex justify-between text-[7px] text-zinc-700 px-1 -mt-0.5">
        <span>{history[0].date.slice(5)}</span>
        <span>{history[history.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// --- Accuracy before vs after chart ---
function AccuracyChart({ history }: { history: OptHistoryEntry[] }) {
  if (history.length < 2) return null;

  const cw = 260, ch = 55, pad = 4;
  const toX = (i: number) => pad + (i / (history.length - 1)) * (cw - pad * 2);
  const toY = (acc: number) => pad + ((100 - acc) / 100) * (ch - pad * 2);

  const before = history.map((e, i) => ({ x: toX(i), y: toY(e.accuracyBefore ?? e.accuracy) }));
  const after = history.map((e, i) => ({ x: toX(i), y: toY(e.accuracy) }));
  const bLine = before.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const aLine = after.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  // Area between before and after to highlight improvement
  const area = `${aLine} L ${after[after.length - 1].x} ${before[before.length - 1].y} ${before.slice().reverse().map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;

  return (
    <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} className="w-full">
      <line x1={pad} y1={toY(50)} x2={cw - pad} y2={toY(50)} stroke="#27272a" strokeWidth="0.5" strokeDasharray="3 3" />
      <path d={area} fill="#22c55e" opacity="0.06" />
      <path d={bLine} fill="none" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" opacity="0.5" strokeDasharray="3 3" />
      <path d={aLine} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" />
      {/* Dots on after line */}
      {after.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={history[i].accuracy >= 50 ? "#22c55e" : "#ef4444"} stroke="#18181b" strokeWidth="1" />
      ))}
    </svg>
  );
}

// --- Delta visualization for a class ---
function DeltaBars({ classWeights, globalWeights }: { classWeights: ClassWeights; globalWeights: Record<string, number> }) {
  const sources = Object.keys(globalWeights);
  return (
    <div className="space-y-1">
      {sources.map((s) => {
        const gw = globalWeights[s] || 0.25;
        const ew = classWeights.effectiveWeights[s] || 0.25;
        const delta = ew - gw;
        const isUp = delta >= 0;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span className="text-[8px] text-zinc-500 w-10 text-right shrink-0">{SRC_SHORT[s]}</span>
            {/* Divergence bar centered at 0 */}
            <div className="flex-1 h-2 bg-zinc-800/30 rounded-full relative overflow-hidden">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-700" />
              <div
                className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
                style={{
                  left: isUp ? "50%" : `${50 + delta * 200}%`,
                  width: `${Math.abs(delta) * 200}%`,
                  backgroundColor: isUp ? "#22c55e" : "#ef4444",
                  opacity: 0.7,
                }}
              />
            </div>
            <span className={`text-[8px] font-mono w-10 text-right ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{(delta * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Legend ---
function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {Object.entries(SRC_COLORS).map(([s, c]) => (
        <div key={s} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: c }} />
          <span className="text-[7px] text-zinc-600">{SRC_SHORT[s]}</span>
        </div>
      ))}
    </div>
  );
}

export default function OptimizationPanel({ optimization, records }: Props) {
  if (!optimization || optimization.epoch === 0) return null;

  const lastPostmortem = records.find((r) => r.postmortem);
  const generalClass = optimization.classDeltas?.["general"];
  const hasClassWeights = generalClass && Object.keys(generalClass.effectiveWeights).length > 0;
  const h = optimization.history;

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧬</span>
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Self-Improving</span>
          <span className="text-[9px] font-mono text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">epoch {optimization.epoch}</span>
        </div>
        <span className="text-[9px] font-mono text-zinc-700">η = {optimization.weightLR.toFixed(4)}</span>
      </div>

      {/* Global weights */}
      <div className="mb-3">
        <WeightBars weights={optimization.sourceWeights} label="Global Weights" />
      </div>

      {/* Per-class weights + deltas */}
      {(() => {
        const activeClasses = Object.entries(optimization.classDeltas || {})
          .filter(([, cw]) => cw.epoch > 0 && Object.keys(cw.effectiveWeights).length > 0)
          .sort((a, b) => b[1].epoch - a[1].epoch);
        if (activeClasses.length === 0) return null;
        return (
          <div className="mb-3 space-y-3">
            {activeClasses.map(([cls, cw]) => (
              <div key={cls} className="bg-zinc-900/30 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">{cls}</span>
                  <span className="text-[8px] text-zinc-600 font-mono">{cw.epoch} epochs</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <WeightBars weights={cw.effectiveWeights} label="" />
                  </div>
                  <div className="w-24 shrink-0">
                    <span className="text-[7px] text-zinc-600 uppercase">Delta</span>
                    <div className="space-y-0.5 mt-0.5">
                      {Object.keys(optimization.sourceWeights).map((s) => {
                        const delta = (cw.effectiveWeights[s] || 0.25) - (optimization.sourceWeights[s] || 0.25);
                        const isUp = delta >= 0;
                        return (
                          <div key={s} className="flex items-center gap-1">
                            <span className={`text-[7px] font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                              {isUp ? "+" : ""}{(delta * 100).toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <Legend />

      {/* Weight evolution charts */}
      {h.length >= 2 && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Global Weight Evolution</span>
              <span className="text-[8px] text-zinc-700">{h.length} epochs</span>
            </div>
            <WeightChart history={h} field="weights" />
          </div>

          {h.some((e) => e.classWeights) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">General Class Weight Evolution</span>
              </div>
              <WeightChart history={h} field="classWeights" />
            </div>
          )}
        </div>
      )}

      {/* Accuracy: before vs after optimization */}
      {h.length >= 2 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Accuracy: Before vs Optimized</span>
          </div>
          <AccuracyChart history={h} />
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded bg-emerald-500" />
              <span className="text-[7px] text-zinc-600">Optimized</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded bg-red-500 opacity-50" />
              <span className="text-[7px] text-zinc-600">Before</span>
            </div>
          </div>
        </div>
      )}

      {/* Convergence */}
      <div className="mt-4 bg-zinc-900/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex justify-between text-[8px] text-zinc-600 mb-0.5">
              <span>Learning Rate Decay (η → 0)</span>
              <span className="font-mono">{optimization.weightLR.toFixed(4)} / 0.3</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${Math.max(3, (1 - optimization.weightLR / 0.3) * 100)}%` }} />
            </div>
          </div>
          <div className="text-center shrink-0 ml-3">
            <span className="text-[10px] font-mono text-zinc-400">Day {optimization.epoch}</span>
          </div>
        </div>
      </div>

      {/* Latest postmortem */}
      {lastPostmortem?.postmortem && (
        <div className="mt-3 pt-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Latest Insight</span>
            <span className="text-[8px] text-zinc-700">{lastPostmortem.date}</span>
          </div>
          <p className="text-[10px] text-zinc-400 leading-relaxed">{lastPostmortem.postmortem}</p>
        </div>
      )}
    </div>
  );
}
