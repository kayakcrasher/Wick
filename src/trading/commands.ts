import { closeMatching, equity, openPosition, usd } from "./engine";
import type { Desk, Side } from "./types";

export type CommandResult = { desk: Desk; message: string };

const TRADE = /^\/(long|short)\s+(\d+(?:\.\d+)?)\s+(\d{1,3})x?$/i;
const CLOSE = /^\/close(?:\s+(long|short))?$/i;

export function runCommand(desk: Desk, raw: string, mark: number): CommandResult {
  const line = raw.trim();
  if (!line.startsWith("/")) throw new Error("Commands start with /.");

  const trade = TRADE.exec(line);
  if (trade) {
    const side = trade[1].toLowerCase() as Side;
    const notional = Number(trade[2]);
    const leverage = Number(trade[3]);
    const next = openPosition(desk, { side, notional, leverage, mark });
    return { desk: next, message: next.fills[0]?.text ?? "Opened." };
  }

  const close = CLOSE.exec(line);
  if (close) {
    const side = close[1]?.toLowerCase() as Side | undefined;
    const closed = closeMatching(desk, mark, side);
    const realized = closed.realized;
    const label = realized > 0 ? `+${usd(realized)}` : usd(realized);
    return { desk: closed.desk, message: `Closed ${label}.` };
  }

  if (/^\/bal$/i.test(line)) {
    const eq = Number.isFinite(mark) && mark > 0 ? equity(desk, mark) : desk.cash;
    return {
      desk,
      message: `Cash ${usd(desk.cash)} · equity ${usd(eq)} · ${desk.positions.length} open`,
    };
  }

  if (/^\/help$/i.test(line)) {
    return {
      desk,
      message: "/long 10000 25x · /short 5000 10x · /close · /close long · /bal",
    };
  }

  throw new Error("Unknown command. Try /help.");
}
