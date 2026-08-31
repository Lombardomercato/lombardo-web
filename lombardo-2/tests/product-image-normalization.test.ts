import assert from "node:assert/strict";
import test from "node:test";
import {
  alphaBounds,
  fitInsideLombardoCanvas,
  removeEdgeConnectedBackground,
} from "../lib/images/normalize-product-master.ts";

test("edge-connected background is removed without erasing enclosed white details", () => {
  const width = 10;
  const height = 12;
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 2; y < 11; y += 1) {
    for (let x = 3; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 20;
      data[offset + 1] = 20;
      data[offset + 2] = 20;
    }
  }
  const labelOffset = (6 * width + 4) * 4;
  data[labelOffset] = 255;
  data[labelOffset + 1] = 255;
  data[labelOffset + 2] = 255;

  const result = removeEdgeConnectedBackground({ data, width, height, channels: 4 });
  assert.equal(result.data[3], 0);
  assert.equal(result.data[labelOffset + 3], 255);
  assert.deepEqual(alphaBounds(result), { left: 3, top: 2, width: 4, height: 9 });
});

test("tall products occupy 80% of the transparent Lombardo canvas", () => {
  assert.deepEqual(fitInsideLombardoCanvas(300, 1000), {
    width: 300,
    height: 1000,
    left: 350,
    top: 125,
  });
});

test("wide products occupy 80% of the transparent Lombardo canvas", () => {
  assert.deepEqual(fitInsideLombardoCanvas(1000, 500), {
    width: 800,
    height: 400,
    left: 100,
    top: 725,
  });
});
