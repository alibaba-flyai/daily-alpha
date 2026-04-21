/**
 * Backfill missing days by replaying the cron logic with historical prices.
 * Predictions are generated WITHOUT seeing actual outcomes — Gemini only
 * gets the opening price for that day, same as a live run would.
 *
 * Usage: GEMINI_API_KEY=... npx tsx scripts/backfill.ts
 */

import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generatePostmortem, synthesizeLearnings } from "../lib/postmortem";
import { initOptimizationState, optimizationStep } from "../lib/optimizer";
import type {
  PerformanceData,
  DailyPrediction,
  DailyResult,
  DailyRecord,
} from "../lib/performance";

const SEED_FILE = path.join(process.cwd(), "lib", "seed-performance.json");
const DATA_FILE = path.join(process.cwd(), "data", "performance.json");

const MISSING_DATES = ["2026-04-16", "2026-04-17", "2026-04-18"];

function loadPerformance(): PerformanceData {
  for (const f of [DATA_FILE, SEED_FILE]) {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
    } catch { /* skip */ }
  }
  return { records: [] };
}

function savePerformance(data: PerformanceData): void {
  fs.writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
}

// --- Yahoo Finance: fetch historical OHLC for a date range ---

interface DayPrice {
  open: number;
  close: number;
}

async function fetchHistoricalPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<Record<string, DayPrice>> {
  // Yahoo chart API with period1/period2 as unix timestamps
  const start = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000);
  const end = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${end}&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return {};

    const timestamps: number[] = result.timestamp || [];
    const opens: number[] = result.indicators?.quote?.[0]?.open || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];

    const prices: Record<string, DayPrice> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
      if (opens[i] != null && closes[i] != null) {
        prices[date] = { open: opens[i], close: closes[i] };
      }
    }
    return prices;
  } catch {
    return {};
  }
}

// --- Get a pool of active symbols from adjacent days' records ---

function getSymbolPool(perf: PerformanceData): { symbol: string; name: string }[] {
  const seen = new Set<string>();
  const pool: { symbol: string; name: string }[] = [];

  // Gather symbols from existing records
  for (const record of perf.records) {
    for (const pred of record.predictions) {
      if (!seen.has(pred.symbol)) {
        seen.add(pred.symbol);
        pool.push({ symbol: pred.symbol, name: pred.name });
      }
    }
  }
  return pool;
}

// --- Prediction: Gemini sees only the open price, NOT the close ---

interface BatchPrediction {
  symbol: string;
  winRate: number;
  assetClass: string;
  sourceScores: { source: string; score: number }[];
}

async function predictBatchForDate(
  date: string,
  assets: { symbol: string; name: string; openPrice: number }[]
): Promise<BatchPrediction[]> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const assetList = assets.map((a) => `- ${a.symbol} (${a.name}) at $${a.openPrice.toFixed(2)}`).join("\n");

    // IMPORTANT: prompt only shows the opening price, not the close.
    // The date is included so the LLM can reason about day-of-week, macro context, etc.
    const prompt = `You are a quantitative analyst. Today is ${date} (market open). For each asset:
1. Classify its asset class: "equity", "crypto", "commodity", or "index"
2. Predict probability (0-100) that today's closing price > the opening price shown
3. Estimate what each data source would signal (0-100)

You must predict based on general market knowledge up to ${date}. Do NOT use any information from after this date.

Assets (with opening prices):
${assetList}

Return JSON array:
[{"symbol": "NVDA", "assetClass": "equity", "winRate": 55, "sourceScores": [{"source": "Polymarket", "score": 45}, {"source": "Market Data", "score": 62}, {"source": "News Sentiment", "score": 58}, {"source": "X / Twitter", "score": 50}]}]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch (err) {
    console.error(`  Prediction failed for ${date}:`, err);
    return assets.map((a) => ({
      symbol: a.symbol,
      assetClass: "equity",
      winRate: 50,
      sourceScores: [
        { source: "Polymarket", score: 50 },
        { source: "Market Data", score: 50 },
        { source: "News Sentiment", score: 50 },
        { source: "X / Twitter", score: 50 },
      ],
    }));
  }
}

// --- Main ---

async function main() {
  const perf = loadPerformance();
  const symbolPool = getSymbolPool(perf);

  console.log(`[backfill] ${symbolPool.length} symbols in pool, backfilling ${MISSING_DATES.length} days`);

  // Fetch historical prices for all symbols across the date range
  const allStart = MISSING_DATES[0];
  const allEnd = MISSING_DATES[MISSING_DATES.length - 1];

  console.log(`[backfill] Fetching historical prices ${allStart} to ${allEnd}...`);
  const priceCache: Record<string, Record<string, DayPrice>> = {};
  for (const { symbol } of symbolPool) {
    priceCache[symbol] = await fetchHistoricalPrices(symbol, allStart, allEnd);
    // Rate-limit Yahoo
    await new Promise((r) => setTimeout(r, 200));
  }

  for (const date of MISSING_DATES) {
    // Skip if already exists
    if (perf.records.some((r) => r.date === date)) {
      console.log(`[backfill] ${date} already exists, skipping`);
      continue;
    }

    console.log(`\n[backfill] === ${date} ===`);

    // Pick 10 random symbols that have prices for this date
    const available = symbolPool.filter((s) => priceCache[s.symbol]?.[date]);
    if (available.length === 0) {
      console.log(`[backfill] No price data for ${date}, skipping (market closed?)`);
      continue;
    }

    const picked = available.sort(() => Math.random() - 0.5).slice(0, 10);
    const assetsWithOpen = picked.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      openPrice: priceCache[s.symbol][date].open,
    }));

    // Step 1: Generate predictions (LLM only sees open price)
    console.log(`[backfill] Predicting ${picked.length} assets...`);
    const batchPreds = await predictBatchForDate(date, assetsWithOpen);

    const predictions: DailyPrediction[] = picked.map((asset) => {
      const pred = batchPreds.find((p) => p.symbol === asset.symbol);
      const winRate = pred?.winRate ?? 50;
      return {
        symbol: asset.symbol,
        name: asset.name,
        predictedWinRate: winRate,
        predictedWin: winRate > 50,
        priceAtPrediction: priceCache[asset.symbol][date].open,
        assetClass: pred?.assetClass || "equity",
        sourceScores: (pred?.sourceScores || []).map((s) => ({
          source: s.source,
          score: s.score,
          bullish: s.score > 50,
        })),
      };
    });

    // Step 2: Evaluate against actual close prices
    console.log(`[backfill] Evaluating against close prices...`);
    const results: DailyResult[] = predictions.map((pred) => {
      const closePrice = priceCache[pred.symbol]?.[date]?.close ?? pred.priceAtPrediction;
      const actualWin = closePrice > pred.priceAtPrediction;
      return {
        ...pred,
        priceAtClose: closePrice,
        actualWin,
        correct: pred.predictedWin === actualWin,
      };
    });

    const accuracy = results.length > 0
      ? Math.round((results.filter((r) => r.correct).length / results.length) * 100)
      : null;

    const record: DailyRecord = { date, predictions, results, accuracy };

    // Step 3: Postmortem
    try {
      record.postmortem = await generatePostmortem(record);
      if (record.postmortem) console.log(`[backfill] Postmortem generated`);
    } catch (err) {
      console.log(`[backfill] Postmortem failed: ${err}`);
    }

    // Insert in sorted order
    perf.records.push(record);
    perf.records.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[backfill] ${date}: ${accuracy}% accuracy (${results.filter(r => r.correct).length}/${results.length})`);
  }

  // Run learnings synthesis and optimization over the full dataset
  console.log(`\n[backfill] Synthesizing learnings...`);
  try {
    const newLearnings = await synthesizeLearnings(perf);
    if (newLearnings) perf.learnings = newLearnings;
  } catch (err) {
    console.log(`[backfill] Learning synthesis failed: ${err}`);
  }

  // Re-run optimization for newly added days
  console.log(`[backfill] Running optimization...`);
  let optState = perf.optimizationState || initOptimizationState();

  for (const date of MISSING_DATES) {
    const record = perf.records.find((r) => r.date === date);
    if (!record?.results) continue;

    const results = record.results;
    const byClass: Record<string, typeof results> = {};
    for (const r of results) {
      const cls = r.assetClass || "equity";
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(r);
    }

    const sourceCorrect: Record<string, number> = {};
    const sourceTotal: Record<string, number> = {};
    for (const r of results) {
      if (!r.sourceScores) continue;
      for (const ss of r.sourceScores) {
        sourceTotal[ss.source] = (sourceTotal[ss.source] || 0) + 1;
        if (ss.bullish === r.actualWin) sourceCorrect[ss.source] = (sourceCorrect[ss.source] || 0) + 1;
      }
    }
    const globalAccuracy: Record<string, number> = {};
    for (const [source, total] of Object.entries(sourceTotal)) {
      globalAccuracy[source] = Math.round(((sourceCorrect[source] || 0) / total) * 100);
    }

    const { state: globalOpt } = optimizationStep(optState, {
      date, sourceAccuracy: globalAccuracy, accuracy: record.accuracy || 50,
    });
    optState = globalOpt;

    for (const [cls, classResults] of Object.entries(byClass)) {
      const clsCorrect: Record<string, number> = {};
      const clsTotal: Record<string, number> = {};
      for (const r of classResults) {
        if (!r.sourceScores) continue;
        for (const ss of r.sourceScores) {
          clsTotal[ss.source] = (clsTotal[ss.source] || 0) + 1;
          if (ss.bullish === r.actualWin) clsCorrect[ss.source] = (clsCorrect[ss.source] || 0) + 1;
        }
      }
      const clsAccuracy: Record<string, number> = {};
      for (const [source, total] of Object.entries(clsTotal)) {
        clsAccuracy[source] = Math.round(((clsCorrect[source] || 0) / total) * 100);
      }
      const clsAcc = Math.round((classResults.filter((r) => r.correct).length / classResults.length) * 100);
      const { state: clsOpt } = optimizationStep(optState, {
        date, sourceAccuracy: clsAccuracy, accuracy: clsAcc, assetClass: cls,
      });
      optState = clsOpt;
    }

    optState.lastOptimizedDate = date;
  }
  perf.optimizationState = optState;

  // Save
  savePerformance(perf);
  console.log(`\n[backfill] Done. Total records: ${perf.records.length}`);
  console.log(`[backfill] Dates: ${perf.records.map(r => r.date).join(', ')}`);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
