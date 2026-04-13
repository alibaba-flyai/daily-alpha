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

The system evolves:
- **Query expansion** learns to search broader as it discovers what Polymarket, news, and Twitter actually cover
- **Sentiment analysis** uses LLM understanding, not keyword matching -- "FSD approved in Netherlands" is bullish even though no keyword says so
- **Formula weights** are dynamically assigned per query -- Polymarket matters more for prediction-market-native events, price momentum matters more for stocks
- **Performance tracking** creates accountability -- if accuracy drops below 50%, something needs to change

This is day one. The track record starts now.

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/predict` | POST | Stream-analyze any asset (SSE) |
| `/api/trending` | GET | Today's most active, gainers, losers |
| `/api/performance` | GET | Prediction track record + auto-evaluate |
| `/api/intraday` | GET | Live intraday prices for multiple tickers |

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
  AgentPanel       Rich per-source visualization (markets, headlines, tweets, prices)
  SpeedMeter       Animated semicircular gauge with live needle
  Trajectory       Streaming execution timeline with interim results
  SearchBar        Controlled search input
  TrendingSection  Homepage trending dashboard
  PerformancePanel Track record with chart, tabs, market clock

lib/
  scorer.ts        Gemini-powered win-rate synthesis
  sentiment.ts     Gemini batch sentiment classifier
  query-expander.ts LLM query expansion (tickers, people, categories)
  performance.ts   Prediction storage and evaluation
  types.ts         Shared TypeScript types
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
