import { useEffect, useRef } from "react";
import type { Candle } from "./trading/feed";
import { liquidationPrice } from "./trading/engine";
import type { Position } from "./trading/types";

const UP = "#3ddc97";
const DOWN = "#ff5d5d";
const LIQ = "#e6b35a";
const GRID = "rgba(236, 234, 230, 0.06)";
const FG = "#eceae4";
const MUTED = "#8d928c";

export function Chart({
  candles,
  positions,
  mark,
}: {
  candles: Candle[];
  positions: Position[];
  mark: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const paint = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width < 10 || height < 10) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#101114";
      ctx.fillRect(0, 0, width, height);

      const view = candles.slice(-90);
      if (view.length === 0) {
        ctx.fillStyle = MUTED;
        ctx.font = "13px 'IBM Plex Sans', sans-serif";
        ctx.fillText("Waiting for candles", 16, 28);
        return;
      }

      let hi = Math.max(...view.map((candle) => candle.h));
      let lo = Math.min(...view.map((candle) => candle.l));
      for (const position of positions) {
        hi = Math.max(hi, position.entry, liquidationPrice(position.side, position.entry, position.leverage));
        lo = Math.min(lo, position.entry, liquidationPrice(position.side, position.entry, position.leverage));
      }
      if (mark) {
        hi = Math.max(hi, mark);
        lo = Math.min(lo, mark);
      }
      const pad = (hi - lo) * 0.08 || hi * 0.002;
      hi += pad;
      lo -= pad;

      const volumeTop = height * 0.78;
      const plotBottom = volumeTop - 8;
      const plotTop = 16;
      const plotH = plotBottom - plotTop;
      const yOf = (price: number) => plotTop + ((hi - price) / (hi - lo)) * plotH;
      const slot = width / view.length;
      const bodyW = Math.max(2, Math.min(10, slot * 0.62));
      const maxVol = Math.max(...view.map((candle) => candle.v), 1);

      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const y = plotTop + (plotH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      view.forEach((candle, index) => {
        const x = index * slot + slot / 2;
        const up = candle.c >= candle.o;
        ctx.strokeStyle = up ? UP : DOWN;
        ctx.fillStyle = up ? UP : DOWN;
        ctx.beginPath();
        ctx.moveTo(x, yOf(candle.h));
        ctx.lineTo(x, yOf(candle.l));
        ctx.stroke();
        const top = yOf(Math.max(candle.o, candle.c));
        const bottom = yOf(Math.min(candle.o, candle.c));
        ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
        const volH = (candle.v / maxVol) * (height - volumeTop - 8);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x - bodyW / 2, height - 8 - volH, bodyW, volH);
        ctx.globalAlpha = 1;
      });

      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = MUTED;
      ctx.fillText(formatPrice(hi - pad), 8, plotTop + 12);
      ctx.fillText(formatPrice(lo + pad), 8, plotBottom - 4);

      const drawLine = (price: number, color: string, label: string, dash: number[]) => {
        const y = yOf(price);
        if (y < plotTop || y > plotBottom) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        const text = `${label} ${formatPrice(price)}`;
        const box = ctx.measureText(text).width + 10;
        ctx.fillRect(width - box - 8, y - 8, box, 16);
        ctx.fillStyle = "#101114";
        ctx.fillText(text, width - box - 3, y + 4);
        ctx.restore();
      };

      for (const position of positions.slice(0, 4)) {
        drawLine(position.entry, position.side === "long" ? UP : DOWN, "ENTRY", [4, 4]);
        drawLine(
          liquidationPrice(position.side, position.entry, position.leverage),
          LIQ,
          "LIQ",
          [2, 3],
        );
      }

      if (mark) {
        const y = yOf(mark);
        ctx.strokeStyle = FG;
        ctx.setLineDash([1, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [candles, positions, mark]);

  return (
    <div ref={wrapRef} className="chart-canvas">
      <canvas ref={canvasRef} />
    </div>
  );
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
