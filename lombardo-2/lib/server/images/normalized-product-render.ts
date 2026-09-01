import "server-only";

import sharp from "sharp";
import {
  LOMBARDO_RENDER_HEIGHT,
  LOMBARDO_RENDER_WIDTH,
  alphaBounds,
  fitInsideLombardoCanvas,
  removeEdgeConnectedBackground,
} from "@/lib/images/normalize-product-master";

export async function createNormalizedProductRender(source: Uint8Array) {
  const decoded = await sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const removed = removeEdgeConnectedBackground({
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: 4,
  });
  const bounds = alphaBounds(removed);
  if (!bounds || removed.confidence === "low") {
    return { status: "needs_review" as const, confidence: removed.confidence, edgeCoverage: removed.edgeCoverage };
  }
  const placement = fitInsideLombardoCanvas(bounds.width, bounds.height);
  const foreground = await sharp(Buffer.from(removed.data), {
    raw: { width: removed.width, height: removed.height, channels: 4 },
  })
    .extract(bounds)
    .resize(placement.width, placement.height, { fit: "fill" })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: {
      width: LOMBARDO_RENDER_WIDTH,
      height: LOMBARDO_RENDER_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: placement.left, top: placement.top }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  return {
    status: "ready" as const,
    bytes,
    confidence: removed.confidence,
    edgeCoverage: removed.edgeCoverage,
  };
}
