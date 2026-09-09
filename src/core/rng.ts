/**
 * Geseedeter PRNG (mulberry32). Der Zustand ist ein einzelner int32 und
 * damit trivial serialisierbar - hier noch wichtiger als in InfiniteSettler:
 * der RNG-Zustand des Wuerfels liegt im Durable Object und muss dessen
 * Hibernation ueberleben, also durch JSON und wieder zurueck.
 *
 * Math.random ist in src/core verboten: nicht seedbar, nicht reproduzierbar.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0;
  }

  /** Naechster uint32. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Ganzzahl in [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    return this.next() % n;
  }

  /**
   * Fisher-Yates in-place. Rueckwaerts, damit die Reihenfolge der
   * next()-Aufrufe eindeutig festliegt.
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  getState(): number {
    return this.s;
  }

  setState(s: number): void {
    this.s = s | 0;
  }
}
