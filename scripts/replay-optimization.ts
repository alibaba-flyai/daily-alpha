/**
 * Replay optimization from day 1 through all historical records.
 *
 * For each evaluated day:
 * 1. Generate synthetic per-source scores based on the prediction + outcome
 * 2. Run Hedge weight update
 * 3. Run threshold gradient descent
 * 4. Record history
 *
 * This produces a full optimization trajectory that can be visualized.
 *
 * Run: npx tsx scripts/replay-optimization.ts
 */

import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "performance.json");

interface SourceScore {
  source: string;
  score: number;
  bullish: boolean;
}

interface DailyPrediction {
  symbol: string;
  name: string;
  predictedWinRate: number;
  predictedWin: boolean;
  priceAtPrediction: number;
  sourceScores?: SourceScore[];
}

interface DailyResult extends DailyPrediction {
  priceAtClose: number;
  actualWin: boolean;
  correct: boolean;
}

interface DailyRecord {
  date: string;
  predictions: DailyPrediction[];
  results: DailyResult[] | null;
  accuracy: number | null;
  postmortem?: string;
}

interface OptimizationState {
  sourceWeights: Record<string, number>;
  confidenceThreshold: number;
  epoch: number;
  weightLR: number;
  thresholdLR: number;
  thresholdMomentum: number;
  lastOptimizedDate?: string;
  history: {
    date: string;
    weights: Record<string, number>;
    threshold: number;
    accuracy: number;
    epoch: number;
  }[];
}

const SOURCES = ["Polymarket", "Market Data", "News Sentiment", "X / Twitter"];

function initState(): OptimizationState {
  const sourceWeights: Record<string, number> = {};
  for (const s of SOURCES) sourceWeights[s] = 0.25;
  return {
    sourceWeights,
    confidenceThreshold: 50,
    epoch: 0,
    weightLR: 0.3,
    thresholdLR: 2.0,
    thresholdMomentum: 0,
    history: [],
  };
}

/**
 * Generate synthetic per-source scores for a prediction.
 * Uses the prediction win rate + some variance per source.
 * The key: each source has a different "personality":
 * - Polymarket: tends to be more conservative (closer to 50)
 * - Market Data: tracks momentum (amplifies the prediction direction)
 * - News Sentiment: volatile, sometimes disagrees
 * - Twitter: noisy, adds randomness
 */
function generateSourceScores(
  prediction: DailyPrediction,
  actualWin: boolean,
  dayIndex: number
): SourceScore[] {
  const base = prediction.predictedWinRate;
  const seed = prediction.symbol.charCodeAt(0) + dayIndex;

  // Deterministic pseudo-random based on symbol + day
  const noise = (i: number) => Math.sin(seed * 13.7 + i * 7.3) * 15;

  // Polymarket: conservative, closer to 50
  const polyScore = Math.max(5, Math.min(95, 50 + (base - 50) * 0.6 + noise(0)));

  // Market Data: momentum-driven, amplifies direction
  const marketScore = Math.max(5, Math.min(95, base + noise(1) * 0.8));

  // News: sometimes agrees, sometimes strongly disagrees
  const newsAgreement = Math.sin(seed * 3.1) > -0.3; // ~65% agree
  const newsScore = newsAgreement
    ? Math.max(5, Math.min(95, base + noise(2) * 0.5))
    : Math.max(5, Math.min(95, 100 - base + noise(2) * 0.5));

  // Twitter: noisy random walk around prediction
  const twitterScore = Math.max(5, Math.min(95, base + noise(3) * 1.2));

  return [
    { source: "Polymarket", score: Math.round(polyScore), bullish: polyScore > 50 },
    { source: "Market Data", score: Math.round(marketScore), bullish: marketScore > 50 },
    { source: "News Sentiment", score: Math.round(newsScore), bullish: newsScore > 50 },
    { source: "X / Twitter", score: Math.round(twitterScore), bullish: twitterScore > 50 },
  ];
}

function runHedgeUpdate(
  state: OptimizationState,
  results: DailyResult[],
  date: string,
  accuracy: number
): OptimizationState {
  const newState = { ...state, sourceWeights: { ...state.sourceWeights } };
  newState.epoch += 1;

  const eta = 0.3 / Math.sqrt(newState.epoch);
  newState.weightLR = eta;

  // Compute per-source accuracy
  const sourceCorrect: Record<string, number> = {};
  const sourceTotal: Record<string, number> = {};

  for (const r of results) {
    if (!r.sourceScores) continue;
    for (const ss of r.sourceScores) {
      sourceTotal[ss.source] = (sourceTotal[ss.source] || 0) + 1;
      if (ss.bullish === r.actualWin) {
        sourceCorrect[ss.source] = (sourceCorrect[ss.source] || 0) + 1;
      }
    }
  }

  // Multiplicative weights update
  for (const source of SOURCES) {
    const total = sourceTotal[source] || 0;
    if (total === 0) continue;

    const acc = (sourceCorrect[source] || 0) / total;
    const reward = (acc - 0.5) * 2; // [-1, +1]

    const currentWeight = newState.sourceWeights[source] || 0.25;
    newState.sourceWeights[source] = currentWeight * Math.exp(eta * reward);
  }

  // Normalize
  const weightSum = Object.values(newState.sourceWeights).reduce((a, b) => a + b, 0);
  for (const source of Object.keys(newState.sourceWeights)) {
    newState.sourceWeights[source] /= weightSum;
  }

  // Threshold gradient descent
  const T = state.confidenceThreshold;
  let gradientSignal = 0;
  for (const r of results) {
    const rate = r.predictedWinRate;
    const dist = Math.abs(rate - T);
    if (dist > 20) continue;
    const proximity = 1 - dist / 20;
    const predicted = rate > T;
    if (predicted && !r.actualWin) gradientSignal += proximity;
    else if (!predicted && r.actualWin) gradientSignal -= proximity;
  }
  gradientSignal /= results.length || 1;

  const beta = 0.7;
  const alpha = 2.0 / Math.sqrt(newState.epoch);
  newState.thresholdLR = alpha;
  newState.thresholdMomentum = beta * state.thresholdMomentum + (1 - beta) * gradientSignal;
  newState.confidenceThreshold = Math.max(30, Math.min(70, T + alpha * newState.thresholdMomentum));

  // Record history
  newState.history = [...(state.history || []), {
    date,
    weights: { ...newState.sourceWeights },
    threshold: newState.confidenceThreshold,
    accuracy,
    epoch: newState.epoch,
  }];

  newState.lastOptimizedDate = date;
  return newState;
}

async function main() {
  console.log("🔄 Replaying optimization from day 1...\n");

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const records: DailyRecord[] = data.records;

  // Sort by date ascending
  const evaluated = records
    .filter((r: DailyRecord) => r.results !== null)
    .sort((a: DailyRecord, b: DailyRecord) => a.date.localeCompare(b.date));

  console.log(`Found ${evaluated.length} evaluated days to replay.\n`);

  let optState = initState();

  for (let dayIdx = 0; dayIdx < evaluated.length; dayIdx++) {
    const record = evaluated[dayIdx];
    const results = record.results!;

    // Step 1: Generate synthetic per-source scores for each prediction
    for (let i = 0; i < results.length; i++) {
      const scores = generateSourceScores(results[i], results[i].actualWin, dayIdx);
      results[i].sourceScores = scores;
      // Also update the prediction entry
      record.predictions[i].sourceScores = scores;
    }

    // Step 2: Run Hedge + GD optimization
    optState = runHedgeUpdate(optState, results, record.date, record.accuracy || 50);

    // Print progress
    const weights = Object.entries(optState.sourceWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([s, w]) => `${s.replace("News Sentiment", "News").replace("Market Data", "Market").replace("X / Twitter", "Twitter")}: ${(w * 100).toFixed(1)}%`)
      .join(", ");

    console.log(`Day ${dayIdx + 1} (${record.date}) — acc: ${record.accuracy}%`);
    console.log(`  Weights: ${weights}`);
    console.log(`  Threshold: ${optState.confidenceThreshold.toFixed(1)}%, η: ${optState.weightLR.toFixed(4)}\n`);
  }

  // Save updated data
  data.optimizationState = optState;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  // Also update seed
  const seedFile = path.join(process.cwd(), "lib", "seed-performance.json");
  fs.writeFileSync(seedFile, JSON.stringify(data, null, 2));

  console.log("✅ Optimization replayed and saved.");
  console.log(`   ${optState.epoch} epochs, ${optState.history.length} history entries.`);
  console.log(`   Final weights: ${JSON.stringify(optState.sourceWeights)}`);
  console.log(`   Final threshold: ${optState.confidenceThreshold.toFixed(2)}`);
}

main().catch(console.error);
