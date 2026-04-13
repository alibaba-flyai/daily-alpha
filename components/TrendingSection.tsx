"use client";

import { useEffect, useState } from "react";

interface TrendingAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  category: "active" | "gainer" | "loser" | "trending";
}

interface TrendingData {
  active: TrendingAsset[];
  gainers: TrendingAsset[];
  losers: TrendingAsset[];
  trending: TrendingAsset[];
  date: string;
}

interface TrendingSectionProps {
  onSearch: (query: string) => void;
}

function SentimentMini({ positive }: { positive: boolean }) {
  return (
    <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded bg-black border ${positive ? "border-emerald-500/30" : "border-red-500/30"}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={positive ? "#22c55e" : "#ef4444"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {positive ? (
          <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>
        ) : (
          <><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></>
        )}
      </svg>
    </span>
  );
}

function AssetRow({ asset, onSearch }: { asset: TrendingAsset; onSearch: (q: string) => void }) {
  const isUp = asset.change >= 0;
  return (
    <button
      onClick={() => onSearch(asset.symbol)}
      className="flex items-center gap-2 w-full py-1.5 px-2 -mx-2 rounded-lg hover:bg-zinc-800/40 transition-colors text-left group"
    >
      <SentimentMini positive={isUp} />
      <span className="text-[11px] font-mono text-zinc-300 w-12 shrink-0 group-hover:text-white transition-colors">{asset.symbol}</span>
      <span className="text-[11px] text-zinc-500 flex-1 truncate">{asset.name}</span>
      {asset.price > 0 && (
        <span className="text-[11px] text-zinc-400 font-mono shrink-0">${asset.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      )}
      {asset.change !== 0 && (
        <span className={`text-[11px] font-mono font-medium w-16 text-right shrink-0 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
          {isUp ? "+" : ""}{asset.change.toFixed(2)}%
        </span>
      )}
    </button>
  );
}

export default function TrendingSection({ onSearch }: TrendingSectionProps) {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trending")
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const date = new Date(data.date);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto mt-8 mb-12">
      {/* Date */}
      <div className="text-center mb-6">
        <span className="text-xs text-zinc-600">{dateStr}</span>
      </div>

      {/* Trending tickers strip */}
      {data.trending.length > 0 && (
        <div className="mb-5">
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Trending</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.trending.map((t) => (
              <button
                key={t.symbol}
                onClick={() => onSearch(t.symbol)}
                className="px-2.5 py-1 text-[11px] font-mono bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Three columns: Active, Gainers, Losers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Most Active */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🔥</span>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Most Active</span>
          </div>
          <div className="space-y-0.5">
            {data.active.map((a) => (
              <AssetRow key={a.symbol} asset={a} onSearch={onSearch} />
            ))}
          </div>
        </div>

        {/* Top Gainers */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🚀</span>
            <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">Top Gainers</span>
          </div>
          <div className="space-y-0.5">
            {data.gainers.map((a) => (
              <AssetRow key={a.symbol} asset={a} onSearch={onSearch} />
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📉</span>
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Top Losers</span>
          </div>
          <div className="space-y-0.5">
            {data.losers.map((a) => (
              <AssetRow key={a.symbol} asset={a} onSearch={onSearch} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
