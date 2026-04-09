import type { Compositor } from './types.js';
import { createCanvas2DCompositor } from './canvas2d-compositor.js';
import { createGPUCompositor } from './gpu-compositor.js';

export type CompositorType = 'gpu' | 'canvas2d' | 'auto';

export async function createCompositor(
  width: number,
  height: number,
  type: CompositorType = 'auto',
): Promise<Compositor> {
  if (type === 'canvas2d') {
    return createCanvas2DCompositor(width, height);
  }

  if (type === 'gpu' || type === 'auto') {
    if (typeof navigator !== 'undefined' && (navigator as unknown as { gpu?: unknown }).gpu) {
      try {
        return await createGPUCompositor(width, height);
      } catch {
        if (type === 'gpu') {
          throw new Error('WebGPU compositor requested but initialization failed');
        }
      }
    } else if (type === 'gpu') {
      throw new Error('WebGPU not available');
    }
  }

  return createCanvas2DCompositor(width, height);
}
