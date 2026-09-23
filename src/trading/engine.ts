import type { Desk, Fill, Position, Side } from "./types";

export const STARTING_CASH = 100_000;
export const MAX_LEVERAGE = 100;
export const TAKER_FEE = 0.0004;
export const MMR = 0.005;
export const MIN_NOTIONAL = 10;

export function liquidationPrice(side: Side, entry: number, leverage: number): number {
  const imr = 1 / leverage;
  if (side === "long") return entry * (1 - imr + MMR);
  return entry * (1 + imr - MMR);
}

export function unrealizedPnl(side: Side, entry: number, qty: number, mark: number): number {
  const diff = side === "long" ? mark - entry : entry - mark;
  return diff * qty;
}

export function isLiquidated(side: Side, mark: number, liq: number): boolean {
  return side === "long" ? mark <= liq : mark >= liq;
}

export function equity(desk: Desk, mark: number): number {
  let total = desk.cash;
  for (const position of desk.positions) {
    total += position.margin + unrealizedPnl(position.side, position.entry, position.qty, mark);
  }
  return total;
}

function fill(text: string, tone: Fill["tone"]): Fill {
  return { id: crypto.randomUUID(), ts: Date.now(), text, tone };
}

function pushFill(desk: Desk, next: Fill): Fill[] {
  return [next, ...desk.fills].slice(0, 40);
}

export function openPosition(
  desk: Desk,
  input: { side: Side; notional: number; leverage: number; mark: number },
): Desk {
  const leverage = Math.round(input.leverage);
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > MAX_LEVERAGE) {
    throw new Error("Leverage is 1x to 100x.");
  }
  const notional = input.notional;
  if (!Number.isFinite(notional) || notional < MIN_NOTIONAL) {
    throw new Error("Size must be at least $10.");
  }
  if (!Number.isFinite(input.mark) || input.mark <= 0) {
    throw new Error("Waiting for a BTC price.");
  }
  const margin = notional / leverage;
  const openFee = notional * TAKER_FEE;
  if (margin + openFee > desk.cash + 1e-8) {
    throw new Error("Not enough cash for that margin.");
  }
  const position: Position = {
    id: crypto.randomUUID(),
    side: input.side,
    qty: notional / input.mark,
    entry: input.mark,
    leverage,
    margin,
    notional,
    openedAt: Date.now(),
  };
  const sideLabel = input.side === "long" ? "Long" : "Short";
  return {
    ...desk,
    cash: desk.cash - margin - openFee,
    positions: [position, ...desk.positions],
    fills: pushFill(
      desk,
      fill(
        `${sideLabel} ${position.qty.toFixed(6)} BTC · ${usd(notional, 0)} · ${leverage}x`,
        input.side,
      ),
    ),
  };
}

export function closePosition(desk: Desk, id: string, mark: number): { desk: Desk; realized: number } {
  const position = desk.positions.find((item) => item.id === id);
  if (!position) throw new Error("That position is already closed.");
  if (!Number.isFinite(mark) || mark <= 0) throw new Error("Waiting for a BTC price.");
  const pnl = unrealizedPnl(position.side, position.entry, position.qty, mark);
  const closeFee = position.qty * mark * TAKER_FEE;
  const credit = position.margin + pnl - closeFee;
  const realized = pnl - closeFee;
  const verb = position.side === "long" ? "Closed long" : "Closed short";
  return {
    realized,
    desk: {
      ...desk,
      cash: desk.cash + Math.max(0, credit),
      positions: desk.positions.filter((item) => item.id !== id),
      fills: pushFill(desk, fill(`${verb} ${signedUsd(realized)}`, realized >= 0 ? "long" : "short")),
    },
  };
}

export function closeMatching(desk: Desk, mark: number, side?: Side): { desk: Desk; realized: number } {
  const targets = desk.positions.filter((position) => !side || position.side === side);
  if (targets.length === 0) throw new Error(side ? `No ${side} open.` : "Nothing open.");
  let next = desk;
  let realized = 0;
  for (const position of targets) {
    const closed = closePosition(next, position.id, mark);
    next = closed.desk;
    realized += closed.realized;
  }
  return { desk: next, realized };
}

export function liquidate(desk: Desk, mark: number): Desk {
  if (!Number.isFinite(mark) || mark <= 0) return desk;
  const kept: Position[] = [];
  let fills = desk.fills;
  let hit = false;
  for (const position of desk.positions) {
    const liq = liquidationPrice(position.side, position.entry, position.leverage);
    if (!isLiquidated(position.side, mark, liq)) {
      kept.push(position);
      continue;
    }
    hit = true;
    const next = fill(
      `Liquidated ${position.side} ${position.qty.toFixed(6)} BTC · margin ${usd(position.margin)} gone`,
      "liq",
    );
    fills = [next, ...fills].slice(0, 40);
  }
  if (!hit) return desk;
  return { ...desk, positions: kept, fills };
}

export function usd(value: number, digits = 2): string {
  const sign = value < 0 ? "-" : "";
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${sign}$${body}`;
}

export function signedUsd(value: number): string {
  if (value > 0) return `+${usd(value)}`;
  if (value < 0) return usd(value);
  return usd(0);
}

export function btc(qty: number): string {
  return qty.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
