"use client";

import { useEffect, useRef, useState } from "react";
import { TraceStep } from "@/lib/types";

interface SpeedMeterProps {
  value: number | null;
  steps: TraceStep[];
  loading: boolean;
  query: string;
}

function getLabel(score: number): string {
  if (score < 20) return "Strong Sell";
  if (score < 40) return "Bearish";
  if (score < 60) return "Neutral";
  if (score < 80) return "Bullish";
  return "Strong Buy";
}

function computeInterimScore(steps: TraceStep[]): number | null {
  const doneSteps = steps.filter(
    (s) => s.status === "done" && s.signal && s.signal.confidence > 0 && s.id !== "llm"
  );
  if (doneSteps.length === 0) return null;
  let wSum = 0, wTotal = 0;
  for (const s of doneSteps) {
    const w = s.signal!.confidence;
    wSum += s.signal!.score * w;
    wTotal += w;
  }
  return wTotal > 0 ? Math.round(wSum / wTotal) : null;
}

export default function SpeedMeter({ value, steps, loading, query }: SpeedMeterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const animRef = useRef<number>(0);
  const vibrateRef = useRef<number>(0);

  const interimScore = computeInterimScore(steps);
  const targetValue = value ?? interimScore ?? 0;
  const hasAnyValue = value !== null || interimScore !== null;
  const isFinal = value !== null;
  const isLLMRunning = steps.some(s => s.id === "llm" && s.status === "running");

  // Animate needle to target
  useEffect(() => {
    if (!hasAnyValue && !loading) {
      setDisplayValue(0);
      return;
    }
    const start = displayValue;
    const target = targetValue;
    if (start === target) return;

    const duration = isFinal ? 1200 : 600;
    const startTime = Date.now();
    cancelAnimationFrame(animRef.current);

    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (target - start) * eased));
      if (progress < 1) animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, hasAnyValue]);

  // Vibrate needle ±3 around interim value during LLM synthesis
  const [vibrationOffset, setVibrationOffset] = useState(0);
  useEffect(() => {
    if (!isLLMRunning || isFinal) {
      setVibrationOffset(0);
      cancelAnimationFrame(vibrateRef.current);
      return;
    }
    let t = 0;
    const tick = () => {
      t += 0.08;
      // Sine wave vibration ±3 points
      setVibrationOffset(Math.sin(t * 4) * 3 + Math.sin(t * 7) * 1.5);
      vibrateRef.current = requestAnimationFrame(tick);
    };
    vibrateRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(vibrateRef.current);
  }, [isLLMRunning, isFinal]);

  const effectiveValue = Math.max(0, Math.min(100, displayValue + vibrationOffset));

  // SVG gauge
  const cx = 120, cy = 110, r = 90, sw = 12;
  const sa = -210, ea = 30, ta = ea - sa;

  function p2c(angle: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(a1: number, a2: number) {
    const s = p2c(a2), e = p2c(a1);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 0 ${e.x} ${e.y}`;
  }

  const needleAngle = sa + (effectiveValue / 100) * ta;
  const needleEnd = p2c(needleAngle);
  const ticks = [0, 20, 40, 60, 80, 100];
  const needleColor = effectiveValue < 40 ? "#ef4444" : effectiveValue < 60 ? "#eab308" : "#22c55e";

  const doneCount = steps.filter(s => s.status === "done" && s.id !== "llm").length;

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4">
      {/* Query */}
      <div className="text-center mb-1">
        <span className="text-xs text-zinc-500">Win Rate for</span>
        <span className="text-sm font-semibold text-zinc-200 ml-1">{query || "..."}</span>
      </div>

      {/* Gauge */}
      <div className="flex justify-center">
        <svg width="240" height="150" viewBox="0 0 240 150">
          <defs>
            <linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="ng">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Background arc */}
          <path d={arc(sa, ea)} fill="none" stroke="#27272a" strokeWidth={sw} strokeLinecap="round" />

          {/* Filled arc */}
          {effectiveValue > 0 && (
            <path d={arc(sa, sa + (effectiveValue / 100) * ta)} fill="none" stroke="url(#gg)" strokeWidth={sw} strokeLinecap="round" />
          )}

          {/* Ticks */}
          {ticks.map((tick) => {
            const a = sa + (tick / 100) * ta;
            const or2 = r + sw / 2 + 2;
            const lr = r + sw / 2 + 14;
            const o = { x: cx + or2 * Math.cos((a * Math.PI) / 180), y: cy + or2 * Math.sin((a * Math.PI) / 180) };
            const l = { x: cx + lr * Math.cos((a * Math.PI) / 180), y: cy + lr * Math.sin((a * Math.PI) / 180) };
            return (
              <g key={tick}>
                <circle cx={o.x} cy={o.y} r={1.5} fill="#52525b" />
                <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-600" fontSize="8" fontFamily="monospace">{tick}</text>
              </g>
            );
          })}

          {/* Needle */}
          <line
            x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y}
            stroke={needleColor} strokeWidth={2.5} strokeLinecap="round"
            filter={isLLMRunning ? "url(#ng)" : undefined}
          />
          <circle cx={cx} cy={cy} r={5} fill="#18181b" stroke="#3f3f46" strokeWidth={2} />

          {/* Score number — positioned below the needle pivot, above the bottom */}
          <text
            x={cx} y={cy + 30}
            textAnchor="middle" dominantBaseline="middle"
            className={`font-bold ${
              !hasAnyValue && !loading ? "fill-zinc-600" :
              displayValue < 40 ? "fill-red-400" : displayValue < 60 ? "fill-yellow-400" : "fill-emerald-400"
            }`}
            fontSize="32"
            fontFamily="system-ui"
          >
            {hasAnyValue ? displayValue : loading ? "—" : "0"}
          </text>
        </svg>
      </div>

      {/* Label below gauge — only show sentiment label after final result */}
      <div className="text-center mt-1">
        {isFinal && (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            value < 40
              ? "bg-red-500/15 text-red-400"
              : value < 60
                ? "bg-yellow-500/15 text-yellow-400"
                : "bg-emerald-500/15 text-emerald-400"
          }`}>
            {getLabel(value)}
          </span>
        )}
      </div>

      {/* Source progress dots — only during loading */}
      {loading && !isFinal && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                i < doneCount ? "bg-emerald-400 scale-100" : "bg-zinc-700 scale-75"
              }`}
            />
          ))}
          <span className="text-[10px] text-zinc-600 ml-1">{doneCount}/4 sources</span>
        </div>
      )}
    </div>
  );
}
