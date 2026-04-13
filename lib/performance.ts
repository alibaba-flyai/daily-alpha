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
}

export interface PerformanceData {
  records: DailyRecord[];
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
  return seedData as PerformanceData;
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

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
