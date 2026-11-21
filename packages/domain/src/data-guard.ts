/**
 * Freeze-and-validate guard for world data.
 *
 * World data must be plain JSON (so its canonical hash is defined) and must
 * never be mutated in place (so `apply` is pure and a failed transition
 * leaves its input untouched). The kernel deep-freezes data when a world is
 * created and after every system run. Traversal stops at already-frozen
 * nodes, so with structural sharing each run only visits the objects it
 * newly created: the cost is proportional to the change, not the world.
 *
 * Violations are programming errors in a system and throw
 * `WorldDataError` naming the offending path.
 */
export class WorldDataError extends TypeError {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`World data at ${path} ${reason}`);
    this.name = "WorldDataError";
    this.path = path;
  }
}

export function freezeWorldData<T>(value: T, path = "data"): T {
  guard(value, path);
  return value;
}

function guard(value: unknown, path: string): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new WorldDataError(path, "is not a finite number");
    return;
  }
  if (typeof value !== "object") throw new WorldDataError(path, `is a ${typeof value}, not JSON data`);
  if (Object.isFrozen(value)) return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new WorldDataError(`${path}[${index}]`, "is a sparse array hole");
      guard(value[index], `${path}[${index}]`);
    }
  } else {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new WorldDataError(path, "is not a plain object or array");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) throw new WorldDataError(path, "has symbol keys");
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new WorldDataError(`${path}.${key}`, "is undefined");
      guard(item, `${path}.${key}`);
    }
  }
  Object.freeze(value);
}
