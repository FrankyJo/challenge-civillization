/**
 * Binary min-heap of cell indices keyed by an integer priority. Ties break by
 * the smaller cell index, so pop order is a pure function of the inputs.
 */
export class CellHeap {
  #keys: number[] = [];
  #cells: number[] = [];

  get size(): number {
    return this.#cells.length;
  }

  push(key: number, cell: number): void {
    const keys = this.#keys;
    const cells = this.#cells;
    let index = cells.length;
    keys.push(key);
    cells.push(cell);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.#less(index, parent)) break;
      this.#swap(index, parent);
      index = parent;
    }
  }

  /** Remove the minimum; returns [key, cell]. */
  pop(): [number, number] {
    const keys = this.#keys;
    const cells = this.#cells;
    if (cells.length === 0) throw new RangeError("pop from an empty heap");
    const top: [number, number] = [keys[0] as number, cells[0] as number];
    const lastKey = keys.pop() as number;
    const lastCell = cells.pop() as number;
    if (cells.length > 0) {
      keys[0] = lastKey;
      cells[0] = lastCell;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < cells.length && this.#less(left, smallest)) smallest = left;
        if (right < cells.length && this.#less(right, smallest)) smallest = right;
        if (smallest === index) break;
        this.#swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  #less(a: number, b: number): boolean {
    const ka = this.#keys[a] as number;
    const kb = this.#keys[b] as number;
    return ka < kb || (ka === kb && (this.#cells[a] as number) < (this.#cells[b] as number));
  }

  #swap(a: number, b: number): void {
    const keys = this.#keys;
    const cells = this.#cells;
    const key = keys[a] as number;
    keys[a] = keys[b] as number;
    keys[b] = key;
    const cell = cells[a] as number;
    cells[a] = cells[b] as number;
    cells[b] = cell;
  }
}
