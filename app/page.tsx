"use client";

import { useState, useRef, useMemo } from "react";
import SearchBar from "@/components/SearchBar";
import AgentPanel from "@/components/AgentPanel";
import Trajectory from "@/components/Trajectory";
import SpeedMeter from "@/components/SpeedMeter";
import TrendingSection from "@/components/TrendingSection";
import PerformancePanel from "@/components/PerformancePanel";
import { PredictionResult, TraceStep, StreamEvent, FormulaComponent } from "@/lib/types";
import katex from "katex";
import "katex/dist/katex.min.css";

const AGENTS = [
  { id: "polymarket", source: "Polymarket" },
  { id: "market", source: "Market Data" },
  { id: "news", source: "News Sentiment" },
  { id: "twitter", source: "X / Twitter" },
];

function FormulaCard({ components, winRate }: { components: FormulaComponent[]; winRate: number }) {
  const active = components.filter((c) => c.confidence > 0);

  const latex = useMemo(() => {
    if (active.length === 0) return katex.renderToString("\\text{Win Rate} = 50 \\;\\text{(no data)}", { throwOnError: false, displayMode: true });

    // Build: Win Rate = (w1 × s1 + w2 × s2 + ...) = result
    const terms = active.map(
      (c) => `${c.weight} \\times ${c.score}`
    );
    const expression = `\\text{Win Rate} = ${terms.join(" + ")} = \\boxed{${winRate}}`;
    return katex.renderToString(expression, { throwOnError: false, displayMode: true });
  }, [active, winRate]);

  // Build the expanded version showing source labels
  const expandedLatex = useMemo(() => {
    if (active.length === 0) return "";
    const terms = active.map((c) => {
      const shortName = c.source.replace("News Sentiment", "News").replace("Market Data", "Market").replace("X / Twitter", "Twitter");
      return `\\underbrace{${c.weight}}_{w_{\\text{${shortName}}}} \\times \\underbrace{${c.score}}_{s_{\\text{${shortName}}}}`;
    });
    return katex.renderToString(`= ${terms.join(" + ")}`, { throwOnError: false, displayMode: true });
  }, [active]);

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Formula
      </h3>

      {/* LaTeX formula */}
      <div className="bg-black rounded-lg px-4 py-3 mb-3 overflow-x-auto [&_.katex]:text-emerald-400 [&_.katex]:text-sm">
        <div dangerouslySetInnerHTML={{ __html: latex }} />
        {expandedLatex && (
          <div className="mt-1 opacity-60 [&_.katex]:text-[11px]" dangerouslySetInnerHTML={{ __html: expandedLatex }} />
        )}
      </div>

      {/* Component table */}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-zinc-600 text-[10px] uppercase">
            <th className="text-left py-1 font-medium">Source</th>
            <th className="text-right py-1 font-medium">Score</th>
            <th className="text-right py-1 font-medium">Weight</th>
            <th className="text-right py-1 font-medium">Contrib.</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.source} className={c.confidence > 0 ? "text-zinc-300" : "text-zinc-600"}>
              <td className="py-1">{c.source}</td>
              <td className="py-1 text-right font-mono">{c.confidence > 0 ? c.score : "—"}</td>
              <td className="py-1 text-right font-mono">{(c.weight * 100).toFixed(0)}%</td>
              <td className="py-1 text-right font-mono">{c.confidence > 0 ? c.contribution.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
        {active.length > 0 && (
          <tfoot>
            <tr className="border-t border-zinc-800 text-zinc-200 font-medium">
              <td className="py-1.5">Total</td>
              <td className="py-1.5" colSpan={2}></td>
              <td className="py-1.5 text-right font-mono text-emerald-400">= {winRate}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function Home() {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [history, setHistory] = useState<{ query: string; winRate: number; timestamp: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSearch(query: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setSteps([]);
    setCurrentQuery(query);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to get prediction");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const event: StreamEvent = JSON.parse(dataLine.slice(6));
          if (event.type === "trace") setSteps((prev) => [...prev, event.step]);
          else if (event.type === "result") {
            setResult(event.data);
            setHistory((prev) => {
              const filtered = prev.filter((h) => h.query.toLowerCase() !== event.data.query.toLowerCase());
              return [{ query: event.data.query, winRate: event.data.winRate, timestamp: event.data.timestamp }, ...filtered].slice(0, 10);
            });
          }
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const isActive = steps.length > 0;
  const showResults = result && !loading;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/50 sticky top-0 bg-black/90 backdrop-blur-lg z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            <span className="text-zinc-500 font-normal">The</span>{" "}
            Daily <span className="text-emerald-400">Alpha</span>
          </a>
          {loading && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-zinc-500">Analyzing...</span>
            </div>
          )}
          {!loading && (
            <span className="text-xs text-zinc-600">
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6">
        {/* Search section */}
        <section className={`text-center transition-all duration-700 ease-out ${isActive ? "pt-6 pb-4" : "pt-24 pb-12"}`}>
          {!isActive && (
            <div className="animate-fade-slide-in">
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                Buy Today, <span className="text-emerald-400">Win Tomorrow</span>?
              </h2>
              <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto">
                Your daily signal. We aggregate prediction markets, price action, and
                news to predict if tomorrow&apos;s price will be better than today&apos;s.
              </p>
            </div>
          )}
          <SearchBar value={currentQuery} onChange={setCurrentQuery} onSearch={handleSearch} loading={loading} />

          {/* Search history */}
          {history.length > 0 && (
            <div className="flex items-center justify-center gap-2 flex-wrap mt-4">
              {history.map((h) => {
                const color = h.winRate < 40 ? "border-red-800/40 text-red-400" : h.winRate < 60 ? "border-yellow-800/40 text-yellow-400" : "border-emerald-800/40 text-emerald-400";
                const scoreBg = h.winRate < 40 ? "bg-red-500/15" : h.winRate < 60 ? "bg-yellow-500/15" : "bg-emerald-500/15";
                return (
                  <button
                    key={h.query}
                    onClick={() => handleSearch(h.query)}
                    disabled={loading}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-zinc-900/50 hover:bg-zinc-800/80 transition-colors text-xs disabled:opacity-50 ${color}`}
                  >
                    <span className="text-zinc-300">{h.query}</span>
                    <span className={`font-mono font-bold text-[10px] px-1 py-0.5 rounded ${scoreBg}`}>{h.winRate}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {error && (
          <div className="text-center py-4 animate-fade-slide-in">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Main content — two column */}
        {isActive && (
          <div className="flex flex-col lg:flex-row gap-6 pb-16 animate-fade-slide-in">
            {/* Left: Agent panels */}
            <div className="lg:w-[55%] xl:w-[60%]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
                {AGENTS.map((agent) => (
                  <AgentPanel
                    key={agent.id}
                    id={agent.id}
                    source={agent.source}
                    steps={steps}
                  />
                ))}
              </div>
            </div>

            {/* Right: Sticky SpeedMeter + LLM bar + Trajectory + Formula */}
            <div className="lg:w-[45%] xl:w-[40%]">
              <div className="lg:sticky lg:top-16 space-y-3">
                {/* Speed Meter — shows interim scores as agents complete */}
                <SpeedMeter
                  value={result ? result.winRate : null}
                  steps={steps}
                  loading={loading}
                  query={currentQuery}
                />

                {/* LLM Synthesis bar — right below meter */}
                {(() => {
                  const llmStep = [...steps].reverse().find((s) => s.id === "llm");
                  if (!llmStep) return null;
                  const isRunning = llmStep.status === "running";
                  return (
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all duration-500 animate-fade-slide-in ${
                      isRunning
                        ? "border-emerald-500/40 bg-emerald-950/20 shadow-lg shadow-emerald-500/5"
                        : "border-zinc-800 bg-zinc-950"
                    }`}>
                      {isRunning ? (
                        <svg className="animate-spin h-4 w-4 text-emerald-400 shrink-0" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <span className="text-sm shrink-0">🧠</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-emerald-400 font-semibold">Gemini 2.5 Flash</span>
                          {isRunning && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] ${isRunning ? "text-zinc-300" : "text-zinc-500"}`}>
                          {llmStep.message}
                        </p>
                      </div>
                      {!isRunning && (
                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                          <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Trajectory */}
                <Trajectory steps={steps} result={null} loading={loading} />

                {/* Win definition + Formula — after result */}
                {showResults && (
                  <div className="space-y-3 animate-fade-slide-in">
                    {/* Win definition */}
                    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
                      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                        What does &quot;win&quot; mean?
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">{result.winDefinition}</p>
                    </div>

                    {/* Formula */}
                    <FormulaCard components={result.formula.components} winRate={result.winRate} />
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* Trending + Performance — shown on homepage */}
        {!isActive && !error && (
          <>
            <TrendingSection onSearch={handleSearch} />
            <div className="max-w-4xl mx-auto mb-12">
              <PerformancePanel onSearch={handleSearch} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
