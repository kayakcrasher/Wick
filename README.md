# Wick

Paper-trade BTC perpetuals against the live Coinbase price. Each desk starts with **$100,000**. Leverage runs from **1x to 100x**. Nothing here is real money.

```bash
npm install
npm run dev
```

Open the local URL Vite prints. Name a desk, then buy or sell.

## How a trade works

Size is **notional** in dollars. Margin is notional divided by leverage. A taker fee of **0.04%** is charged on the open and the close. Maintenance margin is **0.5%**.

A 100x long liquidates about **0.5%** through the entry. Isolated margin: a liquidation takes that position’s margin and nothing else.

## Commands

The bar at the bottom speaks the same grammar a Telegram bot would.

| Command | What it does |
| --- | --- |
| `/long 10000 25x` | Long $10,000 notional at 25x |
| `/short 5000 10x` | Short $5,000 notional at 10x |
| `/close` | Close every open position |
| `/close long` | Close longs only |
| `/bal` | Print cash and equity |
| `/help` | List commands |

Desks stay in this browser (`localStorage`). Clearing site data wipes them.
