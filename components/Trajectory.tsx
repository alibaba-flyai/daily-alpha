"use client";

import { TraceStep, PredictionResult } from "@/lib/types";

interface TrajectoryProps {
  steps: TraceStep[];
  result: PredictionResult | null;
  loading: boolean;
}

const SOURCE_META: Record<string, { icon: string; color: string }> = {
  Polymarket: { icon: "🎯", color: "text-purple-400" },
  "Market Data": { icon: "📈", color: "text-blue-400" },
  "News Sentiment": { icon: "📰", color: "text-amber-400" },
  "X / Twitter": { icon: "𝕏", color: "text-sky-400" },
  Agent: { icon: "🧠", color: "text-emerald-400" },
};

function Dots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce" />
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const color =
    score < 40 ? "bg-red-500/15 text-red-400 border-red-500/20"
    : score < 60 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}/100
    </span>
  );
}

function SentimentMini({ positive }: { positive: boolean }) {
  if (positive) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
}

function InterimResult({ step }: { step: TraceStep }) {
  // Polymarket interim
  if (step.polymarketData && step.polymarketData.markets.length > 0) {
    const top = step.polymarketData.markets[0];
    return (
      <div className="mt-1 ml-6 pl-3 border-l border-zinc-800 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span>{step.polymarketData.markets.length} markets</span>
          <span className="text-zinc-700">·</span>
          <span>Top: {(top.yesPrice * 100).toFixed(0)}% Yes</span>
          <SentimentMini positive={top.yesPrice >= 0.5} />
        </div>
        <p className="text-[10px] text-zinc-600 truncate">{top.question}</p>
      </div>
    );
  }

  // Market data interim
  if (step.marketData) {
    const d = step.marketData;
    const up = d.dailyChange >= 0;
    return (
      <div className="mt-1 ml-6 pl-3 border-l border-zinc-800">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-zinc-400 font-mono">${d.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className={`font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? "+" : ""}{d.dailyChange.toFixed(2)}%
          </span>
          <SentimentMini positive={up} />
        </div>
      </div>
    );
  }

  // News interim
  if (step.newsData && step.newsData.headlines.length > 0) {
    const d = step.newsData;
    const posRatio = d.totalArticles > 0 ? d.positiveCount / (d.positiveCount + d.negativeCount || 1) : 0.5;
    return (
      <div className="mt-1 ml-6 pl-3 border-l border-zinc-800 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-emerald-500">{d.positiveCount} bullish</span>
          <span className="text-red-500">{d.negativeCount} bearish</span>
          <span className="text-zinc-600">of {d.totalArticles}</span>
          <SentimentMini positive={posRatio > 0.5} />
        </div>
        <p className="text-[10px] text-zinc-600 truncate">{d.headlines[0].title}</p>
      </div>
    );
  }

  // Tweet interim
  if (step.tweetData && step.tweetData.tweets.length > 0) {
    const tweets = step.tweetData.tweets;
    const posCount = tweets.filter(t => t.sentiment === "positive").length;
    const negCount = tweets.filter(t => t.sentiment === "negative").length;
    return (
      <div className="mt-1 ml-6 pl-3 border-l border-zinc-800 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-zinc-500">{tweets.length} tweets</span>
          {posCount > 0 && <span className="text-emerald-500">{posCount} positive</span>}
          {negCount > 0 && <span className="text-red-500">{negCount} negative</span>}
          <SentimentMini positive={posCount >= negCount} />
        </div>
        <p className="text-[10px] text-zinc-600 truncate">{tweets[0].handle}: {tweets[0].text}</p>
      </div>
    );
  }

  return null;
}

export default function Trajectory({ steps, result, loading }: TrajectoryProps) {
  // Deduplicate: only show latest status per id
  const stepMap = new Map<string, TraceStep>();
  for (const step of steps) {
    const existing = stepMap.get(step.id);
    if (!existing || step.status === "done" || step.status === "error") {
      stepMap.set(step.id, step);
    }
  }
  const dedupedSteps = Array.from(stepMap.values());

  // Separate agent source steps from the llm step
  const sourceSteps = dedupedSteps.filter(s => s.id !== "llm");

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/50 bg-zinc-900/20">
        <span className="relative flex h-2 w-2">
          {loading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${loading ? "bg-emerald-500" : "bg-zinc-600"}`} />
        </span>
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Execution Trajectory</span>
      </div>

      <div className="px-4 py-3 space-y-0">
        {/* Source agent steps */}
        {sourceSteps.map((step, i) => {
          const meta = SOURCE_META[step.source] || { icon: "📊", color: "text-zinc-400" };
          const isRunning = step.status === "running";
          const isDone = step.status === "done";
          const isError = step.status === "error";
          const isLast = i === sourceSteps.length - 1;

          return (
            <div key={step.id} className="animate-fade-slide-in">
              <div className="flex gap-2.5 py-1.5">
                {/* Timeline */}
                <div className="flex flex-col items-center w-5">
                  {isRunning && (
                    <span className="mt-0.5 w-4 h-4 flex items-center justify-center">
                      <svg className="animate-spin h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </span>
                  )}
                  {isDone && (
                    <span className="mt-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-emerald-500/15">
                      <svg className="h-2.5 w-2.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  {isError && (
                    <span className="mt-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/15">
                      <svg className="h-2.5 w-2.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  {!isLast && <div className="w-px flex-1 bg-zinc-800 mt-1" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{meta.icon}</span>
                    <span className={`text-[11px] font-semibold ${meta.color}`}>{step.source}</span>
                    {isDone && step.signal && step.signal.confidence > 0 && (
                      <ScorePill score={step.signal.score} />
                    )}
                    {isRunning && <Dots />}
                  </div>
                  <p className={`text-[11px] mt-0.5 ${
                    isRunning ? "text-zinc-400" : isError ? "text-red-400/70" : "text-zinc-500"
                  }`}>
                    {step.message}
                  </p>

                  {/* Interim results */}
                  {isDone && <InterimResult step={step} />}
                </div>
              </div>
            </div>
          );
        })}

        {/* LLM synthesis is shown separately above */}

        {/* Final result */}
        {result && (
          <div className="mt-2 pt-3 border-t border-zinc-800 animate-scale-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Result</span>
              <span className="text-[10px] text-zinc-600">
                {new Date(result.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Big score */}
              <div className={`text-3xl font-bold tabular-nums ${
                result.winRate < 40 ? "text-red-400" : result.winRate < 60 ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {result.winRate}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs text-zinc-300 font-medium">Win Rate</span>
                  <SentimentMini positive={result.winRate >= 50} />
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">
                  {result.oneLiner}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
