"use client";

import { SourceSignal } from "@/lib/types";

interface SourceBreakdownProps {
  signals: SourceSignal[];
}

const SOURCE_ICONS: Record<string, string> = {
  Polymarket: "🎯",
  "Market Data": "📈",
  "News Sentiment": "📰",
  "X / Twitter": "🐦",
};

function getScoreColor(score: number): string {
  if (score < 40) return "text-red-400";
  if (score < 60) return "text-yellow-400";
  return "text-emerald-400";
}

export default function SourceBreakdown({ signals }: SourceBreakdownProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h3 className="text-sm font-medium text-zinc-500 mb-3 uppercase tracking-wider">
        Source Breakdown
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {signals.map((signal) => (
          <div
            key={signal.source}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <span>{SOURCE_ICONS[signal.source] || "📊"}</span>
                {signal.source}
              </span>
              <span className={`text-lg font-bold ${getScoreColor(signal.score)}`}>
                {signal.confidence > 0 ? signal.score : "—"}
              </span>
            </div>

            {/* Score bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: signal.confidence > 0 ? `${signal.score}%` : "0%",
                  backgroundColor:
                    signal.score < 40
                      ? "#ef4444"
                      : signal.score < 60
                        ? "#eab308"
                        : "#22c55e",
                }}
              />
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              {signal.summary}
            </p>

            {signal.confidence > 0 && (
              <p className="text-xs text-zinc-600 mt-1">
                Confidence: {Math.round(signal.confidence * 100)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
