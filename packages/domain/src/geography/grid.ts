import { cellIdSchema, type CellId } from "@civ/contracts";
import { mulDiv } from "../units.js";

/**
 * Hex grid geometry ("pointy-top, odd-r": odd rows are shifted right by half
 * a cell). Cell index = row × width + col. Axial coordinates
 * q = col − (row − (row & 1)) / 2, r = row are used for distances.
 *
 * Planar coordinates are integer metres from the map's north-west corner:
 * x = col × spacing + (row odd ? spacing / 2 : 0), y = row × rowSpacing.
 */
export interface GridShape {
  readonly width: number;
  readonly height: number;
  readonly cellSpacingM: number;
}

/** √3/2 in parts per billion. */
const SQRT3_HALF_PPB = 866_025_404;

export function rowSpacingFor(cellSpacingM: number): number {
  return mulDiv(cellSpacingM, SQRT3_HALF_PPB, 1_000_000_000, "half_even");
}

export function cellAreaFor(cellSpacingM: number): number {
  return mulDiv(cellSpacingM * cellSpacingM, SQRT3_HALF_PPB, 1_000_000_000, "half_even");
}

/** Neighbour offsets (dCol, dRow) in fixed order E, NE, NW, W, SW, SE. */
const EVEN_ROW = [
  [1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;
const ODD_ROW = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 1],
] as const;

export class ImpossibleCoordinateError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ImpossibleCoordinateError";
  }
}

/** Precomputed adjacency for one grid shape. */
export interface Topology {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  /** 6 entries per cell (E, NE, NW, W, SW, SE); −1 outside the map. */
  readonly neighbours: Int32Array;
}

// Shared per shape. Internal: callers must treat `neighbours` as read-only
// (typed-array contents cannot be frozen); not exported from the package index.
const topologies = new Map<string, Topology>();

export function topologyFor(shape: { readonly width: number; readonly height: number }): Topology {
  const key = `${shape.width}x${shape.height}`;
  const cached = topologies.get(key);
  if (cached !== undefined) return cached;
  const { width, height } = shape;
  const neighbours = new Int32Array(width * height * 6).fill(-1);
  for (let row = 0; row < height; row += 1) {
    const offsets = (row & 1) === 0 ? EVEN_ROW : ODD_ROW;
    for (let col = 0; col < width; col += 1) {
      const base = (row * width + col) * 6;
      for (let direction = 0; direction < 6; direction += 1) {
        const [dc, dr] = offsets[direction] as readonly [number, number];
        const c = col + dc;
        const r = row + dr;
        if (c >= 0 && c < width && r >= 0 && r < height) neighbours[base + direction] = r * width + c;
      }
    }
  }
  const topology = Object.freeze({ width, height, cellCount: width * height, neighbours });
  if (topologies.size > 16) topologies.clear();
  topologies.set(key, topology);
  return topology;
}

export function assertCell(shape: { readonly width: number; readonly height: number }, cell: number): void {
  if (!Number.isSafeInteger(cell) || cell < 0 || cell >= shape.width * shape.height) {
    throw new ImpossibleCoordinateError(`cell index ${cell} is outside a ${shape.width}×${shape.height} map`);
  }
}

export function cellIndex(
  shape: { readonly width: number; readonly height: number },
  col: number,
  row: number,
): number {
  if (
    !Number.isSafeInteger(col) ||
    !Number.isSafeInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= shape.width ||
    row >= shape.height
  ) {
    throw new ImpossibleCoordinateError(`(${col}, ${row}) is outside a ${shape.width}×${shape.height} map`);
  }
  return row * shape.width + col;
}

export function cellColRow(shape: { readonly width: number }, cell: number): [number, number] {
  return [cell % shape.width, Math.floor(cell / shape.width)];
}

const ID_DIGITS = 4;
const ID_LIMIT = 36 * 36 * 36 * 36;

/** Spatial ID `cel_<col><row>` (4 base-36 digits each); reversible. */
export function cellIdOf(shape: { readonly width: number; readonly height: number }, cell: number): CellId {
  assertCell(shape, cell);
  const [col, row] = cellColRow(shape, cell);
  if (col >= ID_LIMIT || row >= ID_LIMIT) throw new ImpossibleCoordinateError("cell coordinates exceed the ID range");
  return `cel_${col.toString(36).padStart(ID_DIGITS, "0")}${row.toString(36).padStart(ID_DIGITS, "0")}` as CellId;
}

export function cellIndexOfId(shape: { readonly width: number; readonly height: number }, id: string): number {
  const parsed = cellIdSchema.safeParse(id);
  if (!parsed.success) throw new ImpossibleCoordinateError(`malformed cell ID ${JSON.stringify(id)}`);
  const col = Number.parseInt(id.slice(4, 8), 36);
  const row = Number.parseInt(id.slice(8, 12), 36);
  return cellIndex(shape, col, row);
}

export function axialOf(shape: { readonly width: number }, cell: number): [number, number] {
  const [col, row] = cellColRow(shape, cell);
  return [col - (row - (row & 1)) / 2, row];
}

/** Grid steps between two cells. */
export function hexDistance(shape: { readonly width: number; readonly height: number }, a: number, b: number): number {
  assertCell(shape, a);
  assertCell(shape, b);
  const [aq, ar] = axialOf(shape, a);
  const [bq, br] = axialOf(shape, b);
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Centre of a cell in integer metres from the north-west corner. */
export function cellCentreM(shape: GridShape, cell: number): { x: number; y: number } {
  assertCell(shape, cell);
  const [col, row] = cellColRow(shape, cell);
  const half = Math.floor(shape.cellSpacingM / 2);
  return { x: col * shape.cellSpacingM + ((row & 1) === 1 ? half : 0), y: row * rowSpacingFor(shape.cellSpacingM) };
}

/** Existing neighbours in fixed direction order. */
export function neighboursOf(shape: { readonly width: number; readonly height: number }, cell: number): number[] {
  assertCell(shape, cell);
  const { neighbours } = topologyFor(shape);
  const result: number[] = [];
  for (let direction = 0; direction < 6; direction += 1) {
    const next = neighbours[cell * 6 + direction] as number;
    if (next >= 0) result.push(next);
  }
  return result;
}

/** Cells within `radius` grid steps, in ascending index order. */
export function cellsWithin(
  shape: { readonly width: number; readonly height: number },
  centre: number,
  radius: number,
): number[] {
  assertCell(shape, centre);
  if (!Number.isSafeInteger(radius) || radius < 0) throw new RangeError("radius must be a non-negative integer");
  const [, row] = cellColRow(shape, centre);
  const result: number[] = [];
  for (let r = Math.max(0, row - radius); r <= Math.min(shape.height - 1, row + radius); r += 1) {
    const [centreCol] = cellColRow(shape, centre);
    for (let c = Math.max(0, centreCol - radius - 1); c <= Math.min(shape.width - 1, centreCol + radius + 1); c += 1) {
      const cell = r * shape.width + c;
      if (hexDistance(shape, centre, cell) <= radius) result.push(cell);
    }
  }
  return result;
}

/**
 * The cell whose centre is nearest to a point (integer metres). Points
 * outside the map's bounding box are impossible coordinates. Exact integer
 * distances; ties go to the lower cell index.
 */
export function cellAtPoint(shape: GridShape, x: number, y: number): number {
  const rowSpacing = rowSpacingFor(shape.cellSpacingM);
  const maxX = (shape.width - 1) * shape.cellSpacingM + Math.floor(shape.cellSpacingM / 2);
  const maxY = (shape.height - 1) * rowSpacing;
  const halfSpacing = Math.ceil(shape.cellSpacingM / 2);
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    x < -halfSpacing ||
    y < -halfSpacing ||
    x > maxX + halfSpacing ||
    y > maxY + halfSpacing
  ) {
    throw new ImpossibleCoordinateError(`point (${x} m, ${y} m) is outside the map`);
  }
  const approxRow = Math.min(shape.height - 1, Math.max(0, Math.floor(y / rowSpacing)));
  const approxCol = Math.min(shape.width - 1, Math.max(0, Math.floor(x / shape.cellSpacingM)));
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let r = Math.max(0, approxRow - 1); r <= Math.min(shape.height - 1, approxRow + 1); r += 1) {
    for (let c = Math.max(0, approxCol - 1); c <= Math.min(shape.width - 1, approxCol + 1); c += 1) {
      const cell = r * shape.width + c;
      const centre = cellCentreM(shape, cell);
      const distance = (centre.x - x) * (centre.x - x) + (centre.y - y) * (centre.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
  }
  return best;
}
