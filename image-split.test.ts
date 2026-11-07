import { describe, expect, it } from "vitest";
import {
  calculateSplitCrops,
  SPLIT_GRIDS,
  SPLIT_TILE_HEIGHT,
  SPLIT_TILE_WIDTH,
} from "../lib/mosaika/image-split";

describe("Mosaika image splitter geometry", () => {
  it("exports all requested grid proportions", () => {
    expect(SPLIT_GRIDS.map(({ cols, rows }) => `${cols}x${rows}`)).toEqual([
      "2x1",
      "1x2",
      "3x4",
      "3x3",
      "3x2",
      "3x1",
      "2x2",
      "1x3",
      "2x3",
    ]);
  });

  it("cuts a 3240 by 1350 panorama into exact 1080 by 1350 source columns", () => {
    const crops = calculateSplitCrops(3240, 1350, { cols: 3, rows: 1 });

    expect(crops).toEqual([
      { originX: 0, originY: 0, width: 1080, height: 1350 },
      { originX: 1080, originY: 0, width: 1080, height: 1350 },
      { originX: 2160, originY: 0, width: 1080, height: 1350 },
    ]);
    expect(crops.every((crop) => crop.width === SPLIT_TILE_WIDTH)).toBe(true);
    expect(crops.every((crop) => crop.height === SPLIT_TILE_HEIGHT)).toBe(true);
  });

  it("fits a 3000 by 1000 panorama without stretching and allows horizontal framing", () => {
    const centered = calculateSplitCrops(3000, 1000, { cols: 3, rows: 1 });
    const rightAligned = calculateSplitCrops(
      3000,
      1000,
      { cols: 3, rows: 1 },
      1,
    );

    expect(centered).toEqual([
      { originX: 300, originY: 0, width: 800, height: 1000 },
      { originX: 1100, originY: 0, width: 800, height: 1000 },
      { originX: 1900, originY: 0, width: 800, height: 1000 },
    ]);
    expect(rightAligned[0]?.originX).toBe(600);
    expect(rightAligned[2]?.originX).toBe(2200);
  });

  it("returns exactly columns times rows crop rectangles", () => {
    for (const grid of SPLIT_GRIDS) {
      expect(calculateSplitCrops(6000, 8000, grid)).toHaveLength(
        grid.cols * grid.rows,
      );
    }
  });
});
