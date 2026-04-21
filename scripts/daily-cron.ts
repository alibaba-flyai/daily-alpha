/**
 * Standalone daily cron script — runs in GitHub Actions instead of Vercel.
 * Mirrors the logic from app/api/cron/route.ts but writes directly to
 * lib/seed-performance.json and commits via git.
 *
 * Required env vars: GEMINI_API_KEY
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

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function loadPerformance(): PerformanceData {
  // Prefer data/performance.json (local dev), fall back to seed
  for (const f of [DATA_FILE, SEED_FILE]) {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
    } catch { /* skip */ }
  }
  return { records: [] };
}

function savePerformance(data: PerformanceData): void {
  // Write to both seed (bundled into deploy) and data/ (local)
  fs.writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Yahoo Finance helpers ---

async function fetchTrendingSymbols(): Promise<{ symbol: string; name: string; price: number }[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=30",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.finance?.result?.[0]?.quotes || []).map((q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.shortName as string) || (q.symbol as string),
      price: (q.regularMarketPrice as number) || 0,
    }));
  } catch {
    return [];
  }
}

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

// --- Gemini prediction ---

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
}

interface BatchPrediction {
  symbol: string;
  winRate: number;
  assetClass: string;
  sourceScores: { source: string; score: number }[];
}

async function predictBatch(
  assets: { symbol: string; name: string; price: number }[]
): Promise<BatchPrediction[]> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const assetList = assets.map((a) => `- ${a.symbol} (${a.name}) at $${a.price.toFixed(2)}`).join("\n");
    const prompt = `You are a quantitative analyst. For each asset:
1. Classify its asset class: "equity", "crypto", "commodity", or "index"
2. Predict probability (0-100) that tomorrow's closing price > today's
3. Estimate what each data source would signal (0-100)

Assets:
${assetList}

Return JSON array:
[{"symbol": "NVDA", "assetClass": "equity", "winRate": 55, "sourceScores": [{"source": "Polymarket", "score": 45}, {"source": "Market Data", "score": 62}, {"source": "News Sentiment", "score": 58}, {"source": "X / Twitter", "score": 50}]}]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch {
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

async function generatePredictions(): Promise<DailyPrediction[]> {
  const trending = await fetchTrendingSymbols();
  if (trending.length === 0) return [];
  const picked = trending.sort(() => Math.random() - 0.5).slice(0, 10);
  const predictions = await predictBatch(picked);

  return picked.map((asset) => {
    const pred = predictions.find((p) => p.symbol === asset.symbol);
    const winRate = pred?.winRate ?? 50;
    return {
      symbol: asset.symbol,
      name: asset.name,
      predictedWinRate: winRate,
      predictedWin: winRate > 50,
      priceAtPrediction: asset.price,
      assetClass: pred?.assetClass || "equity",
      sourceScores: (pred?.sourceScores || []).map((s) => ({
        source: s.source,
        score: s.score,
        bullish: s.score > 50,
      })),
    };
  });
}

async function evaluateRecord(record: DailyRecord): Promise<DailyResult[]> {
  const results: DailyResult[] = [];
  for (const pred of record.predictions) {
    const currentPrice = await fetchCurrentPrice(pred.symbol);
    const actualWin = currentPrice !== null ? currentPrice > pred.priceAtPrediction : false;
    results.push({
      ...pred,
      priceAtClose: currentPrice ?? pred.priceAtPrediction,
      actualWin,
      correct: currentPrice !== null ? pred.predictedWin === actualWin : !pred.predictedWin,
    });
  }
  return results;
}

// --- Main ---

async function main() {
  const log: string[] = [];
  const perf = loadPerformance();
  const today = getTodayDate();

  console.log(`[cron] Starting daily run for ${today}, ${perf.records.length} existing records`);

  // 1. Evaluate today's predictions (market just closed)
  const todayRecord = perf.records.find((r) => r.date === today);
  if (todayRecord && !todayRecord.results) {
    try {
      const results = await evaluateRecord(todayRecord);
      todayRecord.results = results;
      todayRecord.accuracy = results.length > 0
        ? Math.round((results.filter((r) => r.correct).length / results.length) * 100)
        : null;
      log.push(`Evaluated ${today}: ${todayRecord.accuracy}% accuracy`);
    } catch (err) {
      log.push(`Failed to evaluate ${today}: ${err}`);
    }
  }

  // 2. Evaluate any other unevaluated past records
  for (const record of perf.records) {
    if (record.date === today) continue;
    if (record.date > today) continue;
    if (record.results !== null) continue;
    try {
      const results = await evaluateRecord(record);
      record.results = results;
      record.accuracy = results.length > 0
        ? Math.round((results.filter((r) => r.correct).length / results.length) * 100)
        : null;
      log.push(`Evaluated ${record.date}: ${record.accuracy}%`);
    } catch (err) {
      log.push(`Failed to evaluate ${record.date}: ${err}`);
    }
  }

  // 3. Generate postmortems
  for (const record of perf.records) {
    if (!record.results || record.postmortem) continue;
    try {
      record.postmortem = await generatePostmortem(record);
      if (record.postmortem) log.push(`Postmortem for ${record.date}`);
    } catch (err) {
      log.push(`Postmortem failed for ${record.date}: ${err}`);
    }
  }

  // 4. Synthesize learnings
  try {
    const newLearnings = await synthesizeLearnings(perf);
    if (newLearnings) {
      perf.learnings = newLearnings;
      log.push(`Learnings updated`);
    }
  } catch (err) {
    log.push(`Learning synthesis failed: ${err}`);
  }

  // 5. Optimization step
  const optState = perf.optimizationState || initOptimizationState();
  const newlyEvaluated = perf.records
    .filter((r) => r.results !== null && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestEvaluated = newlyEvaluated[newlyEvaluated.length - 1];
  if (latestEvaluated?.results && latestEvaluated.date !== perf.optimizationState?.lastOptimizedDate) {
    const results = latestEvaluated.results;

    const byClass: Record<string, typeof results> = {};
    for (const r of results) {
      const cls = r.assetClass || "equity";
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(r);
    }

    // Global source accuracy
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

    // Global Hedge update
    let currentOpt = optState;
    const { state: globalOpt, report: globalReport } = optimizationStep(currentOpt, {
      date: latestEvaluated.date,
      sourceAccuracy: globalAccuracy,
      accuracy: latestEvaluated.accuracy || 50,
    });
    currentOpt = globalOpt;
    log.push(`Global: ${globalReport}`);

    // Per-class delta updates
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
      const { state: clsOpt, report: clsReport } = optimizationStep(currentOpt, {
        date: latestEvaluated.date,
        sourceAccuracy: clsAccuracy,
        accuracy: clsAcc,
        assetClass: cls,
      });
      currentOpt = clsOpt;
      log.push(`${cls}: ${clsReport}`);
    }

    currentOpt.lastOptimizedDate = latestEvaluated.date;
    perf.optimizationState = currentOpt;
  }

  // 6. Generate today's predictions if missing
  if (!perf.records.some((r) => r.date === today)) {
    try {
      const predictions = await generatePredictions();
      if (predictions.length > 0) {
        perf.records.push({ date: today, predictions, results: null, accuracy: null });
        log.push(`Generated ${predictions.length} predictions for ${today}`);
      }
    } catch (err) {
      log.push(`Failed to generate predictions: ${err}`);
    }
  } else {
    log.push(`Predictions for ${today} already exist`);
  }

  // 7. Save
  savePerformance(perf);

  console.log(`[cron] Done. Log:`);
  for (const entry of log) console.log(`  - ${entry}`);
  console.log(`[cron] Total records: ${perf.records.length}`);
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err);
  process.exit(1);
});
