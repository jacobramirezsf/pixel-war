import type { Fx } from '../sim/types.ts';

export interface FxOptions {
  damageNumbers: boolean;
}

/** Deterministic scatter for a particle burst, from the effect's position. */
function scatter(seed: number, i: number): [number, number] {
  const a = ((seed * 9301 + i * 49297) % 233280) / 233280 * Math.PI * 2;
  const r = 0.5 + (((seed * 7 + i * 13) % 11) / 11);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly Fx[], opt: FxOptions = { damageNumbers: false }): void {
  for (const f of fx) {
    if (f.k === 'shot') { ctx.strokeStyle = f.c; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
    else if (f.k === 'hit') { ctx.fillStyle = '#fff6c0'; ctx.fillRect(f.x - 1, f.y - 1, 3, 3); }
    else if (f.k === 'die') {
      // A burst of six chips flying out and fading, plus the old fading block.
      const p = 1 - f.t / 0.35, seed = (f.x * 31 + f.y * 17) | 0;
      ctx.fillStyle = 'rgba(210,210,220,' + (0.6 * (1 - p)).toFixed(2) + ')';
      ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
      ctx.fillStyle = 'rgba(255,200,120,' + (1 - p).toFixed(2) + ')';
      for (let i = 0; i < 6; i++) { const [dx, dy] = scatter(seed, i); ctx.fillRect(Math.round(f.x + dx * p * 9), Math.round(f.y + dy * p * 9 + p * p * 4), 1, 1); }
    }
    else if (f.k === 'ping') { const r = Math.round(f.t * 14) + 1; ctx.strokeStyle = '#7dff7d'; ctx.strokeRect(f.x - r + 0.5, f.y - r + 0.5, r * 2, r * 2); }
    else if (f.k === 'boom') {
      const p = 1 - f.t / 0.25, rr = f.r * (0.3 + 0.7 * p), seed = (f.x * 13 + f.y * 7) | 0;
      ctx.fillStyle = 'rgba(255,140,42,' + (0.5 * (1 - p)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffd27a'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,180,' + (1 - p).toFixed(2) + ')';
      const n = Math.min(14, Math.round(f.r));
      for (let i = 0; i < n; i++) { const [dx, dy] = scatter(seed, i); ctx.fillRect(Math.round(f.x + dx * p * f.r * 1.3), Math.round(f.y + dy * p * f.r * 1.3), 1, 1); }
    }
    else if (f.k === 'mark') {
      const blink = Math.floor(f.t * 8) % 2 === 0;
      ctx.strokeStyle = f.c; ctx.globalAlpha = blink ? 0.9 : 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x - 3, f.y); ctx.lineTo(f.x + 3, f.y); ctx.moveTo(f.x, f.y - 3); ctx.lineTo(f.x, f.y + 3); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    else if (f.k === 'bolt') {
      const p = f.t / 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,' + p.toFixed(2) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x + 6, f.y - 40); ctx.lineTo(f.x - 2, f.y - 18); ctx.lineTo(f.x + 3, f.y - 14); ctx.lineTo(f.x, f.y - 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(180,230,255,' + (p * 0.6).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, 6 * (1 - p) + 2, 0, 7); ctx.fill();
    }
    else if (f.k === 'dmg') {
      if (!opt.damageNumbers) continue;
      ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = '#ffe9a8'; ctx.font = '5px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(f.n), f.x, f.y - (0.6 - f.t) * 10);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
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
