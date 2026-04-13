import { SourceSignal } from "../types";

const POLYMARKET_API = "https://gamma-api.polymarket.com";

export interface PolymarketMarket {
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  eventTitle: string;
  slug: string;
  eventSlug: string;
  endDate?: string;
}

interface SearchEvent {
  title: string;
  slug: string;
  description: string;
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  markets: {
    question: string;
    slug: string;
    outcomePrices: string;
    outcomes: string;
    volume: string;
    active: boolean;
    closed: boolean;
    endDate?: string;
  }[];
}

interface SearchResponse {
  events: SearchEvent[];
  pagination: { hasMore: boolean; totalResults: number };
}

// Map common names to ticker symbols and formal names for better search
// Search variants: [searchQueries[], relevanceKeywords[]]
// relevanceKeywords are checked against event title + market question to filter false matches
const SEARCH_VARIANTS: Record<string, { queries: string[]; keywords: string[] }> = {
  google: { queries: ["GOOGL", "alphabet"], keywords: ["google", "googl", "alphabet"] },
  alibaba: { queries: ["alibaba group", "BABA stock"], keywords: ["alibaba", "baba"] },
  tesla: { queries: ["TSLA", "tesla"], keywords: ["tesla", "tsla"] },
  apple: { queries: ["AAPL", "apple inc"], keywords: ["apple", "aapl"] },
  amazon: { queries: ["AMZN", "amazon"], keywords: ["amazon", "amzn"] },
  microsoft: { queries: ["MSFT", "microsoft"], keywords: ["microsoft", "msft"] },
  nvidia: { queries: ["NVDA", "nvidia"], keywords: ["nvidia", "nvda"] },
  meta: { queries: ["META platforms", "facebook"], keywords: ["meta", "facebook"] },
  netflix: { queries: ["NFLX", "netflix"], keywords: ["netflix", "nflx"] },
  bitcoin: { queries: ["bitcoin", "BTC price"], keywords: ["bitcoin", "btc"] },
  ethereum: { queries: ["ethereum", "ETH price"], keywords: ["ethereum", "eth"] },
  solana: { queries: ["solana", "SOL price"], keywords: ["solana", "sol"] },
  anthropic: { queries: ["anthropic", "claude AI"], keywords: ["anthropic", "claude"] },
  openai: { queries: ["openai", "chatgpt"], keywords: ["openai", "gpt", "chatgpt"] },
};

function getSearchQueries(query: string): string[] {
  const lower = query.toLowerCase().trim();
  const queries = [query];

  for (const [key, { queries: variants }] of Object.entries(SEARCH_VARIANTS)) {
    if (lower.includes(key)) {
      for (const v of variants) {
        if (!queries.some((q) => q.toLowerCase() === v.toLowerCase())) {
          queries.push(v);
        }
      }
      break;
    }
  }

  return queries.slice(0, 3);
}

function getRelevanceKeywords(query: string): string[] {
  const lower = query.toLowerCase().trim();
  const keywords = [lower];

  for (const [key, { keywords: kws }] of Object.entries(SEARCH_VARIANTS)) {
    if (lower.includes(key)) {
      keywords.push(...kws);
      break;
    }
  }

  return [...new Set(keywords)];
}

async function searchOnce(q: string, limit: number): Promise<{ events: SearchEvent[]; total: number }> {
  try {
    const res = await fetch(
      `${POLYMARKET_API}/public-search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { cache: "no-store" }
    );
    if (!res.ok) return { events: [], total: 0 };
    const data: SearchResponse = await res.json();
    return { events: data.events || [], total: data.pagination?.totalResults || 0 };
  } catch {
    return { events: [], total: 0 };
  }
}

function isRelevant(text: string, originalText: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (kw.length <= 4) {
      // Short keywords (tickers): require word boundary or parenthesized like "(BABA)"
      // Match as whole word only
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
      if (regex.test(originalText)) {
        // Also verify the match is likely a ticker/company, not a person's name
        // Check if it appears in a financial context (with $ or in parens)
        if (originalText.includes(`(${kw.toUpperCase()})`) || originalText.includes(`$`)) return true;
        // For the exact original query, always accept
        if (kw === keywords[0]) return true;
      }
    } else {
      // Longer keywords: simple substring match
      if (lower.includes(kw)) return true;
    }
  }
  return false;
}

function extractOpenMarkets(events: SearchEvent[], keywords: string[]): PolymarketMarket[] {
  const markets: PolymarketMarket[] = [];
  for (const event of events) {
    const eventText = `${event.title} ${event.description || ""}`;
    const eventRelevant = isRelevant(eventText, eventText, keywords);

    for (const market of event.markets || []) {
      if (market.closed) continue;

      const marketRelevant = eventRelevant || isRelevant(market.question, market.question, keywords);
      if (!marketRelevant) continue;

      try {
        const prices: number[] = JSON.parse(market.outcomePrices).map(Number);
        const outcomes: string[] = JSON.parse(market.outcomes);
        const yesIdx = outcomes.findIndex(
          (o) => o.toLowerCase() === "yes" || o.toLowerCase() === "higher"
        );
        markets.push({
          question: market.question,
          yesPrice: yesIdx >= 0 ? prices[yesIdx] : prices[0],
          noPrice: yesIdx >= 0 ? prices[1 - yesIdx] : prices[1] ?? 1 - prices[0],
          volume: parseFloat(market.volume) || 0,
          eventTitle: event.title,
          slug: market.slug || event.slug,
          eventSlug: event.slug,
          endDate: market.endDate,
        });
      } catch {
        // skip
      }
    }
  }
  return markets;
}

export async function fetchPolymarket(
  query: string,
  externalSearchTerms?: string[],
  externalKeywords?: string[]
): Promise<{ signal: SourceSignal; markets: PolymarketMarket[]; totalResults: number }> {
  try {
    const searchQueries = externalSearchTerms && externalSearchTerms.length > 0
      ? externalSearchTerms.slice(0, 6)
      : getSearchQueries(query);
    const keywords = externalKeywords && externalKeywords.length > 0
      ? externalKeywords
      : getRelevanceKeywords(query);

    // Search all variants in parallel
    const results = await Promise.all(
      searchQueries.map((q) => searchOnce(q, 20))
    );

    // Collect all open + relevant markets, deduplicate by question
    const seen = new Set<string>();
    const allMarkets: PolymarketMarket[] = [];
    let totalResults = 0;

    for (const r of results) {
      totalResults = Math.max(totalResults, r.total);
      const open = extractOpenMarkets(r.events, keywords);
      for (const m of open) {
        if (!seen.has(m.question)) {
          seen.add(m.question);
          allMarkets.push(m);
        }
      }
    }

    allMarkets.sort((a, b) => b.volume - a.volume);
    const topMarkets = allMarkets.slice(0, 10);

    if (topMarkets.length === 0) {
      return {
        signal: fallback(`No active prediction markets found for "${query}"`),
        markets: [],
        totalResults,
      };
    }

    const totalVolume = topMarkets.reduce((s, m) => s + m.volume, 0);
    const weightedYes =
      topMarkets.reduce((s, m) => s + m.yesPrice * m.volume, 0) / totalVolume;
    const confidence = Math.min(1, Math.log10(Math.max(totalVolume, 1)) / 7);

    return {
      signal: {
        source: "Polymarket",
        score: Math.round(weightedYes * 100),
        confidence: Math.round(confidence * 100) / 100,
        summary: `${topMarkets.length} markets found (${totalResults} total)`,
      },
      markets: topMarkets,
      totalResults,
    };
  } catch {
    return { signal: fallback("Failed to fetch Polymarket data"), markets: [], totalResults: 0 };
  }
}

function fallback(reason: string): SourceSignal {
  return { source: "Polymarket", score: 50, confidence: 0, summary: reason };
}
