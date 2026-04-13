import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

export interface ExpandedQuery {
  searchTerms: string[];
  relevanceKeywords: string[];
  twitterHandles: string[];
  tickerSymbol: string | null;
  relatedTickers: string[]; // related assets to show for context (e.g. ["MSFT", "AMZN", "^GSPC"])
}

// Cache expansions to avoid repeated LLM calls for the same query
const cache = new Map<string, { result: ExpandedQuery; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function expandQuery(query: string): Promise<ExpandedQuery> {
  const lower = query.toLowerCase().trim();
  const cached = cache.get(lower);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result;

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const prompt = `Given the investment query "${query}", expand it for searching prediction markets, news, and social media.

On prediction markets like Polymarket, companies often appear as sub-options in BROADER category events. For example, "Alibaba" appears in events titled "Which company has the best AI model?" — so you must include category search terms too.

Think about:
1. Direct: company name, ticker symbol, CEO/founder
2. Products & brands: key products, subsidiaries
3. CATEGORIES the company competes in: "best AI model", "largest company", "tech stock", "chip maker" etc.

Examples:
- "alibaba" → searchTerms: ["alibaba", "BABA", "best AI model", "qwen", "chinese tech"], relevanceKeywords: ["alibaba", "baba", "qwen", "aliyun"], twitterHandles: ["AlibabaGroup"], tickerSymbol: "BABA", relatedTickers: ["JD", "PDD", "KWEB"]
- "google" → searchTerms: ["google", "GOOGL", "alphabet", "best AI model", "gemini"], relevanceKeywords: ["google", "googl", "alphabet"], twitterHandles: ["Google"], tickerSymbol: "GOOGL", relatedTickers: ["MSFT", "META", "^GSPC"]
- "nvidia" → searchTerms: ["nvidia", "NVDA", "AI chip", "jensen huang", "GPU"], relevanceKeywords: ["nvidia", "nvda"], twitterHandles: ["nvidia"], tickerSymbol: "NVDA", relatedTickers: ["AMD", "INTC", "TSM"]
- "bitcoin" → searchTerms: ["bitcoin", "BTC price", "crypto"], relevanceKeywords: ["bitcoin", "btc"], twitterHandles: ["bitcoin"], tickerSymbol: "BTC-USD", relatedTickers: ["ETH-USD", "SOL-USD", "^GSPC"]

Return JSON:
{
  "searchTerms": ["term1", "term2", "term3", "term4", "term5"],
  "relevanceKeywords": ["keyword1", "keyword2"],
  "twitterHandles": ["handle1", "handle2"],
  "tickerSymbol": "TICKER" or null,
  "relatedTickers": ["TICKER1", "TICKER2", "TICKER3"]
}

searchTerms: up to 6 terms. Include 1-2 CATEGORY terms the company competes in.
relevanceKeywords: core identifiers only (company name, ticker, key brands). Used to filter results.
twitterHandles: 1-2 official accounts.
relatedTickers: 3-4 Yahoo Finance tickers of competitors, sector peers, or relevant indices. Use exact Yahoo Finance format (e.g. ^GSPC for S&P 500, BTC-USD for Bitcoin).`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as ExpandedQuery;

    // Ensure lowercase keywords
    parsed.relevanceKeywords = parsed.relevanceKeywords.map((k) => k.toLowerCase());

    // Always include the original query
    if (!parsed.searchTerms.some((t) => t.toLowerCase() === lower)) {
      parsed.searchTerms.unshift(query);
    }
    if (!parsed.relevanceKeywords.includes(lower)) {
      parsed.relevanceKeywords.unshift(lower);
    }

    // Add "CompanyName (TICKER)" format — this is how Polymarket titles stock markets
    if (parsed.tickerSymbol) {
      const ticker = parsed.tickerSymbol.replace(/-.*$/, ""); // "BTC-USD" → "BTC"
      const tickerSearch = `${query} (${ticker})`;
      if (!parsed.searchTerms.includes(tickerSearch)) {
        parsed.searchTerms.splice(1, 0, tickerSearch); // insert early
      }
    }

    cache.set(lower, { result: parsed, ts: Date.now() });
    return parsed;
  } catch (err) {
    console.error("Query expansion failed:", err instanceof Error ? err.message : err);
    // Fallback: just use the original query
    return {
      searchTerms: [query],
      relevanceKeywords: [lower],
      twitterHandles: [query.replace(/\s+/g, "")],
      tickerSymbol: null,
      relatedTickers: [],
    };
  }
}
