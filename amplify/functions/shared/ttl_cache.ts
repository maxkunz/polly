/**
 * TTL-Cache im Speicher der Lambda-Instanz: geht beim Kaltstart verloren und wird nicht zwischen Instanzen geteilt.
 * Ist der Cache voll, wird der zuletzt am längsten nicht geschriebene Eintrag verworfen (Map-Reihenfolge, O(1));
 * abgelaufene Einträge fallen beim Lesen oder auf diesem Weg heraus.
 * Rein (ohne AWS-SDK), getestet in `test/ttlCache.test.ts`.
 */

const DEFAULT_MAX_ENTRIES = 500;

export interface TtlCacheOptions {
  /** Standard-Lebensdauer; `set` und `getOrLoad` können pro Eintrag eine andere angeben. */
  ttlMs: number;
  maxEntries?: number;
}

/** Ergebnis von `load` in `getOrLoad`: ohne `ttlMs` gilt die Standard-Lebensdauer, `<= 0` merkt den Wert nicht. */
export interface CacheLoad<V> {
  value: V;
  ttlMs?: number;
}

export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  /** Wert oder `undefined`, wenn es keinen gibt oder er abgelaufen ist. */
  get(key: string): V | undefined {
    return this.lookup(key)?.value;
  }

  /**
   * Merkt den Wert und gibt ihn zurück. Ist `ttlMs` keine Zahl > 0 (auch `NaN`), wird nichts gemerkt und ein
   * vorhandener Eintrag verworfen.
   */
  set(key: string, value: V, ttlMs = this.ttlMs): V {
    // Neu einreihen, damit die Reihenfolge der Map dem Alter des Eintrags entspricht
    this.entries.delete(key);
    if (!(Number.isFinite(ttlMs) && ttlMs > 0)) return value;
    while (this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /**
   * Wert aus dem Cache oder über `load` (bei `fresh` immer über `load`); das Ergebnis wird wie bei `set` gemerkt.
   * Ein Treffer zählt auch bei falsy Werten. Wirft `load`, bleibt der Cache unverändert.
   */
  async getOrLoad(key: string, load: () => Promise<CacheLoad<V>>, fresh = false): Promise<V> {
    const entry = fresh ? undefined : this.lookup(key);
    if (entry) return entry.value;
    const { value, ttlMs } = await load();
    return this.set(key, value, ttlMs);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private lookup(key: string): { value: V; expiresAt: number } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry;
    this.entries.delete(key);
    return undefined;
  }
}
