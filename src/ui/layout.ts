// Breakpoint and pointer detection. The DOM is the same on both layouts; the arrangement changes.

export type LayoutMode = 'mobile' | 'desktop';

export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Desktop when there is room for a side panel and the window is landscape. */
export function detectLayout(): LayoutMode {
  const w = window.innerWidth, h = window.innerHeight;
  return w >= 900 && w > h ? 'desktop' : 'mobile';
}

/** Move the shared panels into the arrangement for this layout. */
export function applyLayout(mode: LayoutMode): void {
  document.body.classList.toggle('desktop', mode === 'desktop');
  document.body.classList.toggle('mobile', mode === 'mobile');
  document.body.classList.toggle('coarse', coarsePointer());
  const cmd = document.getElementById('cmd')!, strips = document.getElementById('strips')!, msg = document.getElementById('msg')!, info = document.getElementById('info')!;
  const side = document.getElementById('side')!, bottom = document.getElementById('bottom')!, stage = document.getElementById('stage')!;
  if (mode === 'desktop') {
    side.appendChild(cmd);
    bottom.appendChild(strips);
    stage.appendChild(msg);
    stage.appendChild(info);
  } else {
    bottom.appendChild(msg);
    bottom.appendChild(info);
    bottom.appendChild(strips);
    bottom.appendChild(cmd);
  }
}
