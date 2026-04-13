import { GoogleGenerativeAI } from "@google/generative-ai";

type Sentiment = "positive" | "negative" | "neutral";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

/**
 * Batch-classify a list of texts as positive/negative/neutral
 * in terms of investment sentiment (will the asset price go up?).
 */
export async function classifySentimentBatch(
  query: string,
  texts: string[]
): Promise<Sentiment[]> {
  if (texts.length === 0) return [];

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const numbered = texts
      .map((t, i) => `${i + 1}. ${t.replace(/\n/g, " ").slice(0, 200)}`)
      .join("\n");

    const prompt = `You are an investment sentiment analyst. For the query "${query}", classify each text below as "positive" (bullish — suggests the price/value will go UP), "negative" (bearish — suggests price will go DOWN), or "neutral".

Consider the INVESTMENT implications, not just the tone. For example:
- "FSD approved in Netherlands" → positive (expansion = bullish)
- "CEO faces investigation" → negative (risk = bearish)
- "Company releases new product" → positive (growth signal)
- "Quarterly results mixed" → neutral

Texts:
${numbered}

Return a JSON array of strings, one per text, in the same order. Example: ["positive","negative","neutral"]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const result: string[] = JSON.parse(cleaned);

    // Validate and map
    return result.map((r) => {
      const lower = (r || "").toLowerCase().trim();
      if (lower === "positive") return "positive";
      if (lower === "negative") return "negative";
      return "neutral";
    });
  } catch (err) {
    console.error("Sentiment classification failed:", err instanceof Error ? err.message : err);
    // Fall back to all neutral
    return texts.map(() => "neutral");
  }
}
