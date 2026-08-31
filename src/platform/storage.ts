// Persistence goes through this adapter. Game code never touches localStorage directly.
// A desktop build can swap in a file-backed implementation without touching callers.

export interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get(key: string): string | null { return this.m.has(key) ? this.m.get(key)! : null; }
  set(key: string, value: string): void { this.m.set(key, value); }
  remove(key: string): void { this.m.delete(key); }
  keys(): string[] { return Array.from(this.m.keys()).sort(); }
}

const PREFIX = 'pixelwar:';

class LocalStorageBackend implements Storage {
  private ls: globalThis.Storage;
  constructor(ls: globalThis.Storage) { this.ls = ls; }
  get(key: string): string | null { return this.ls.getItem(PREFIX + key); }
  set(key: string, value: string): void { this.ls.setItem(PREFIX + key, value); }
  remove(key: string): void { this.ls.removeItem(PREFIX + key); }
  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out.sort();
  }
}

/** localStorage when it works, memory otherwise (private mode, sandboxed iframes, Node). */
export function createStorage(): Storage {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = PREFIX + '__probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return new LocalStorageBackend(ls);
    }
  } catch {
    // fall through
  }
  return new MemoryStorage();
}

export function getJSON<T>(s: Storage, key: string, fallback: T): T {
  const raw = s.get(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function setJSON(s: Storage, key: string, value: unknown): void {
  s.set(key, JSON.stringify(value));
}
