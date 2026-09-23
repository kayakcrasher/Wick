import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Chart } from "./Chart";
import { createDesk, getBook, selectDesk, subscribe, writeDesk } from "./store";
import { runCommand } from "./trading/commands";
import {
  btc,
  equity,
  liquidationPrice,
  liquidate,
  openPosition,
  closePosition,
  signedUsd,
  unrealizedPnl,
  usd,
  MAX_LEVERAGE,
  TAKER_FEE,
} from "./trading/engine";
import {
  TIMEFRAMES,
  applyTick,
  fetchCandles,
  fetchChange,
  fetchTicker,
  openTicker,
  type Candle,
  type TimeframeId,
} from "./trading/feed";
import type { Desk, Position, Side } from "./trading/types";

export function App() {
  const book = useSyncExternalStore(subscribe, getBook, getBook);
  const desk = book.desks.find((item) => item.id === book.activeId) ?? null;
  const [mark, setMark] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tf, setTf] = useState<TimeframeId>("1m");
  const [live, setLive] = useState(false);

  const granularity = TIMEFRAMES.find((item) => item.id === tf)?.granularity ?? 60;

  useEffect(() => {
    let stop = false;
    const pull = () => {
      fetchTicker()
        .then((price) => {
          if (!stop) setMark(price);
        })
        .catch(() => undefined);
    };
    pull();
    const poll = window.setInterval(pull, 4000);
    const closeWs = openTicker((price) => {
      setLive(true);
      setMark(price);
    });
    fetchChange()
      .then((value) => {
        if (!stop) setChange(value);
      })
      .catch(() => undefined);
    const stats = window.setInterval(() => {
      fetchChange()
        .then(setChange)
        .catch(() => undefined);
    }, 60_000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(stats);
      closeWs();
    };
  }, []);

  useEffect(() => {
    let stop = false;
    fetchCandles(granularity)
      .then((rows) => {
        if (!stop) setCandles(rows);
      })
      .catch(() => {
        if (!stop) setCandles([]);
      });
    return () => {
      stop = true;
    };
  }, [granularity]);

  useEffect(() => {
    if (!mark) return;
    setCandles((rows) => applyTick(rows, mark, granularity));
  }, [mark, granularity]);

  useEffect(() => {
    if (!desk || !mark) return;
    const next = liquidate(desk, mark);
    if (next !== desk) writeDesk(next);
  }, [desk, mark]);

  if (!desk) return <StartGate desks={book.desks} />;

  return (
    <DeskScreen
      name={desk.name}
      activeId={desk.id}
      desks={book.desks.map((item) => ({ id: item.id, name: item.name }))}
      onSelect={selectDesk}
      cash={desk.cash}
      positions={desk.positions}
      fills={desk.fills}
      mark={mark}
      change={change}
      live={live}
      candles={candles}
      tf={tf}
      onTf={setTf}
      onOpen={(side, notional, leverage) => {
        if (!mark) throw new Error("Waiting for a BTC price.");
        writeDesk(openPosition(desk, { side, notional, leverage, mark }));
      }}
      onClose={(id) => {
        if (!mark) throw new Error("Waiting for a BTC price.");
        writeDesk(closePosition(desk, id, mark).desk);
      }}
      onCommand={(line) => {
        if (!mark) throw new Error("Waiting for a BTC price.");
        const result = runCommand(desk, line, mark);
        writeDesk(result.desk);
        return result.message;
      }}
    />
  );
}

function StartGate({ desks }: { desks: { id: string; name: string; cash: number }[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  return (
    <main className="gate">
      <p className="kicker">Paper desk</p>
      <h1>Wick</h1>
      <p className="lede">
        $100,000 in dry powder. BTC perpetuals. Leverage up to 100x. The price is live. The money is not.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            createDesk(name);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not fund the desk.");
          }
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Desk name"
          maxLength={18}
          aria-label="Desk name"
          autoFocus
        />
        <button type="submit">Fund $100,000</button>
        {error ? <p className="error">{error}</p> : null}
      </form>
      {desks.length > 0 ? (
        <ul className="desk-list">
          {desks.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => selectDesk(item.id)}>
                <span>{item.name}</span>
                <span className="mono">{usd(item.cash)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

function DeskScreen(props: {
  name: string;
  activeId: string;
  desks: { id: string; name: string }[];
  onSelect: (id: string) => void;
  cash: number;
  positions: Position[];
  fills: { id: string; text: string; tone: string }[];
  mark: number | null;
  change: number | null;
  live: boolean;
  candles: Candle[];
  tf: TimeframeId;
  onTf: (id: TimeframeId) => void;
  onOpen: (side: Side, notional: number, leverage: number) => void;
  onClose: (id: string) => void;
  onCommand: (line: string) => string;
}) {
  const eq = props.mark
    ? equity(
        {
          id: props.activeId,
          name: props.name,
          cash: props.cash,
          positions: props.positions,
          fills: [],
          createdAt: 0,
        } satisfies Desk,
        props.mark,
      )
    : props.cash;
  const up = (props.change ?? 0) >= 0;

  return (
    <main className="desk">
      <header className="top">
        <div className="brand">
          <h1>Wick</h1>
          <span className="product">BTC-PERP</span>
        </div>
        <div className="quote">
          <strong className={props.mark ? (up ? "up" : "down") : ""}>
            {props.mark ? usd(props.mark) : "—"}
          </strong>
          <span className={up ? "up" : "down"}>
            {props.change == null ? "" : `${up ? "+" : ""}${(props.change * 100).toFixed(2)}%`}
          </span>
          <span className="live">{props.live ? "LIVE" : "POLL"}</span>
        </div>
        <div className="account">
          <span className="label">Equity</span>
          <strong className="mono">{usd(eq)}</strong>
          <span className="muted mono">cash {usd(props.cash)}</span>
        </div>
        <label className="switcher">
          <span className="sr">{props.name}</span>
          <select
            aria-label="Desk"
            value={props.activeId}
            onChange={(event) => {
              if (event.target.value === "new") {
                const next = window.prompt("Desk name");
                if (next) {
                  try {
                    createDesk(next);
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : "Could not fund.");
                  }
                }
                return;
              }
              props.onSelect(event.target.value);
            }}
          >
            {props.desks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="new">New desk</option>
          </select>
        </label>
      </header>

      <section className="stage">
        <div className="chart-panel">
          <div className="chart-bar">
            <span>BTC-USD</span>
            <div className="tfs">
              {TIMEFRAMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === props.tf ? "on" : ""}
                  onClick={() => props.onTf(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <Chart candles={props.candles} positions={props.positions} mark={props.mark} />
        </div>

        <Ticket mark={props.mark} cash={props.cash} onOpen={props.onOpen} />

        <section className="positions">
          <header>
            <h2>Positions</h2>
            <span className="muted">{props.positions.length} open</span>
          </header>
          {props.positions.length === 0 ? (
            <p className="empty">Flat. Long or short from the ticket, or type /long 10000 25x.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>Liq</th>
                    <th>Lev</th>
                    <th>uPnL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {props.positions.map((position) => {
                    const pnl = props.mark
                      ? unrealizedPnl(position.side, position.entry, position.qty, props.mark)
                      : 0;
                    return (
                      <tr key={position.id}>
                        <td className={position.side}>{position.side}</td>
                        <td className="mono">{btc(position.qty)}</td>
                        <td className="mono">{usd(position.entry)}</td>
                        <td className="mono liq">
                          {usd(liquidationPrice(position.side, position.entry, position.leverage))}
                        </td>
                        <td className="mono">{position.leverage}x</td>
                        <td className={pnl >= 0 ? "up mono" : "down mono"}>{signedUsd(pnl)}</td>
                        <td>
                          <button type="button" className="ghost" onClick={() => props.onClose(position.id)}>
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <CommandBar fills={props.fills} onCommand={props.onCommand} />
    </main>
  );
}

function Ticket({
  mark,
  cash,
  onOpen,
}: {
  mark: number | null;
  cash: number;
  onOpen: (side: Side, notional: number, leverage: number) => void;
}) {
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState("10000");
  const [leverage, setLeverage] = useState(10);
  const [error, setError] = useState("");

  const notional = Number(size);
  const preview = useMemo(() => {
    if (!mark || !Number.isFinite(notional) || notional <= 0) return null;
    const margin = notional / leverage;
    const fee = notional * TAKER_FEE;
    const liq = liquidationPrice(side, mark, leverage);
    return { margin, fee, liq };
  }, [mark, notional, leverage, side]);

  return (
    <form
      className="ticket"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onOpen(side, notional, leverage);
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Order rejected.");
        }
      }}
    >
      <div className="sides">
        <button type="button" className={side === "long" ? "long on" : ""} onClick={() => setSide("long")}>
          Long
        </button>
        <button type="button" className={side === "short" ? "short on" : ""} onClick={() => setSide("short")}>
          Short
        </button>
      </div>
      <label>
        Notional
        <input
          inputMode="decimal"
          value={size}
          onChange={(event) => setSize(event.target.value.replace(/[^0-9.]/g, ""))}
          aria-label="Notional in dollars"
        />
      </label>
      <label>
        Leverage {leverage}x
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          value={leverage}
          onChange={(event) => setLeverage(Number(event.target.value))}
          aria-label="Leverage"
        />
      </label>
      <dl>
        <div>
          <dt>Margin</dt>
          <dd className="mono">{preview ? usd(preview.margin) : "—"}</dd>
        </div>
        <div>
          <dt>Liq</dt>
          <dd className="mono">{preview ? usd(preview.liq) : "—"}</dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd className="mono">{preview ? usd(preview.fee) : "—"}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd className="mono">{usd(cash)}</dd>
        </div>
      </dl>
      <button type="submit" className={side} disabled={!mark}>
        {side === "long" ? "Buy" : "Sell"} {leverage}x
      </button>
      {error ? <p className="error">{error}</p> : <p className="hint">Isolated. 100x dies on a 0.5% move.</p>}
    </form>
  );
}

function CommandBar({
  fills,
  onCommand,
}: {
  fills: { id: string; text: string; tone: string }[];
  onCommand: (line: string) => string;
}) {
  const [line, setLine] = useState("");
  const [note, setNote] = useState(" /long 10000 25x");

  return (
    <footer className="command">
      <p className={`note ${fills[0]?.tone ?? ""}`}>{fills[0]?.text ?? note}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const message = onCommand(line);
            setNote(message);
            setLine("");
          } catch (err) {
            setNote(err instanceof Error ? err.message : "Rejected.");
          }
        }}
      >
        <span aria-hidden="true">{">"}</span>
        <input
          value={line}
          onChange={(event) => setLine(event.target.value)}
          placeholder="/long 10000 25x"
          aria-label="Command"
          spellCheck={false}
        />
      </form>
    </footer>
  );
}
