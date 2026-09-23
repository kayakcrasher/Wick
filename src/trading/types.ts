export type Side = "long" | "short";

export type Position = {
  id: string;
  side: Side;
  qty: number;
  entry: number;
  leverage: number;
  margin: number;
  notional: number;
  openedAt: number;
};

export type Fill = {
  id: string;
  ts: number;
  text: string;
  tone: "neutral" | "long" | "short" | "liq";
};

export type Desk = {
  id: string;
  name: string;
  cash: number;
  positions: Position[];
  fills: Fill[];
  createdAt: number;
};

export type Book = {
  desks: Desk[];
  activeId: string | null;
};
