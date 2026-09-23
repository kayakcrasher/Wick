import assert from "node:assert/strict";
import test from "node:test";
import { runCommand } from "../src/trading/commands.ts";
import {
  STARTING_CASH,
  TAKER_FEE,
  closePosition,
  equity,
  liquidationPrice,
  liquidate,
  openPosition,
  unrealizedPnl,
} from "../src/trading/engine.ts";
import type { Desk } from "../src/trading/types.ts";

function desk(): Desk {
  return {
    id: "d1",
    name: "Test",
    cash: STARTING_CASH,
    positions: [],
    fills: [],
    createdAt: 0,
  };
}

test("100x long liquidates half a percent under entry", () => {
  const entry = 80_000;
  const liq = liquidationPrice("long", entry, 100);
  assert.ok(Math.abs(liq - entry * 0.995) < 1e-6);
});

test("25x short liquidates above entry", () => {
  const entry = 80_000;
  const liq = liquidationPrice("short", entry, 25);
  assert.ok(Math.abs(liq - entry * 1.035) < 1e-6);
});

test("open locks margin plus the taker fee", () => {
  const next = openPosition(desk(), { side: "long", notional: 10_000, leverage: 100, mark: 80_000 });
  const fee = 10_000 * TAKER_FEE;
  assert.equal(next.positions.length, 1);
  assert.equal(next.positions[0].margin, 100);
  assert.ok(Math.abs(next.cash - (STARTING_CASH - 100 - fee)) < 1e-6);
  assert.ok(Math.abs(next.positions[0].qty - 10_000 / 80_000) < 1e-10);
});

test("a winning close returns margin and pnl minus the close fee", () => {
  const opened = openPosition(desk(), { side: "long", notional: 10_000, leverage: 10, mark: 80_000 });
  const position = opened.positions[0];
  const mark = 81_000;
  const closed = closePosition(opened, position.id, mark);
  const pnl = unrealizedPnl("long", 80_000, position.qty, mark);
  const closeFee = position.qty * mark * TAKER_FEE;
  assert.ok(Math.abs(closed.realized - (pnl - closeFee)) < 1e-6);
  assert.ok(closed.desk.positions.length === 0);
  assert.ok(closed.desk.cash > opened.cash);
});

test("liquidation forfeits isolated margin and leaves other cash", () => {
  const opened = openPosition(desk(), { side: "long", notional: 10_000, leverage: 100, mark: 80_000 });
  const busted = liquidate(opened, liquidationPrice("long", 80_000, 100) - 1);
  assert.equal(busted.positions.length, 0);
  assert.ok(busted.cash < STARTING_CASH);
  assert.ok(Math.abs(busted.cash - opened.cash) < 1e-6);
});

test("telegram-style command opens and reports a balance", () => {
  const opened = runCommand(desk(), "/long 10000 25x", 75_000);
  assert.equal(opened.desk.positions[0].leverage, 25);
  assert.equal(opened.desk.positions[0].notional, 10_000);
  const balance = runCommand(opened.desk, "/bal", 75_000);
  assert.match(balance.message, /Cash/);
  assert.ok(equity(opened.desk, 75_000) < STARTING_CASH);
});
