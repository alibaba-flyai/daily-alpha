import { NextRequest, NextResponse } from "next/server";

interface IntradayPoint {
  price: number;
  time: number; // unix timestamp
}

export interface IntradayData {
  symbol: string;
  points: IntradayPoint[];
  currentPrice: number;
  openPrice: number;
  change: number; // % change from open
}

async function fetchIntraday(symbol: string): Promise<IntradayData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const points: IntradayPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null) {
        points.push({ price: closes[i]!, time: timestamps[i] });
      }
    }

    const currentPrice = meta.regularMarketPrice || (points.length > 0 ? points[points.length - 1].price : 0);
    const openPrice = meta.chartPreviousClose || (points.length > 0 ? points[0].price : currentPrice);
    const change = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

    return {
      symbol: meta.symbol,
      points,
      currentPrice,
      openPrice,
      change: Math.round(change * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols param required" }, { status: 400 });
  }

  const tickers = symbols.split(",").slice(0, 10);
  const results = await Promise.all(tickers.map((s) => fetchIntraday(s.trim())));

  const data: Record<string, IntradayData> = {};
  for (const r of results) {
    if (r) data[r.symbol] = r;
  }

  return NextResponse.json(data);
}
