import fs from "fs";
import path from "path";
import seedData from "./seed-performance.json";

// On Vercel: use /tmp (writable but ephemeral per invocation)
// Locally: use data/ directory
const IS_VERCEL = !!process.env.VERCEL;
const DATA_FILE = IS_VERCEL
  ? path.join("/tmp", "performance.json")
  : path.join(process.cwd(), "data", "performance.json");

export interface DailyPrediction {
  symbol: string;
  name: string;
  predictedWinRate: number; // 0-100
  predictedWin: boolean; // winRate > 50
  priceAtPrediction: number;
}

export interface DailyResult extends DailyPrediction {
  priceAtClose: number;
  actualWin: boolean; // price went up
  correct: boolean; // prediction matched reality
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  predictions: DailyPrediction[];
  results: DailyResult[] | null; // null if not yet evaluated
  accuracy: number | null; // % correct, null if not evaluated
  postmortem?: string; // LLM analysis of what went right/wrong
}

export interface SourceAccuracy {
  source: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
}

export interface PerformanceData {
  records: DailyRecord[];
  learnings?: string; // accumulated LLM insights from postmortems
  sourceAccuracy?: SourceAccuracy[]; // per-source track record
  optimizationState?: import("./optimizer").OptimizationState; // learned parameters
}

// Compute per-source accuracy from historical data
// This is approximate — tracks how well each source's score correlated with wins
export function computeSourceAccuracy(records: DailyRecord[]): SourceAccuracy[] {
  // We don't have per-source data in results, so we track overall patterns
  // This will be enriched by the postmortem analysis
  const evaluated = records.filter((r) => r.results !== null);
  const total = evaluated.reduce((s, r) => s + (r.results?.length || 0), 0);
  const correct = evaluated.reduce(
    (s, r) => s + (r.results?.filter((x) => x.correct).length || 0), 0
  );

  return [
    { source: "Overall", totalPredictions: total, correctPredictions: correct, accuracy: total > 0 ? Math.round((correct / total) * 100) : 50 },
  ];
}

export function loadPerformance(): PerformanceData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // file not readable
  }

  // Fallback: use bundled seed data
  return seedData as unknown as PerformanceData;
}

export function savePerformance(data: PerformanceData): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch {
    // On Vercel /tmp may fail across invocations — that's ok
  }
}

export async function persistToGitHub(data: PerformanceData): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;

  const repo = "alibaba-flyai/daily-alpha";
  const filePath = "lib/seed-performance.json";
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  try {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      headers: { Authorization: `token ${token}`, "User-Agent": "daily-alpha" },
    });
    const existing = await getRes.json();
    const sha = existing?.sha;

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "daily-alpha",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `[auto] Update predictions — ${new Date().toISOString().split("T")[0]}`,
        content,
        sha,
      }),
    });

    return putRes.ok;
  } catch {
    return false;
  }
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
