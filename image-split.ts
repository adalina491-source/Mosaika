export const SPLIT_TILE_WIDTH = 1080;
export const SPLIT_TILE_HEIGHT = 1350;

export type SplitGrid = { cols: number; rows: number };
export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export const SPLIT_GRIDS: SplitGrid[] = [
  { cols: 2, rows: 1 },
  { cols: 1, rows: 2 },
  { cols: 3, rows: 4 },
  { cols: 3, rows: 3 },
  { cols: 3, rows: 2 },
  { cols: 3, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 1, rows: 3 },
  { cols: 2, rows: 3 },
];

/** Return integer source rectangles in reading order (left-to-right, top-to-bottom). */
export function calculateSplitCrops(
  sourceWidth: number,
  sourceHeight: number,
  grid: SplitGrid,
  panX = 0,
  panY = 0,
): CropRect[] {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    !Number.isInteger(grid.cols) ||
    !Number.isInteger(grid.rows) ||
    grid.cols < 1 ||
    grid.rows < 1
  ) {
    throw new Error("Dimensões ou grade inválidas.");
  }

  const totalWidth = grid.cols * SPLIT_TILE_WIDTH;
  const totalHeight = grid.rows * SPLIT_TILE_HEIGHT;
  const scale = Math.max(totalWidth / sourceWidth, totalHeight / sourceHeight);
  const visibleWidth = totalWidth / scale;
  const visibleHeight = totalHeight / scale;
  const startX =
    Math.max(0, sourceWidth - visibleWidth) * (0.5 + clamp(panX) / 2);
  const startY =
    Math.max(0, sourceHeight - visibleHeight) * (0.5 + clamp(panY) / 2);
  const cellWidth = visibleWidth / grid.cols;
  const cellHeight = visibleHeight / grid.rows;
  const crops: CropRect[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const originX = Math.max(
        0,
        Math.min(sourceWidth - 1, Math.round(startX + col * cellWidth)),
      );
      const originY = Math.max(
        0,
        Math.min(sourceHeight - 1, Math.round(startY + row * cellHeight)),
      );
      const right = Math.min(
        sourceWidth,
        Math.max(originX + 1, Math.round(startX + (col + 1) * cellWidth)),
      );
      const bottom = Math.min(
        sourceHeight,
        Math.max(originY + 1, Math.round(startY + (row + 1) * cellHeight)),
      );
      crops.push({
        originX,
        originY,
        width: right - originX,
        height: bottom - originY,
      });
    }
  }

  return crops;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
