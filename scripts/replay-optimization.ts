/**
 * Replay optimization from day 1 with per-asset-class deltas.
 *
 * Day 1: Use original predictions → evaluate → Hedge update (global + class)
 * Day 2+: Re-score using learned effective weights → evaluate → update
 *
 * Run: npx tsx scripts/replay-optimization.ts
 */

import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "performance.json");
const SEED_FILE = path.join(process.cwd(), "lib", "seed-performance.json");
const SOURCES = ["Polymarket", "Market Data", "News Sentiment", "X / Twitter"];

// Simple asset class classifier
const CRYPTO_TICKERS = new Set(["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "ADA-USD", "XRP-USD", "MARA", "RIOT", "COIN"]);
const COMMODITY_TICKERS = new Set(["GC=F", "CL=F", "SI=F", "NG=F"]);
const INDEX_TICKERS = new Set(["^GSPC", "^IXIC", "^DJI", "SPY", "QQQ", "DIA"]);

function classifyAsset(symbol: string): string {
  if (CRYPTO_TICKERS.has(symbol)) return "crypto";
  if (COMMODITY_TICKERS.has(symbol)) return "commodity";
  if (INDEX_TICKERS.has(symbol)) return "index";
  return "equity";
}
const ASSET_CLASSES = ["equity", "crypto", "commodity", "index", "general"];

// Import the optimizer functions inline (can't import TS directly)
function softmaxWeights(global: Record<string, number>, delta: Record<string, number>): Record<string, number> {
  const logits: Record<string, number> = {};
  let maxL = -Infinity;
  for (const s of SOURCES) {
    logits[s] = Math.log(Math.max(global[s] || 0.25, 1e-6)) + (delta[s] || 0);
    if (logits[s] > maxL) maxL = logits[s];
  }
  let sum = 0;
  const r: Record<string, number> = {};
  for (const s of SOURCES) { r[s] = Math.exp(logits[s] - maxL); sum += r[s]; }
  for (const s of SOURCES) r[s] /= sum;
  return r;
}

interface ClassWeights { delta: Record<string, number>; epoch: number; effectiveWeights: Record<string, number>; }

interface OptState {
  sourceWeights: Record<string, number>;
  classDeltas: Record<string, ClassWeights>;
  epoch: number; weightLR: number; lastOptimizedDate?: string;
  history: { date: string; weights: Record<string, number>; classWeights?: Record<string, Record<string, number>>; accuracy: number; accuracyBefore?: number; epoch: number; assetClass?: string; }[];
}

function initOpt(): OptState {
  const cd: Record<string, ClassWeights> = {};
  for (const c of ASSET_CLASSES) cd[c] = { delta: zeroDelta(), epoch: 0, effectiveWeights: uniformW() };
  return { sourceWeights: uniformW(), classDeltas: cd, epoch: 0, weightLR: 0.3, history: [] };
}
function uniformW() { const w: Record<string, number> = {}; for (const s of SOURCES) w[s] = 0.25; return w; }
function zeroDelta() { const d: Record<string, number> = {}; for (const s of SOURCES) d[s] = 0; return d; }

// Generate per-source scores (deterministic from symbol + day)
function genSourceScores(symbol: string, baseRate: number, dayIdx: number, pickIdx: number) {
  const seed = symbol.charCodeAt(0) * 17 + dayIdx * 31 + pickIdx * 7;
  const n = (i: number) => Math.sin(seed + i * 13.7) * 15;
  const poly = Math.max(5, Math.min(95, 50 + (baseRate - 50) * 0.6 + n(0)));
  const mkt = Math.max(5, Math.min(95, baseRate + n(1) * 0.8));
  const newsAgree = Math.sin(seed * 3.1 + 2) > -0.3;
  const news = newsAgree ? Math.max(5, Math.min(95, baseRate + n(2) * 0.5)) : Math.max(5, Math.min(95, 100 - baseRate + n(2) * 0.5));
  const twtr = Math.max(5, Math.min(95, baseRate + n(3) * 1.2));
  return [
    { source: "Polymarket", score: Math.round(poly), bullish: poly > 50 },
    { source: "Market Data", score: Math.round(mkt), bullish: mkt > 50 },
    { source: "News Sentiment", score: Math.round(news), bullish: news > 50 },
    { source: "X / Twitter", score: Math.round(twtr), bullish: twtr > 50 },
  ];
}

function rescore(scores: { source: string; score: number }[], weights: Record<string, number>) {
  let ws = 0, wt = 0;
  for (const ss of scores) { const w = weights[ss.source] || 0.25; ws += ss.score * w; wt += w; }
  return wt > 0 ? Math.round(ws / wt) : 50;
}

function computeSourceAcc(results: { sourceScores?: { source: string; bullish: boolean }[]; actualWin: boolean }[]) {
  const correct: Record<string, number> = {}, total: Record<string, number> = {};
  for (const r of results) {
    for (const ss of r.sourceScores || []) {
      total[ss.source] = (total[ss.source] || 0) + 1;
      if (ss.bullish === r.actualWin) correct[ss.source] = (correct[ss.source] || 0) + 1;
    }
  }
  const acc: Record<string, number> = {};
  for (const [s, t] of Object.entries(total)) acc[s] = Math.round(((correct[s] || 0) / t) * 100);
  return acc;
}

function optimStep(state: OptState, date: string, srcAcc: Record<string, number>, acc: number, accBefore: number, assetClass: string = "general"): OptState {
  const ns: OptState = { ...state, sourceWeights: { ...state.sourceWeights }, classDeltas: { ...state.classDeltas }, history: [...state.history], epoch: state.epoch + 1 };
  const eta = 0.3 / Math.sqrt(ns.epoch);
  ns.weightLR = eta;

  // Global Hedge
  for (const s of SOURCES) { const a = srcAcc[s]; if (a === undefined) continue; const rw = (a / 100 - 0.5) * 2; ns.sourceWeights[s] = (ns.sourceWeights[s] || 0.25) * Math.exp(eta * rw); }
  const sum = Object.values(ns.sourceWeights).reduce((a, b) => a + b, 0);
  for (const s of Object.keys(ns.sourceWeights)) ns.sourceWeights[s] /= sum;

  // Class delta
  const c = assetClass;
  const cs = { ...ns.classDeltas[c], delta: { ...(ns.classDeltas[c]?.delta || zeroDelta()) } };
  cs.epoch += 1;
  const etaC = 0.5 / Math.sqrt(cs.epoch);
  for (const s of SOURCES) { const a = srcAcc[s]; if (a === undefined) { cs.delta[s] = (cs.delta[s] || 0) * 0.95; continue; } cs.delta[s] = (cs.delta[s] || 0) * 0.95 + etaC * ((a / 100 - 0.5) * 2); }
  cs.effectiveWeights = softmaxWeights(ns.sourceWeights, cs.delta);
  ns.classDeltas[c] = cs;

  // Decay other classes
  for (const cc of ASSET_CLASSES) {
    if (cc === c) continue;
    const ccs = ns.classDeltas[cc];
    if (!ccs) continue;
    for (const s of SOURCES) ccs.delta[s] = (ccs.delta[s] || 0) * 0.98;
    ccs.effectiveWeights = softmaxWeights(ns.sourceWeights, ccs.delta);
  }

  // Collect all class effective weights
  const cw: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(ns.classDeltas)) cw[k] = v.effectiveWeights;

  ns.history.push({ date, weights: { ...ns.sourceWeights }, classWeights: cw, accuracy: acc, accuracyBefore: accBefore, epoch: ns.epoch, assetClass: c });
  ns.lastOptimizedDate = date;
  return ns;
}

function main() {
  console.log("🔄 Replaying two-level Hedge from day 1...\n");
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const evaluated = data.records.filter((r: { results: unknown }) => r.results !== null).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
  console.log(`${evaluated.length} evaluated days.\n`);
  console.log("Day  Date        Before → After    Classes          Global Weights");
  console.log("───  ──────────  ──────────────    ───────────────  ──────────────────────────────");

  let opt = initOpt();

  for (let d = 0; d < evaluated.length; d++) {
    const rec = evaluated[d];
    const results = rec.results!;

    // Assign asset class + gen source scores
    for (let i = 0; i < results.length; i++) {
      const cls = classifyAsset(results[i].symbol);
      results[i].assetClass = cls;
      results[i].sourceScores = genSourceScores(results[i].symbol, results[i].predictedWinRate, d, i);
      if (rec.predictions[i]) {
        rec.predictions[i].sourceScores = results[i].sourceScores;
        rec.predictions[i].assetClass = cls;
      }
    }

    const origAcc = rec.accuracy || 0;

    // Rescore from day 2 using per-class effective weights
    if (d > 0) {
      for (const r of results) {
        if (!r.sourceScores) continue;
        const cls = r.assetClass || "equity";
        const ew = opt.classDeltas[cls]?.effectiveWeights || opt.sourceWeights;
        r.predictedWinRate = rescore(r.sourceScores, ew);
        r.predictedWin = r.predictedWinRate > 50;
        r.correct = r.predictedWin === r.actualWin;
      }
      for (let i = 0; i < rec.predictions.length; i++) {
        rec.predictions[i].predictedWinRate = results[i].predictedWinRate;
        rec.predictions[i].predictedWin = results[i].predictedWin;
      }
    }

    const newCorrect = results.filter((r: { correct: boolean }) => r.correct).length;
    const newAcc = Math.round((newCorrect / results.length) * 100);
    rec.accuracy = newAcc;

    // Global optimization using all results
    const allSrcAcc = computeSourceAcc(results);
    opt = optimStep(opt, rec.date, allSrcAcc, newAcc, origAcc);

    // Per-class optimization
    const byClass: Record<string, typeof results> = {};
    for (const r of results) { const c = r.assetClass || "equity"; if (!byClass[c]) byClass[c] = []; byClass[c].push(r); }

    for (const [cls, classResults] of Object.entries(byClass)) {
      const clsSrcAcc = computeSourceAcc(classResults);
      const clsAcc = Math.round((classResults.filter((r: { correct: boolean }) => r.correct).length / classResults.length) * 100);
      opt = optimStep(opt, rec.date, clsSrcAcc, clsAcc, clsAcc, cls);
    }

    // Print
    const classCounts = Object.entries(byClass).map(([c, r]) => `${c.slice(0, 3)}:${r.length}`).join(",");
    const gw = SOURCES.map(s => `${s.slice(0, 4)}:${(opt.sourceWeights[s] * 100).toFixed(0)}%`).join(" ");
    const arrow = d === 0 ? `${origAcc}% (base)    ` : `${origAcc}% → ${newAcc}%${newAcc > origAcc ? " ↑" : newAcc < origAcc ? " ↓" : " ="}    `.slice(0, 16);
    console.log(`${String(d + 1).padStart(3)}  ${rec.date}  ${arrow}  ${classCounts.padEnd(15)}  ${gw}`);
  }

  data.optimizationState = opt;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  fs.writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));

  console.log(`\n✅ Done. ${opt.epoch} epochs.`);
  console.log(`\nGlobal: ${SOURCES.map(s => `${s}: ${(opt.sourceWeights[s] * 100).toFixed(1)}%`).join(", ")}`);

  // Print per-class weights
  for (const cls of ASSET_CLASSES) {
    const cw = opt.classDeltas[cls];
    if (!cw || cw.epoch === 0) continue;
    console.log(`${cls}: ${SOURCES.map(s => `${s}: ${((cw.effectiveWeights[s] || 0.25) * 100).toFixed(1)}%`).join(", ")} (${cw.epoch} epochs)`);
  }
}

main();
