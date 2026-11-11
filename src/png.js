// Renders tile previews to PNG so Finn can look at his drafts.
import { PNG } from 'pngjs';
import { PALETTE } from './world.js';

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const COLORS = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, rgb(v)]));

function paint(png, pixels, scale, ox, oy) {
  for (let y = 0; y < 16; y++) {
    const row = pixels[y] || '';
    for (let x = 0; x < 16; x++) {
      const c = COLORS[row[x]];
      if (!c) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((oy + y * scale + dy) * png.width + (ox + x * scale + dx)) * 4;
          png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
        }
    }
  }
}

/** 3x3 preview: ground tiles repeated to show seams; objects on grass. Returns base64 PNG. */
export function previewPNG(draft, grassPixels, scale = 8) {
  const t = 16 * scale;
  const png = new PNG({ width: t * 3, height: t * 3 });
  png.data.fill(0);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) paint(png, draft.layer === 'ground' ? draft.pixels : grassPixels, scale, i * t, j * t);
  if (draft.layer === 'object') paint(png, draft.pixels, scale, t, t);
  return PNG.sync.write(png).toString('base64');
}
