import { STARTING_CASH } from "./trading/engine";
import type { Book, Desk } from "./trading/types";

const KEY = "wick:desks:v1";

const empty: Book = { desks: [], activeId: null };

function load(): Book {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Book;
    if (!parsed || !Array.isArray(parsed.desks)) return empty;
    return { desks: parsed.desks, activeId: parsed.activeId ?? null };
  } catch {
    return empty;
  }
}

let book = load();
const listeners = new Set<() => void>();

function emit(next: Book) {
  book = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // private mode
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBook(): Book {
  return book;
}

export function activeDesk(): Desk | null {
  return book.desks.find((desk) => desk.id === book.activeId) ?? null;
}

export function createDesk(name: string): Desk {
  const trimmed = name.trim().slice(0, 18);
  if (!trimmed) throw new Error("Name the desk.");
  const desk: Desk = {
    id: crypto.randomUUID(),
    name: trimmed,
    cash: STARTING_CASH,
    positions: [],
    fills: [],
    createdAt: Date.now(),
  };
  emit({ desks: [desk, ...book.desks].slice(0, 8), activeId: desk.id });
  return desk;
}

export function selectDesk(id: string) {
  if (!book.desks.some((desk) => desk.id === id)) return;
  emit({ ...book, activeId: id });
}

export function writeDesk(desk: Desk) {
  emit({
    ...book,
    activeId: desk.id,
    desks: book.desks.map((item) => (item.id === desk.id ? desk : item)),
  });
}
