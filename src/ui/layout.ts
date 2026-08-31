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
  // One panel, two homes: the left column on desktop, the bottom third on a phone.
  const panel = document.getElementById('panel')!;
  const side = document.getElementById('side')!, bottom = document.getElementById('bottom')!;
  (mode === 'desktop' ? side : bottom).appendChild(panel);
}
