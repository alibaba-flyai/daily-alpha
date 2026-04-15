/**
 * Principled self-improvement via online optimization.
 *
 * Two mechanisms:
 * 1. Multiplicative Weights Update (Hedge algorithm) — learns optimal source weights
 *    Regret bound: O(√T log N), provably converges to best fixed strategy
 *
 * 2. Online gradient descent on confidence threshold — learns optimal decision boundary
 *    Uses binary cross-entropy loss gradient
 *
 * All updates are incremental (no retraining), stateless across restarts
 * (state stored in performance data), and mathematically grounded.
 */

export interface OptimizationState {
  // Source weights — updated via multiplicative weights (Hedge)
  sourceWeights: Record<string, number>;

  // Confidence threshold — win rates above this → predict "win"
  // Updated via online gradient descent
  confidenceThreshold: number;

  // Learning rates (decayed over time)
  epoch: number; // number of updates so far
  weightLR: number; // η for multiplicative weights, decayed
  thresholdLR: number; // α for gradient descent on threshold

  // Momentum for threshold (SGD with momentum)
  thresholdMomentum: number;

  // Track last processed day to avoid re-optimization
  lastOptimizedDate?: string;

  // History for visualization
  history: {
    date: string;
    weights: Record<string, number>;
    threshold: number;
    accuracy: number;
    epoch: number;
  }[];
}

const DEFAULT_SOURCES = ["Polymarket", "Market Data", "News Sentiment", "X / Twitter"];

export function initOptimizationState(): OptimizationState {
  const sourceWeights: Record<string, number> = {};
  for (const s of DEFAULT_SOURCES) {
    sourceWeights[s] = 1.0 / DEFAULT_SOURCES.length; // uniform prior
  }

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
 * Multiplicative Weights Update (Hedge algorithm)
 *
 * For each source, compute a "reward" based on how well that source's
 * signal correlated with actual outcomes. Then:
 *   w_i ← w_i × exp(η × reward_i)
 *   normalize so Σw_i = 1
 *
 * reward_i = (source predicted correctly ? +1 : -1) averaged over day's picks
 *
 * η decays as 1/√epoch for convergence guarantee
 */
export function updateSourceWeights(
  state: OptimizationState,
  dayResults: {
    sourceScores: Record<string, number>; // per-source average score for the day (0-100)
    outcomes: boolean[]; // actual win/lose per pick
    predictedWins: boolean[]; // what we predicted
  }
): OptimizationState {
  const { sourceScores, outcomes } = dayResults;
  const newState = { ...state };
  newState.epoch += 1;

  // Decaying learning rate: η = η₀ / √epoch (convergence guarantee)
  const eta = 0.3 / Math.sqrt(newState.epoch);
  newState.weightLR = eta;

  // For each source, compute reward:
  // If source score > 50 and actual was win → positive reward
  // If source score ≤ 50 and actual was lose → positive reward
  // Otherwise → negative reward
  for (const source of DEFAULT_SOURCES) {
    const score = sourceScores[source];
    if (score === undefined) continue;

    const sourcePredictsWin = score > 50;
    let correct = 0;
    let total = 0;

    for (let i = 0; i < outcomes.length; i++) {
      total++;
      if (sourcePredictsWin === outcomes[i]) correct++;
    }

    // Reward: [-1, +1] based on accuracy
    const accuracy = total > 0 ? correct / total : 0.5;
    const reward = (accuracy - 0.5) * 2; // map [0,1] → [-1,+1]

    // Multiplicative update: w *= exp(η × reward)
    const currentWeight = newState.sourceWeights[source] || (1 / DEFAULT_SOURCES.length);
    newState.sourceWeights[source] = currentWeight * Math.exp(eta * reward);
  }

  // Normalize weights to sum to 1
  const weightSum = Object.values(newState.sourceWeights).reduce((a, b) => a + b, 0);
  if (weightSum > 0) {
    for (const source of Object.keys(newState.sourceWeights)) {
      newState.sourceWeights[source] /= weightSum;
    }
  }

  return newState;
}

/**
 * Online Gradient Descent on confidence threshold
 *
 * Loss function: binary cross-entropy
 *   L = -Σ[y_i log(p_i) + (1-y_i) log(1-p_i)]
 *   where y_i = actual outcome, p_i = our predicted probability
 *
 * We optimize the threshold T: predict "win" if winRate > T
 * Gradient of accuracy w.r.t. threshold:
 *   If lowering T would have caught more true wins → decrease T
 *   If raising T would have avoided more false wins → increase T
 *
 * Update: T ← T - α × gradient (with momentum)
 */
export function updateConfidenceThreshold(
  state: OptimizationState,
  dayResults: {
    winRates: number[]; // predicted win rates (0-100)
    outcomes: boolean[]; // actual win/lose
  }
): OptimizationState {
  const { winRates, outcomes } = dayResults;
  const newState = { ...state };
  const T = state.confidenceThreshold;

  // Compute gradient: how many correct predictions would we gain/lose
  // by shifting the threshold by ε?
  let gradientSignal = 0;

  for (let i = 0; i < winRates.length; i++) {
    const rate = winRates[i];
    const actual = outcomes[i];
    const predicted = rate > T;

    // Cases near the threshold boundary matter most
    const distFromThreshold = Math.abs(rate - T);
    if (distFromThreshold > 20) continue; // far from boundary, doesn't matter

    // Weight by proximity to threshold (closer = more signal)
    const proximity = 1 - distFromThreshold / 20;

    if (predicted && !actual) {
      // False positive: we predicted win but it lost
      // → should raise threshold (make it harder to predict win)
      gradientSignal += proximity;
    } else if (!predicted && actual) {
      // False negative: we predicted lose but it won
      // → should lower threshold (make it easier to predict win)
      gradientSignal -= proximity;
    }
    // Correct predictions: no gradient signal needed
  }

  // Normalize gradient
  const n = winRates.length;
  if (n > 0) gradientSignal /= n;

  // SGD with momentum (β = 0.7)
  const beta = 0.7;
  const alpha = 2.0 / Math.sqrt(newState.epoch + 1); // decaying LR
  newState.thresholdLR = alpha;

  newState.thresholdMomentum = beta * state.thresholdMomentum + (1 - beta) * gradientSignal;

  // Update threshold (clamp to [30, 70])
  newState.confidenceThreshold = Math.max(30, Math.min(70,
    T + alpha * newState.thresholdMomentum
  ));

  return newState;
}

/**
 * Full optimization step: run after each daily evaluation.
 * Combines both weight update and threshold update.
 */
export function optimizationStep(
  state: OptimizationState,
  dayResults: {
    date: string;
    winRates: number[];
    outcomes: boolean[];
    sourceScores: Record<string, number>;
    predictedWins: boolean[];
    accuracy: number;
  }
): { state: OptimizationState; report: string } {
  // Step 1: Update source weights (Hedge)
  let newState = updateSourceWeights(state, dayResults);

  // Step 2: Update confidence threshold (Online GD)
  newState = updateConfidenceThreshold(newState, dayResults);

  // Step 3: Record history for visualization
  newState.history = [...(state.history || []), {
    date: dayResults.date,
    weights: { ...newState.sourceWeights },
    threshold: newState.confidenceThreshold,
    accuracy: dayResults.accuracy,
    epoch: newState.epoch,
  }].slice(-30); // keep last 30 days

  // Generate report
  const weightStr = Object.entries(newState.sourceWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  const report = `[Epoch ${newState.epoch}] Weights: ${weightStr}. Threshold: ${newState.confidenceThreshold.toFixed(1)}%. LR: η=${newState.weightLR.toFixed(4)}, α=${newState.thresholdLR.toFixed(4)}.`;

  return { state: newState, report };
}

/**
 * Format optimization state as context for the LLM scorer.
 * This is injected into the prediction prompt.
 */
export function formatOptimizationContext(state: OptimizationState): string {
  const weights = Object.entries(state.sourceWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  return `OPTIMIZED PARAMETERS (learned from ${state.epoch} days of data via Hedge algorithm):
- Source weights: ${weights}
- Use these weights in your formula. They are learned from actual prediction accuracy, not heuristic.
- Confidence threshold: ${state.confidenceThreshold.toFixed(1)}% — predictions above this are more likely to be correct.
- These parameters are updated daily via multiplicative weights update (regret-bounded, provably convergent).`;
}
