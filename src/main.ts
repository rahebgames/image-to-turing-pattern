/*
 * This file is mostly my own code, with a few heavily modified segments
 *  taken from the source credited at the top of simulator.ts.
 */

import makeReactionDiffusionDiagram from "./simulator.ts";

document.addEventListener("DOMContentLoaded", async () => {
  // load default image
  const imgBitmap = await createImageBitmap(
    await (await fetch("./turing.jpg")).blob(),
  );

  const SIMULATION_SIZE = 256;
  const IMAGE_SIZE = SIMULATION_SIZE;

  // preprocess image - resize and convert to grayscale
  function get_image_data(bitmap: ImageBitmap): Float32Array {
    const canvas = new OffscreenCanvas(SIMULATION_SIZE, SIMULATION_SIZE);
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(bitmap, 0, 0, SIMULATION_SIZE, SIMULATION_SIZE);

    const imageData =
      ctx.getImageData(0, 0, SIMULATION_SIZE, SIMULATION_SIZE).data;
    const data = new Float32Array(IMAGE_SIZE * SIMULATION_SIZE);

    // Rec. 709 standard luminance constants
    const RED_WEIGHT = 0.299;
    const GREEN_WEIGHT = 0.587;
    const BLUE_WEIGHT = 0.114;

    for (let i = 0; i < data.length; i++) {
      const r = imageData[i * 4];
      const g = imageData[i * 4 + 1];
      const b = imageData[i * 4 + 2];
      const luminance = RED_WEIGHT * r + GREEN_WEIGHT * g + BLUE_WEIGHT * b;
      data[i] = luminance / 255; // Normalize to [0, 1]
    }

    return data;
  }

  const initialConcentrations = get_image_data(imgBitmap);

  // see https://homepages.inf.ed.ac.uk/rbf/HIPR2/log.htm
  // enhance edges to allow for cleaner lines in visualization
  function enhanceEdges(data: Float32Array, size: number): Float32Array {
    if (data.length !== size * size) {
      console.error(
        "enhanceEdges: data.length does not match size×size",
        data.length,
        size,
      );
      // Optionally resize or clamp?
      // For now, just return zeros if mismatched
      return new Float32Array(size * size);
    }

    const output = new Float32Array(data.length);
    const KERNEL_RADIUS = 1; // 3x3 kernel

    // Discrete Laplacian convolusion kernel (approximates second derivative for edge detection)
    // Deno formatter ruins this every time, but it is a 3x3 array.
    const LAPLACIAN_KERNEL = [
      0,
      -1,
      0,
      -1,
      4,
      -1,
      0,
      -1,
      0,
    ];

    // Apply laplacian convolution only to interior pixels (border remains zero)
    for (let y = KERNEL_RADIUS; y < size - KERNEL_RADIUS; y++) {
      for (let x = KERNEL_RADIUS; x < size - KERNEL_RADIUS; x++) {
        let edge = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const sampleIndex = (y + ky) * size + (x + kx);
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            edge += data[sampleIndex] * LAPLACIAN_KERNEL[kernelIndex];
          }
        }

        // Increase pixel value by edge strength to sharpen
        const centerIndex = y * size + x;
        const enhancedValue = data[centerIndex] + edge;
        output[centerIndex] = Math.max(0, Math.min(1, enhancedValue)); // clamp
      }
    }

    return output;
  }

  const enhancedEdgeMap = enhanceEdges(initialConcentrations, IMAGE_SIZE);

  // draw the initial state of the canvas using the default image
  function initial_bitmap(ctx: CanvasRenderingContext2D) {
    const imageData = ctx.createImageData(IMAGE_SIZE, IMAGE_SIZE);
    const pixels = imageData.data;

    for (let i = 0; i < initialConcentrations.length; i++) {
      const value = initialConcentrations[i];
      const brightness = Math.floor(255 * Math.max(0, Math.min(1, value))); // clamp

      pixels[i * 4] = brightness; // R
      pixels[i * 4 + 1] = brightness; // G
      pixels[i * 4 + 2] = brightness; // B
      pixels[i * 4 + 3] = 255; // A
    }

    // reset transform
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  }

  function getSlider(id: string): number {
    const el = document.getElementById(id) as HTMLInputElement;
    const value = el.valueAsNumber;
    el.previousSibling!.textContent = value.toFixed(3) + "  ";
    return value;
  }

  // handle image upload from user
  document.getElementById("image-upload")!.addEventListener(
    "change",
    async (e) => {
      const input = e.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) return;

      const file = input.files[0];
      const imgBitmap = await createImageBitmap(file);

      // regenerate concentration data from uploaded image
      const newConcentrations = get_image_data(imgBitmap);
      const newEnhancedEdges = enhanceEdges(newConcentrations, IMAGE_SIZE);

      initialConcentrations.set(newConcentrations);
      enhancedEdgeMap.set(newEnhancedEdges);
      diagram1.updateFeedMask(enhancedEdgeMap);
      diagram1.reloadInitialBitmap();
      diagram1.reset();
    },
  );

  // Initialize simulation with configured parameters
  const diagram1 = makeReactionDiffusionDiagram(
    "reaction-diffusion-1",
    {
      size: SIMULATION_SIZE,
      iterations_per_tick: 20, // Simulation speed: higher = faster evolution
      initial_bitmap: initial_bitmap,
      // black or white based on threshold
      colorize_glsl: `vec3(step(texture2D(u_new, v_uv).x, 0.5))`,
      feed_mask: enhancedEdgeMap, // mask based on image
    },
    (_tick: any) => ({
      diffusion_rate: 0.7, // diffusion speed of chemical A
      diffusion_step: 1.0, // neighbor sampling distance in grid units
      feed: getSlider("slider-feed"),
      kill: getSlider("slider-kill"),
      reset: false,
    }),
  );

  (document.getElementById("reset-button") as HTMLButtonElement)
    .addEventListener("click", () => diagram1.reset());
});
