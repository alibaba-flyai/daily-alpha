import { SourceSignal, NewsData, NewsHeadline } from "../types";
import { classifySentimentBatch } from "../sentiment";

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  description?: string;
  publishedAt?: string;
}

export async function fetchNewsSentiment(
  query: string
): Promise<{ signal: SourceSignal; data: NewsData }> {
  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return { signal: fallback("News API unavailable"), data: emptyData() };
    }

    const xml = await res.text();
    const articles = parseRSS(xml);

    if (articles.length === 0) {
      return {
        signal: fallback(`No recent news found for "${query}"`),
        data: emptyData(),
      };
    }

    // Take top 10 for display, classify with Gemini
    const top = articles.slice(0, 10);
    const sentiments = await classifySentimentBatch(
      query,
      top.map((a) => a.title)
    );

    const headlines: NewsHeadline[] = top.map((a, i) => ({
      title: a.title,
      url: a.url,
      source: a.source,
      sentiment: sentiments[i] || "neutral",
      publishedAt: a.publishedAt,
    }));

    const positiveCount = headlines.filter((h) => h.sentiment === "positive").length;
    const negativeCount = headlines.filter((h) => h.sentiment === "negative").length;

    // Score: ratio of positive to total classified
    const totalClassified = positiveCount + negativeCount;
    const score =
      totalClassified === 0
        ? 50
        : Math.round((positiveCount / totalClassified) * 100);

    const confidence =
      Math.round(Math.min(0.8, (articles.length / 10) * 0.5 + (totalClassified / 10) * 0.3) * 100) / 100;

    return {
      signal: {
        source: "News Sentiment",
        score,
        confidence,
        summary: `${articles.length} articles — ${positiveCount} bullish, ${negativeCount} bearish`,
      },
      data: { headlines, positiveCount, negativeCount, totalArticles: articles.length },
    };
  } catch {
    return { signal: fallback("Failed to analyze news sentiment"), data: emptyData() };
  }
}

function emptyData(): NewsData {
  return { headlines: [], positiveCount: 0, negativeCount: 0, totalArticles: 0 };
}

function parseRSS(xml: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const source = extractTag(item, "source");
    const description = extractTag(item, "description");
    const pubDate = extractTag(item, "pubDate");
    if (title) {
      articles.push({
        title,
        url: link || "#",
        source: source || "Unknown",
        description: description || undefined,
        publishedAt: pubDate || undefined,
      });
    }
    if (articles.length >= 20) break;
  }
  return articles;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
  );
  const match = regex.exec(xml);
  return match ? (match[1] || match[2] || "").trim() : null;
}

function fallback(reason: string): SourceSignal {
  return { source: "News Sentiment", score: 50, confidence: 0, summary: reason };
}
