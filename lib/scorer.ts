import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  SourceSignal,
  PredictionResult,
  FormulaComponent,
} from "./types";
import { PolymarketMarket } from "./sources/polymarket";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

interface ScorerInput {
  query: string;
  signals: SourceSignal[];
  polymarketMarkets: PolymarketMarket[];
}

interface LLMScorerOutput {
  winRate: number;
  assetType: string;
  winDefinition: string;
  oneLiner: string;
  formula: {
    expression: string;
    components: FormulaComponent[];
  };
}

export async function computeWinRate(
  input: ScorerInput
): Promise<PredictionResult> {
  const { query, signals, polymarketMarkets } = input;

  try {
    const llmResult = await callGemini(query, signals, polymarketMarkets);
    return {
      query,
      winRate: Math.max(0, Math.min(100, llmResult.winRate)),
      assetType: llmResult.assetType as PredictionResult["assetType"],
      winDefinition: llmResult.winDefinition,
      oneLiner: llmResult.oneLiner,
      formula: llmResult.formula,
      signals,
      timestamp: new Date().toISOString(),
    };
  } catch (err: unknown) {
    console.error("Gemini scorer failed:", err instanceof Error ? err.message : err);
    return fallbackScore(query, signals);
  }
}

async function callGemini(
  query: string,
  signals: SourceSignal[],
  polymarketMarkets: PolymarketMarket[]
): Promise<LLMScorerOutput> {
  const marketsContext =
    polymarketMarkets.length > 0
      ? polymarketMarkets
          .map(
            (m) =>
              `- ${m.question.replace(/"/g, '')} -- Yes: ${(m.yesPrice * 100).toFixed(1)}%, Volume: $${(m.volume / 1e6).toFixed(2)}M`
          )
          .join("\n")
      : "No matching prediction markets found.";

  const signalsContext = signals
    .map(
      (s) =>
        `- ${s.source}: score=${s.score}, confidence=${s.confidence}, summary=${s.summary.replace(/"/g, "'")}`
    )
    .join("\n");

  const prompt = `You are a quantitative investment analyst. A user asked about: "${query}"

Here are the raw data signals collected from multiple sources:

${signalsContext}

Polymarket prediction markets related to this query:
${marketsContext}

This is a DAILY prediction. The question is: "If I invest in this today, will tomorrow's price be better (higher) than today's closing price?"

Based on ALL the data above, produce a professional daily win-rate analysis. You must:

1. **Classify the asset type**: one of "equity", "crypto", "commodity", "index", "prediction", or "general"

2. **Define what "win" means** with precise daily criteria. Examples:
   - For a stock: "Win = TSLA closing price tomorrow > today's close"
   - For crypto: "Win = BTC price at tomorrow's UTC close > current price"
   - For a prediction: "Win = the predicted outcome moves in your favor by tomorrow"

3. **Create a formula** that combines the signals into a single win rate (0-100). The formula MUST:
   - Include ALL sources that have confidence > 0 in the components array. Do NOT exclude any source.
   - Assign weights to each source (weights must sum to 1.0). Even if a source is less relevant, give it at least 0.05 weight.
   - For daily predictions, recent price momentum and news sentiment typically matter more
   - Account for confidence levels
   - Be simple enough for a retail investor to understand
   - Reference actual numbers from the data

4. **Compute the win rate** using your formula (integer 0-100)

5. **Write a one-liner** — a single sentence a non-expert would understand. Frame it as "buy today, win tomorrow" advice.

Respond in this exact JSON format:
{
  "winRate": 58,
  "assetType": "equity",
  "winDefinition": "Win = TSLA closing price tomorrow is higher than todays close",
  "oneLiner": "Tesla has a 58% chance of closing higher tomorrow based on positive momentum and mixed news.",
  "formula": {
    "expression": "Win Rate = 0.4 * 62 + 0.3 * 55 + 0.2 * 48 + 0.1 * 50 = 56.1",
    "components": [
      {"source": "Market Data", "weight": 0.4, "score": 62, "confidence": 0.85, "contribution": 21.08},
      {"source": "News Sentiment", "weight": 0.3, "score": 55, "confidence": 0.7, "contribution": 11.55},
      {"source": "Polymarket", "weight": 0.2, "score": 48, "confidence": 0.9, "contribution": 8.64},
      {"source": "X / Twitter", "weight": 0.1, "score": 50, "confidence": 0.5, "contribution": 2.5}
    ]
  }
}

Replace ALL values with your actual analysis. Every number must reflect the real data above.`;

  const model = getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  });

  const response = await model.generateContent(prompt);
  const text = response.response.text().trim();
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as LLMScorerOutput;
}

// Fallback in case Gemini is unavailable
function fallbackScore(
  query: string,
  signals: SourceSignal[]
): PredictionResult {
  const active = signals.filter((s) => s.confidence > 0);
  let weightedSum = 0;
  let weightSum = 0;
  const weights: Record<string, number> = {
    Polymarket: 0.35,
    "Market Data": 0.3,
    "News Sentiment": 0.25,
    "X / Twitter": 0.1,
  };

  const components: FormulaComponent[] = [];
  for (const s of signals) {
    const w = weights[s.source] ?? 0.1;
    const contrib = s.confidence > 0 ? s.score * w * s.confidence : 0;
    components.push({
      source: s.source,
      weight: w,
      score: s.score,
      confidence: s.confidence,
      contribution: Math.round(contrib * 100) / 100,
    });
    if (s.confidence > 0) {
      weightedSum += contrib;
      weightSum += w * s.confidence;
    }
  }

  const winRate = weightSum > 0 ? Math.round(weightedSum / weightSum) : 50;

  return {
    query,
    winRate: Math.max(0, Math.min(100, winRate)),
    assetType: "general",
    winDefinition: `Win = ${query} closing price tomorrow is higher than today's close.`,
    oneLiner: `${query} has a ${winRate}% chance of closing higher tomorrow based on available signals.`,
    formula: {
      components,
      expression: active.length > 0
        ? `Win Rate = ${active.map((s) => `${weights[s.source] ?? 0.1} × ${s.score}`).join(" + ")} (weighted) = ${winRate}`
        : "Win Rate = 50 (insufficient data)",
    },
    signals,
    timestamp: new Date().toISOString(),
  };
}
