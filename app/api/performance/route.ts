import { NextResponse } from "next/server";
import {
  loadPerformance,
  savePerformance,
  getTodayDate,
  DailyPrediction,
  DailyResult,
  DailyRecord,
} from "@/lib/performance";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

// --- Fetch trending tickers ---
async function fetchTrendingSymbols(): Promise<{ symbol: string; name: string; price: number }[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=30",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    return quotes.map((q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.shortName as string) || (q.symbol as string),
      price: (q.regularMarketPrice as number) || 0,
    }));
  } catch {
    return [];
  }
}

// --- Quick price check ---
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

// --- LLM batch prediction ---
async function predictBatch(
  assets: { symbol: string; name: string; price: number }[]
): Promise<{ symbol: string; winRate: number }[]> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const assetList = assets
      .map((a) => `- ${a.symbol} (${a.name}) at $${a.price.toFixed(2)}`)
      .join("\n");

    const prompt = `You are a quantitative analyst making daily stock predictions. For each asset below, predict the probability (0-100) that its closing price TOMORROW will be higher than today's current price.

Consider: recent momentum, market conditions, sector trends, and any known catalysts.

Assets:
${assetList}

Return a JSON array of objects with "symbol" and "winRate" (integer 0-100):
[{"symbol": "NVDA", "winRate": 55}, {"symbol": "TSLA", "winRate": 42}]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Batch prediction failed:", err);
    // Fallback: random-ish predictions based on nothing
    return assets.map((a) => ({ symbol: a.symbol, winRate: 50 }));
  }
}

// --- Generate today's predictions ---
async function generatePredictions(): Promise<DailyPrediction[]> {
  const trending = await fetchTrendingSymbols();
  if (trending.length === 0) return [];

  // Randomly pick 10
  const shuffled = trending.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 10);

  // Get LLM predictions
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
    };
  });
}

// --- Evaluate a past record ---
async function evaluateRecord(record: DailyRecord): Promise<DailyResult[]> {
  const results: DailyResult[] = [];

  for (const pred of record.predictions) {
    const currentPrice = await fetchCurrentPrice(pred.symbol);
    if (currentPrice === null) {
      // Can't evaluate, assume neutral
      results.push({
        ...pred,
        priceAtClose: pred.priceAtPrediction,
        actualWin: false,
        correct: !pred.predictedWin, // if we predicted lose and price didn't change, count as correct
      });
      continue;
    }

    const actualWin = currentPrice > pred.priceAtPrediction;
    results.push({
      ...pred,
      priceAtClose: currentPrice,
      actualWin,
      correct: pred.predictedWin === actualWin,
    });
  }

  return results;
}

export async function GET() {
  const perf = loadPerformance();
  const today = getTodayDate();

  // Check if today's predictions exist
  const todayRecord = perf.records.find((r) => r.date === today);

  if (!todayRecord) {
    // Generate today's predictions
    try {
      const predictions = await generatePredictions();
      if (predictions.length > 0) {
        const newRecord: DailyRecord = {
          date: today,
          predictions,
          results: null,
          accuracy: null,
        };
        perf.records.push(newRecord);
      }
    } catch (err) {
      console.error("Failed to generate predictions:", err);
    }
  }

  // Evaluate any unevaluated past records (not today)
  for (const record of perf.records) {
    if (record.date === today) continue; // don't evaluate today
    if (record.results !== null) continue; // already evaluated

    try {
      const results = await evaluateRecord(record);
      record.results = results;
      record.accuracy =
        results.length > 0
          ? Math.round((results.filter((r) => r.correct).length / results.length) * 100)
          : null;
    } catch (err) {
      console.error(`Failed to evaluate ${record.date}:`, err);
    }
  }

  // Save
  savePerformance(perf);

  // Sort by date descending
  const sorted = [...perf.records].sort((a, b) => b.date.localeCompare(a.date));

  // Compute overall stats
  const evaluated = sorted.filter((r) => r.results !== null);
  const totalPredictions = evaluated.reduce((s, r) => s + (r.results?.length || 0), 0);
  const totalCorrect = evaluated.reduce(
    (s, r) => s + (r.results?.filter((x) => x.correct).length || 0),
    0
  );
  const overallAccuracy = totalPredictions > 0 ? Math.round((totalCorrect / totalPredictions) * 100) : null;

  return NextResponse.json({
    records: sorted,
    stats: {
      totalDays: evaluated.length,
      totalPredictions,
      totalCorrect,
      overallAccuracy,
    },
  });
}
