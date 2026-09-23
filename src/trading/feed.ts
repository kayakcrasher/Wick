export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export const TIMEFRAMES = [
  { id: "1m", label: "1m", granularity: 60 },
  { id: "5m", label: "5m", granularity: 300 },
  { id: "15m", label: "15m", granularity: 900 },
  { id: "1h", label: "1h", granularity: 3600 },
  { id: "6h", label: "6h", granularity: 21600 },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

const TICKER = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";
const STATS = "https://api.exchange.coinbase.com/products/BTC-USD/stats";
const CANDLES = "https://api.exchange.coinbase.com/products/BTC-USD/candles";
const WS_URL = "wss://ws-feed.exchange.coinbase.com";

export async function fetchTicker(): Promise<number> {
  const response = await fetch(TICKER);
  if (!response.ok) throw new Error("Ticker failed.");
  const body = (await response.json()) as { price?: string };
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Bad ticker.");
  return price;
}

export async function fetchChange(): Promise<number | null> {
  const response = await fetch(STATS);
  if (!response.ok) return null;
  const body = (await response.json()) as { open?: string; last?: string };
  const open = Number(body.open);
  const last = Number(body.last);
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(last)) return null;
  return (last - open) / open;
}

export async function fetchCandles(granularity: number): Promise<Candle[]> {
  const response = await fetch(`${CANDLES}?granularity=${granularity}`);
  if (!response.ok) throw new Error("Candles failed.");
  const rows = (await response.json()) as number[][];
  return rows
    .map(([t, low, high, open, close, volume]) => ({
      t: t * 1000,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
    }))
    .reverse();
}

export function applyTick(candles: Candle[], price: number, granularity: number): Candle[] {
  if (candles.length === 0) {
    const bucket = Math.floor(Date.now() / 1000 / granularity) * granularity * 1000;
    return [{ t: bucket, o: price, h: price, l: price, c: price, v: 0 }];
  }
  const bucket = Math.floor(Date.now() / 1000 / granularity) * granularity * 1000;
  const last = candles[candles.length - 1];
  if (last.t === bucket) {
    const next = { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
    return [...candles.slice(0, -1), next];
  }
  if (bucket > last.t) {
    return [...candles, { t: bucket, o: price, h: price, l: price, c: price, v: 0 }].slice(-300);
  }
  return candles;
}

export function openTicker(onPrice: (price: number) => void): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      socket?.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: ["BTC-USD"],
          channels: ["ticker"],
        }),
      );
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; price?: string };
        if (message.type !== "ticker" || !message.price) return;
        const price = Number(message.price);
        if (Number.isFinite(price) && price > 0) onPrice(price);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = () => {
      if (!stopped) retry = setTimeout(connect, 2000);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
