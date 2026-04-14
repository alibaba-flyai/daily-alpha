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

async function predictBatch(
  assets: { symbol: string; name: string; price: number }[]
): Promise<{ symbol: string; winRate: number }[]> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const assetList = assets.map((a) => `- ${a.symbol} (${a.name}) at $${a.price.toFixed(2)}`).join("\n");
    const prompt = `You are a quantitative analyst. For each asset, predict the probability (0-100) that tomorrow's closing price will be higher than today's.

Assets:
${assetList}

Return JSON array: [{"symbol": "NVDA", "winRate": 55}]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch {
    return assets.map((a) => ({ symbol: a.symbol, winRate: 50 }));
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

  // 3. Generate today's predictions if missing
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

  // 4. Save locally
  savePerformance(perf);

  // 5. Persist to GitHub
  const pushed = await persistToGitHub(perf);
  log.push(pushed ? "Persisted to GitHub" : "GitHub persistence skipped/failed");

  return NextResponse.json({ ok: true, log, recordCount: perf.records.length });
}
