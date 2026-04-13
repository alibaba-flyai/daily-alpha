import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "performance.json");

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
    // corrupted file, start fresh
  }
  return { records: [] };
}

export function savePerformance(data: PerformanceData): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
