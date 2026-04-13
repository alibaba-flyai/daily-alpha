import { NextRequest } from "next/server";
import { fetchPolymarket, PolymarketMarket } from "@/lib/sources/polymarket";
import { fetchMarketData } from "@/lib/sources/market";
import { fetchNewsSentiment } from "@/lib/sources/news";
import { fetchTwitterSentiment } from "@/lib/sources/twitter";
import { computeWinRate } from "@/lib/scorer";
import { expandQuery } from "@/lib/query-expander";
import { SourceSignal, StreamEvent } from "@/lib/types";

export async function POST(req: NextRequest) {
  let query: string;
  try {
    const body = await req.json();
    query = body.query;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Query is required" }), { status: 400 });
  }

  const trimmed = query.trim();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(event: StreamEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // Step 1: Expand query with LLM
      send({ type: "trace", step: { id: "expand", source: "Agent", status: "running", message: `Expanding "${trimmed}" → related terms, tickers, key people...`, timestamp: new Date().toISOString() } });

      const expanded = await expandQuery(trimmed);

      send({ type: "trace", step: {
        id: "expand", source: "Agent", status: "done",
        message: `Search: ${expanded.searchTerms.slice(0, 4).join(", ")}${expanded.tickerSymbol ? ` (${expanded.tickerSymbol})` : ""}`,
        timestamp: new Date().toISOString(),
      } });

      // Step 2: All agents start simultaneously
      send({ type: "trace", step: { id: "polymarket", source: "Polymarket", status: "running", message: `Searching ${expanded.searchTerms.length} terms...`, timestamp: new Date().toISOString() } });
      send({ type: "trace", step: { id: "market", source: "Market Data", status: "running", message: `Fetching ${expanded.tickerSymbol || trimmed}...`, timestamp: new Date().toISOString() } });
      send({ type: "trace", step: { id: "news", source: "News Sentiment", status: "running", message: "Scanning latest headlines...", timestamp: new Date().toISOString() } });
      send({ type: "trace", step: { id: "twitter", source: "X / Twitter", status: "running", message: `Fetching @${expanded.twitterHandles[0] || trimmed}...`, timestamp: new Date().toISOString() } });

      const signals: SourceSignal[] = [];
      let polymarketMarkets: PolymarketMarket[] = [];

      // Pass expanded search terms and keywords to Polymarket
      const polyPromise = fetchPolymarket(trimmed, expanded.searchTerms, expanded.relevanceKeywords).then((r) => {
        signals.push(r.signal);
        polymarketMarkets = r.markets;
        send({
          type: "trace",
          step: {
            id: "polymarket", source: "Polymarket",
            status: r.signal.confidence > 0 ? "done" : "error",
            message: r.signal.confidence > 0 ? `${r.markets.length} markets found` : r.signal.summary,
            timestamp: new Date().toISOString(),
            signal: r.signal,
            polymarketData: {
              markets: r.markets.map((m) => ({
                question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice,
                volume: m.volume, slug: m.slug, eventSlug: m.eventSlug, endDate: m.endDate,
              })),
              totalResults: r.totalResults,
            },
          },
        });
      }).catch(() => {
        signals.push({ source: "Polymarket", score: 50, confidence: 0, summary: "Failed" });
        send({ type: "trace", step: { id: "polymarket", source: "Polymarket", status: "error", message: "Failed to connect", timestamp: new Date().toISOString() } });
      });

      // Use ticker symbol for market data if available
      const marketQuery = expanded.tickerSymbol || trimmed;
      const marketPromise = fetchMarketData(marketQuery, expanded.relatedTickers).then((r) => {
        signals.push(r.signal);
        send({
          type: "trace",
          step: {
            id: "market", source: "Market Data",
            status: r.signal.confidence > 0 ? "done" : "error",
            message: r.signal.summary,
            timestamp: new Date().toISOString(),
            signal: r.signal,
            marketData: r.data || undefined,
          },
        });
      }).catch(() => {
        signals.push({ source: "Market Data", score: 50, confidence: 0, summary: "Failed" });
        send({ type: "trace", step: { id: "market", source: "Market Data", status: "error", message: "Failed to connect", timestamp: new Date().toISOString() } });
      });

      const newsPromise = fetchNewsSentiment(trimmed).then((r) => {
        signals.push(r.signal);
        send({
          type: "trace",
          step: {
            id: "news", source: "News Sentiment",
            status: r.signal.confidence > 0 ? "done" : "error",
            message: r.signal.summary,
            timestamp: new Date().toISOString(),
            signal: r.signal,
            newsData: r.data,
          },
        });
      }).catch(() => {
        signals.push({ source: "News Sentiment", score: 50, confidence: 0, summary: "Failed" });
        send({ type: "trace", step: { id: "news", source: "News Sentiment", status: "error", message: "Failed to connect", timestamp: new Date().toISOString() } });
      });

      // Use expanded Twitter handles
      const twitterHandle = expanded.twitterHandles[0] || trimmed;
      const twitterPromise = fetchTwitterSentiment(trimmed, twitterHandle).then((r) => {
        signals.push(r.signal);
        send({
          type: "trace",
          step: {
            id: "twitter", source: "X / Twitter", status: "done",
            message: r.signal.summary,
            timestamp: new Date().toISOString(),
            signal: r.signal,
            tweetData: r.data,
          },
        });
      }).catch(() => {
        signals.push({ source: "X / Twitter", score: 50, confidence: 0, summary: "Failed" });
        send({ type: "trace", step: { id: "twitter", source: "X / Twitter", status: "error", message: "Failed to connect", timestamp: new Date().toISOString() } });
      });

      await Promise.all([polyPromise, marketPromise, newsPromise, twitterPromise]);

      // LLM scoring
      send({ type: "trace", step: { id: "llm", source: "Agent", status: "running", message: "Synthesizing all signals...", timestamp: new Date().toISOString() } });

      const result = await computeWinRate({ query: trimmed, signals, polymarketMarkets });

      send({ type: "trace", step: { id: "llm", source: "Agent", status: "done", message: `Win Rate: ${result.winRate}/100`, timestamp: new Date().toISOString(), detail: result.oneLiner } });
      send({ type: "result", data: result });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
