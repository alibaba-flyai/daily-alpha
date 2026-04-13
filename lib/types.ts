export interface SourceSignal {
  source: string;
  score: number; // 0-100
  confidence: number; // 0-1
  summary: string;
}

export type AssetType = "equity" | "crypto" | "commodity" | "index" | "prediction" | "general";

export interface FormulaComponent {
  source: string;
  weight: number;
  score: number;
  confidence: number;
  contribution: number;
}

export interface PredictionResult {
  query: string;
  winRate: number; // 0-100
  assetType: AssetType;
  winDefinition: string;
  oneLiner: string;
  formula: {
    components: FormulaComponent[];
    expression: string;
  };
  signals: SourceSignal[];
  timestamp: string;
}

export type TraceStepStatus = "running" | "done" | "error";

// --- Rich source data ---

export interface PolymarketMarketData {
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  slug: string;
  eventSlug: string;
  endDate?: string;
}

export interface PolymarketData {
  markets: PolymarketMarketData[];
  totalResults: number;
}

export interface NewsHeadline {
  title: string;
  url: string;
  source: string;
  sentiment: "positive" | "negative" | "neutral";
  publishedAt?: string;
}

export interface NewsData {
  headlines: NewsHeadline[];
  positiveCount: number;
  negativeCount: number;
  totalArticles: number;
}

export interface AssetPrice {
  symbol: string;
  name: string;
  price: number;
  dailyChange: number;
}

export interface MarketPriceData {
  symbol: string;
  name: string;
  price: number;
  dailyChange: number;
  fiftyDayChange: number;
  relatedAssets: AssetPrice[];
}

export interface TweetData {
  tweets: {
    author: string;
    handle: string;
    text: string;
    sentiment: "positive" | "negative" | "neutral";
    createdAt?: string;
  }[];
}

export interface TraceStep {
  id: string;
  source: string;
  status: TraceStepStatus;
  message: string;
  timestamp: string;
  detail?: string;
  signal?: SourceSignal;
  polymarketData?: PolymarketData;
  newsData?: NewsData;
  marketData?: MarketPriceData;
  tweetData?: TweetData;
}

export type StreamEvent =
  | { type: "trace"; step: TraceStep }
  | { type: "result"; data: PredictionResult }
  | { type: "error"; message: string };
