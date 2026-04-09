import type { Compositor, CompositeLayer } from './types.js';

export function createCanvas2DCompositor(width: number, height: number): Compositor {
  let canvas = new OffscreenCanvas(width, height);
  let ctx = canvas.getContext('2d')!;
  let currentWidth = width;
  let currentHeight = height;

  return {
    async composite(layers: CompositeLayer[]): Promise<ImageBitmap> {
      ctx.clearRect(0, 0, currentWidth, currentHeight);

      // Sort by zIndex ascending (low = bottom, high = top)
      const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

      for (const layer of sorted) {
        if (layer.opacity <= 0) continue;

        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.source, 0, 0, currentWidth, currentHeight);
      }

      ctx.globalAlpha = 1;
      return createImageBitmap(canvas);
    },

    resize(w: number, h: number): void {
      currentWidth = w;
      currentHeight = h;
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d')!;
    },

    destroy(): void {
      // OffscreenCanvas has no explicit cleanup needed
    },
  };
}
