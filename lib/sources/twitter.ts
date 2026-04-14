import { SourceSignal, TweetData } from "../types";
import { classifySentimentBatch } from "../sentiment";

// Map queries to relevant Twitter/X accounts
const ACCOUNT_MAP: Record<string, string[]> = {
  tesla: ["Tesla", "elonmusk"],
  bitcoin: ["bitcoin", "DocumentingBTC"],
  btc: ["bitcoin", "DocumentingBTC"],
  ethereum: ["ethereum", "VitalikButerin"],
  eth: ["ethereum", "VitalikButerin"],
  nvidia: ["nvidia"],
  apple: ["Apple", "tim_cook"],
  google: ["Google"],
  amazon: ["amazon"],
  microsoft: ["Microsoft"],
  meta: ["Meta"],
  openai: ["OpenAI", "sama"],
  anthropic: ["AnthropicAI", "DarioAmodei"],
  spacex: ["SpaceX", "elonmusk"],
  solana: ["solana"],
};

interface RawTweet {
  text: string;
  user: { name: string; screen_name: string };
  id_str: string;
  created_at?: string;
}

// In-memory cache to avoid rate limits
const tweetCache = new Map<string, { tweets: RawTweet[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function fetchUserTweets(handle: string): Promise<RawTweet[]> {
  const cached = tweetCache.get(handle);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.tweets;
  }

  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      }
    );

    if (res.status === 429) {
      console.log(`[Twitter] Rate limited for @${handle}`);
      return cached?.tweets || [];
    }

    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const entries = data?.props?.pageProps?.timeline?.entries || [];

    const tweets: RawTweet[] = [];
    for (const entry of entries) {
      if (entry.type === "tweet" && entry.content?.tweet) {
        tweets.push(entry.content.tweet);
      }
    }

    // Only cache non-empty results
    if (tweets.length > 0) {
      tweetCache.set(handle, { tweets, ts: Date.now() });
    }
    return tweets;
  } catch {
    return cached?.tweets || [];
  }
}

function resolveAccounts(query: string): string[] {
  const lower = query.toLowerCase().trim();
  for (const [key, accounts] of Object.entries(ACCOUNT_MAP)) {
    if (lower.includes(key)) return accounts;
  }
  return [query.replace(/^@/, "")];
}

export async function fetchTwitterSentiment(
  query: string,
  externalHandle?: string
): Promise<{ signal: SourceSignal; data: TweetData }> {
  try {
    const handle = externalHandle || resolveAccounts(query)[0];
    const allTweets = await fetchUserTweets(handle);

    if (allTweets.length === 0) {
      return {
        signal: {
          source: "X / Twitter",
          score: 50,
          confidence: 0,
          summary: `No tweets available for @${handle} (may be rate limited)`,
        },
        data: { tweets: [] },
      };
    }

    const recentTweets = allTweets.slice(0, 8);

    // Classify sentiment with Gemini
    const sentiments = await classifySentimentBatch(
      query,
      recentTweets.map((t) => `@${t.user.screen_name}: ${t.text}`)
    );

    const classified = recentTweets.map((t, i) => ({
      author: t.user.name,
      handle: `@${t.user.screen_name}`,
      text: t.text,
      sentiment: sentiments[i] || ("neutral" as const),
      createdAt: t.created_at,
    }));

    const posCount = classified.filter((t) => t.sentiment === "positive").length;
    const negCount = classified.filter((t) => t.sentiment === "negative").length;
    const total = classified.length;

    const totalClassified = posCount + negCount;
    const score =
      totalClassified > 0
        ? Math.round((posCount / totalClassified) * 100)
        : 50;
    const confidence = Math.min(0.6, total / 15);

    return {
      signal: {
        source: "X / Twitter",
        score,
        confidence: Math.round(confidence * 100) / 100,
        summary: `${total} tweets from @${handle} — ${posCount} bullish, ${negCount} bearish`,
      },
      data: {
        tweets: classified.slice(0, 5),
      },
    };
  } catch {
    return {
      signal: {
        source: "X / Twitter",
        score: 50,
        confidence: 0,
        summary: "Failed to fetch tweets",
      },
      data: { tweets: [] },
    };
  }
}
