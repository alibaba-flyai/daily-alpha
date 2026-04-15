import { GoogleGenerativeAI } from "@google/generative-ai";
import { DailyRecord, PerformanceData } from "./performance";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

/**
 * Generate a postmortem for a single day's predictions vs results.
 * Returns a short analysis of what patterns were missed or caught.
 */
export async function generatePostmortem(record: DailyRecord): Promise<string> {
  if (!record.results) return "";

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });

    const rows = record.results.map((r) => {
      const dir = r.actualWin ? "UP" : "DOWN";
      const pred = r.predictedWin ? "WIN" : "LOSE";
      const chg = ((r.priceAtClose - r.priceAtPrediction) / r.priceAtPrediction * 100).toFixed(2);
      return `${r.symbol}: predicted ${pred} (${r.predictedWinRate}%), actual ${dir} (${chg}%), ${r.correct ? "CORRECT" : "WRONG"}`;
    });

    const correct = record.results.filter((r) => r.correct).length;

    const prompt = `You are a quant analyst reviewing yesterday's predictions. Accuracy: ${correct}/${record.results.length} (${record.accuracy}%).

Results:
${rows.join("\n")}

In 2-3 sentences, identify:
1. The key pattern you got RIGHT (what signal worked)
2. The key mistake (what signal was misleading)
3. One specific adjustment for tomorrow

Be concrete — reference specific tickers and percentages. No generic advice.`;

    const response = await model.generateContent(prompt);
    return response.response.text().trim();
  } catch (err) {
    console.error("Postmortem generation failed:", err);
    return "";
  }
}

/**
 * Synthesize accumulated learnings from recent postmortems.
 * This is injected into the scoring prompt for future predictions.
 */
export async function synthesizeLearnings(data: PerformanceData): Promise<string> {
  const recentRecords = data.records
    .filter((r) => r.results !== null && r.postmortem)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7); // last 7 days

  if (recentRecords.length < 2) return data.learnings || "";

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    });

    const history = recentRecords.map((r) =>
      `${r.date} (${r.accuracy}%): ${r.postmortem}`
    ).join("\n\n");

    const overallAcc = data.records.filter((r) => r.results !== null);
    const totalCorrect = overallAcc.reduce((s, r) => s + (r.results?.filter((x) => x.correct).length || 0), 0);
    const totalPreds = overallAcc.reduce((s, r) => s + (r.results?.length || 0), 0);
    const overallPct = totalPreds > 0 ? Math.round((totalCorrect / totalPreds) * 100) : 50;

    const prompt = `You are a quant analyst improving a daily stock prediction system. Overall accuracy: ${overallPct}% across ${overallAcc.length} days.

Recent daily postmortems:
${history}

Synthesize the key learnings into 3-5 concise rules that should guide TOMORROW's predictions. Format as bullet points. Each rule must:
- Be specific and actionable (not generic like "be careful")
- Reference actual patterns from the data (e.g. "momentum signals worked for tech but failed for commodities")
- Include when to trust vs distrust each signal type

These rules will be injected directly into the prediction prompt.`;

    const response = await model.generateContent(prompt);
    return response.response.text().trim();
  } catch (err) {
    console.error("Learning synthesis failed:", err);
    return data.learnings || "";
  }
}
