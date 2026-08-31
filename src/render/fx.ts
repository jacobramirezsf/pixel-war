import type { Fx } from '../sim/types.ts';

export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly Fx[]): void {
  for (const f of fx) {
    if (f.k === 'shot') { ctx.strokeStyle = f.c; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
    else if (f.k === 'hit') { ctx.fillStyle = '#fff6c0'; ctx.fillRect(f.x - 1, f.y - 1, 3, 3); }
    else if (f.k === 'die') { ctx.fillStyle = 'rgba(210,210,220,' + (f.t / 0.35).toFixed(2) + ')'; ctx.fillRect(f.x - 3, f.y - 3, 6, 6); }
    else if (f.k === 'ping') { const r = Math.round(f.t * 14) + 1; ctx.strokeStyle = '#7dff7d'; ctx.strokeRect(f.x - r + 0.5, f.y - r + 0.5, r * 2, r * 2); }
    else if (f.k === 'boom') {
      const p = 1 - f.t / 0.25, rr = f.r * (0.3 + 0.7 * p);
      ctx.fillStyle = 'rgba(255,140,42,' + (0.5 * (1 - p)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffd27a'; ctx.stroke();
    }
    else if (f.k === 'heal') { ctx.fillStyle = '#7dff7d'; ctx.fillRect(f.x - 1, f.y - 2, 1, 3); ctx.fillRect(f.x - 2, f.y - 1, 3, 1); }
    else if (f.k === 'fix') { ctx.fillStyle = '#f2d34a'; ctx.fillRect(f.x - 1, f.y, 3, 1); ctx.fillRect(f.x, f.y - 1, 1, 3); }
    else if (f.k === 'txt') {
      ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = f.c; ctx.font = '6px monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.str, f.x, f.y - (1.4 - f.t) * 7);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }
}
