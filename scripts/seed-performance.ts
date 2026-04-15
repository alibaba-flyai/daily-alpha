/**
 * Seed performance data with diversified asset classes.
 * Picks from equities, crypto, commodities, and indices.
 * Fetches real historical prices, generates random predictions, evaluates.
 *
 * Run: npx tsx scripts/seed-performance.ts
 */

import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "performance.json");

interface DailyPrediction {
  symbol: string;
  name: string;
  predictedWinRate: number;
  predictedWin: boolean;
  priceAtPrediction: number;
  assetClass: string;
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

// Diversified ticker pool with asset class labels
const TICKER_POOL: { symbol: string; assetClass: string }[] = [
  // Equities (large cap)
  { symbol: "AAPL", assetClass: "equity" },
  { symbol: "MSFT", assetClass: "equity" },
  { symbol: "GOOGL", assetClass: "equity" },
  { symbol: "AMZN", assetClass: "equity" },
  { symbol: "NVDA", assetClass: "equity" },
  { symbol: "META", assetClass: "equity" },
  { symbol: "TSLA", assetClass: "equity" },
  { symbol: "JPM", assetClass: "equity" },
  { symbol: "V", assetClass: "equity" },
  { symbol: "NFLX", assetClass: "equity" },
  { symbol: "AMD", assetClass: "equity" },
  { symbol: "INTC", assetClass: "equity" },
  { symbol: "BA", assetClass: "equity" },
  { symbol: "DIS", assetClass: "equity" },
  { symbol: "PLTR", assetClass: "equity" },
  { symbol: "BABA", assetClass: "equity" },

  // Crypto
  { symbol: "BTC-USD", assetClass: "crypto" },
  { symbol: "ETH-USD", assetClass: "crypto" },
  { symbol: "SOL-USD", assetClass: "crypto" },
  { symbol: "DOGE-USD", assetClass: "crypto" },
  { symbol: "ADA-USD", assetClass: "crypto" },
  { symbol: "XRP-USD", assetClass: "crypto" },

  // Commodities
  { symbol: "GC=F", assetClass: "commodity" },
  { symbol: "CL=F", assetClass: "commodity" },
  { symbol: "SI=F", assetClass: "commodity" },

  // Indices
  { symbol: "^GSPC", assetClass: "index" },
  { symbol: "^IXIC", assetClass: "index" },
  { symbol: "^DJI", assetClass: "index" },
];

async function fetchHistoricalPrices(symbol: string): Promise<{ date: string; close: number }[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const points: { date: string; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null) {
        const d = new Date(timestamps[i] * 1000);
        points.push({ date: d.toISOString().split("T")[0], close: Math.round(closes[i]! * 100) / 100 });
      }
    }
    return points;
  } catch {
    return [];
  }
}

async function fetchName(symbol: string): Promise<string> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return symbol;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.shortName || symbol;
  } catch {
    return symbol;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log("🌱 Seeding diversified performance data...\n");

  // Pick 20 tickers ensuring diversity: 10 equity, 4 crypto, 3 commodity, 3 index
  const equities = shuffle(TICKER_POOL.filter((t) => t.assetClass === "equity")).slice(0, 10);
  const cryptos = shuffle(TICKER_POOL.filter((t) => t.assetClass === "crypto")).slice(0, 4);
  const commodities = shuffle(TICKER_POOL.filter((t) => t.assetClass === "commodity")).slice(0, 3);
  const indices = shuffle(TICKER_POOL.filter((t) => t.assetClass === "index")).slice(0, 3);
  const picked = [...equities, ...cryptos, ...commodities, ...indices];

  console.log(`Selected ${picked.length} tickers:`);
  console.log(`  Equity (${equities.length}): ${equities.map((t) => t.symbol).join(", ")}`);
  console.log(`  Crypto (${cryptos.length}): ${cryptos.map((t) => t.symbol).join(", ")}`);
  console.log(`  Commodity (${commodities.length}): ${commodities.map((t) => t.symbol).join(", ")}`);
  console.log(`  Index (${indices.length}): ${indices.map((t) => t.symbol).join(", ")}`);

  // Fetch prices and names
  console.log("\nFetching historical data...");
  const priceMap = new Map<string, { date: string; close: number }[]>();
  const nameMap = new Map<string, string>();
  const classMap = new Map<string, string>();

  await Promise.all(
    picked.map(async ({ symbol, assetClass }) => {
      const [prices, name] = await Promise.all([fetchHistoricalPrices(symbol), fetchName(symbol)]);
      priceMap.set(symbol, prices);
      nameMap.set(symbol, name);
      classMap.set(symbol, assetClass);
    })
  );

  // Find common trading dates
  let allDates: string[] = [];
  for (const [, prices] of priceMap) {
    if (prices.length > allDates.length) allDates = prices.map((p) => p.date);
  }
  const tradingDates = allDates.slice(-8); // 8 dates = 7 day-over-day pairs
  console.log(`\nTrading dates: ${tradingDates.join(", ")}`);

  if (tradingDates.length < 2) {
    console.log("❌ Not enough trading dates.");
    return;
  }

  const records: DailyRecord[] = [];

  for (let i = 0; i < tradingDates.length - 1; i++) {
    const predDate = tradingDates[i];
    const resultDate = tradingDates[i + 1];

    // Pick 10 tickers for this day: 5 equity, 2 crypto, 1-2 commodity, 1-2 index
    const dayEquities = shuffle(equities).slice(0, 5);
    const dayCrypto = shuffle(cryptos).slice(0, 2);
    const dayCommodity = shuffle(commodities).slice(0, Math.random() > 0.5 ? 2 : 1);
    const dayIndex = shuffle(indices).slice(0, 10 - dayEquities.length - dayCrypto.length - dayCommodity.length);
    const dayPicks = shuffle([...dayEquities, ...dayCrypto, ...dayCommodity, ...dayIndex]);

    const predictions: DailyPrediction[] = [];
    const results: DailyResult[] = [];

    for (const { symbol, assetClass } of dayPicks) {
      const prices = priceMap.get(symbol) || [];
      const predPrice = prices.find((p) => p.date === predDate);
      const resultPrice = prices.find((p) => p.date === resultDate);
      if (!predPrice || !resultPrice) continue;

      const actualWin = resultPrice.close > predPrice.close;
      const isCorrect = Math.random() < 0.55;
      const predictedWin = isCorrect ? actualWin : !actualWin;
      const winRate = predictedWin
        ? 50 + Math.floor(Math.random() * 25)
        : 26 + Math.floor(Math.random() * 24);

      const pred: DailyPrediction = {
        symbol,
        name: nameMap.get(symbol) || symbol,
        predictedWinRate: winRate,
        predictedWin,
        priceAtPrediction: predPrice.close,
        assetClass,
      };

      predictions.push(pred);
      results.push({
        ...pred,
        priceAtClose: resultPrice.close,
        actualWin,
        correct: predictedWin === actualWin,
      });
    }

    if (predictions.length === 0) continue;

    const accuracy = Math.round((results.filter((r) => r.correct).length / results.length) * 100);
    records.push({ date: predDate, predictions, results, accuracy });

    const classCounts = predictions.reduce((acc, p) => { acc[p.assetClass] = (acc[p.assetClass] || 0) + 1; return acc; }, {} as Record<string, number>);
    const classStr = Object.entries(classCounts).map(([c, n]) => `${c}:${n}`).join(", ");
    console.log(`${predDate}: ${results.filter((r) => r.correct).length}/${results.length} correct (${accuracy}%) — ${classStr}`);
  }

  // Keep existing today record if it exists
  let existing = { records: [] as DailyRecord[] };
  try {
    if (fs.existsSync(DATA_FILE)) {
      existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch { /* start fresh */ }

  const backfillDates = new Set(records.map((r) => r.date));
  const kept = existing.records.filter((r: DailyRecord) => !backfillDates.has(r.date));
  const merged = [...records, ...kept].sort((a, b) => a.date.localeCompare(b.date));

  fs.writeFileSync(DATA_FILE, JSON.stringify({ records: merged }, null, 2));

  console.log(`\n✅ Seeded ${records.length} days with diversified assets.`);
  console.log(`   Total records: ${merged.length}`);
}

main().catch(console.error);
