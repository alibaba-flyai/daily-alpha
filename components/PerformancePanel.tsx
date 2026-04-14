"use client";

import { useEffect, useState } from "react";

interface DailyPrediction {
  symbol: string;
  name: string;
  predictedWinRate: number;
  predictedWin: boolean;
  priceAtPrediction: number;
}

interface DailyResult extends DailyPrediction {
  priceAtClose: number;
  actualWin: boolean;
  correct: boolean;
}

interface DailyRecord {
  date: string;
  predictions: DailyPrediction[];
  results: DailyResult[] | null;
  accuracy: number | null;
}

interface PerformanceResponse {
  records: DailyRecord[];
  stats: {
    totalDays: number;
    totalPredictions: number;
    totalCorrect: number;
    overallAccuracy: number | null;
  };
}

interface PerformancePanelProps {
  onSearch: (query: string) => void;
}

function SentimentIcon({ positive }: { positive: boolean }) {
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

// --- Compact Market Pill ---
function MarketPill() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = et.getHours(), minutes = et.getMinutes();
  const totalMins = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30, marketClose = 16 * 60;
  const isWeekday = et.getDay() >= 1 && et.getDay() <= 5;
  const isOpen = isWeekday && totalMins >= marketOpen && totalMins < marketClose;
  const isPreMarket = isWeekday && totalMins < marketOpen;

  let label: string, timeLeft: string, dotColor: string, borderColor: string;
  if (!isWeekday) {
    label = "Closed"; timeLeft = "Mon"; dotColor = "bg-zinc-600"; borderColor = "border-zinc-700";
  } else if (isOpen) {
    const m = marketClose - totalMins;
    label = "Open"; timeLeft = `${Math.floor(m / 60)}h${m % 60}m`; dotColor = "bg-emerald-400"; borderColor = "border-emerald-800/50";
  } else if (isPreMarket) {
    const m = marketOpen - totalMins;
    label = "Pre"; timeLeft = `${Math.floor(m / 60)}h${m % 60}m`; dotColor = "bg-yellow-400"; borderColor = "border-yellow-800/50";
  } else {
    label = "Closed"; timeLeft = "Tmrw"; dotColor = "bg-zinc-600"; borderColor = "border-zinc-700";
  }

  return (
    <div className={`shrink-0 flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-zinc-900/50 ${borderColor}`}>
      <div className="flex items-center gap-1.5">
        <span className={`relative flex h-1.5 w-1.5`}>
          {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`} />
        </span>
        <span className={`text-[9px] font-semibold uppercase ${
          isOpen ? "text-emerald-400" : isPreMarket ? "text-yellow-400" : "text-zinc-500"
        }`}>{label}</span>
      </div>
      <span className="text-[10px] font-mono text-zinc-400 leading-none">{timeLeft}</span>
    </div>
  );
}

// --- Compact Inline Accuracy Chart ---
function AccuracyChartInline({ records, selectedDate, onSelectDate }: {
  records: DailyRecord[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const evaluated = records
    .filter((r) => r.accuracy !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const today = new Date().toISOString().split("T")[0];
  const todayRecord = records.find((r) => r.date === today && r.results === null);
  const allPoints = [...evaluated];
  if (todayRecord) allPoints.push({ ...todayRecord, accuracy: null });

  if (allPoints.length < 2) return <div className="h-10" />;

  const w = 200, h = 40, pad = 4, padTop = 14;
  const points = allPoints.map((r, i) => ({
    x: pad + (i / (allPoints.length - 1)) * (w - pad * 2),
    y: r.accuracy !== null
      ? padTop + ((100 - r.accuracy) / 100) * (h - padTop - pad)
      : h - pad,
    accuracy: r.accuracy,
    date: r.date,
    isPending: r.accuracy === null,
  }));

  const evalPoints = points.filter((p) => !p.isPending);
  const line = evalPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = evalPoints.length > 1
    ? `${line} L ${evalPoints[evalPoints.length - 1].x} ${h - pad} L ${evalPoints[0].x} ${h - pad} Z`
    : "";

  return (
    <div className="relative">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
        <defs>
          <linearGradient id="acc-grad-il" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 50% baseline */}
        <line x1={pad} y1={padTop + (h - padTop - pad) / 2} x2={w - pad} y2={padTop + (h - padTop - pad) / 2} stroke="#27272a" strokeWidth="0.5" strokeDasharray="3 3" />
        {area && <path d={area} fill="url(#acc-grad-il)" />}
        {evalPoints.length > 1 && (
          <path d={line} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={10} fill="transparent" className="cursor-pointer"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectDate(p.date)}
            />
            {p.date === selectedDate && (
              <circle cx={p.x} cy={p.y} r={5} fill="none" stroke="#22c55e" strokeWidth="0.8" opacity="0.4" />
            )}
            <circle cx={p.x} cy={p.y}
              r={p.date === selectedDate ? 3 : 2}
              fill={p.isPending ? "#3f3f46" : (p.accuracy || 0) >= 50 ? "#22c55e" : "#ef4444"}
              stroke="#18181b" strokeWidth="1" className="cursor-pointer"
            />
          </g>
        ))}
        {hovered !== null && points[hovered] && (
          <g>
            <rect
              x={Math.min(Math.max(points[hovered].x - 24, 0), w - 48)}
              y={0} width="48" height="14" rx="3"
              fill="#18181b" stroke="#3f3f46" strokeWidth="0.5"
            />
            <text
              x={Math.min(Math.max(points[hovered].x, 24), w - 24)}
              y={8} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fontFamily="monospace"
              fill={points[hovered].isPending ? "#71717a" : (points[hovered].accuracy || 0) >= 50 ? "#22c55e" : "#ef4444"}
            >
              {points[hovered].date.slice(5)} {points[hovered].isPending ? "?" : `${points[hovered].accuracy}%`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// --- Day Tabs (compact, horizontal scroll) ---
function DayTabs({ records, selectedDate, onSelect }: {
  records: DailyRecord[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="flex gap-1 pb-0.5">
      {records.map((r) => {
        const isSelected = r.date === selectedDate;
        const isToday = r.date === today;
        const hasResults = r.results !== null;
        const d = new Date(r.date + "T12:00:00");
        const dayLabel = isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
        const dateNum = d.getDate();

        return (
          <button
            key={r.date}
            onClick={() => onSelect(r.date)}
            className={`shrink-0 w-10 py-1.5 rounded-lg border text-center transition-all ${
              isSelected
                ? "border-emerald-500/40 bg-emerald-950/20"
                : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700"
            }`}
          >
            <div className={`text-[8px] font-semibold uppercase ${isSelected ? "text-emerald-400" : "text-zinc-600"}`}>{dayLabel}</div>
            <div className={`text-[11px] font-bold font-mono ${isSelected ? "text-zinc-200" : "text-zinc-500"}`}>{dateNum}</div>
            {hasResults && r.accuracy !== null ? (
              <div className={`text-[8px] font-mono font-bold ${
                r.accuracy >= 60 ? "text-emerald-400" : r.accuracy >= 50 ? "text-yellow-400" : "text-red-400"
              }`}>
                {r.accuracy}%
              </div>
            ) : (
              <div className="text-[8px] text-zinc-700">···</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Mini Sparkline ---
function MiniSparkline({ points, isUp }: { points: { price: number }[]; isUp: boolean }) {
  if (points.length < 2) return null;
  const w = 48, h = 16, pad = 1;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pathPoints = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: pad + ((max - p) / range) * (h - pad * 2),
  }));

  const d = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={d} fill="none" stroke={isUp ? "#22c55e" : "#ef4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --- Intraday data type ---
interface IntradayData {
  points: { price: number; time: number }[];
  currentPrice: number;
  openPrice: number;
  change: number;
}

// --- Market hours helper ---
function useMarketStatus() {
  const [status, setStatus] = useState(() => getMarketStatus());
  useEffect(() => {
    const t = setInterval(() => setStatus(getMarketStatus()), 10000);
    return () => clearInterval(t);
  }, []);
  return status;
}

function getMarketStatus() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = et.getHours(), minutes = et.getMinutes();
  const totalMins = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30, marketClose = 16 * 60;
  const isWeekday = et.getDay() >= 1 && et.getDay() <= 5;
  const isOpen = isWeekday && totalMins >= marketOpen && totalMins < marketClose;
  const isPreMarket = isWeekday && totalMins < marketOpen;

  let countdown = "";
  if (isPreMarket) {
    const m = marketOpen - totalMins;
    countdown = `${Math.floor(m / 60)}h ${m % 60}m`;
  } else if (!isWeekday) {
    countdown = "Monday 9:30 AM ET";
  } else if (!isOpen) {
    countdown = "tomorrow 9:30 AM ET";
  }

  return { isOpen, isPreMarket, isWeekday, countdown };
}

// --- Prediction Table ---
function PredictionTable({
  record,
  onSearch,
}: {
  record: DailyRecord;
  onSearch: (q: string) => void;
}) {
  const hasResults = record.results !== null;
  const isPending = !hasResults;
  const items = hasResults ? record.results! : record.predictions;

  const today = new Date().toISOString().split("T")[0];
  const isToday = record.date === today;
  const market = useMarketStatus();

  // Only fetch intraday data when market is open
  const [intraday, setIntraday] = useState<Record<string, IntradayData>>({});
  useEffect(() => {
    if (!isToday || !isPending || !market.isOpen) return;
    const symbols = items.map((p) => p.symbol).join(",");
    fetch(`/api/intraday?symbols=${symbols}`)
      .then((r) => r.json())
      .then(setIntraday)
      .catch(() => {});

    const interval = setInterval(() => {
      fetch(`/api/intraday?symbols=${symbols}`)
        .then((r) => r.json())
        .then(setIntraday)
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [isToday, isPending, items, market.isOpen]);

  const showLive = isToday && isPending && market.isOpen && Object.keys(intraday).length > 0;
  const showPreMarket = isToday && isPending && !market.isOpen;

  // Show extra columns for today (live or pending) and for evaluated results
  const showExtraCols = isToday && isPending;

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-1.5 mb-1 text-[9px] text-zinc-600 uppercase">
        <span className="w-4" />
        <span className="w-12">Ticker</span>
        <span className="flex-1">Name</span>
        <span className="w-10 text-right">Pred</span>
        {showExtraCols && <span className="w-12 text-center">Live</span>}
        {showExtraCols && <span className="w-14 text-right">Now</span>}
        {hasResults && <span className="w-14 text-right">Actual</span>}
        <span className="w-6 text-center">{hasResults || showExtraCols ? "W/L" : ""}</span>
      </div>

      <div className="space-y-0.5">
        {items.map((p, i) => {
          const r = hasResults ? (record.results![i]) : null;
          const live = showLive ? intraday[p.symbol] : null;
          const liveUp = live ? live.change >= 0 : false;
          const liveCorrect = live ? (p.predictedWin === (live.change > 0)) : null;

          return (
            <button
              key={p.symbol}
              onClick={() => onSearch(p.symbol)}
              className="flex items-center gap-1.5 w-full py-1 px-1 -mx-1 rounded hover:bg-zinc-800/30 transition-colors text-left"
            >
              <SentimentIcon positive={p.predictedWin} />
              <span className="text-[11px] font-mono text-zinc-300 w-12">{p.symbol}</span>
              <span className="text-[11px] text-zinc-500 flex-1 truncate">{p.name}</span>
              <span className={`text-[11px] font-mono w-10 text-right ${
                p.predictedWinRate > 50 ? "text-emerald-400" : p.predictedWinRate < 50 ? "text-red-400" : "text-zinc-400"
              }`}>
                {p.predictedWinRate}%
              </span>
              {/* Live sparkline + change — or pending placeholder */}
              {showExtraCols && (
                live ? (
                  <>
                    <span className="w-12 flex justify-center">
                      <MiniSparkline points={live.points} isUp={liveUp} />
                    </span>
                    <span className={`text-[11px] font-mono w-14 text-right ${liveUp ? "text-emerald-400" : "text-red-400"}`}>
                      {liveUp ? "+" : ""}{live.change.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-12 text-center text-[9px] text-zinc-700">—</span>
                    <span className="w-14 text-right text-[9px] text-zinc-700">—</span>
                  </>
                )
              )}
              {/* Actual results for evaluated records */}
              {r ? (
                <>
                  <span className={`text-[11px] font-mono w-14 text-right ${r.actualWin ? "text-emerald-400" : "text-red-400"}`}>
                    {r.actualWin ? "↑" : "↓"}{Math.abs((r.priceAtClose - r.priceAtPrediction) / r.priceAtPrediction * 100).toFixed(1)}%
                  </span>
                  <span className="w-6 text-center">
                    <span className={`text-[11px] font-bold ${r.correct ? "text-emerald-400" : "text-red-400"}`}>
                      {r.correct ? "W" : "L"}
                    </span>
                  </span>
                </>
              ) : (
                <span className="w-6 text-center">
                  {liveCorrect !== null ? (
                    <span className={`text-[11px] font-bold ${liveCorrect ? "text-emerald-400/60" : "text-red-400/60"}`}>
                      {liveCorrect ? "W" : "L"}
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-700">—</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      {hasResults && record.accuracy !== null && (
        <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-emerald-500">{record.results!.filter(r => r.correct).length}W</span>
            <span className="text-red-500">{record.results!.filter(r => !r.correct).length}L</span>
          </div>
          <span className={`text-xs font-bold font-mono ${
            record.accuracy >= 60 ? "text-emerald-400" : record.accuracy >= 50 ? "text-yellow-400" : "text-red-400"
          }`}>
            {record.accuracy}%
          </span>
        </div>
      )}
      {isPending && showLive && (
        <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px]">
            {(() => {
              const liveWins = items.filter((p) => {
                const l = intraday[p.symbol];
                return l && p.predictedWin === (l.change > 0);
              }).length;
              const liveTotal = items.filter((p) => intraday[p.symbol]).length;
              return (
                <>
                  <span className="text-emerald-500">{liveWins}W</span>
                  <span className="text-red-500">{liveTotal - liveWins}L</span>
                  <span className="text-zinc-600">(live)</span>
                </>
              );
            })()}
          </div>
          <span className="text-[10px] text-zinc-500">Updates every 60s</span>
        </div>
      )}
      {showPreMarket && (
        <div className="mt-3 pt-3 border-t border-zinc-800/50">
          <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-zinc-900/50 rounded-lg">
            <span className={`relative flex h-1.5 w-1.5`}>
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${market.isPreMarket ? "bg-yellow-400" : "bg-zinc-600"}`} />
            </span>
            <span className={`text-[10px] font-semibold ${market.isPreMarket ? "text-yellow-400" : "text-zinc-500"}`}>
              {market.isPreMarket ? "Pre-Market" : "Closed"}
            </span>
            <span className="text-[10px] text-zinc-500">·</span>
            <span className="text-[10px] font-mono text-zinc-400">
              {market.isPreMarket ? `Opens in ${market.countdown}` : `Opens ${market.countdown}`}
            </span>
          </div>
        </div>
      )}
      {isPending && !showLive && !showPreMarket && (
        <div className="mt-2 pt-2 border-t border-zinc-800/50 text-center">
          <span className="text-[10px] text-zinc-600">Waiting for market data</span>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---
export default function PerformancePanel({ onSearch }: PerformancePanelProps) {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    // Fast load: get history instantly
    fetch("/api/performance")
      .then((res) => res.json())
      .then((d: PerformanceResponse & { needsGenerate?: boolean }) => {
        setData(d);
        const today = new Date().toISOString().split("T")[0];
        const todayExists = d.records.some((r) => r.date === today);
        setSelectedDate(todayExists ? today : d.records[0]?.date || "");
        setLoading(false);

        // If today's predictions don't exist, trigger generation
        if (d.needsGenerate) {
          fetch("/api/performance", { method: "POST" })
            .then((res) => res.json())
            .then((updated: PerformanceResponse) => {
              setData(updated);
              const updatedToday = updated.records.some((r) => r.date === today);
              if (updatedToday) setSelectedDate(today);
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-32 mb-4" />
        <div className="h-20 bg-zinc-800/50 rounded" />
      </div>
    );
  }

  if (!data || data.records.length === 0) return null;

  const { stats } = data;
  const selectedRecord = data.records.find((r) => r.date === selectedDate);

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5">
      {/* Header: Title + Score + W:L + Market pill */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🏆</span>
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Track Record</span>
        {stats.overallAccuracy !== null && (
          <span className={`text-sm font-bold font-mono ${
            stats.overallAccuracy >= 60 ? "text-emerald-400" : stats.overallAccuracy >= 50 ? "text-yellow-400" : "text-red-400"
          }`}>
            {stats.overallAccuracy}%
          </span>
        )}
        {stats.totalDays > 0 && (
          <div className="flex items-center gap-1 bg-zinc-900/80 rounded px-2 py-0.5 border border-zinc-800">
            <span className="text-[11px] font-bold font-mono text-emerald-400">{stats.totalCorrect}</span>
            <span className="text-[9px] text-zinc-600">:</span>
            <span className="text-[11px] font-bold font-mono text-red-400">{stats.totalPredictions - stats.totalCorrect}</span>
            <span className="text-[8px] text-zinc-600 ml-0.5 font-mono">{stats.totalDays}d</span>
          </div>
        )}
        <div className="ml-auto">
          <MarketPill />
        </div>
      </div>

      {/* Chart (left) + Day calendar (right) side by side */}
      <div className="flex items-stretch gap-3 mb-3">
        {/* Accuracy curve */}
        <div className="w-[45%] shrink-0">
          <AccuracyChartInline records={data.records} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        {/* Day calendar — scrollable, max 7 visible */}
        <div className="flex-1 overflow-x-auto scrollbar-none">
          <DayTabs records={data.records} selectedDate={selectedDate} onSelect={setSelectedDate} />
        </div>
      </div>

      {/* Selected day's predictions */}
      {selectedRecord && (
        <PredictionTable record={selectedRecord} onSearch={onSearch} />
      )}
    </div>
  );
}
