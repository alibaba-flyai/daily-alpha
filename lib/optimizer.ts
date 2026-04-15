/**
 * Principled self-improvement via online optimization.
 *
 * Two-level Hedge algorithm:
 * 1. Global source weights — learned across all asset classes
 * 2. Per-asset-class deltas — adjustments from global prior
 *
 * Final weights for asset class c:
 *   w_{i,c} = softmax(log(w_i^global) + δ_{i,c})
 *
 * Global Hedge: η = 0.3 / √epoch (standard convergence)
 * Class Hedge:  η_c = 0.5 / √epoch_c (faster, less data per class)
 * Delta regularization: δ decays toward 0 each epoch (stay near global)
 *
 * Regret bound: O(√T log N) for global, O(√T_c log N) per class
 */

export const DEFAULT_SOURCES = ["Polymarket", "Market Data", "News Sentiment", "X / Twitter"];
export const ASSET_CLASSES = ["equity", "crypto", "commodity", "index"] as const;
export type AssetClass = typeof ASSET_CLASSES[number];

export interface ClassWeights {
  delta: Record<string, number>; // per-source delta from global
  epoch: number; // class-specific epoch count
  effectiveWeights: Record<string, number>; // computed: softmax(log(global) + delta)
}

export interface OptHistoryEntry {
  date: string;
  weights: Record<string, number>; // global weights
  classWeights?: Record<string, Record<string, number>>; // per-class effective weights
  accuracy: number;
  accuracyBefore?: number;
  epoch: number;
  assetClass?: string;
}

export interface OptimizationState {
  // Global source weights — Hedge
  sourceWeights: Record<string, number>;

  // Per-asset-class deltas
  classDeltas: Record<string, ClassWeights>;

  // Global epoch
  epoch: number;
  weightLR: number;

  // Track last processed day
  lastOptimizedDate?: string;

  // History for visualization
  history: OptHistoryEntry[];
}

function uniformWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const s of DEFAULT_SOURCES) w[s] = 1 / DEFAULT_SOURCES.length;
  return w;
}

function zeroDelta(): Record<string, number> {
  const d: Record<string, number> = {};
  for (const s of DEFAULT_SOURCES) d[s] = 0;
  return d;
}

export function initOptimizationState(): OptimizationState {
  const classDeltas: Record<string, ClassWeights> = {};
  for (const c of ASSET_CLASSES) {
    classDeltas[c] = { delta: zeroDelta(), epoch: 0, effectiveWeights: uniformWeights() };
  }

  return {
    sourceWeights: uniformWeights(),
    classDeltas,
    epoch: 0,
    weightLR: 0.3,
    history: [],
  };
}

/**
 * Softmax: convert log-weights + deltas into normalized probabilities
 */
function softmaxWeights(globalWeights: Record<string, number>, delta: Record<string, number>): Record<string, number> {
  const logits: Record<string, number> = {};
  let maxLogit = -Infinity;

  for (const s of DEFAULT_SOURCES) {
    const gw = globalWeights[s] || (1 / DEFAULT_SOURCES.length);
    const d = delta[s] || 0;
    logits[s] = Math.log(Math.max(gw, 1e-6)) + d;
    if (logits[s] > maxLogit) maxLogit = logits[s];
  }

  // Stable softmax
  let sum = 0;
  const result: Record<string, number> = {};
  for (const s of DEFAULT_SOURCES) {
    result[s] = Math.exp(logits[s] - maxLogit);
    sum += result[s];
  }
  for (const s of DEFAULT_SOURCES) result[s] /= sum;

  return result;
}

/**
 * Hedge update on global weights.
 * sourceAccuracy: per-source accuracy (0-100) for this day
 */
function hedgeUpdateGlobal(
  weights: Record<string, number>,
  sourceAccuracy: Record<string, number>,
  epoch: number
): Record<string, number> {
  const eta = 0.3 / Math.sqrt(epoch);
  const newWeights = { ...weights };

  for (const source of DEFAULT_SOURCES) {
    const acc = sourceAccuracy[source];
    if (acc === undefined) continue;
    const reward = (acc / 100 - 0.5) * 2; // [-1, +1]
    newWeights[source] = (newWeights[source] || 0.25) * Math.exp(eta * reward);
  }

  // Normalize
  const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
  if (sum > 0) for (const s of Object.keys(newWeights)) newWeights[s] /= sum;

  return newWeights;
}

/**
 * Hedge update on per-class delta.
 * Uses higher learning rate (less data per class).
 * Delta regularized toward 0 each epoch.
 */
function hedgeUpdateClassDelta(
  classState: ClassWeights,
  globalWeights: Record<string, number>,
  sourceAccuracy: Record<string, number>
): ClassWeights {
  const newState = {
    delta: { ...classState.delta },
    epoch: classState.epoch + 1,
    effectiveWeights: {},
  };

  const eta = 0.5 / Math.sqrt(newState.epoch); // faster LR for classes
  const decay = 0.95; // regularize delta toward 0

  for (const source of DEFAULT_SOURCES) {
    const acc = sourceAccuracy[source];
    if (acc === undefined) {
      // Decay toward 0 even without data
      newState.delta[source] = (newState.delta[source] || 0) * decay;
      continue;
    }

    const reward = (acc / 100 - 0.5) * 2;
    // Update delta: shift toward sources that work for this class
    newState.delta[source] = ((newState.delta[source] || 0) * decay) + eta * reward;
  }

  // Compute effective weights: softmax(log(global) + delta)
  newState.effectiveWeights = softmaxWeights(globalWeights, newState.delta);

  return newState as ClassWeights;
}

/**
 * Get effective weights for a given asset class.
 */
export function getEffectiveWeights(state: OptimizationState, assetClass: string): Record<string, number> {
  const classState = state.classDeltas[assetClass];
  if (classState?.effectiveWeights && Object.keys(classState.effectiveWeights).length > 0) {
    return classState.effectiveWeights;
  }
  return state.sourceWeights;
}

/**
 * Full optimization step after daily evaluation.
 */
export function optimizationStep(
  state: OptimizationState,
  dayResults: {
    date: string;
    sourceAccuracy: Record<string, number>; // per-source accuracy (0-100)
    accuracy: number; // overall day accuracy
    accuracyBefore?: number;
    assetClass?: string; // if predictions are for a specific class
  }
): { state: OptimizationState; report: string } {
  const newState: OptimizationState = {
    ...state,
    sourceWeights: { ...state.sourceWeights },
    classDeltas: { ...state.classDeltas },
    history: [...(state.history || [])],
    epoch: state.epoch + 1,
  };

  const eta = 0.3 / Math.sqrt(newState.epoch);
  newState.weightLR = eta;

  // Step 1: Global Hedge update
  newState.sourceWeights = hedgeUpdateGlobal(
    state.sourceWeights,
    dayResults.sourceAccuracy,
    newState.epoch
  );

  // Step 2: Per-class delta update (if we know the class)
  const assetClass = dayResults.assetClass || "equity";
  const currentClass = state.classDeltas[assetClass] || {
    delta: zeroDelta(), epoch: 0, effectiveWeights: uniformWeights(),
  };
  newState.classDeltas[assetClass] = hedgeUpdateClassDelta(
    currentClass,
    newState.sourceWeights,
    dayResults.sourceAccuracy
  );

  // Also decay deltas for non-updated classes (regularization)
  for (const c of ASSET_CLASSES) {
    if (c === assetClass) continue;
    const cs = newState.classDeltas[c];
    if (!cs) continue;
    for (const s of DEFAULT_SOURCES) {
      cs.delta[s] = (cs.delta[s] || 0) * 0.98;
    }
    cs.effectiveWeights = softmaxWeights(newState.sourceWeights, cs.delta);
  }

  // Step 3: Record history
  const classEffective: Record<string, Record<string, number>> = {};
  for (const [c, cs] of Object.entries(newState.classDeltas)) {
    classEffective[c] = cs.effectiveWeights;
  }

  newState.history.push({
    date: dayResults.date,
    weights: { ...newState.sourceWeights },
    classWeights: classEffective,
    accuracy: dayResults.accuracy,
    accuracyBefore: dayResults.accuracyBefore,
    epoch: newState.epoch,
    assetClass,
  });

  // Keep last 30 entries
  if (newState.history.length > 30) newState.history = newState.history.slice(-30);

  newState.lastOptimizedDate = dayResults.date;

  // Report
  const gw = Object.entries(newState.sourceWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s.replace("News Sentiment", "News").replace("Market Data", "Mkt").replace("X / Twitter", "Twtr")}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  const cw = Object.entries(newState.classDeltas[assetClass]?.effectiveWeights || {})
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s.replace("News Sentiment", "News").replace("Market Data", "Mkt").replace("X / Twitter", "Twtr")}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  const report = `[Epoch ${newState.epoch}] Global: ${gw}. ${assetClass}: ${cw}. η=${eta.toFixed(4)}.`;

  return { state: newState, report };
}

/**
 * Format optimization state as context for the LLM scorer.
 */
export function formatOptimizationContext(state: OptimizationState, assetClass?: string): string {
  const effectiveWeights = assetClass
    ? getEffectiveWeights(state, assetClass)
    : state.sourceWeights;

  const weights = Object.entries(effectiveWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  const globalWeights = Object.entries(state.sourceWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s}: ${(w * 100).toFixed(1)}%`)
    .join(", ");

  return `OPTIMIZED PARAMETERS (learned from ${state.epoch} epochs via two-level Hedge algorithm):
- Source weights for ${assetClass || "all"}: ${weights}
- Global baseline weights: ${globalWeights}
- Use the source weights above in your formula. They are learned from actual prediction accuracy per asset class.
- These parameters update daily: global weights via Hedge (regret-bounded), per-class via delta adjustment.`;
}
