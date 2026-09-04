export const LOMBARDO_RENDER_WIDTH = 1000;
export const LOMBARDO_RENDER_HEIGHT = 1250;
export const LOMBARDO_PRODUCT_OCCUPANCY = 0.8;

export interface RawRgbaImage {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 4;
}

export interface BackgroundRemovalResult extends RawRgbaImage {
  removedPixelCount: number;
  edgeCoverage: number;
  backgroundColor: [number, number, number];
  confidence: "high" | "medium" | "low";
}

const CONSERVATIVE_BACKGROUND_THRESHOLD = 28;
const MAX_AGGRESSIVE_FOREGROUND_LOSS = 0.08;

const pixelOffset = (x: number, y: number, width: number) =>
  (y * width + x) * 4;

const colourDistance = (
  data: Uint8Array,
  offset: number,
  [red, green, blue]: [number, number, number],
) => Math.sqrt(
  (data[offset] - red) ** 2 +
  (data[offset + 1] - green) ** 2 +
  (data[offset + 2] - blue) ** 2,
);

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function perimeterOffsets(width: number, height: number) {
  const offsets: number[] = [];
  for (let x = 0; x < width; x += 1) {
    offsets.push(pixelOffset(x, 0, width));
    if (height > 1) offsets.push(pixelOffset(x, height - 1, width));
  }
  for (let y = 1; y < height - 1; y += 1) {
    offsets.push(pixelOffset(0, y, width));
    if (width > 1) offsets.push(pixelOffset(width - 1, y, width));
  }
  return offsets;
}

function estimateBackground(data: Uint8Array, offsets: number[]) {
  const opaque = offsets.filter((offset) => data[offset + 3] > 220);
  const sample = opaque.length ? opaque : offsets;
  return [
    median(sample.map((offset) => data[offset])),
    median(sample.map((offset) => data[offset + 1])),
    median(sample.map((offset) => data[offset + 2])),
  ] as [number, number, number];
}

/**
 * Removes only background pixels connected to an image edge. White labels and
 * highlights enclosed by the product are therefore preserved.
 */
function removeBackgroundAtThreshold(
  image: RawRgbaImage,
  threshold: number,
): BackgroundRemovalResult {
  const { width, height } = image;
  const data = new Uint8Array(image.data);
  const perimeter = perimeterOffsets(width, height);
  const backgroundColor = estimateBackground(data, perimeter);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha > 12 && colourDistance(data, offset, backgroundColor) > threshold) {
      return;
    }
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let removedPixelCount = 0;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = index * 4;
    const distance = colourDistance(data, offset, backgroundColor);
    const existingAlpha = data[offset + 3];
    const softenedAlpha = distance <= threshold * 0.58
      ? 0
      : Math.round(existingAlpha * ((distance - threshold * 0.58) / (threshold * 0.42)));
    if (softenedAlpha < existingAlpha) {
      data[offset + 3] = softenedAlpha;
      removedPixelCount += 1;
    }

    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const edgeMatches = perimeter.filter((offset) =>
    data[offset + 3] <= 12 || colourDistance(image.data, offset, backgroundColor) <= threshold,
  ).length;
  const transparentEdges = perimeter.filter((offset) => image.data[offset + 3] <= 12).length;
  const edgeCoverage = perimeter.length ? edgeMatches / perimeter.length : 0;
  const transparentEdgeCoverage = perimeter.length ? transparentEdges / perimeter.length : 0;
  const removedRatio = removedPixelCount / (width * height);
  const luminance = backgroundColor[0] * 0.2126 + backgroundColor[1] * 0.7152 + backgroundColor[2] * 0.0722;
  const confidence = transparentEdgeCoverage >= 0.92
    ? "high"
    : edgeCoverage >= 0.92 && removedRatio >= 0.08 && luminance >= 170
    ? "high"
    : edgeCoverage >= 0.72 && removedRatio >= 0.04 && luminance >= 170
      ? "medium"
      : "low";

  return {
    data,
    width,
    height,
    channels: 4,
    removedPixelCount,
    edgeCoverage,
    backgroundColor,
    confidence,
  };
}

function visibleAlphaMass(image: RawRgbaImage, minimumAlpha = 18) {
  let mass = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] >= minimumAlpha) mass += image.data[offset];
  }
  return mass;
}

/**
 * Removes edge-connected background while protecting light glass, highlights,
 * white labels and other product details. When the normal pass would erase
 * materially more foreground than a conservative pass, the conservative
 * result is returned with low confidence so it cannot be auto-published.
 */
export function removeEdgeConnectedBackground(
  image: RawRgbaImage,
  threshold = 52,
): BackgroundRemovalResult {
  const aggressive = removeBackgroundAtThreshold(image, threshold);
  if (threshold <= CONSERVATIVE_BACKGROUND_THRESHOLD) return aggressive;

  const conservative = removeBackgroundAtThreshold(
    image,
    CONSERVATIVE_BACKGROUND_THRESHOLD,
  );
  const conservativeForeground = visibleAlphaMass(conservative);
  const aggressiveForeground = visibleAlphaMass(aggressive);
  const foregroundLoss = conservativeForeground > 0
    ? (conservativeForeground - aggressiveForeground) / conservativeForeground
    : 0;

  if (foregroundLoss <= MAX_AGGRESSIVE_FOREGROUND_LOSS) return aggressive;
  return {
    ...conservative,
    confidence: "low",
  };
}

export function alphaBounds(image: RawRgbaImage, minimumAlpha = 18) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[pixelOffset(x, y, image.width) + 3] < minimumAlpha) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function fitInsideLombardoCanvas(width: number, height: number) {
  const maximumWidth = LOMBARDO_RENDER_WIDTH * LOMBARDO_PRODUCT_OCCUPANCY;
  const maximumHeight = LOMBARDO_RENDER_HEIGHT * LOMBARDO_PRODUCT_OCCUPANCY;
  const scale = Math.min(maximumWidth / width, maximumHeight / height);
  const renderWidth = Math.max(1, Math.round(width * scale));
  const renderHeight = Math.max(1, Math.round(height * scale));
  return {
    width: renderWidth,
    height: renderHeight,
    left: Math.round((LOMBARDO_RENDER_WIDTH - renderWidth) / 2),
    top: LOMBARDO_RENDER_HEIGHT - Math.round(LOMBARDO_RENDER_HEIGHT * 0.1) - renderHeight,
  };
}
