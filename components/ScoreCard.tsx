"use client";

import { FormulaComponent } from "@/lib/types";

interface ScoreCardProps {
  winRate: number;
  query: string;
  oneLiner: string;
  winDefinition: string;
  formula: {
    components: FormulaComponent[];
    expression: string;
  };
}

function getColor(score: number): string {
  if (score < 40) return "#ef4444";
  if (score < 60) return "#eab308";
  return "#22c55e";
}

function getLabel(score: number): string {
  if (score < 20) return "Very Bearish";
  if (score < 40) return "Bearish";
  if (score < 60) return "Neutral";
  if (score < 80) return "Bullish";
  return "Very Bullish";
}

export default function ScoreCard({
  winRate,
  query,
  oneLiner,
  winDefinition,
  formula,
}: ScoreCardProps) {
  const color = getColor(winRate);
  const label = getLabel(winRate);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (winRate / 100) * circumference;

  const activeComponents = formula.components.filter((c) => c.confidence > 0);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* One-liner answer */}
      <p className="text-center text-lg text-zinc-200 max-w-2xl leading-relaxed">
        {oneLiner}
      </p>

      {/* Gauge */}
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {winRate}
          </span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
      </div>

      <span
        className="text-sm font-medium px-3 py-1 rounded-full"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {label}
      </span>

      {/* Win definition */}
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Buy {query} today — what does &quot;win&quot; mean?
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{winDefinition}</p>
      </div>

      {/* Formula */}
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Formula
        </h3>

        {/* Expression */}
        <div className="bg-black rounded-lg px-4 py-3 mb-4 overflow-x-auto">
          <code className="text-xs text-emerald-400 font-mono whitespace-nowrap">
            {formula.expression}
          </code>
        </div>

        {/* Component table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-600 text-xs uppercase">
              <th className="text-left py-1 font-medium">Source</th>
              <th className="text-right py-1 font-medium">Score</th>
              <th className="text-right py-1 font-medium">Weight</th>
              <th className="text-right py-1 font-medium">Conf.</th>
              <th className="text-right py-1 font-medium">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {formula.components.map((c) => (
              <tr
                key={c.source}
                className={c.confidence > 0 ? "text-zinc-300" : "text-zinc-600"}
              >
                <td className="py-1.5 text-left">{c.source}</td>
                <td className="py-1.5 text-right font-mono">
                  {c.confidence > 0 ? c.score : "—"}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {(c.weight * 100).toFixed(0)}%
                </td>
                <td className="py-1.5 text-right font-mono">
                  {c.confidence > 0 ? `${(c.confidence * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {c.confidence > 0 ? c.contribution.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {activeComponents.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-200 font-medium">
                <td className="py-2 text-left">Total</td>
                <td className="py-2 text-right font-mono" colSpan={3}></td>
                <td className="py-2 text-right font-mono text-emerald-400">
                  = {winRate}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
