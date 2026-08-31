export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing element #' + id);
  return el as T;
}

export function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle('hide', !on);
}

export function on(el: HTMLElement, ev: string, fn: (e: Event) => void): void {
  el.addEventListener(ev, fn);
}
