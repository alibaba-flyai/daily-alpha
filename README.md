<div align="center">

# The Daily Alpha

### A self-evolving predictor for everything.

[![Deploy](https://img.shields.io/badge/deploy-vercel-black?logo=vercel)](https://daily-alpha-drab.vercel.app)
[![GitHub](https://img.shields.io/badge/repo-GitHub-181717?logo=github)](https://github.com/alibaba-flyai/daily-alpha)

</div>

**The Daily Alpha** is an agentic investment intelligence system that predicts whether *any* asset will close higher tomorrow. It aggregates real-time signals from prediction markets, market data, news sentiment, and social media — then synthesizes them through an LLM to produce a single, transparent win rate.

Every day, it makes 10 public predictions. Every day, it checks if it was right. The track record is open for everyone to see. The system **optimizes itself** using provably convergent online learning algorithms.

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
      build formula using learned
      Hedge weights, compute win rate)
                 |
                 v
         Win Rate: 64/100
```

**Four agents work in parallel.** You watch them think in real time — each source streams its findings as they arrive. Polymarket odds roll in. News headlines appear with AI-classified sentiment. Price data populates with momentum bars. Tweets surface with bullish/bearish tags. Then Gemini synthesizes everything into a single number with a transparent, KaTeX-rendered formula.

---

## Features

- **Multi-Agent Architecture** — four data agents run simultaneously with streaming execution trajectory
- **LLM-Powered Intelligence** — query expansion, sentiment classification, dynamic formula generation
- **Live Speed Meter** — animated gauge with real-time needle movement and vibration during synthesis
- **Self-Tracking Performance** — daily predictions, evaluation, accuracy chart, W/L tracking
- **Self-Improving Optimization** — Hedge algorithm + online gradient descent (see below)
- **Trending Dashboard** — most active stocks, top gainers/losers, all clickable

---

## Self-Improving via Online Optimization

Most AI systems are static after deployment. The Daily Alpha gets better every day through two mathematically grounded optimization algorithms, plus qualitative LLM feedback.

### 1. Multiplicative Weights Update (Hedge Algorithm)

Each data source has a weight $w_i$ that determines its influence on the final score. These weights are **learned from actual prediction accuracy**, not hardcoded.

**Update rule** — after each daily evaluation:

$$r_i = 2 \cdot (\text{accuracy}_i - 0.5) \quad \in [-1, +1]$$

$$w_i \leftarrow w_i \cdot \exp(\eta \cdot r_i)$$

$$w_i \leftarrow \frac{w_i}{\sum_j w_j} \quad \text{(normalize)}$$

**Learning rate decay** — ensures convergence:

$$\eta_t = \frac{\eta_0}{\sqrt{t}} = \frac{0.3}{\sqrt{t}}$$

**Regret bound** — the Hedge algorithm guarantees:

$$\text{Regret}(T) \leq O\left(\sqrt{T \ln N}\right)$$

where $T$ is the number of trading days and $N$ is the number of sources. This means after $T$ days, our cumulative loss is within $\sqrt{T \ln N}$ of the **best possible fixed-weight strategy** we could have chosen in hindsight. This is provably optimal — no online algorithm can do better.

**What you see:** On the dashboard, source weights shift over time. If News Sentiment has been the most accurate source, its weight grows from 25% toward 40%. If Twitter is noisy, it shrinks toward 5%.

### 2. Online Gradient Descent on Confidence Threshold

The system learns the optimal **decision boundary** $\tau$ — above what win rate should we predict "win"?

**Gradient signal** — for predictions near the boundary:

$$g = \frac{1}{n} \sum_{i : |p_i - \tau| < 20} \text{proximity}_i \cdot \begin{cases} +1 & \text{if false positive} \\ -1 & \text{if false negative} \\ 0 & \text{if correct} \end{cases}$$

**SGD with momentum** ($\beta = 0.7$):

$$m_t = \beta \cdot m_{t-1} + (1 - \beta) \cdot g_t$$

$$\tau_{t+1} = \text{clamp}\left(\tau_t + \alpha_t \cdot m_t, \ 30, \ 70\right)$$

$$\alpha_t = \frac{2.0}{\sqrt{t}}$$

The momentum smooths noisy daily gradients. The decaying $\alpha$ ensures convergence. The clamp $[30, 70]$ prevents degenerate solutions.

### 3. LLM Postmortem Loop (Qualitative)

After each evaluation, Gemini generates a postmortem:

```
Day N closes → Evaluate → Postmortem → Synthesize learnings → Inject into next prediction
```

> *"INTC (53% WIN) went down — moderate-confidence tech calls failed.*
> *High-conviction calls ≥ 57% were 100% accurate."*

The postmortem provides **qualitative** insights that complement the quantitative updates. Both are injected into the scorer prompt, creating a complete feedback loop.

### Convergence Properties

| Property | Mechanism | Guarantee |
|----------|-----------|-----------|
| Source weights | Hedge (multiplicative weights) | $O(\sqrt{T \ln N})$ regret |
| Decision threshold | SGD with momentum | Convergence via decaying $\alpha_t \to 0$ |
| Stability | Weight normalization + threshold clamp | Bounded parameter space |
| Adaptation | Per-epoch updates | Tracks non-stationary distributions |

### Why Online Learning?

Traditional ML would retrain on historical data. But we have:
- **Very few data points** — 10 per day
- **Non-stationary distribution** — markets change regime
- **No per-source ground truth** — only composite outcomes

Online learning algorithms like Hedge are designed exactly for this: learn incrementally, adapt to distribution shift, and guarantee performance bounds with minimal data.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| LLM | Gemini 2.5 Flash |
| Math Rendering | KaTeX |
| Prediction Markets | Polymarket public-search API |
| Market Data | Yahoo Finance v8 Chart API |
| News | Google News RSS |
| Social | X/Twitter Syndication API |
| Streaming | Server-Sent Events (SSE) |
| Optimization | Hedge + Online GD (`lib/optimizer.ts`) |

---

## Quick Start

```bash
git clone https://github.com/alibaba-flyai/daily-alpha.git
cd daily-alpha
npm install

echo 'GEMINI_API_KEY=your-key-here' > .env.local

# Seed 7 days of backtest data
npx tsx scripts/seed-performance.ts

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and search anything.

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/predict` | POST | Stream-analyze any asset (SSE) |
| `/api/trending` | GET | Today's most active, gainers, losers |
| `/api/performance` | GET/POST | Track record + generate today's picks |
| `/api/intraday` | GET | Live intraday prices for multiple tickers |
| `/api/cron` | GET | Daily: evaluate → optimize → generate (Mon-Fri 4:05 PM ET) |

---

## Architecture

```
app/
  api/
    predict/          SSE streaming prediction engine
    trending/         Yahoo Finance trending data
    performance/      Track record + daily prediction generation
    intraday/         Live intraday price data
    cron/             Daily evaluation + optimization + persistence

components/
    AgentPanel          Per-source visualization (markets, headlines, tweets, prices)
    SpeedMeter          Animated semicircular gauge with live needle
    Trajectory          Streaming execution timeline with interim results
    PerformancePanel    Track record with chart, day tabs, market clock
    OptimizationPanel   Weight evolution, threshold, convergence visualization
    TrendingSection     Homepage trending dashboard
    TypewriterText      Streaming character-by-character narrative reveal

lib/
    scorer.ts           Gemini win-rate synthesis (with optimization context injection)
    optimizer.ts        Hedge algorithm + online GD (principled self-improvement)
    postmortem.ts       Daily LLM analysis of prediction accuracy
    sentiment.ts        Gemini batch sentiment classifier
    query-expander.ts   LLM query expansion (tickers, people, categories)
    performance.ts      Storage, evaluation, GitHub persistence
    sources/
      polymarket.ts     Polymarket public-search with relevance filtering
      market.ts         Yahoo Finance v8 chart with related assets
      news.ts           Google News RSS with LLM sentiment
      twitter.ts        X syndication API with caching
```

---

## The Thesis

Most investment tools give you data. Dashboards. Charts. Numbers.

**The Daily Alpha gives you a single answer**: *Should I buy this today?*

It's not a black box. The formula is visible. The sources are linked. The weights are learned. The accuracy is tracked. Every prediction is publicly accountable.

And it gets better every day — not with heuristics, but with $O(\sqrt{T \ln N})$ regret-bounded optimization.

---

<p align="center">
  <strong>The Daily Alpha</strong><br>
  <em>Buy today. Know tomorrow.</em>
</p>
