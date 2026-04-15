"use client";

interface OptimizationState {
  sourceWeights: Record<string, number>;
  confidenceThreshold: number;
  epoch: number;
  weightLR: number;
  thresholdLR: number;
  history: {
    date: string;
    weights: Record<string, number>;
    threshold: number;
    accuracy: number;
    accuracyBefore?: number;
    epoch: number;
  }[];
}

interface DailyRecord {
  date: string;
  postmortem?: string;
  accuracy: number | null;
}

interface OptimizationPanelProps {
  optimization: OptimizationState | null;
  records: DailyRecord[];
}

const SOURCE_COLORS: Record<string, string> = {
  Polymarket: "#a855f7",
  "Market Data": "#3b82f6",
  "News Sentiment": "#f59e0b",
  "X / Twitter": "#06b6d4",
};

const SOURCE_SHORT: Record<string, string> = {
  Polymarket: "Poly",
  "Market Data": "Market",
  "News Sentiment": "News",
  "X / Twitter": "Twitter",
};

// --- Weight Bar Chart ---
function WeightBars({ weights }: { weights: Record<string, number> }) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-1.5">
      {sorted.map(([source, weight]) => (
        <div key={source} className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500 w-12 text-right shrink-0">
            {SOURCE_SHORT[source] || source}
          </span>
          <div className="flex-1 h-3 bg-zinc-800/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(2, weight * 100)}%`,
                backgroundColor: SOURCE_COLORS[source] || "#71717a",
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
            {(weight * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Weight Evolution Chart ---
function WeightEvolutionChart({ history }: { history: OptimizationState["history"] }) {
  if (history.length < 2) return null;

  const cw = 280, ch = 80, pad = 6;
  const sources = Object.keys(history[0].weights);

  return (
    <div>
      <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} className="w-full">
        {sources.map((source) => {
          const points = history.map((entry, i) => ({
            x: pad + (i / (history.length - 1)) * (cw - pad * 2),
            y: pad + ((1 - (entry.weights[source] || 0)) / 1) * (ch - pad * 2) * 0.8 + pad,
          }));
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <path
              key={source}
              d={d}
              fill="none"
              stroke={SOURCE_COLORS[source] || "#71717a"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
          );
        })}
        {/* 25% baseline (uniform) */}
        <line x1={pad} y1={ch * 0.55} x2={cw - pad} y2={ch * 0.55} stroke="#27272a" strokeWidth="0.5" strokeDasharray="3 3" />
      </svg>
      <div className="flex justify-between text-[8px] text-zinc-700 px-1">
        <span>{history[0].date.slice(5)}</span>
        <span>{history[history.length - 1].date.slice(5)}</span>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {sources.map((s) => (
          <div key={s} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: SOURCE_COLORS[s] || "#71717a" }} />
            <span className="text-[8px] text-zinc-600">{SOURCE_SHORT[s] || s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Threshold + Accuracy Chart ---
function ThresholdChart({ history }: { history: OptimizationState["history"] }) {
  if (history.length < 2) return null;

  const tw = 280, th = 60, pad = 4;

  // Before accuracy (original, unoptimized)
  const beforePoints = history.map((entry, i) => ({
    x: pad + (i / (history.length - 1)) * (tw - pad * 2),
    y: pad + ((100 - (entry.accuracyBefore ?? entry.accuracy)) / 100) * (th - pad * 2) * 0.8 + pad,
  }));
  // After accuracy (optimized)
  const afterPoints = history.map((entry, i) => ({
    x: pad + (i / (history.length - 1)) * (tw - pad * 2),
    y: pad + ((100 - entry.accuracy) / 100) * (th - pad * 2) * 0.8 + pad,
  }));
  // Threshold
  const thresholdPoints = history.map((entry, i) => ({
    x: pad + (i / (history.length - 1)) * (tw - pad * 2),
    y: pad + ((70 - entry.threshold) / 40) * (th - pad * 2) * 0.8 + pad,
  }));

  const bLine = beforePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const aLine = afterPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const tLine = thresholdPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={tw} height={th} viewBox={`0 0 ${tw} ${th}`} className="w-full">
      {/* 50% baseline */}
      <line x1={pad} y1={th * 0.45} x2={tw - pad} y2={th * 0.45} stroke="#27272a" strokeWidth="0.5" strokeDasharray="3 3" />
      {/* Before (original) */}
      <path d={bLine} fill="none" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" opacity="0.4" strokeDasharray="3 3" />
      {/* After (optimized) */}
      <path d={aLine} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      {/* Threshold */}
      <path d={tLine} fill="none" stroke="#eab308" strokeWidth="1" strokeLinecap="round" strokeDasharray="4 2" opacity="0.6" />
    </svg>
  );
}

export default function OptimizationPanel({ optimization, records }: OptimizationPanelProps) {
  if (!optimization || optimization.epoch === 0) return null;

  const lastPostmortem = records.find((r) => r.postmortem);

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧬</span>
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Self-Improving</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-zinc-600">epoch {optimization.epoch}</span>
          <span className="text-[9px] font-mono text-zinc-700">η={optimization.weightLR.toFixed(4)}</span>
        </div>
      </div>

      {/* Current weights */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Source Weights</span>
          <span className="text-[9px] text-zinc-600">Hedge algorithm</span>
        </div>
        <WeightBars weights={optimization.sourceWeights} />
      </div>

      {/* Weight evolution */}
      {optimization.history.length >= 2 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Weight Evolution</span>
            <span className="text-[9px] text-zinc-600">{optimization.history.length} updates</span>
          </div>
          <WeightEvolutionChart history={optimization.history} />
        </div>
      )}

      {/* Threshold + accuracy trend */}
      {optimization.history.length >= 2 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Threshold &amp; Accuracy</span>
          </div>
          <ThresholdChart history={optimization.history} />
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded bg-emerald-500" />
              <span className="text-[8px] text-zinc-600">Optimized</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded bg-red-500 opacity-40" />
              <span className="text-[8px] text-zinc-600">Before</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded bg-yellow-500" />
              <span className="text-[8px] text-zinc-600">Threshold</span>
            </div>
          </div>
        </div>
      )}

      {/* Convergence indicator */}
      <div className="bg-zinc-900/50 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Convergence</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[9px] text-zinc-600 mb-0.5">
              <span>Learning Rate Decay</span>
              <span className="font-mono">{optimization.weightLR.toFixed(4)}</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(3, (1 - optimization.weightLR / 0.3) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-[10px] font-mono text-zinc-400">Day {optimization.epoch}</div>
            <div className="text-[8px] text-zinc-600">of learning</div>
          </div>
        </div>
      </div>

      {/* Latest postmortem */}
      {lastPostmortem?.postmortem && (
        <div className="border-t border-zinc-800/50 pt-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Latest Insight</span>
            <span className="text-[9px] text-zinc-700">{lastPostmortem.date}</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {lastPostmortem.postmortem}
          </p>
        </div>
      )}
    </div>
  );
}
