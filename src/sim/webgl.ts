import { Camera } from '../core/camera';
import { matterLUT } from '../core/palette';
import type { FieldSnapshot, LeniaParams, Pattern, Quality, RenderView, SeedSpec, Simulation } from '../core/types';
import { buildPackedKernel, lanesFor } from './kernel';
import { resolveSeed, type SeedSpecExt } from './seed';
import {
  type Encoding,
  eraseSource,
  extractSource,
  fieldSource,
  GLOW_BLUR,
  GLOW_DOWN,
  RENDER,
  seedSource,
  snapshotSource,
  stepSource,
  VERT,
} from './shaders';
import { decodeSnapshotPixels, decodeValuePixels, GRAD_ENCODE_MAX, pack16, snapshotSize } from './snapshot';
import { DEFAULT_RENDER_STYLE, RIM_HALO, normalizeRenderStyle, type SimRenderStyle } from './style';

/**
 * Lenia on WebGL2.
 *
 * - State: lane-packed float textures in ping-pong (RGBA16F: 4 cells per texel),
 *   or RGBA8 with 16-bit fixed-point cells when float targets are not renderable.
 * - Step: one draw per step; the convolution is fully unrolled with the kernel
 *   weights baked in as constants (regenerated only when R / rings change), rows
 *   ±dy summed before the multiply-adds, zero weights dropped. Same rule as
 *   cpu.ts: A = clip(A + dt·G(K*A)), Chan kn=1 kernel / gn=1 growth, torus.
 * - Render: grid-res "field" pass (A, ∇A, glow source) → optional half-res
 *   blur → one screen pass (bicubic upsampling, LUT, gel relief, cyan contour,
 *   bloom, dish). Quality: low = no bloom; medium = bloom; high = wider bloom.
 *   For weak devices the big saver is a smaller backing store (cap the DPR you
 *   pass to resizeCanvas), since the screen pass is per device pixel.
 *
 * Conventions: grid cell i covers [i, i+1) (centre i + 0.5); SeedSpec x/y,
 * erase and capture centres are continuous grid coordinates; snapshot block b
 * covers cells [b*scale, b*scale+scale). Camera math is core/camera.ts.
 *
 * Extras beyond core Simulation (optional for the integrator): readState /
 * writeState (full 16-bit grid), snapshotAsync (non-blocking readback),
 * prewarmKernel (compile a kernel ahead of setParams), finish, info,
 * contextLost, SeedSpec.patternScale (see seed.ts), setMatterLUT / setRenderStyle (cosmetic
 * palettes and dish themes; purely visual, see style.ts).
 */

export type StateFormat = 'auto' | 'half' | 'float' | 'u8';

export interface SimOptions {
  gridW: number;
  gridH: number;
  params: LeniaParams;
  /** Storage: 'auto' (default) = 16-bit float if renderable, else RGBA8 16-bit fixed point. */
  format?: StateFormat;
  /** Upper bound for cells per texel (testing / debugging). Default 4. */
  maxLanes?: 1 | 2 | 4;
  /** Snapshot downsampling factor (grid cells per snapshot cell). Default 2. */
  snapshotScale?: number;
  /** Called when the GL context is lost / restored (state is restored from the latest backup). */
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export class SimUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimUnsupportedError';
  }
}

export function createSimulation(canvas: HTMLCanvasElement, opts: SimOptions): WebGLSimulation {
  return new WebGLSimulation(canvas, opts);
}

interface Prog {
  p: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

type Candidate = 'f16' | 'f32' | 'u8';

interface Formats {
  cand: Candidate;
  enc: Encoding;
  lanes: number;
  internal: number;
  format: number;
  type: number;
}

/** Diagnostic info about the running backend. */
export interface SimInfo {
  renderer: string;
  storage: Candidate;
  lanes: number;
  /** Texture fetches per cell per step for the current kernel. */
  fetchesPerCell: number;
  madsPerCell: number;
  floatField: boolean;
}

/** Compiled step programs kept (one per kernel R / rings); each is a few hundred KB of driver memory. */
const STEP_CACHE_MAX = 18;

const QUALITY_GLOW: Record<Quality, { amount: number; passes: number; cubic: boolean }> = {
  low: { amount: 0, passes: 0, cubic: true },
  medium: { amount: 0.55, passes: 1, cubic: true },
  high: { amount: 0.65, passes: 2, cubic: true },
};

export class WebGLSimulation implements Simulation {
  readonly gridW: number;
  readonly gridH: number;
  info: SimInfo;

  private readonly canvas: HTMLCanvasElement;
  private readonly opts: SimOptions;
  private readonly gl: WebGL2RenderingContext;
  private _params: LeniaParams;
  private _step = 0;
  private snapScale: number;

  // GL resources (rebuilt on context restore)
  private fm!: Formats;
  private vao!: WebGLVertexArrayObject;
  private state!: [Target, Target];
  private cur = 0;
  private field!: Target;
  private glowA!: Target;
  private glowB!: Target;
  private snapT!: Target;
  private extractTargets = new Map<string, Target>();
  private lut!: WebGLTexture;
  /** Matter colormap (256×1 RGBA8); kept so a restored context gets the same palette. */
  private lutData: Uint8Array = matterLUT();
  private style: SimRenderStyle = DEFAULT_RENDER_STYLE;
  /** Style uniforms must be (re)sent to the render program. */
  private styleDirty = true;
  private tmplTex!: WebGLTexture;
  private tmplRef: Pattern | null = null;
  private emptyTmpl!: WebGLTexture;
  private stepProg!: Prog;
  private stepKey = '';
  private stepCache = new Map<string, Prog>();
  private progs!: Record<'seed' | 'erase' | 'snapshot' | 'extract' | 'field' | 'glowDown' | 'glowBlur' | 'render', Prog>;
  private floatField = false;
  private offMin = -8;
  private offMax = 7;

  /** Backing-store pixels per CSS pixel (line widths); refreshed on resizeCanvas, not per frame. */
  private pxRatio = 1;
  private fieldDirty = true;
  private glowBuiltPasses = -1;
  private camera: Camera;
  private lost = false;
  private disposed = false;
  private seedCounter = 1;
  private backup: { data: Float32Array; step: number } | null = null;
  private lastSnap: FieldSnapshot | null = null;
  private pbo: WebGLBuffer | null = null;
  private pending: Promise<FieldSnapshot> | null = null;
  private readonly onLost: (e: Event) => void;
  private readonly onRestored: () => void;

  constructor(canvas: HTMLCanvasElement, opts: SimOptions) {
    if (!(opts.gridW >= 8 && opts.gridH >= 8)) throw new Error('grid too small');
    this.canvas = canvas;
    this.opts = opts;
    this.gridW = Math.floor(opts.gridW);
    this.gridH = Math.floor(opts.gridH);
    this._params = { ...opts.params, rings: [...opts.params.rings] };
    this.snapScale = Math.max(1, Math.min(8, Math.floor(opts.snapshotScale ?? 2)));
    this.camera = new Camera(this.gridW, this.gridH);
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new SimUnsupportedError('WebGL2 is not available on this device');
    this.gl = gl;
    this.info = { renderer: '', storage: 'u8', lanes: 1, fetchesPerCell: 0, madsPerCell: 0, floatField: false };

    this.onLost = (e: Event) => {
      e.preventDefault(); // allows the browser to restore the context
      if (this.lost) return;
      this.lost = true;
      console.warn('[sim] WebGL context lost; simulation paused until restored');
      this.opts.onContextLost?.();
    };
    this.onRestored = () => {
      if (this.disposed) return;
      console.info('[sim] WebGL context restored; rebuilding GPU state');
      // Clear the flag first: initGL's storage round-trip test runs real seed()/clear() passes,
      // which are no-ops while `lost` is set (the probe pattern would stay in the dish).
      this.lost = false;
      try {
        this.initGL();
        this.restoreBackup();
        this.opts.onContextRestored?.();
      } catch (err) {
        this.lost = true;
        console.error('[sim] could not rebuild after context restore', err);
      }
    };
    this.updatePxRatio();
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored, false);
    this.initGL();
  }

  // ───────────────────────────── Simulation API ─────────────────────────────

  get params(): LeniaParams {
    return this._params;
  }

  get stepCount(): number {
    return this._step;
  }

  /** True while the WebGL context is lost (all calls are no-ops). */
  get contextLost(): boolean {
    return this.lost;
  }

  setParams(p: Partial<LeniaParams>): void {
    const next: LeniaParams = { ...this._params, ...p, rings: [...(p.rings ?? this._params.rings)] };
    this._params = next;
    if (!this.lost) this.ensureStepProgram();
  }

  advance(steps: number): void {
    const n = Math.floor(steps);
    if (this.lost || this.disposed || n <= 0) return;
    const gl = this.gl;
    const { mu, sigma, dt } = this._params;
    const p = this.stepProg;
    gl.useProgram(p.p);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(p.u('uS'), 0);
    gl.uniform2f(p.u('uInv'), 1 / this.state[0].w, 1 / this.state[0].h);
    gl.uniform1f(p.u('uMu'), mu);
    gl.uniform1f(p.u('uK'), 1 / (9 * sigma * sigma));
    gl.uniform1f(p.u('uDt'), dt);
    gl.viewport(0, 0, this.state[0].w, this.state[0].h);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < n; i++) {
      const src = this.state[this.cur];
      const dst = this.state[1 - this.cur];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cur = 1 - this.cur;
    }
    this._step += n;
    this.fieldDirty = true;
  }

  seed(spec: SeedSpec): void {
    if (this.lost || this.disposed) return;
    const s = resolveSeed(spec as SeedSpecExt, this.nextSeed());
    const gl = this.gl;
    const p = this.progs.seed;
    if (s.pattern) this.uploadTemplate(s.pattern);
    this.beginStatePass(p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.pattern ? this.tmplTex : this.emptyTmpl);
    gl.uniform1i(p.u('uTmpl'), 1);
    gl.uniform2i(p.u('uTmplSize'), s.pattern?.w ?? 0, s.pattern?.h ?? 0);
    gl.uniform2f(p.u('uCenter'), s.cx, s.cy);
    gl.uniform2f(p.u('uTCenter'), s.tx, s.ty);
    gl.uniform2f(p.u('uRot'), s.cos, s.sin);
    gl.uniform2f(p.u('uSpacing'), s.spacing1, s.spacing2);
    gl.uniform1f(p.u('uRadius'), s.radius);
    gl.uniform1f(p.u('uDensity'), s.density);
    gl.uniform1f(p.u('uNoise'), s.noise);
    gl.uniform1f(p.u('uBias'), s.bias);
    gl.uniform1f(p.u('uTScale'), s.scale);
    gl.uniform1f(p.u('uBound'), s.bound);
    gl.uniform1i(p.u('uShape'), s.shape);
    gl.uniform1i(p.u('uHasTmpl'), s.pattern ? 1 : 0);
    gl.uniform1ui(p.u('uSeed'), s.rngSeed);
    this.endStatePass();
  }

  erase(x: number, y: number, radius: number): void {
    if (this.lost || this.disposed) return;
    const gl = this.gl;
    const p = this.progs.erase;
    this.beginStatePass(p);
    gl.uniform2f(p.u('uCenter'), x, y);
    gl.uniform1f(p.u('uRadius'), Math.max(0.5, radius));
    this.endStatePass();
  }

  clear(): void {
    if (this.lost || this.disposed) return;
    const gl = this.gl;
    for (const t of this.state) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    }
    this.fieldDirty = true;
  }

  snapshot(): FieldSnapshot {
    const { w, h } = snapshotSize(this.gridW, this.gridH, this.snapScale);
    if (this.lost || this.disposed) {
      return this.lastSnap ?? {
        w,
        h,
        scale: this.snapScale,
        gridW: this.gridW,
        gridH: this.gridH,
        value: new Float32Array(w * h),
        grad: new Float32Array(w * h),
        step: this._step,
      };
    }
    const gl = this.gl;
    const p = this.progs.snapshot;
    this.useStateReader(p);
    gl.uniform1i(p.u('uScale'), this.snapScale);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapT.fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const snap = decodeSnapshotPixels(px, w, h, this.snapScale, this.gridW, this.gridH, this._step);
    this.lastSnap = snap;
    return snap;
  }

  /**
   * Non-blocking variant of snapshot(): the readback goes through a pixel
   * buffer + fence, so the CPU never waits for the GPU. Resolves a frame or
   * two later with the field as it was at the call (`step` = stepCount then).
   * Only one request is in flight; a second call returns the same promise.
   */
  snapshotAsync(): Promise<FieldSnapshot> {
    if (this.pending) return this.pending;
    if (this.lost || this.disposed) return Promise.resolve(this.snapshot());
    const gl = this.gl;
    const { w, h } = snapshotSize(this.gridW, this.gridH, this.snapScale);
    const step = this._step;
    const p = this.progs.snapshot;
    this.useStateReader(p);
    gl.uniform1i(p.u('uScale'), this.snapScale);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapT.fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.pbo) this.pbo = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    const pbo = this.pbo;
    this.pending = new Promise<FieldSnapshot>((resolve) => {
      const poll = () => {
        if (this.lost || this.disposed) {
          this.pending = null;
          resolve(this.snapshot());
          return;
        }
        const st = gl.clientWaitSync(fence, 0, 0);
        if (st === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 1);
          return;
        }
        gl.deleteSync(fence);
        const px = new Uint8Array(w * h * 4);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        const snap = decodeSnapshotPixels(px, w, h, this.snapScale, this.gridW, this.gridH, step);
        if (!this.lastSnap || this.lastSnap.step <= step) this.lastSnap = snap;
        this.pending = null;
        resolve(snap);
      };
      setTimeout(poll, 0);
    });
    return this.pending;
  }

  capture(x: number, y: number, size: number): Pattern {
    const n = Math.max(1, Math.round(size));
    if (this.lost || this.disposed) return { w: n, h: n, data: new Float32Array(n * n) };
    const data = this.readCells(Math.round(x - n / 2), Math.round(y - n / 2), n, n);
    return { w: n, h: n, data };
  }

  /**
   * Non-blocking capture (portraits): the cells are copied on the GPU at the call (the dish as it is
   * now) and read back through a pixel buffer + fence a frame or two later. Never stalls the main
   * thread (QA3 F2: synchronous readPixels was 82-87 % of busy time).
   */
  captureAsync(x: number, y: number, size: number): Promise<Pattern> {
    const n = Math.max(1, Math.round(size));
    if (this.lost || this.disposed) return Promise.resolve({ w: n, h: n, data: new Float32Array(n * n) });
    return this.readCellsAsync(Math.round(x - n / 2), Math.round(y - n / 2), n, n).then((data) => ({ w: n, h: n, data }));
  }

  /** Non-blocking exportState(): 8-bit dish for the save, read through a pixel buffer + fence. */
  exportStateAsync(): Promise<Uint8Array> {
    if (this.lost || this.disposed) return Promise.resolve(this.exportState());
    const step = this._step;
    return this.readCellsAsync(0, 0, this.gridW, this.gridH).then((full) => {
      if (!this.backup || this.backup.step <= step) this.backup = { data: full.slice(), step };
      const out = new Uint8Array(full.length);
      for (let i = 0; i < full.length; i++) out[i] = Math.round(full[i] * 255);
      return out;
    });
  }

  exportState(): Uint8Array {
    const full = this.lost || this.disposed ? (this.backup?.data ?? new Float32Array(this.gridW * this.gridH)) : this.readState();
    const out = new Uint8Array(full.length);
    for (let i = 0; i < full.length; i++) out[i] = Math.round(full[i] * 255);
    return out;
  }

  /**
   * Load an 8-bit state. If the saved grid has another size it is centred and
   * cropped / zero-padded (creatures keep their size; resampling would kill them).
   */
  importState(data: Uint8Array, w: number, h: number): void {
    const W = this.gridW;
    const H = this.gridH;
    const out = new Float32Array(W * H);
    if (w === W && h === H) {
      for (let i = 0; i < out.length; i++) out[i] = (data[i] ?? 0) / 255;
    } else {
      const ox = Math.floor((w - W) / 2);
      const oy = Math.floor((h - H) / 2);
      for (let y = 0; y < H; y++) {
        const sy = y + oy;
        if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < W; x++) {
          const sx = x + ox;
          if (sx < 0 || sx >= w) continue;
          out[y * W + x] = (data[sy * w + sx] ?? 0) / 255;
        }
      }
    }
    this.writeState(out);
  }

  render(view: RenderView): void {
    if (this.lost || this.disposed) return;
    const gl = this.gl;
    const q = QUALITY_GLOW[view.quality] ?? QUALITY_GLOW.medium;
    if (this.fieldDirty) {
      this.buildField();
      this.fieldDirty = false;
      this.glowBuiltPasses = -1;
    }
    if (q.passes > 0 && this.glowBuiltPasses !== q.passes) {
      this.buildGlow(q.passes);
      this.glowBuiltPasses = q.passes;
    }
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cam = this.camera;
    cam.setView(W, H);
    cam.zoom = view.camera.zoom;
    cam.cx = view.camera.cx;
    cam.cy = view.camera.cy;
    const dpr = this.pxRatio;

    const p = this.progs.render;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(p.p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.glowA.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.uniform1i(p.u('uField'), 0);
    gl.uniform1i(p.u('uGlow'), 1);
    gl.uniform1i(p.u('uLut'), 2);
    gl.uniform2f(p.u('uView'), W, H);
    gl.uniform2f(p.u('uGrid'), this.gridW, this.gridH);
    gl.uniform2f(p.u('uCenter'), cam.cx, cam.cy);
    gl.uniform1f(p.u('uScale'), cam.scale);
    gl.uniform1f(p.u('uDpr'), dpr);
    gl.uniform1f(p.u('uTime'), view.time);
    gl.uniform1f(p.u('uGlowAmt'), q.amount);
    gl.uniform1i(p.u('uCubic'), q.cubic ? 1 : 0);
    gl.uniform1f(p.u('uGradBias'), this.floatField ? 0 : 0.5);
    if (this.styleDirty) this.uploadStyle(p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Style uniforms persist in the render program; sent only after a change or a rebuild. */
  private uploadStyle(p: Prog): void {
    const gl = this.gl;
    const st = this.style;
    gl.uniform3fv(p.u('uBg'), st.bg);
    gl.uniform3fv(p.u('uAgarIn'), st.agarIn);
    gl.uniform3fv(p.u('uAgarOut'), st.agarOut);
    gl.uniform3fv(p.u('uRim'), st.rim);
    gl.uniform3fv(p.u('uContour'), st.contour);
    gl.uniform3fv(p.u('uGlowCore'), st.glowCore);
    gl.uniform3fv(p.u('uGlowWide'), st.glowWide);
    gl.uniform3fv(p.u('uShadow'), st.shadow);
    gl.uniform1f(p.u('uRimAmt'), st.rimAmt);
    gl.uniform1f(p.u('uRimHalo'), st.rimStyle === 'glow' ? RIM_HALO.glow : RIM_HALO.normal);
    gl.uniform1f(p.u('uRimDouble'), st.rimStyle === 'double' ? 1 : 0);
    gl.uniform4fv(p.u('uLabGrid'), st.grid);
    this.styleDirty = false;
  }

  /**
   * Swap the matter colormap (256×1 RGBA8, e.g. src/store/apply.ts paletteLUT). Purely visual:
   * the simulation state and the detector never see it.
   */
  setMatterLUT(lut: Uint8Array): void {
    if (lut.length !== 256 * 4) throw new Error('setMatterLUT: expected 256×1 RGBA8 (1024 bytes)');
    this.lutData = lut.slice();
    if (this.lost || this.disposed) return; // initGL uploads lutData on restore
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.lutData);
  }

  /** Dish and accent colours of the screen pass (style.ts). Defaults reproduce the original look exactly. */
  setRenderStyle(style: SimRenderStyle): void {
    this.style = normalizeRenderStyle(style);
    this.styleDirty = true;
  }

  get renderStyle(): Readonly<SimRenderStyle> {
    return this.style;
  }

  resizeCanvas(width: number, height: number): void {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
    this.updatePxRatio();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (!this.lost) this.deleteResources();
  }

  // ───────────────────────────── Extras (tests, tools) ─────────────────────────────

  /** Full-precision (16-bit) copy of the whole grid, row-major. Also refreshes the restore backup. */
  readState(): Float32Array {
    if (this.lost || this.disposed) return this.backup?.data.slice() ?? new Float32Array(this.gridW * this.gridH);
    const data = this.readCells(0, 0, this.gridW, this.gridH);
    this.backup = { data: data.slice(), step: this._step };
    return data;
  }

  /** Overwrite the whole grid (row-major, values 0..1). */
  writeState(data: Float32Array): void {
    const n = this.gridW * this.gridH;
    if (data.length < n) throw new Error('writeState: wrong size');
    this.backup = { data: data.slice(0, n), step: this._step };
    if (this.lost || this.disposed) return;
    this.uploadState(data);
  }

  /**
   * Compile (and cache) the step shader for a kernel without switching to it,
   * e.g. when the calibrator opens, so a later setParams({R}) does not hitch.
   * Compiling costs ~0.1–0.7 s depending on R (the weights are baked in).
   */
  prewarmKernel(R: number, rings: number[] = this._params.rings): void {
    if (this.lost || this.disposed) return;
    const key = `${this.fm.lanes}|${this.fm.enc}|${R}|${rings.join(',')}`;
    if (this.stepCache.has(key)) return;
    const saved = this._params;
    const savedKey = this.stepKey;
    const savedProg = this.stepProg;
    this._params = { ...saved, R, rings: [...rings] };
    this.ensureStepProgram();
    this._params = saved;
    this.stepKey = savedKey;
    this.stepProg = savedProg;
    const pk = buildPackedKernel(saved.R, saved.rings, this.fm.lanes);
    this.info = { ...this.info, fetchesPerCell: pk.fetches / pk.lanes, madsPerCell: pk.mads / pk.lanes };
  }

  /** Block until the GPU has finished all queued work (benchmarks). */
  finish(): void {
    if (this.lost || this.disposed) return;
    const gl = this.gl;
    // A 1-pixel readback is the portable way to wait for the queue.
    const t = this.extractTarget(1, 1);
    this.useStateReader(this.progs.extract);
    gl.uniform2i(this.progs.extract.u('uOrigin'), 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  // ───────────────────────────── GL setup ─────────────────────────────

  private updatePxRatio(): void {
    const css = this.canvas.clientWidth; // layout read: only here, never per frame
    const r = css > 0 ? this.canvas.width / css : (globalThis.devicePixelRatio ?? 1);
    this.pxRatio = Math.min(4, Math.max(1, r || 1));
  }

  private initGL(): void {
    const gl = this.gl;
    this.stepCache.clear();
    this.extractTargets.clear();
    this.pbo = null;
    this.pending = null;
    this.stepKey = '';
    this.tmplRef = null;
    this.fieldDirty = true;
    this.glowBuiltPasses = -1;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    this.offMin = gl.getParameter(gl.MIN_PROGRAM_TEXEL_OFFSET) ?? -8;
    this.offMax = gl.getParameter(gl.MAX_PROGRAM_TEXEL_OFFSET) ?? 7;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));

    this.vao = gl.createVertexArray()!;
    // Seed templates (R32F, sampled with texelFetch + manual bilinear).
    this.tmplTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tmplTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array(1));
    this.texParams(gl.NEAREST, gl.CLAMP_TO_EDGE);
    this.emptyTmpl = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTmpl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array(1));
    this.texParams(gl.NEAREST, gl.CLAMP_TO_EDGE);
    const want = this.opts.format ?? 'auto';
    let floatOK = false;
    if (want !== 'u8') {
      const f = gl.getExtension('EXT_color_buffer_float');
      const h = gl.getExtension('EXT_color_buffer_half_float');
      floatOK = !!(f || h);
    }
    const order: Candidate[] =
      want === 'u8' ? ['u8'] : want === 'float' ? ['f32', 'u8'] : want === 'half' ? ['f16', 'u8'] : ['f16', 'f32', 'u8'];
    let ok = false;
    for (const cand of order) {
      if (cand !== 'u8' && !floatOK) continue;
      if (this.tryFormat(cand)) {
        ok = true;
        break;
      }
    }
    if (!ok) throw new SimUnsupportedError('No renderable texture format for the simulation');

    // Display field: half float if renderable (always filterable), else RGBA8.
    this.floatField = false;
    if (floatOK) {
      const t = this.makeTarget(this.gridW, this.gridH, gl.RGBA16F, gl.LINEAR, gl.REPEAT);
      if (this.isComplete(t)) {
        this.field = t;
        this.floatField = true;
      } else this.deleteTarget(t);
    }
    if (!this.floatField) this.field = this.makeTarget(this.gridW, this.gridH, gl.RGBA8, gl.LINEAR, gl.REPEAT);
    const gw = Math.ceil(this.gridW / 2);
    const gh = Math.ceil(this.gridH / 2);
    this.glowA = this.makeTarget(gw, gh, gl.RGBA8, gl.LINEAR, gl.REPEAT);
    this.glowB = this.makeTarget(gw, gh, gl.RGBA8, gl.LINEAR, gl.REPEAT);
    const ss = snapshotSize(this.gridW, this.gridH, this.snapScale);
    this.snapT = this.makeTarget(ss.w, ss.h, gl.RGBA8, gl.NEAREST, gl.CLAMP_TO_EDGE);

    this.lut = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lutData);
    this.texParams(gl.LINEAR, gl.CLAMP_TO_EDGE);

    this.progs = {
      ...this.progs,
      field: this.program(fieldSource(this.fm.lanes, this.fm.enc, this.floatField ? 0 : 0.5)),
      render: this.program(RENDER),
      glowDown: this.program(GLOW_DOWN),
      glowBlur: this.program(GLOW_BLUR),
    };
    this.styleDirty = true; // new render program: its style uniforms start at zero
    this.ensureStepProgram();
    this.info = {
      ...this.info,
      renderer,
      storage: this.fm.cand,
      lanes: this.fm.lanes,
      floatField: this.floatField,
    };
  }

  /** Create state textures + programs for a storage candidate and verify a round trip. */
  private tryFormat(cand: Candidate): boolean {
    const gl = this.gl;
    const maxL = cand === 'u8' ? 2 : (this.opts.maxLanes ?? 4);
    const lanes = lanesFor(this.gridW, maxL);
    const fmt = formatsFor(gl, cand, lanes);
    const Wt = this.gridW / lanes;
    const a = this.makeTarget(Wt, this.gridH, fmt.internal, gl.NEAREST, gl.REPEAT);
    const b = this.makeTarget(Wt, this.gridH, fmt.internal, gl.NEAREST, gl.REPEAT);
    if (!this.isComplete(a) || !this.isComplete(b)) {
      this.deleteTarget(a);
      this.deleteTarget(b);
      return false;
    }
    this.fm = fmt;
    this.state = [a, b];
    this.cur = 0;
    try {
      const L = lanes;
      this.progs = {
        seed: this.program(seedSource(L, fmt.enc)),
        erase: this.program(eraseSource(L, fmt.enc)),
        snapshot: this.program(snapshotSource(L, fmt.enc, GRAD_ENCODE_MAX)),
        extract: this.program(extractSource(L, fmt.enc)),
      } as WebGLSimulation['progs'];
      // Round trip: upload a ramp, render it through an identity state→state
      // pass (a zero-density seed) into the other target, read it back.
      const n = this.gridW * this.gridH;
      const probe = new Float32Array(n);
      for (let i = 0; i < n; i++) probe[i] = ((i * 37) % 101) / 100;
      this.uploadState(probe);
      this.seed({ x: 0, y: 0, radius: 1, density: 0, noise: 0, shape: 'blob', rngSeed: 0 });
      const back = this.readCells(0, 0, this.gridW, this.gridH);
      let err = 0;
      for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(back[i] - probe[i]));
      this.clear();
      if (err < 2e-3) return true;
      console.warn(`[sim] storage ${cand} failed the round-trip test (err ${err})`);
    } catch (e) {
      console.warn(`[sim] storage ${cand} unusable`, e);
    }
    for (const p of Object.values(this.progs ?? {})) if (p) gl.deleteProgram(p.p);
    for (const t of this.extractTargets.values()) this.deleteTarget(t);
    this.extractTargets.clear();
    this.deleteTarget(a);
    this.deleteTarget(b);
    return false;
  }

  private ensureStepProgram(): void {
    const { R, rings } = this._params;
    const key = `${this.fm.lanes}|${this.fm.enc}|${R}|${rings.join(',')}`;
    if (key === this.stepKey) return;
    let prog = this.stepCache.get(key);
    const pk = buildPackedKernel(R, rings, this.fm.lanes);
    if (!prog) {
      prog = this.program(stepSource(pk, this.fm.enc, this.offMin, this.offMax));
      // LRU: calibrating R sweeps through kernels; keep plenty compiled (QA3 F11: 6 evicted R = 13).
      if (this.stepCache.size >= STEP_CACHE_MAX) {
        const [oldKey, old] = this.stepCache.entries().next().value as [string, Prog];
        if (old !== this.stepProg) {
          this.gl.deleteProgram(old.p);
          this.stepCache.delete(oldKey);
        }
      }
      this.stepCache.set(key, prog);
    } else {
      this.stepCache.delete(key);
      this.stepCache.set(key, prog); // refresh LRU order
    }
    this.stepProg = prog;
    this.stepKey = key;
    this.info = { ...this.info, fetchesPerCell: pk.fetches / pk.lanes, madsPerCell: pk.mads / pk.lanes };
  }

  // ───────────────────────────── Passes ─────────────────────────────

  private nextSeed(): number {
    return Math.imul(this.seedCounter++, 0x9e3779b1) >>> 0;
  }

  /** Bind a state-reading program with the current state on unit 0. */
  private useStateReader(p: Prog): void {
    const gl = this.gl;
    gl.useProgram(p.p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.cur].tex);
    gl.uniform1i(p.u('uS'), 0);
    gl.uniform2i(p.u('uGrid'), this.gridW, this.gridH);
    const gf = p.u('uGridF');
    if (gf) gl.uniform2f(gf, this.gridW, this.gridH);
  }

  /** Start a state → state pass (seed, erase): reads current, writes the other buffer. */
  private beginStatePass(p: Prog): void {
    this.useStateReader(p);
  }

  private endStatePass(): void {
    const gl = this.gl;
    const dst = this.state[1 - this.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = 1 - this.cur;
    this.fieldDirty = true;
  }

  private readCells(x0: number, y0: number, w: number, h: number): Float32Array {
    const gl = this.gl;
    const t = this.extractTarget(w, h);
    const p = this.progs.extract;
    this.useStateReader(p);
    const ox = ((x0 % this.gridW) + this.gridW) % this.gridW;
    const oy = ((y0 % this.gridH) + this.gridH) % this.gridH;
    gl.uniform2i(p.u('uOrigin'), ox, oy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return decodeValuePixels(px, w * h);
  }

  /**
   * Async readCells: the extract pass runs now into its own target (so a later sync read cannot
   * overwrite it), the pixels go to a fresh pixel-pack buffer, and a fence tells when they are ready.
   */
  private readCellsAsync(x0: number, y0: number, w: number, h: number): Promise<Float32Array> {
    const gl = this.gl;
    const t = this.makeTarget(w, h, gl.RGBA8, gl.NEAREST, gl.CLAMP_TO_EDGE);
    const p = this.progs.extract;
    this.useStateReader(p);
    const ox = ((x0 % this.gridW) + this.gridW) % this.gridW;
    const oy = ((y0 % this.gridH) + this.gridH) % this.gridH;
    gl.uniform2i(p.u('uOrigin'), ox, oy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    const cleanup = () => {
      if (!this.lost && !this.disposed) {
        gl.deleteBuffer(buf);
        this.deleteTarget(t);
      }
    };
    return new Promise<Float32Array>((resolve) => {
      const poll = () => {
        if (this.lost || this.disposed) {
          resolve(new Float32Array(w * h));
          return;
        }
        if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 4);
          return;
        }
        gl.deleteSync(fence);
        const px = new Uint8Array(w * h * 4);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        cleanup();
        resolve(decodeValuePixels(px, w * h));
      };
      setTimeout(poll, 0);
    });
  }

  private extractTarget(w: number, h: number): Target {
    const key = `${w}x${h}`;
    let t = this.extractTargets.get(key);
    if (!t) {
      // Keep the cache small: the full grid, a few capture sizes.
      if (this.extractTargets.size > 6) {
        for (const [k, v] of this.extractTargets) {
          if (k !== `${this.gridW}x${this.gridH}`) {
            this.deleteTarget(v);
            this.extractTargets.delete(k);
            break;
          }
        }
      }
      t = this.makeTarget(w, h, this.gl.RGBA8, this.gl.NEAREST, this.gl.CLAMP_TO_EDGE);
      this.extractTargets.set(key, t);
    }
    return t;
  }

  private uploadState(data: Float32Array): void {
    const gl = this.gl;
    const { lanes, enc } = this.fm;
    const t = this.state[this.cur];
    const n = this.gridW * this.gridH;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    if (enc === 'float') {
      const src = data.length === n ? data : data.subarray(0, n);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.w, t.h, this.fm.format, gl.FLOAT, src);
    } else {
      const bytes = new Uint8Array(t.w * t.h * 4);
      const stride = lanes === 2 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const [hi, lo] = pack16(data[i]);
        bytes[i * stride] = hi;
        bytes[i * stride + 1] = lo;
        if (stride === 4) bytes[i * 4 + 3] = 255;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
    this.fieldDirty = true;
  }

  private uploadTemplate(p: Pattern): void {
    if (this.tmplRef === p) return;
    const gl = this.gl;
    const data = p.data instanceof Float32Array ? p.data : Float32Array.from(p.data as ArrayLike<number>);
    gl.bindTexture(gl.TEXTURE_2D, this.tmplTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, p.w, p.h, 0, gl.RED, gl.FLOAT, data.subarray(0, p.w * p.h));
    this.tmplRef = p;
  }

  private buildField(): void {
    const gl = this.gl;
    const p = this.progs.field;
    this.useStateReader(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.field.fbo);
    gl.viewport(0, 0, this.field.w, this.field.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private buildGlow(passes: number): void {
    const gl = this.gl;
    const a = this.glowA;
    const b = this.glowB;
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0, 0, a.w, a.h);
    let p = this.progs.glowDown;
    gl.useProgram(p.p);
    gl.uniform1i(p.u('uSrc'), 0);
    gl.uniform2f(p.u('uInvDst'), 1 / a.w, 1 / a.h);
    gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    p = this.progs.glowBlur;
    gl.useProgram(p.p);
    gl.uniform1i(p.u('uSrc'), 0);
    gl.uniform2f(p.u('uInvDst'), 1 / a.w, 1 / a.h);
    for (let i = 0; i < passes; i++) {
      const spread = 1 + i; // second pass is wider
      gl.uniform2f(p.u('uDir'), spread / a.w, 0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.uniform2f(p.u('uDir'), 0, spread / a.h);
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  private restoreBackup(): void {
    const snap = this.lastSnap;
    const bk = this.backup;
    if (snap && (!bk || snap.step > bk.step)) {
      this.uploadState(upsampleSnapshot(snap));
    } else if (bk) {
      this.uploadState(bk.data);
    }
  }

  // ───────────────────────────── GL helpers ─────────────────────────────

  private program(fs: string): Prog {
    const gl = this.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    let f: WebGLShader;
    try {
      f = compile(gl, gl.FRAGMENT_SHADER, fs);
    } catch (err) {
      gl.deleteShader(vs); // a storage candidate that fails to compile must not leak shaders
      throw err;
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`program link failed: ${log}`);
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      p,
      u: (name: string) => {
        let l = cache.get(name);
        if (l === undefined) {
          l = gl.getUniformLocation(p, name);
          cache.set(name, l);
        }
        return l;
      },
    };
  }

  private texParams(filter: number, wrap: number): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  private makeTarget(w: number, h: number, internal: number, filter: number, wrap: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
    this.texParams(filter, wrap);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    return { tex, fbo, w, h };
  }

  private isComplete(t: Target): boolean {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  private deleteTarget(t: Target): void {
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  private deleteResources(): void {
    const gl = this.gl;
    for (const t of [...(this.state ?? []), this.field, this.glowA, this.glowB, this.snapT]) if (t) this.deleteTarget(t);
    for (const t of this.extractTargets.values()) this.deleteTarget(t);
    this.extractTargets.clear();
    for (const p of Object.values(this.progs ?? {})) if (p) gl.deleteProgram(p.p);
    for (const p of this.stepCache.values()) gl.deleteProgram(p.p);
    this.stepCache.clear();
    for (const t of [this.lut, this.tmplTex, this.emptyTmpl]) if (t) gl.deleteTexture(t);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.pbo) gl.deleteBuffer(this.pbo);
  }
}

function formatsFor(gl: WebGL2RenderingContext, cand: Candidate, lanes: number): Formats {
  if (cand === 'u8') return { cand, enc: 'u8', lanes, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const half = cand === 'f16';
  const internal =
    lanes === 4 ? (half ? gl.RGBA16F : gl.RGBA32F) : lanes === 2 ? (half ? gl.RG16F : gl.RG32F) : half ? gl.R16F : gl.R32F;
  const format = lanes === 4 ? gl.RGBA : lanes === 2 ? gl.RG : gl.RED;
  return { cand, enc: 'float', lanes, internal, format, type: gl.FLOAT };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    const numbered = src
      .split('\n')
      .slice(0, 400)
      .map((l, i) => `${i + 1}: ${l}`)
      .join('\n');
    throw new Error(`shader compile failed: ${log}\n${numbered}`);
  }
  return s;
}

/** Bilinear (toroidal) upsampling of a snapshot back to grid resolution (context-restore fallback). */
function upsampleSnapshot(s: FieldSnapshot): Float32Array {
  const out = new Float32Array(s.gridW * s.gridH);
  for (let y = 0; y < s.gridH; y++) {
    const fy = (y + 0.5) / s.scale - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const r0 = ((y0 % s.h) + s.h) % s.h;
    const r1 = (r0 + 1) % s.h;
    for (let x = 0; x < s.gridW; x++) {
      const fx = (x + 0.5) / s.scale - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const c0 = ((x0 % s.w) + s.w) % s.w;
      const c1 = (c0 + 1) % s.w;
      const a = s.value[r0 * s.w + c0] + (s.value[r0 * s.w + c1] - s.value[r0 * s.w + c0]) * tx;
      const b = s.value[r1 * s.w + c0] + (s.value[r1 * s.w + c1] - s.value[r1 * s.w + c0]) * tx;
      out[y * s.gridW + x] = a + (b - a) * ty;
    }
  }
  return out;
}
