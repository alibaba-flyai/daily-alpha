"use client";

import { TraceStep } from "@/lib/types";

interface AgentPanelProps {
  id: string;
  source: string;
  steps: TraceStep[];
}

const SOURCE_META: Record<string, { icon: string; gradient: string; label: string }> = {
  Polymarket: { icon: "🎯", gradient: "from-purple-500/10 to-transparent", label: "Polymarket" },
  "Market Data": { icon: "📈", gradient: "from-blue-500/10 to-transparent", label: "Yahoo Finance" },
  "News Sentiment": { icon: "📰", gradient: "from-amber-500/10 to-transparent", label: "Google News" },
  "X / Twitter": { icon: "𝕏", gradient: "from-sky-500/10 to-transparent", label: "X / Twitter" },
};

// Assign distinct colors to known publishers
const SOURCE_COLORS: Record<string, string> = {
  Reuters: "bg-orange-500",
  Bloomberg: "bg-purple-500",
  "CNBC": "bg-blue-500",
  "The Wall Street Journal": "bg-amber-700",
  "Financial Times": "bg-pink-600",
  "Forbes": "bg-red-600",
  "Yahoo Finance": "bg-indigo-500",
  "TechCrunch": "bg-emerald-600",
  "The Verge": "bg-fuchsia-500",
  "Ars Technica": "bg-orange-600",
  "Business Insider": "bg-blue-600",
  "MarketWatch": "bg-green-600",
  "Barron's": "bg-teal-600",
  "CNN": "bg-red-700",
  "BBC": "bg-red-500",
  "AP News": "bg-red-600",
  "The New York Times": "bg-zinc-600",
  "The Guardian": "bg-blue-700",
  "Autoblog": "bg-sky-600",
  "Engadget": "bg-violet-600",
  "Wired": "bg-zinc-500",
};

function getSourceColor(source: string): string {
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source];
  // Generate a deterministic color from source name
  const colors = [
    "bg-cyan-600", "bg-rose-600", "bg-lime-600", "bg-violet-600",
    "bg-amber-600", "bg-teal-600", "bg-indigo-600", "bg-pink-600",
  ];
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = source.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" />
    </div>
  );
}

function formatVolume(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function ScoreBadge({ score }: { score: number }) {
  const color = score < 40 ? "bg-red-500/15 text-red-400" : score < 60 ? "bg-yellow-500/15 text-yellow-400" : "bg-emerald-500/15 text-emerald-400";
  return <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${color}`}>{score}</span>;
}

function SentimentIcon({ sentiment }: { sentiment: "positive" | "negative" | "neutral" }) {
  if (sentiment === "positive") {
    return (
      <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-black border border-emerald-500/30" title="Bullish">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </span>
    );
  }
  if (sentiment === "negative") {
    return (
      <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-black border border-red-500/30" title="Bearish">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
          <polyline points="16 17 22 17 22 11" />
        </svg>
      </span>
    );
  }
  return (
    <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-black border border-zinc-700" title="Neutral">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    </span>
  );
}

// --- Polymarket Rich UI ---
function PolymarketContent({ step }: { step: TraceStep }) {
  const data = step.polymarketData;
  if (!data || data.markets.length === 0) return <EmptyState message={step.message} />;

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="w-5" /> {/* sentiment icon space */}
        <span className="flex-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Market</span>
        <span className="w-[52px] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-right">Odds</span>
        <span className="w-[52px] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-right">Volume</span>
      </div>
      <div className="space-y-1.5">
        {data.markets.slice(0, 5).map((m, i) => {
          const isBullish = m.yesPrice >= 0.5;
          return (
            <a
              key={i}
              href={`https://polymarket.com/event/${m.eventSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 group py-1 -mx-0.5 px-0.5 rounded-md hover:bg-zinc-800/30 transition-colors"
            >
              <SentimentIcon sentiment={isBullish ? "positive" : "negative"} />
              {/* Question + date */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 line-clamp-2 leading-snug group-hover:text-white transition-colors">
                  {m.question}
                </p>
                {m.endDate && (
                  <span className="text-[9px] text-zinc-600">Ends {formatDate(m.endDate)}</span>
                )}
              </div>
              {/* Odds with mini bar */}
              <div className="w-[52px] shrink-0">
                <span className={`text-xs font-mono font-bold block text-right ${
                  isBullish ? "text-emerald-400" : "text-red-400"
                }`}>
                  {(m.yesPrice * 100).toFixed(0)}%
                </span>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(3, m.yesPrice * 100)}%`,
                      background: isBullish ? "#22c55e" : "#ef4444",
                    }}
                  />
                </div>
              </div>
              {/* Volume */}
              <span className="w-[52px] text-[10px] text-zinc-500 font-mono text-right shrink-0">
                {formatVolume(m.volume)}
              </span>
            </a>
          );
        })}
      </div>
      {data.markets.length > 5 && (
        <p className="text-[10px] text-zinc-600 pt-2 pl-0.5">
          +{data.markets.length - 5} more · {data.totalResults} total on Polymarket
        </p>
      )}
    </div>
  );
}

// --- News Rich UI ---
function NewsContent({ step }: { step: TraceStep }) {
  const data = step.newsData;
  if (!data || data.headlines.length === 0) return <EmptyState message={step.message} />;

  return (
    <div className="space-y-2">
      {data.headlines.slice(0, 6).map((h, i) => (
        <a
          key={i}
          href={h.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 group"
        >
          {/* Sentiment icon */}
          <SentimentIcon sentiment={h.sentiment} />

          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-300 leading-snug line-clamp-2 group-hover:text-white transition-colors">
              {h.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {/* Colorful source badge */}
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold text-white px-1.5 py-[1px] rounded ${getSourceColor(h.source)}`}>
                {h.source}
              </span>
              {h.publishedAt && (
                <span className="text-[9px] text-zinc-600">
                  {formatTimeAgo(h.publishedAt)}
                </span>
              )}
            </div>
          </div>
        </a>
      ))}
      {data.totalArticles > 6 && (
        <div className="flex items-center gap-3 pt-1 text-[10px] text-zinc-600">
          <span>+{data.totalArticles - 6} more</span>
          <span className="text-emerald-500">{data.positiveCount} bullish</span>
          <span className="text-red-500">{data.negativeCount} bearish</span>
        </div>
      )}
    </div>
  );
}

// --- Market Data Rich UI ---
function MarketContent({ step }: { step: TraceStep }) {
  const data = step.marketData;
  if (!data) return <EmptyState message={step.message} />;

  const isUp = data.dailyChange >= 0;
  const fiftyUp = data.fiftyDayChange >= 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SentimentIcon sentiment={isUp ? "positive" : "negative"} />
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100 tabular-nums">
              ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">{data.symbol} · {data.name}</span>
        </div>
        <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-mono font-bold ${
          isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          <span>{isUp ? "▲" : "▼"}</span>
          <span>{isUp ? "+" : ""}{data.dailyChange.toFixed(2)}%</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
            <span>Daily momentum</span>
            <span>{isUp ? "+" : ""}{data.dailyChange.toFixed(2)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(3, Math.min(97, 50 + data.dailyChange * 5))}%`,
                background: isUp ? "#22c55e" : "#ef4444",
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-0.5">
            <span>50-day trend</span>
            <span>{fiftyUp ? "+" : ""}{data.fiftyDayChange.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(3, Math.min(97, 50 + data.fiftyDayChange * 2))}%`,
                background: fiftyUp ? "#22c55e" : "#ef4444",
              }}
            />
          </div>
        </div>
      </div>

      {/* Related assets */}
      {data.relatedAssets && data.relatedAssets.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-zinc-800/50">
          <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">Related</span>
          <div className="mt-1.5 space-y-1">
            {data.relatedAssets.map((a) => {
              const up = a.dailyChange >= 0;
              return (
                <div key={a.symbol} className="flex items-center gap-2">
                  <SentimentIcon sentiment={up ? "positive" : "negative"} />
                  <span className="text-[10px] text-zinc-400 font-mono w-14 truncate">{a.symbol}</span>
                  <span className="text-[10px] text-zinc-300 flex-1 truncate">{a.name}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">${a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className={`text-[10px] font-mono font-medium w-14 text-right ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? "+" : ""}{a.dailyChange.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Twitter / X Rich UI ---
function TwitterContent({ step }: { step: TraceStep }) {
  const data = step.tweetData;
  if (!data || data.tweets.length === 0) return <EmptyState message={step.message} />;

  const borderColors = {
    positive: "border-l-emerald-500/50",
    negative: "border-l-red-500/50",
    neutral: "border-l-zinc-700",
  };

  return (
    <div className="space-y-2">
      {data.tweets.map((t, i) => (
        <div key={i} className={`border border-zinc-800/80 border-l-2 ${borderColors[t.sentiment]} rounded-lg p-2.5 bg-zinc-900/20`}>
          <div className="flex items-center gap-2 mb-1">
            <SentimentIcon sentiment={t.sentiment} />
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">
                {t.author[0]}
              </div>
              <span className="text-[11px] font-medium text-zinc-300 truncate">{t.author}</span>
              <span className="text-[10px] text-zinc-600 shrink-0">{t.handle}</span>
            </div>
            {t.createdAt && (
              <span className="text-[9px] text-zinc-600 shrink-0">{formatTimeAgo(t.createdAt)}</span>
            )}
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 pl-7">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

// --- Empty / Loading states ---
function EmptyState({ message }: { message: string }) {
  return <p className="text-xs text-zinc-500">{message}</p>;
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="space-y-2.5 py-1">
      <p className="text-xs text-zinc-500">{message}</p>
      <div className="space-y-2">
        <div className="h-2 bg-zinc-800/50 rounded-full w-full animate-pulse" />
        <div className="h-2 bg-zinc-800/50 rounded-full w-4/5 animate-pulse [animation-delay:150ms]" />
        <div className="h-2 bg-zinc-800/50 rounded-full w-3/5 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// --- Main Component ---
export default function AgentPanel({ id, source, steps }: AgentPanelProps) {
  const meta = SOURCE_META[source] || { icon: "📊", gradient: "from-zinc-500/10 to-transparent", label: source };
  const latestStep = [...steps].reverse().find((s) => s.id === id);
  const isRunning = latestStep?.status === "running";
  const isDone = latestStep?.status === "done";
  const isError = latestStep?.status === "error";

  return (
    <div className={`rounded-xl overflow-hidden transition-all duration-500 ${
      isRunning
        ? "bg-zinc-950 border border-zinc-700/50 shadow-lg shadow-zinc-900/50"
        : "bg-zinc-950 border border-zinc-800/80"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 bg-gradient-to-r ${meta.gradient} border-b border-zinc-800/50`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{meta.icon}</span>
          <span className="text-xs font-semibold text-zinc-300">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isRunning && <Spinner />}
          {isDone && latestStep?.signal && latestStep.signal.confidence > 0 && (
            <ScoreBadge score={latestStep.signal.score} />
          )}
          {isDone && (
            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-emerald-500/15">
              <svg className="h-2.5 w-2.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {isError && (
            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500/15">
              <svg className="h-2.5 w-2.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-3 min-h-[100px]">
        {isRunning && <LoadingState message={latestStep?.message || "Loading..."} />}
        {isDone && source === "Polymarket" && <PolymarketContent step={latestStep!} />}
        {isDone && source === "Market Data" && <MarketContent step={latestStep!} />}
        {isDone && source === "News Sentiment" && <NewsContent step={latestStep!} />}
        {isDone && source === "X / Twitter" && <TwitterContent step={latestStep!} />}
        {isError && <EmptyState message={latestStep?.message || "Error"} />}
      </div>
    </div>
  );
}
