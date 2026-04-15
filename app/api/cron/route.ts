import { NextRequest, NextResponse } from "next/server";
import {
  loadPerformance,
  savePerformance,
  persistToGitHub,
  getTodayDate,
  DailyPrediction,
  DailyResult,
  DailyRecord,
} from "@/lib/performance";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generatePostmortem, synthesizeLearnings } from "@/lib/postmortem";
import { initOptimizationState, optimizationStep } from "@/lib/optimizer";

// Verify cron secret to prevent unauthorized calls
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return false;
  return true;
}

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
}

async function fetchTrendingSymbols(): Promise<{ symbol: string; name: string; price: number }[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=30",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
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
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

interface BatchPrediction {
  symbol: string;
  winRate: number;
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
    const prompt = `You are a quantitative analyst. For each asset, predict the probability (0-100) that tomorrow's closing price will be higher than today's.

For each asset, also estimate what each data source would signal (0-100):
- Polymarket: based on prediction market sentiment for this asset/sector
- Market Data: based on recent price momentum and trend
- News Sentiment: based on recent news tone for this asset
- X / Twitter: based on social media sentiment

Assets:
${assetList}

Return JSON array:
[{"symbol": "NVDA", "winRate": 55, "sourceScores": [{"source": "Polymarket", "score": 45}, {"source": "Market Data", "score": 62}, {"source": "News Sentiment", "score": 58}, {"source": "X / Twitter", "score": 50}]}]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch {
    return assets.map((a) => ({
      symbol: a.symbol,
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
      symbol: asset.symbol, name: asset.name,
      predictedWinRate: winRate, predictedWin: winRate > 50,
      priceAtPrediction: asset.price,
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

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perf = loadPerformance();
  const today = getTodayDate();
  const log: string[] = [];

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

  // 2. Evaluate any other unevaluated past records (skip future predictions)
  for (const record of perf.records) {
    if (record.date === today) continue; // already handled in step 1
    if (record.date > today) continue; // future — don't evaluate yet
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

  // 3. Generate postmortem for evaluated records that don't have one
  for (const record of perf.records) {
    if (!record.results || record.postmortem) continue;
    try {
      record.postmortem = await generatePostmortem(record);
      if (record.postmortem) log.push(`Postmortem for ${record.date}: ${record.postmortem.slice(0, 80)}...`);
    } catch (err) {
      log.push(`Postmortem failed for ${record.date}: ${err}`);
    }
  }

  // 4. Synthesize accumulated learnings from recent postmortems
  try {
    const newLearnings = await synthesizeLearnings(perf);
    if (newLearnings) {
      perf.learnings = newLearnings;
      log.push(`Learnings updated: ${newLearnings.slice(0, 80)}...`);
    }
  } catch (err) {
    log.push(`Learning synthesis failed: ${err}`);
  }

  // 5. Run optimization step on all newly evaluated records
  const optState = perf.optimizationState || initOptimizationState();
  const newlyEvaluated = perf.records.filter(
    (r) => r.results !== null && r.date <= today
  ).sort((a, b) => a.date.localeCompare(b.date));

  // Only run optimization on the most recent evaluated day (avoid re-processing)
  const latestEvaluated = newlyEvaluated[newlyEvaluated.length - 1];
  if (latestEvaluated?.results && latestEvaluated.date !== perf.optimizationState?.lastOptimizedDate) {
    const results = latestEvaluated.results;

    // Compute per-source accuracy: for each source, how often was its bullish/bearish call correct?
    const sourceCorrect: Record<string, number> = {};
    const sourceTotal: Record<string, number> = {};
    for (const r of results) {
      if (!r.sourceScores) continue;
      for (const ss of r.sourceScores) {
        sourceTotal[ss.source] = (sourceTotal[ss.source] || 0) + 1;
        if (ss.bullish === r.actualWin) {
          sourceCorrect[ss.source] = (sourceCorrect[ss.source] || 0) + 1;
        }
      }
    }
    // Convert to 0-100 accuracy scores
    const sourceAccuracyScores: Record<string, number> = {};
    for (const [source, total] of Object.entries(sourceTotal)) {
      sourceAccuracyScores[source] = Math.round(((sourceCorrect[source] || 0) / total) * 100);
    }

    const { state: updatedOpt, report } = optimizationStep(optState, {
      date: latestEvaluated.date,
      sourceAccuracy: sourceAccuracyScores,
      accuracy: latestEvaluated.accuracy || 50,
      assetClass: "general", // daily picks are mixed asset classes
    });
    updatedOpt.lastOptimizedDate = latestEvaluated.date;
    perf.optimizationState = updatedOpt;
    log.push(`Optimization: ${report}`);
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

  // 6. Save locally
  savePerformance(perf);

  // 7. Persist to GitHub
  const pushed = await persistToGitHub(perf);
  log.push(pushed ? "Persisted to GitHub" : "GitHub persistence skipped/failed");

  return NextResponse.json({ ok: true, log, recordCount: perf.records.length });
}
