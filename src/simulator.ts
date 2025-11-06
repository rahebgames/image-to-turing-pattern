/*
 * From https://www.redblobgames.com/x/2202-turing-patterns/
 * and some code copied from https://www.redblobgames.com/x/1905-reaction-diffusion/
 * Copyright 2022 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */

/*
 * This file is based on code from the above source.
 * Modifications:
 *  Conversion to TypeScript
 *  Changes to allow for simulation based on input images
 *  Tweaks and comments for my own legibility
 *   Most comments using multi line formatting are from the original source,
 *   most others are by me
 */

import createREGL from "regl";

// Config interface for makeReactionDiffusionDiagram
// Passed as a parameter
interface DiagramParam {
  size: number;
  iterations_per_tick: number;
  // method to draw initial state onto canvas
  initial_bitmap(ctx: CanvasRenderingContext2D): void;
  colorize_glsl: string; // GLSL fragment expression for visualizing output
  feed_mask?: Float32Array; // optional precomputed mask for spatially varying feed rate
}

// Compiles shaders and links uniforms to GLSL variables
function makeShaderProgram(
  regl: any,
  uniforms: any, // Map: uniform name -> GLSL type ( example: {feed: 'float'} )
  frag: string, // fragment shader code in GLSL (main logic for pixel color)
  blend: boolean = false, // enable blending
  vert?: string, // optional custom vertex shader code in GLSL
) {
  const uniform_map: { [key: string]: any } = {};
  let uniform_decl = "";

  for (const [name, type] of Object.entries(uniforms)) {
    // parse uniforms into runtime flexible REGL prop functions
    uniform_map[name] = regl.prop(name);
    // insert uniforms into shader source as GLSL
    uniform_decl += `uniform ${type} ${name};\n`;
  }

  // create and return a REGL draw command configured with shaders, state, and attributes
  return regl({
    frag: `
      precision highp float; // enable high precision floats
      ${uniform_decl}
      varying vec2 v_uv;
      ${frag}
    `,
    vert: vert || `  // use custom or default
      precision highp float;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(2.0 * v_uv - 1.0, 0.0, 1.0);
      }
    `,
    blend: { enable: blend },
    uniforms: uniform_map,
    depth: { enable: false },
    count: 3,
    attributes: { a_uv: [-2, 0, 0, -2, 2, 2] },
  });
}

// Main factory function: initializes a reaction-diffusion simulation on a canvas
// Implements Gray-Scott model using GPU-based stencil operations via REGL
export default function makeReactionDiffusionDiagram(
  id: string,
  params: DiagramParam,
  uniforms: any,
) {
  const canvas = document.getElementById(id);
  const regl = createREGL({
    canvas,
    extensions: ["OES_texture_float", "OES_texture_float_linear"],
  });

  // if feed mask provided, enable spatial variation of feed rate based on provided data
  let feedMaskTexture: any;
  if (params.feed_mask) {
    feedMaskTexture = regl.texture({
      data: params.feed_mask,
      shape: [params.size, params.size, 1],
      type: "float",
    });
  }

  /* Need two framebuffers, which will store A and B values in a double buffer */
  const buffer_textures = [
    regl.texture({
      radius: params.size,
      type: "float",
      min: "linear",
      mag: "linear",
      wrap: "repeat",
    }),
    regl.texture({
      radius: params.size,
      type: "float",
      min: "linear",
      mag: "linear",
      wrap: "repeat",
    }),
  ];

  // attach textures as render targets
  const buffer_fbos = buffer_textures.map(
    (buffer) => regl.framebuffer({ color: [buffer] }),
  );

  // initialize or updates simulation using bitmap from a new image
  const paint_from_bitmap = makeShaderProgram(
    regl,
    { u_old: "sampler2D", u_new: "sampler2D" },
    `
        void main() {
            vec4 old = texture2D(u_old, v_uv);
            vec4 new_texel = texture2D(u_new, v_uv);
            gl_FragColor = mix(old, new_texel, new_texel.a);
        }
    `,
  );

  // Shader to apply color mapping to the texture and draw on screen
  const draw = makeShaderProgram(
    regl,
    { u_old: "sampler2D", u_new: "sampler2D" },
    `void main() {
            vec4 old = texture2D(u_old, v_uv);
            vec4 new = texture2D(u_new, v_uv);
            gl_FragColor = vec4(${params.colorize_glsl}, 1);
        }`,
    false, // blend disabled
    `// Custom vertex shader: flip Y
            precision highp float;
            attribute vec2 a_uv;
            varying vec2 v_uv;
            void main() {
            v_uv = vec2(a_uv.x, 1.0 - a_uv.y);  // Flip Y
            gl_Position = vec4(2.0 * a_uv - 1.0, 0.0, 1.0);
        }`,
  );

  /* see http://www.karlsims.com/rd.html */
  // Uses the method by Karl Sims to implement the Gray-Scott model of reaction-diffusion
  const karlsims_reactiondiffusion = makeShaderProgram(
    regl,
    {
      u_texture: "sampler2D",
      diffusion_step: "float",
      diffusion_rate: "float",
      resolution: "float",
      dt: "float",
      feed: "float",
      kill: "float",
      feed_mask: "sampler2D",
    },
    `
    // Cardinal neighbors have higher diffusion influence
    const float weight_cardinal = 0.2;  // 80% of weight for all cardinals
    const float weight_diagonal = 0.05; // 20% to for all diagonals

    vec2 diffusion(vec2 pos, float step) {
        vec2 dx = vec2(step, 0);
        vec2 dy = vec2(0, step);
        
        // Cardinal neighbors
        vec2 w = texture2D(u_texture, pos - dx).xy;
        vec2 e = texture2D(u_texture, pos + dx).xy;
        vec2 s = texture2D(u_texture, pos - dy).xy;
        vec2 n = texture2D(u_texture, pos + dy).xy;
        
        // Diagonal neighbors
        vec2 sw = texture2D(u_texture, pos - dx - dy).xy;
        vec2 se = texture2D(u_texture, pos + dx - dy).xy;
        vec2 nw = texture2D(u_texture, pos - dx + dy).xy;
        vec2 ne = texture2D(u_texture, pos + dx + dy).xy;

        return weight_cardinal * (w + e + s + n) + weight_diagonal * (sw + se + nw + ne);
    }

    void main() {
      vec2 center = texture2D(u_texture, v_uv).xy;
      vec2 blur = diffusion(v_uv, diffusion_step / resolution) - center;
      float A = center.x, B = center.y;
      float reaction = A * B * B;

      float local_feed = feed * texture2D(feed_mask, v_uv).x;

      vec2 diff = dt * vec2(
        diffusion_rate * blur.x - reaction + local_feed * (1.0 - A),
          diffusion_rate *0.5 * blur.y + reaction - (kill + local_feed) * B );
      gl_FragColor = vec4(center + diff,0,0);
    }
    `,
  );

  // create canvas to draw initial state
  const source_bitmap = document.createElement("canvas");
  source_bitmap.width = source_bitmap.height = params.size;
  const ctx = source_bitmap.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, params.size, params.size);
  ctx.translate(params.size / 2, params.size / 2);
  ctx.scale(params.size / 2, params.size / 2);
  params.initial_bitmap(ctx);

  /* run a render function and swap the buffers */
  let currentOutputIn = 0;
  function reset() {
    const source_texture = regl.texture({ data: source_bitmap });
    regl({ framebuffer: buffer_fbos[currentOutputIn] })(
      () =>
        paint_from_bitmap({
          u_old: buffer_textures[1 - currentOutputIn],
          u_new: source_texture,
        }),
    );
    source_texture.destroy();
  }

  // run one simulation step
  function run(fn: any) {
    const nextOutputIn = 1 - currentOutputIn;
    regl({ framebuffer: buffer_fbos[nextOutputIn] })(() =>
      fn(buffer_textures[currentOutputIn])
    );
    currentOutputIn = nextOutputIn;
  }

  reset();

  // Main Loop
  regl.frame((context: any) => {
    // skip frame if not on screen
    if (
      canvas!.dataset.visible === "hidden" ||
      document.visibilityState === "hidden"
    ) return;

    // run multiple steps per frame
    for (let iterate = 0; iterate < params.iterations_per_tick; iterate++) {
      let u = uniforms(context.tick);
      if (u.reset) reset();

      // run one simulaation step
      run((u_texture: any) =>
        karlsims_reactiondiffusion({
          u_texture,
          resolution: params.size,
          dt: 1.0,
          ...u,
          feed_mask: feedMaskTexture || { min: 0, max: 0 }, // default if missing
        })
      );
    }

    // draw to screen
    draw({
      u_old: buffer_textures[currentOutputIn],
      u_new: buffer_textures[1 - currentOutputIn],
    });
  });

  // allow dynamic update of feed mask
  function updateFeedMask(newFeedMask: Float32Array) {
    const expectedLength = params.size * params.size;
    if (newFeedMask.length !== expectedLength) {
      console.warn(
        `updateFeedMask: expected ${expectedLength} elements, got ${newFeedMask.length}. Padding/clamping.`,
      );
      const fixed = new Float32Array(expectedLength);
      fixed.set(newFeedMask.subarray(0, expectedLength));
      newFeedMask = fixed;
    }

    if (feedMaskTexture) {
      feedMaskTexture({
        data: newFeedMask,
        shape: [params.size, params.size, 1],
      });
    }
  }

  function reloadInitialBitmap() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, params.size, params.size);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, params.size, params.size);
    ctx.translate(params.size / 2, params.size / 2);
    ctx.scale(params.size / 2, params.size / 2);
    params.initial_bitmap(ctx);
  }

  // allow reset function to be used elsewhere (reset button)
  return {
    reset,
    updateFeedMask,
    reloadInitialBitmap,
  };
}
