import { NextResponse } from "next/server";

interface TrendingAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  category: "active" | "gainer" | "loser" | "trending";
}

async function fetchScreener(scrId: string, count: number): Promise<TrendingAsset[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=${count}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    const category = scrId === "day_gainers" ? "gainer" : scrId === "day_losers" ? "loser" : "active";
    return quotes.map((q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.shortName as string) || (q.symbol as string),
      price: (q.regularMarketPrice as number) || 0,
      change: (q.regularMarketChangePercent as number) || 0,
      category,
    }));
  } catch {
    return [];
  }
}

async function fetchTrending(): Promise<TrendingAsset[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/trending/US",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    return quotes.slice(0, 8).map((q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.shortName as string) || (q.symbol as string),
      price: 0,
      change: 0,
      category: "trending" as const,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const [active, gainers, losers, trending] = await Promise.all([
    fetchScreener("most_actives", 6),
    fetchScreener("day_gainers", 4),
    fetchScreener("day_losers", 4),
    fetchTrending(),
  ]);

  return NextResponse.json({
    active,
    gainers,
    losers,
    trending,
    date: new Date().toISOString(),
  });
}
