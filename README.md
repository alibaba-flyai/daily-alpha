# The Daily Alpha

### A self-evolving predictor for everything.

**The Daily Alpha** is an agentic investment intelligence system that predicts whether *any* asset will close higher tomorrow. It aggregates real-time signals from prediction markets, market data, news sentiment, and social media -- then synthesizes them through an LLM to produce a single, transparent win rate.

Every day, it makes 10 public predictions. Every day, it checks if it was right. The track record is open for everyone to see.

---

## How It Works

```
         You search: "Tesla"
                 |
    +------------+-------------+
    |            |             |
    v            v             v
 Polymarket   Yahoo Finance  Google News    X / Twitter
 (prediction   (price action,  (headline     (tweet sentiment
  market odds)  momentum)      sentiment)     via syndication)
    |            |             |              |
    +------------+-------------+--------------+
                 |
                 v
          Gemini 2.5 Flash
     (synthesize all signals,
      define "win", build formula,
      compute win rate)
                 |
                 v
         Win Rate: 64/100
    "Tesla has a 64% chance of
     closing higher tomorrow"
```

**Four agents work in parallel.** You watch them think in real time -- each source streams its findings as they arrive. Polymarket odds roll in. News headlines appear with AI-classified sentiment. Price data populates with momentum bars. Tweets surface with bullish/bearish tags. Then Gemini synthesizes everything into a single number with a transparent, LaTeX-rendered formula.

---

## Features

**Multi-Agent Architecture**
- Four data agents (Polymarket, Yahoo Finance, Google News, X/Twitter) run simultaneously
- Streaming execution trajectory shows each agent's thinking process
- Rich interim results: market odds with volume, headlines with source badges, price sparklines, tweet cards

**LLM-Powered Intelligence**
- **Query Expansion**: "alibaba" automatically expands to BABA, Qwen, Jack Ma, best AI model, etc.
- **Sentiment Classification**: Gemini classifies every headline and tweet as bullish/bearish/neutral based on investment implications, not just keywords
- **Dynamic Formula**: Each query gets a custom-weighted formula -- Gemini decides how much to trust each source for *this specific* asset
- **Win Definition**: Objective, measurable criteria for what "win" means (e.g., "TSLA closing price tomorrow > today's close")

**Live Speed Meter**
- Animated gauge that moves in real time as agents report scores
- Vibrates during LLM synthesis, then locks onto final value
- Color-coded: red (bearish) to yellow (neutral) to green (bullish)

**Self-Tracking Performance**
- Every day: auto-picks 10 trending assets, predicts each
- Every day: evaluates yesterday's predictions against real market data
- Historical accuracy chart with interactive hover tooltips
- Day-by-day tab browser showing predictions, actuals, and W/L
- Live intraday sparklines during market hours
- Market clock with countdown to open/close

**Trending Dashboard**
- Most active stocks by volume
- Top gainers and losers
- Trending tickers by search interest
- All clickable to instantly analyze

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| LLM | Gemini 2.5 Flash (scoring, sentiment, query expansion) |
| Math Rendering | KaTeX |
| Prediction Markets | Polymarket public-search API |
| Market Data | Yahoo Finance v8 Chart API |
| News | Google News RSS |
| Social | X/Twitter Syndication API |
| Streaming | Server-Sent Events (SSE) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/alibaba-flyai/daily-alpha.git
cd daily-alpha

# Install
npm install

# Configure
echo 'GEMINI_API_KEY=your-key-here' > .env.local

# Seed 7 days of backtest data
npx tsx scripts/seed-performance.ts

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and search anything.

---

## The Thesis

Most investment tools give you data. Dashboards. Charts. Numbers.

**The Daily Alpha gives you a single answer**: *Should I buy this today?*

It's not a black box. The formula is visible. The sources are linked. The sentiment reasoning is explained. And every prediction is publicly tracked -- no cherry-picking, no hindsight bias.

The system evolves -- not with heuristics, but with principled optimization.

---

## Self-Improving via Online Optimization

Most AI systems are static after deployment. The Daily Alpha gets better every day through two mathematically grounded optimization algorithms, plus qualitative LLM feedback.

### 1. Multiplicative Weights Update (Hedge Algorithm)

Each data source (Polymarket, Yahoo Finance, News, Twitter) has a weight that determines how much it influences the final score. These weights are **learned from actual prediction accuracy**, not hardcoded.

```
After each daily evaluation:
  For each source i:
    reward_i = (source accuracy - 0.5) * 2     # map [0,1] -> [-1,+1]
    w_i = w_i * exp(eta * reward_i)             # multiplicative update
  Normalize: w_i = w_i / sum(w)                 # weights sum to 1
  Decay: eta = 0.3 / sqrt(epoch)               # learning rate shrinks
```

**Why this works:** The Hedge algorithm is a foundational result in online learning theory. It guarantees a regret bound of O(sqrt(T * log N)) -- meaning after T days, our cumulative loss is within sqrt(T * log N) of the best possible fixed-weight strategy we could have chosen in hindsight. This is provably optimal.

**What you see:** On the dashboard, source weights shift over time. If News Sentiment has been the most accurate source for equities, its weight grows from 25% toward 40%. If Twitter sentiment is noisy, its weight shrinks toward 5%. The system converges toward the empirically best weighting.

### 2. Online Gradient Descent on Confidence Threshold

The system also learns the optimal **decision boundary** -- above what win rate should we predict "win"?

```
For each prediction near the threshold boundary:
  If false positive (predicted win, actual lose):
    gradient += proximity_weight      # push threshold up
  If false negative (predicted lose, actual win):
    gradient -= proximity_weight      # push threshold down

SGD with momentum:
  momentum = 0.7 * momentum + 0.3 * gradient
  threshold = threshold - alpha * momentum
  alpha = 2.0 / sqrt(epoch)          # decaying learning rate
  threshold = clamp(threshold, 30, 70)  # stability bounds
```

**Why this works:** This is standard SGD with momentum applied to a binary classification boundary. The momentum term (beta=0.7) smooths noisy daily gradients. The decaying learning rate ensures convergence -- early days make large adjustments, later days make fine-tuning tweaks. The clamp prevents degenerate solutions.

### 3. LLM Postmortem Loop (Qualitative)

After each daily evaluation, Gemini analyzes the results:

```
Day N closes -> Evaluate predictions -> Postmortem
                                           |
  "INTC (53% WIN) went down -- moderate-confidence
   tech calls failed. High-conviction >= 57% calls
   were 100% accurate."
                                           |
                                    Synthesize learnings
                                           |
  "Rule: Only trust WIN signals >= 57%.
   Rule: Momentum signals work for large-cap tech
   but fail for hardware stocks."
                                           |
                                    Inject into next prediction
```

The postmortem provides **qualitative** insights that complement the quantitative Hedge/GD updates. Together, they form a complete feedback loop.

### Convergence Visualization

The optimization dashboard shows:
- **Weight evolution chart** -- colored lines per source diverging from the 25% uniform baseline
- **Threshold + accuracy trend** -- the decision boundary shifting as it learns
- **Learning rate decay** -- progress bar showing convergence (eta shrinking toward zero)
- **Latest insight** -- the most recent postmortem analysis

### Why Not Just Retrain?

Traditional ML would retrain a model on historical data. But we have:
- Very few data points (1 per day)
- Non-stationary distribution (markets change)
- No ground truth for source weights (only composite outcomes)

Online learning algorithms like Hedge are designed exactly for this: **learn incrementally, adapt to distribution shift, and guarantee performance bounds with minimal data**. They're the right tool for a self-improving daily predictor.

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/predict` | POST | Stream-analyze any asset (SSE) |
| `/api/trending` | GET | Today's most active, gainers, losers |
| `/api/performance` | GET/POST | Prediction track record + generate today's picks |
| `/api/intraday` | GET | Live intraday prices for multiple tickers |
| `/api/cron` | GET | Daily cron: evaluate, optimize, generate (Mon-Fri 4:05 PM ET) |

---

## Architecture

```
app/
  api/
    predict/       SSE streaming prediction engine
    trending/      Yahoo Finance trending data
    performance/   Daily prediction track record
    intraday/      Live intraday price data
  page.tsx         Main page with two-column layout

components/
  AgentPanel          Rich per-source visualization (markets, headlines, tweets, prices)
  SpeedMeter          Animated semicircular gauge with live needle
  Trajectory          Streaming execution timeline with interim results
  SearchBar           Controlled search input
  TrendingSection     Homepage trending dashboard
  PerformancePanel    Track record with chart, tabs, market clock
  OptimizationPanel   Weight evolution, threshold, convergence visualization
  TypewriterText      Streaming character-by-character text reveal

lib/
  scorer.ts           Gemini-powered win-rate synthesis (with optimization context injection)
  sentiment.ts        Gemini batch sentiment classifier
  query-expander.ts   LLM query expansion (tickers, people, categories)
  performance.ts      Prediction storage, evaluation, GitHub persistence
  optimizer.ts        Hedge algorithm + online GD (principled self-improvement)
  postmortem.ts       Daily LLM analysis of prediction accuracy
  types.ts            Shared TypeScript types
  sources/
    polymarket.ts  Polymarket public-search with relevance filtering
    market.ts      Yahoo Finance v8 chart with related assets
    news.ts        Google News RSS with LLM sentiment
    twitter.ts     X syndication API with caching
```

---

## License

MIT

---

<p align="center">
  <strong>The Daily Alpha</strong><br>
  <em>Buy today. Know tomorrow.</em>
</p>
