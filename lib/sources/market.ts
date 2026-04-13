import { SourceSignal, MarketPriceData, AssetPrice } from "../types";

const TICKER_MAP: Record<string, string> = {
  bitcoin: "BTC-USD", btc: "BTC-USD",
  ethereum: "ETH-USD", eth: "ETH-USD",
  tesla: "TSLA", apple: "AAPL", google: "GOOGL", amazon: "AMZN",
  microsoft: "MSFT", nvidia: "NVDA", meta: "META", netflix: "NFLX",
  "s&p": "^GSPC", "s&p 500": "^GSPC", sp500: "^GSPC",
  nasdaq: "^IXIC", gold: "GC=F", oil: "CL=F",
  solana: "SOL-USD", sol: "SOL-USD",
};

function resolveSymbol(query: string): string {
  const lower = query.toLowerCase().trim();
  return TICKER_MAP[lower] || query.toUpperCase();
}

type MarketResult = { signal: SourceSignal; data: MarketPriceData | null };

interface ChartMeta {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  chartPreviousClose: number;
}

interface ChartData {
  symbol: string;
  name: string;
  price: number;
  dailyChange: number;
  fiftyDayChange: number;
}

async function fetchChartData(symbol: string): Promise<ChartData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta: ChartMeta = result.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const valid = closes.filter((c): c is number => c !== null);

    let dailyChange = 0;
    if (valid.length >= 2) {
      const prev = valid[valid.length - 2];
      dailyChange = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    }

    let fiftyDayChange = 0;
    if (valid.length >= 50) {
      const avg50 = valid.slice(-50).reduce((a, b) => a + b, 0) / 50;
      fiftyDayChange = avg50 > 0 ? ((price - avg50) / avg50) * 100 : 0;
    }

    return {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || meta.symbol,
      price,
      dailyChange: Math.round(dailyChange * 100) / 100,
      fiftyDayChange: Math.round(fiftyDayChange * 10) / 10,
    };
  } catch {
    return null;
  }
}

async function fetchQuickPrice(symbol: string): Promise<AssetPrice | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const valid = closes.filter((c): c is number => c !== null);

    let dailyChange = 0;
    if (valid.length >= 2) {
      const prev = valid[valid.length - 2];
      dailyChange = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    }

    return {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || meta.symbol,
      price,
      dailyChange: Math.round(dailyChange * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function fetchMarketData(
  query: string,
  relatedTickers?: string[]
): Promise<MarketResult> {
  const symbol = resolveSymbol(query);

  try {
    // Fetch main asset
    let mainData = await fetchChartData(symbol);
    if (!mainData) {
      // Try search fallback
      const searchRes = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=1`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        const foundSymbol = sData?.quotes?.[0]?.symbol;
        if (foundSymbol) mainData = await fetchChartData(foundSymbol);
      }
    }

    if (!mainData) {
      return { signal: fallback(`No market data for "${query}"`), data: null };
    }

    // Fetch related assets in parallel (quick 5d charts)
    const relatedAssets: AssetPrice[] = [];
    if (relatedTickers && relatedTickers.length > 0) {
      const results = await Promise.all(
        relatedTickers.slice(0, 4).map((t) => fetchQuickPrice(t))
      );
      for (const r of results) {
        if (r) relatedAssets.push(r);
      }
    }

    const { dailyChange, name, price } = mainData;
    const shortTermScore = Math.max(0, Math.min(100, 50 + dailyChange * 5));
    const medTermScore = Math.max(0, Math.min(100, 50 + mainData.fiftyDayChange * 2));
    const score = shortTermScore * 0.5 + medTermScore * 0.5;

    return {
      signal: {
        source: "Market Data",
        score: Math.round(Math.max(0, Math.min(100, score))),
        confidence: 0.85,
        summary: `${name} $${price.toFixed(2)} — Daily: ${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%`,
      },
      data: {
        ...mainData,
        relatedAssets,
      },
    };
  } catch {
    return { signal: fallback("Failed to fetch market data"), data: null };
  }
}

function fallback(reason: string): SourceSignal {
  return { source: "Market Data", score: 50, confidence: 0, summary: reason };
}
