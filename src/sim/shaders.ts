import { DISH_GLSL, ROTATE_BODY, TINT_GLSL, texelOutsideGlsl } from './dishgl';
import type { PackedKernel } from './kernel';

/**
 * GLSL ES 3.00 sources for the simulation and renderer.
 *
 * State layout ("lane packed"): texel (X, y) holds cells X*L .. X*L+L-1 of row y.
 *   enc 'float': R16F / RG16F / RGBA16F (or 32F), one cell per channel.
 *   enc 'u8'   : RGBA8 fallback, each cell is 16-bit fixed point in two channels
 *                (hi, lo), so L is 1 or 2.
 * Texture rows are grid rows (row 0 = grid y 0); FBO gl_FragCoord.y = row + 0.5.
 */
export type Encoding = 'float' | 'u8';

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const LANES = 'xyzw';

/** Encoding helpers + lane-aware accessors for a state sampler `uS`. */
function stateLib(L: number, enc: Encoding): string {
  let decode: string;
  let encode: string;
  if (enc === 'float') {
    decode = 'vec4 decodeTexel(vec4 t) { return t; }';
    encode =
      L === 4
        ? 'vec4 encodeTexel(vec4 v) { return v; }'
        : L === 2
          ? 'vec4 encodeTexel(vec4 v) { return vec4(v.xy, 0.0, 1.0); }'
          : 'vec4 encodeTexel(vec4 v) { return vec4(v.x, 0.0, 0.0, 1.0); }';
  } else {
    decode =
      L === 2
        ? 'vec4 decodeTexel(vec4 t) { return vec4(dot(t.xy, K16), dot(t.zw, K16), 0.0, 0.0); }'
        : 'vec4 decodeTexel(vec4 t) { return vec4(dot(t.xy, K16), 0.0, 0.0, 0.0); }';
    encode =
      L === 2
        ? 'vec4 encodeTexel(vec4 v) { return vec4(enc16(v.x), enc16(v.y)); }'
        : 'vec4 encodeTexel(vec4 v) { return vec4(enc16(v.x), 0.0, 1.0); }';
  }
  return `
const int L = ${L};
// 16-bit fixed point in two unorm8 channels: v = (hi * 256 + lo) / 65535.
const vec2 K16 = vec2(65280.0 / 65535.0, 255.0 / 65535.0);
vec2 enc16(float v) {
  float q = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(q * (1.0 / 256.0));
  return vec2(hi, q - hi * 256.0) * (1.0 / 255.0);
}
${decode}
${encode}
uniform sampler2D uS;
uniform ivec2 uGrid;
/** Matter of grid cell c (wrapped; |c| may exceed the grid by up to 4 grids). */
float cellAt(ivec2 c) {
  c = (c + uGrid * 4) % uGrid;
  int tx = c.x / L;
  vec4 t = decodeTexel(texelFetch(uS, ivec2(tx, c.y), 0));
  return t[c.x - tx * L];
}
`;
}

function fmt(w: number): string {
  const s = w.toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

/** Lysis discs in the dish step (deflect.ts LYSIS.maxDiscs). */
export const MAX_LYSIS = 8;

/**
 * The Lenia step, fully unrolled with the kernel weights as constants
 * (regenerated only when R or rings change). Fetches use the hardware REPEAT
 * wrap for the torus, with constant texel offsets where the range allows.
 *
 * `dish` (ADR-022): round walled dish. The state textures are then read clamp-to-edge (the grid
 * keeps ≥ 4 empty cells around the dish, so that is exact zero padding); texels wholly outside
 * the glass write 0 without convolving; cells outside the glass are forced to 0; lysis discs
 * (deflect.ts) subtract from the growth. Same maths as CpuLenia with setDish/setLysis.
 */
export function stepSource(pk: PackedKernel, enc: Encoding, minOff: number, maxOff: number, dish = false): string {
  const L = pk.lanes;
  const vt = L === 1 ? 'float' : `vec${L}`;
  const lane = (v: string, i: number) => (L === 1 ? (enc === 'u8' ? v : `${v}.x`) : `${v}.${LANES[i]}`);
  const decodeVec = (t: string) =>
    enc === 'float'
      ? L === 1
        ? `${t}.x`
        : `${t}.${LANES.slice(0, L)}`
      : L === 2
        ? `vec2(dot(${t}.xy, K16), dot(${t}.zw, K16))`
        : `dot(${t}.xy, K16)`;
  const fetch = (uv: string, j: number) => {
    if (j === 0) return `texture(uS, ${uv})`;
    if (j >= minOff && j <= maxOff) return `textureOffset(uS, ${uv}, ivec2(${j}, 0))`;
    return `texture(uS, ${uv} + vec2(${j}.0 * uInv.x, 0.0))`;
  };
  const body: string[] = [];
  const entries = [...pk.entries].sort((a, b) => a.dy - b.dy || a.j - b.j);
  let curDy = -1;
  for (const e of entries) {
    if (e.dy !== curDy) {
      curDy = e.dy;
      if (e.dy > 0) body.push(`  p = vec2(b.x, b.y + ${e.dy}.0 * uInv.y); q = vec2(b.x, b.y - ${e.dy}.0 * uInv.y);`);
    }
    const tExpr = e.dy === 0 ? (e.j === 0 ? 'c0' : fetch('b', e.j)) : `${fetch('p', e.j)} + ${fetch('q', e.j)}`;
    body.push(`  t = ${tExpr};`);
    let src = 't';
    if (enc === 'u8') {
      body.push(`  c = ${decodeVec('t')};`);
      src = 'c';
    }
    for (let o = 0; o < L; o++) {
      const terms: string[] = [];
      for (let i = 0; i < L; i++) {
        const w = e.m[o * L + i];
        if (w !== 0) terms.push(`${lane(src, i)} * ${fmt(w)}`);
      }
      if (terms.length) body.push(`  a${L === 1 ? '' : '.' + LANES[o]} += ${terms.join(' + ')};`);
    }
  }
  const outOf = (v: string) =>
    enc === 'float'
      ? L === 4
        ? v
        : L === 2
          ? `vec4(${v}, 0.0, 1.0)`
          : `vec4(${v}, 0.0, 0.0, 1.0)`
      : L === 2
        ? `vec4(enc16(${v}.x), enc16(${v}.y))`
        : `vec4(enc16(${v}), 0.0, 1.0)`;
  const out = outOf('nv');
  // Per-lane cell centres of this texel, for the dish mask and lysis.
  const laneLoop = (body: (pc: string, k: string) => string) =>
    L === 1
      ? `  { vec2 pc = vec2(float(tc.x) + 0.5, float(tc.y) + 0.5); ${body('pc', '')} }`
      : `  for (int k = 0; k < ${L}; k++) { vec2 pc = vec2(float(tc.x * ${L} + k) + 0.5, float(tc.y) + 0.5); ${body('pc', '[k]')} }`;
  const dishHead = dish
    ? `${DISH_GLSL}${texelOutsideGlsl(L)}
uniform vec4 uLysis[${MAX_LYSIS}];  // x, y, radius, strength
uniform int uLysisCount;
float lysisAt(vec2 pc) {
  float p = 0.0;
  for (int i = 0; i < ${MAX_LYSIS}; i++) {
    if (i >= uLysisCount) break;
    vec4 l = uLysis[i];
    float q = length(pc - l.xy) / l.z;
    if (q < 1.0) p = max(p, l.w * (1.0 - q * q));
  }
  return p;
}
`
    : '';
  const dishEarly = dish
    ? `  ivec2 tc = ivec2(gl_FragCoord.xy);
  if (texelOutside(tc)) {
    ${vt} z = ${vt}(0.0);
    o = ${outOf('z')};
    return;
  }
`
    : '';
  const dishPen = dish
    ? `  ${vt} pen = ${vt}(0.0);
  ${vt} ins = ${vt}(0.0);
${laneLoop((pc, k) => `ins${k} = dishInside(${pc}); if (uLysisCount > 0) pen${k} = lysisAt(${pc});`)}
`
    : '';
  return `${HEADER}
uniform sampler2D uS;
uniform vec2 uInv;     // 1 / state texture size
uniform float uMu;
uniform float uK;      // 1 / (9 sigma^2)
uniform float uDt;
out vec4 o;
const vec2 K16 = vec2(65280.0 / 65535.0, 255.0 / 65535.0);
vec2 enc16(float v) {
  float q = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(q * (1.0 / 256.0));
  return vec2(hi, q - hi * 256.0) * (1.0 / 255.0);
}
${dishHead}
void main() {
${dishEarly}  vec2 b = gl_FragCoord.xy * uInv;
  vec4 c0 = texture(uS, b);
  ${vt} a = ${vt}(0.0);
  vec4 t;
  vec2 p, q;
  ${enc === 'u8' ? `${vt} c;` : ''}
${body.join('\n')}
  ${vt} A0 = ${decodeVec('c0')};
  // Chan's polynomial growth (gn = 1): G(u) = 2 * max(0, 1 - (u - mu)^2 / (9 sigma^2))^4 - 1
  ${vt} d = a - uMu;
  ${vt} g = max(${vt}(0.0), 1.0 - d * d * uK);
  g *= g;
  g *= g;
${dishPen}  ${vt} nv = clamp(A0 + uDt * (2.0 * g - 1.0${dish ? ' - pen' : ''}), 0.0, 1.0);${dish ? '\n  nv *= ins;' : ''}
  o = ${out};
}
`;
}

const NOISE_LIB = `
float hash2(ivec2 p, uint s) {
  uint h = uint(p.x) * 0x8da6b343u ^ uint(p.y) * 0xd8163841u ^ s * 0xcb1ab31fu;
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;
}
float vnoise(vec2 p, uint s) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  float a = hash2(ii, s);
  float b = hash2(ii + ivec2(1, 0), s);
  float c = hash2(ii + ivec2(0, 1), s);
  float d = hash2(ii + ivec2(1, 1), s);
  float top = a + (b - a) * u.x;
  float bot = c + (d - c) * u.x;
  return top + (bot - top) * u.y;
}
uniform float uWrap;   // 1 = torus offsets, 0 = round dish (plain offsets)
float wrapD(float d, float n) { return uWrap > 0.5 ? d - n * floor(d / n + 0.5) : d; }
`;

/** Seed pass: mirrors seed.ts seedValueAt exactly (and applySeedCpu's dish mask). */
export function seedSource(L: number, enc: Encoding): string {
  return `${HEADER}${stateLib(L, enc)}${NOISE_LIB}${DISH_GLSL}
uniform sampler2D uTmpl;   // R32F template, sampled with manual bilinear
uniform ivec2 uTmplSize;
uniform vec2 uGridF;
uniform vec2 uCenter;
uniform vec2 uTCenter;
uniform vec2 uRot;         // cos, sin
uniform vec2 uSpacing;     // noise octave spacings (cells)
uniform float uRadius;
uniform float uDensity;
uniform float uNoise;
uniform float uBias;
uniform float uTScale;
uniform float uBound;      // nothing changes farther than this from uCenter (early out)
uniform int uShape;        // 0 blob, 1 ring, 2 noise, 3 pattern
uniform int uHasTmpl;
uniform uint uSeed;
out vec4 o;

float tmplAt(ivec2 i) {
  if (i.x < 0 || i.y < 0 || i.x >= uTmplSize.x || i.y >= uTmplSize.y) return 0.0;
  return texelFetch(uTmpl, i, 0).r;
}
float sampleTmpl(vec2 l) {
  vec2 s = l - 0.5;
  vec2 i0 = floor(s);
  vec2 f = s - i0;
  ivec2 i = ivec2(i0);
  float a = tmplAt(i);
  float b = tmplAt(i + ivec2(1, 0));
  float c = tmplAt(i + ivec2(0, 1));
  float d = tmplAt(i + ivec2(1, 1));
  float top = a + (b - a) * f.x;
  float bot = c + (d - c) * f.x;
  return top + (bot - top) * f.y;
}
float seedValue(vec2 pc) {
  vec2 d = vec2(wrapD(pc.x - uCenter.x, uGridF.x), wrapD(pc.y - uCenter.y, uGridF.y));
  if (length(d) > uBound) return 0.0;
  float q = length(d) / uRadius;
  float tmpl = 0.0;
  if (uHasTmpl == 1) {
    vec2 td = vec2(wrapD(pc.x - uTCenter.x, uGridF.x), wrapD(pc.y - uTCenter.y, uGridF.y));
    vec2 l = vec2(uRot.x * td.x + uRot.y * td.y, -uRot.y * td.x + uRot.x * td.y) / uTScale + vec2(uTmplSize) * 0.5;
    tmpl = sampleTmpl(l);
  }
  float base;
  if (uShape == 3) {
    base = tmpl;
  } else {
    float sh = 0.0;
    if (q < 1.0) {
      if (uShape == 1) {
        float k = (q - 0.6) / 0.2;
        sh = exp(-k * k) * (1.0 - smoothstep(0.85, 1.0, q));
      } else if (uShape == 2) {
        float sp = uRadius * 0.3;
        float n = vnoise(vec2(d.x / sp + 17.31, d.y / sp - 5.79), uSeed ^ 0x9e3779b9u);
        sh = (1.0 - smoothstep(0.5, 1.0, q)) * smoothstep(0.25, 0.75, n);
      } else {
        sh = 1.0 - smoothstep(0.35, 1.0, q);
      }
    }
    base = uDensity * sh;
    if (uHasTmpl == 1) base = base + (tmpl - base) * uBias;
  }
  if (uNoise > 0.0 && base > 0.0) {
    float n = 0.7 * vnoise(d / uSpacing.x, uSeed)
            + 0.3 * vnoise(vec2(d.x / uSpacing.y + 31.7, d.y / uSpacing.y + 11.3), uSeed + 1u);
    base *= 1.0 + (2.0 * n - 1.0) * uNoise;
  }
  return clamp(base, 0.0, 1.0);
}
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 cur = decodeTexel(texelFetch(uS, tc, 0));
  vec4 nv = cur;
  for (int k = 0; k < L; k++) {
    vec2 pc = vec2(float(tc.x * L + k) + 0.5, float(tc.y) + 0.5);
    nv[k] = max(cur[k], seedValue(pc)) * dishInside(pc);
  }
  o = encodeTexel(nv);
}
`;
}

export function eraseSource(L: number, enc: Encoding): string {
  return `${HEADER}${stateLib(L, enc)}
uniform vec2 uGridF;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uWrap;   // 1 = torus offsets, 0 = round dish
out vec4 o;
float wrapD(float d, float n) { return uWrap > 0.5 ? d - n * floor(d / n + 0.5) : d; }
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 cur = decodeTexel(texelFetch(uS, tc, 0));
  vec4 nv = cur;
  for (int k = 0; k < L; k++) {
    vec2 pc = vec2(float(tc.x * L + k) + 0.5, float(tc.y) + 0.5);
    vec2 d = vec2(wrapD(pc.x - uCenter.x, uGridF.x), wrapD(pc.y - uCenter.y, uGridF.y));
    nv[k] = cur[k] * smoothstep(0.6, 1.0, length(d) / uRadius);
  }
  o = encodeTexel(nv);
}
`;
}

/** Glass deflection turn (rigid rotation of a disc of matter): mirrors deflect.ts rotateDiscCpu. */
export function rotateSource(L: number, enc: Encoding): string {
  return `${HEADER}${stateLib(L, enc)}${DISH_GLSL}${ROTATE_BODY}`;
}

/** Snapshot: block mean of A and of |∇A| (central differences), 16-bit packed. */
export function snapshotSource(L: number, enc: Encoding, gradMax: number): string {
  return `${HEADER}${stateLib(L, enc)}
uniform int uScale;
out vec4 o;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * uScale;
  float sv = 0.0;
  float sg = 0.0;
  float n = 0.0;
  for (int j = 0; j < 8; j++) {
    if (j >= uScale) break;
    int y = b.y + j;
    if (y >= uGrid.y) break;
    for (int i = 0; i < 8; i++) {
      if (i >= uScale) break;
      int x = b.x + i;
      if (x >= uGrid.x) break;
      ivec2 c = ivec2(x, y);
      sv += cellAt(c);
      float gx = (cellAt(c + ivec2(1, 0)) - cellAt(c - ivec2(1, 0))) * 0.5;
      float gy = (cellAt(c + ivec2(0, 1)) - cellAt(c - ivec2(0, 1))) * 0.5;
      sg += sqrt(gx * gx + gy * gy);
      n += 1.0;
    }
  }
  o = vec4(enc16(sv / n), enc16(sg / n / ${fmt(gradMax)}));
}
`;
}

/** Copies a (wrapped) window of cells into RGBA8, 16-bit value in R,G. */
export function extractSource(L: number, enc: Encoding): string {
  return `${HEADER}${stateLib(L, enc)}
uniform ivec2 uOrigin;
out vec4 o;
void main() {
  o = vec4(enc16(cellAt(uOrigin + ivec2(gl_FragCoord.xy))), 0.0, 1.0);
}
`;
}

/**
 * Render prep at grid resolution: R = A, G,B = ∇A (central differences, plus
 * `bias` so an RGBA8 target can hold the sign), A = glow source.
 */
export function fieldSource(L: number, enc: Encoding, bias: number): string {
  return `${HEADER}${stateLib(L, enc)}
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float a = cellAt(c);
  float gx = (cellAt(c + ivec2(1, 0)) - cellAt(c - ivec2(1, 0))) * 0.5;
  float gy = (cellAt(c + ivec2(0, 1)) - cellAt(c - ivec2(0, 1))) * 0.5;
  o = vec4(a, vec2(gx, gy) + ${fmt(bias)}, smoothstep(0.25, 0.95, a));
}
`;
}

/** Half-resolution downsample of the glow source (one bilinear tap = 2×2 box). */
export const GLOW_DOWN = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uInvDst;
out vec4 o;
void main() {
  o = vec4(texture(uSrc, gl_FragCoord.xy * uInvDst).a, 0.0, 0.0, 1.0);
}
`;

/** Separable 9-tap Gaussian using 5 bilinear fetches. */
export const GLOW_BLUR = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uInvDst;
uniform vec2 uDir;  // texel step in uv
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * uInvDst;
  float s = texture(uSrc, uv).r * 0.2270270270;
  s += (texture(uSrc, uv + uDir * 1.3846153846).r + texture(uSrc, uv - uDir * 1.3846153846).r) * 0.3162162162;
  s += (texture(uSrc, uv + uDir * 3.2307692308).r + texture(uSrc, uv - uDir * 3.2307692308).r) * 0.0702702703;
  o = vec4(s, 0.0, 0.0, 1.0);
}
`;

/**
 * Screen pass. Mapping identical to core/camera.ts (contain fit × zoom, centred
 * on (cx, cy)). Torus (uDishMode 0): toroidal content inside the dish rectangle. Round dish
 * (uDishMode 1, ADR-022): agar inside the glass, a thick glass wall with a highlight arc and a
 * soft shadow on a lab-table background, a glow ring while the dish grows, and optional species
 * tints of the matter (dishgl.ts TINT_GLSL).
 */
export const RENDER = `${HEADER}
uniform sampler2D uField;   // grid res, REPEAT + LINEAR: (A, ∇A + bias, glow source)
uniform sampler2D uGlow;    // half res, REPEAT + LINEAR
uniform sampler2D uLut;     // 256×1 matter colormap
uniform vec2 uView;         // backing-store pixels
uniform vec2 uGrid;
uniform vec2 uCenter;
uniform float uScale;       // device pixels per cell
uniform float uDpr;
uniform float uTime;
uniform float uGlowAmt;
uniform float uGradBias;
uniform int uCubic;
// Render style (src/sim/style.ts DEFAULT_RENDER_STYLE; cosmetics may change it). Defaults are the
// former constants: background (11,14,18)/255, agar (20,27,34)/255 → (14,19,25)/255, rim
// (91,192,235)/255, contour .40,.90,1, glow core .45,.85,1, glow wide .28,.36,.95, shadow .42,.70,1.
uniform vec3 uBg;
uniform vec3 uAgarIn;
uniform vec3 uAgarOut;
uniform vec3 uRim;
uniform vec3 uContour;
uniform vec3 uGlowCore;
uniform vec3 uGlowWide;
uniform vec3 uShadow;
uniform float uRimAmt;      // 0.22
uniform float uRimHalo;     // 0.025 ('glow' rims: 0.06)
uniform float uRimDouble;   // 1 = second rim line 3 px inside
uniform vec4 uLabGrid;      // rgba of a faint grid every 16 cells; a = 0 disables it
uniform int uDishMode;      // 0 = toroidal rectangle (legacy), 1 = round walled dish
uniform vec3 uDish;         // round dish: centre (grid cells) and radius
uniform float uGrowFx;      // 0..1 glow of the rim while the dish grows
${TINT_GLSL}
out vec4 o;

const vec3 LIGHT = vec3(-0.45, -0.55, 0.70);   // from the top-left, towards the viewer

vec4 fieldCubic(vec2 g) {
  // Cubic B-spline from 4 bilinear taps (smooth, no ringing).
  vec2 t = g - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 inv = 1.0 / uGrid;
  vec2 h0 = (i - 0.5 + w1 / s0) * inv;
  vec2 h1 = (i + 1.5 + w3 / s1) * inv;
  return (texture(uField, h0) * s0.x + texture(uField, vec2(h1.x, h0.y)) * s1.x) * s0.y
       + (texture(uField, vec2(h0.x, h1.y)) * s0.x + texture(uField, h1) * s1.x) * s1.y;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Lab table, the dish's shadow and the glass wall around a round dish (inside = px to the rim). */
vec3 glassDish(vec3 agar, float inside, vec2 g, vec2 px) {
  float s = uScale;
  // Glass wall thickness on screen (≈ 2 cells, never thinner than 6 px).
  float wall = max(6.0 * uDpr, 2.0 * s);
  vec2 dg = g - uDish.xy;
  float r = length(dg);
  vec2 nrm = r > 1e-4 ? dg / r : vec2(0.0, -1.0);
  // Table: the style background, lit from the top-left, with a faint static grain.
  vec2 sp = px / uView;
  float light = 1.0 - 0.55 * clamp(length(sp - vec2(0.28, 0.18)), 0.0, 1.0);
  vec3 table = uBg * (0.8 + 0.6 * light) + uRim * 0.012 * light;
  table *= 0.985 + 0.03 * hash12(floor(px / (2.0 * uDpr)));
  // Soft shadow of the dish, cast towards the bottom-right.
  vec2 so = vec2(0.6, 0.9) * (6.0 * uDpr + 0.9 * wall);
  float sd = (uDish.z - length(g - so / s - uDish.xy)) * s + wall;
  table *= 1.0 - 0.45 * smoothstep(-22.0 * uDpr, 4.0 * uDpr, sd);
  // Glass wall: a little lighter than the table, tinted by the rim colour, thicker-looking at the
  // outer edge, with a specular arc where it faces the light and a fainter refraction opposite.
  float t = clamp(-inside / wall, 0.0, 1.0);
  // Thick glass: brighter towards its middle, tinted by the rim colour.
  vec3 glass = table * 1.3 + uRim * (0.09 + 0.07 * sin(3.14159 * t));
  float spec = pow(max(dot(nrm, normalize(vec2(-0.62, -0.78))), 0.0), 4.0);
  float refr = pow(max(dot(nrm, normalize(vec2(0.62, 0.78))), 0.0), 8.0);
  glass += vec3(0.85, 0.95, 1.0) * (spec * 0.30 * smoothstep(0.05, 0.45, t) * (1.0 - 0.6 * t) + refr * 0.07 * (1.0 - t));
  float aIn = clamp(inside + 0.5, 0.0, 1.0);
  float aOut = clamp(inside + wall + 0.5, 0.0, 1.0);
  vec3 c = mix(table, glass, aOut);
  c = mix(c, agar, aIn);
  // Inner rim line (the meniscus), a glint inside the glass and a thinner outer edge.
  c += uRim * uRimAmt * exp(-pow(inside / (0.9 * uDpr), 2.0));
  c += vec3(0.9, 0.97, 1.0) * (0.06 + 0.22 * spec) * exp(-pow((inside + 0.4 * wall) / (0.7 * uDpr), 2.0));
  c += uRim * uRimAmt * 0.7 * exp(-pow((inside + wall) / (0.8 * uDpr), 2.0));
  if (uRimDouble > 0.0) {
    float rim2 = exp(-pow((inside - 3.0 * uDpr) / (0.7 * uDpr), 2.0));
    c += uRim * rim2 * uRimAmt * 0.6 * uRimDouble;
  }
  c += uRim * uRimHalo * exp(-max(-inside - wall, 0.0) / (10.0 * uDpr)) * (1.0 - aOut);
  // Growth: the meniscus glows and a soft ring breathes on the glass.
  if (uGrowFx > 0.0) {
    c += uRim * uGrowFx * (0.9 * exp(-pow(inside / (2.5 * uDpr), 2.0)) + 0.25 * aOut * (1.0 - aIn));
  }
  return c;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 rel = px - 0.5 * uView;
  vec2 halfSize = 0.5 * uGrid * uScale;
  vec2 g = uCenter + rel / uScale;
  float inside;   // px to the dish edge, > 0 inside
  vec2 e;         // position relative to the dish, ~1 at the edge (vignette)
  if (uDishMode == 1) {
    vec2 dg = g - uDish.xy;
    inside = (uDish.z - length(dg)) * uScale;
    e = dg / uDish.z;
  } else {
    vec2 dEdge = halfSize - abs(rel);
    inside = min(dEdge.x, dEdge.y);
    e = rel / halfSize;
  }

  // Matter (computed everywhere so derivatives stay well defined).
  vec4 f = uCubic == 1 ? fieldCubic(g) : texture(uField, g / uGrid);
  float v = clamp(f.r, 0.0, 1.0);
  vec2 grad = f.gb - uGradBias;
  float gm = length(grad);

  // Agar: slightly lighter than the background, with a very faint vignette.
  float vig = smoothstep(1.6, 0.2, length(e));
  vec3 col = mix(uAgarOut, uAgarIn, vig);
  // Optional lab grid (graph paper), toroidal like the dish; drawn under the matter.
  if (uLabGrid.a > 0.0) {
    vec2 gd = abs(fract(g / 16.0 + 0.5) - 0.5) * 16.0 * uScale;
    float gline = 1.0 - smoothstep(0.5 * uDpr, 0.5 * uDpr + 1.0, min(gd.x, gd.y));
    col = mix(col, uLabGrid.rgb, uLabGrid.a * gline);
  }
  // Inner shadow near the rim, like a glass dish wall.
  col *= 0.78 + 0.22 * smoothstep(0.0, 14.0 * uDpr, inside);

  vec4 lut = texture(uLut, vec2((v * 255.0 + 0.5) / 256.0, 0.5));
  vec3 mat = lut.rgb;
  // Species tint (round dish): matter near a creature leans towards its species hue.
  if (uTintCount > 0 && lut.a > 0.0) mat = tintMatter(mat, g);
  // Soft relief: the field as a gel surface lit from the top-left, so bodies
  // read as volumes and saturated cores do not go flat.
  vec3 n = normalize(vec3(-grad * 5.0, 1.0));
  vec3 l = normalize(LIGHT);
  float shade = dot(n, l) - l.z;                  // 0 on flat matter
  // Shadows sink into deep cyan/indigo instead of grey (stays luminous).
  mat = mix(mat, mat * uShadow, clamp(-shade * 1.4, 0.0, 0.85));
  mat *= 1.0 + 0.35 * max(shade, 0.0);
  float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 48.0);
  mat += vec3(0.9, 0.97, 1.0) * spec * 0.35 * smoothstep(0.15, 0.45, v);
  col = mix(col, mat, lut.a);

  // "This produces": luminous cyan sheen on steep edges + a thin iso-contour.
  float edge = smoothstep(0.02, 0.16, gm);
  col += uContour * 0.14 * edge * (1.0 - smoothstep(0.25, 0.65, v));
  float fw = max(fwidth(v), 1e-5);
  float dist = abs(v - 0.13) / fw;
  float hw = 0.55 * uDpr;
  float line = 1.0 - smoothstep(hw - 0.5, hw + 0.75, dist);
  col += uContour * line * (0.25 + 0.75 * edge) * 0.85;

  // Bloom from the half-res blurred bright matter: wide indigo, cyan core.
  if (uGlowAmt > 0.0) {
    float gl = texture(uGlow, g / uGrid).r;
    col += (uGlowWide * gl + uGlowCore * gl * gl * 1.4) * uGlowAmt;
  }

  vec3 outCol;
  if (uDishMode == 1) {
    outCol = glassDish(col, inside, g, px);
  } else {
    // Dish edge: antialiased cut to the background plus a subtle rim line.
    float aa = clamp(inside + 0.5, 0.0, 1.0);
    outCol = mix(uBg, col, aa);
    float rim = exp(-pow(inside / (0.9 * uDpr), 2.0));
    outCol += uRim * rim * uRimAmt;
    if (uRimDouble > 0.0) {
      float rim2 = exp(-pow((inside - 3.0 * uDpr) / (0.7 * uDpr), 2.0));
      outCol += uRim * rim2 * uRimAmt * 0.6 * uRimDouble;
    }
    float halo = exp(-max(-inside, 0.0) / (10.0 * uDpr)) * (1.0 - aa);
    outCol += uRim * halo * uRimHalo;
  }

  // Dither to kill banding in the dark gradients.
  outCol += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  o = vec4(outCol, 1.0);
}
`;
