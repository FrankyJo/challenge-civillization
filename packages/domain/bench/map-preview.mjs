#!/usr/bin/env node
// Render a generated world map to PNG for visual review (run after building):
//   node packages/domain/bench/map-preview.mjs <seed> <out.png> [layer]
// layer: biome (default) | terrain | elevation | precipitation | regions
// Prints the validation stats as JSON. Development tool only.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { BIOMES, CELL_FLAGS, TERRAIN_TYPES } from "@civ/contracts";
import { generateWorldMap, validateWorldMap } from "../dist/index.js";

const [seed = "00112233445566778899aabbccddeeff", out = "map.png", layer = "biome"] = process.argv.slice(2);
const map = generateWorldMap({ worldId: "wld_0000000000000001", seed });
const { width, height } = map.grid;
const CELL = 8;
const ROW = 7;
const imageWidth = width * CELL + CELL / 2;
const imageHeight = height * ROW + 2;
const pixels = Buffer.alloc(imageWidth * imageHeight * 3);

const BIOME_COLOURS = {
  ocean: [32, 64, 120],
  lake: [70, 130, 200],
  glacier: [240, 245, 250],
  alpine_tundra: [170, 160, 150],
  boreal_forest: [40, 90, 70],
  temperate_forest: [50, 120, 50],
  mediterranean_woodland: [140, 150, 70],
  temperate_grassland: [170, 190, 100],
  semi_desert: [200, 180, 120],
  desert: [230, 210, 150],
  wetland: [80, 140, 120],
};
const TERRAIN_COLOURS = {
  deep_ocean: [25, 50, 100],
  shelf_sea: [50, 90, 150],
  lake: [70, 130, 200],
  plains: [150, 190, 110],
  hills: [170, 150, 100],
  mountains: [130, 110, 90],
  high_mountains: [230, 230, 230],
};

function colourOf(cell) {
  const c = map.cells;
  const water = (c.flags[cell] & CELL_FLAGS.water) !== 0;
  switch (layer) {
    case "terrain":
      return TERRAIN_COLOURS[TERRAIN_TYPES[c.terrain[cell]]];
    case "elevation": {
      const e = c.elevationM[cell];
      if (water && e < 0) return [0, 0, Math.max(40, 160 + Math.floor(e / 20))];
      const v = Math.min(255, 40 + Math.floor((e * 215) / map.params.maxElevationM));
      return [v, v, v];
    }
    case "precipitation": {
      if (water) return [20, 30, 60];
      const v = Math.min(255, Math.floor(c.precipitationMm[cell] / 8));
      return [255 - v, 200, v];
    }
    case "regions": {
      if (water) return [20, 30, 60];
      const r = c.region[cell];
      return [((r * 97) % 200) + 55, ((r * 57) % 200) + 55, ((r * 151) % 200) + 55];
    }
    default:
      return BIOME_COLOURS[BIOMES[c.biome[cell]]];
  }
}

for (let cell = 0; cell < width * height; cell += 1) {
  const col = cell % width;
  const row = Math.floor(cell / width);
  let colour = colourOf(cell);
  if (layer !== "regions" && (map.cells.flags[cell] & CELL_FLAGS.river) !== 0) colour = [60, 120, 230];
  const x0 = col * CELL + (row % 2 === 1 ? CELL / 2 : 0);
  const y0 = row * ROW;
  for (let y = y0; y < y0 + ROW + 1 && y < imageHeight; y += 1) {
    for (let x = x0; x < x0 + CELL && x < imageWidth; x += 1) {
      pixels.set(colour, (y * imageWidth + x) * 3);
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(imageWidth, 0);
header.writeUInt32BE(imageHeight, 4);
header[8] = 8;
header[9] = 2;
const raw = Buffer.alloc((imageWidth * 3 + 1) * imageHeight);
for (let y = 0; y < imageHeight; y += 1) {
  pixels.copy(raw, y * (imageWidth * 3 + 1) + 1, y * imageWidth * 3, (y + 1) * imageWidth * 3);
}
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(JSON.stringify(validateWorldMap(map).stats));
