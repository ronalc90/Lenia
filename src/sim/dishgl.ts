/**
 * GLSL pieces for the round petri dish (ADR-025). shaders.ts composes them into the step, seed,
 * erase, rotate and screen passes; every formula mirrors a CPU function so tests can compare:
 *
 *   inside(c)      cpu: core/dish.ts cellInDish          |c − centre|² < r²   (cell centres)
 *   turn weight    cpu: sim/deflect.ts turnWeight        1 inside r, smoothstep fade over `feather`
 *   rotate pass    cpu: sim/deflect.ts rotateDiscCpu     bilinear sample of the old field at the
 *                                                       centre-rotated position, 0 outside grid/dish
 *
 * Uniform contract (set by webgl.ts): `uniform vec3 uDish;` = (cx, cy, radius) in grid cells.
 */
import { TINT_LUT_ROWS } from './tintlut';

/** Dish helpers; needs nothing else. */
export const DISH_GLSL = `
uniform vec3 uDish;   // centre x, centre y, radius (grid cells)
/** 1 when the cell centre p (grid units) is inside the glass. */
float dishInside(vec2 p) {
  vec2 d = p - uDish.xy;
  return dot(d, d) < uDish.z * uDish.z ? 1.0 : 0.0;
}
`;

/**
 * Early-out test for a lane-packed texel (cells X*L .. X*L+L-1 of row y): true when every cell
 * of the texel is certainly outside the dish, so the step can write zeros without convolving.
 */
export function texelOutsideGlsl(L: number): string {
  return `
bool texelOutside(ivec2 tc) {
  // Nearest point of the texel's cell centres to the dish centre.
  float x0 = float(tc.x * ${L}) + 0.5;
  float x1 = x0 + ${L - 1}.0;
  float nx = clamp(uDish.x, x0, x1);
  vec2 d = vec2(nx, float(tc.y) + 0.5) - uDish.xy;
  return dot(d, d) >= uDish.z * uDish.z;
}
`;
}

/**
 * Rotate pass body (state → state). Requires the shaders.ts state library (L, uS, uGrid,
 * decodeTexel, encodeTexel) and DISH_GLSL. Uniforms: uTurn = (cx, cy, radius), uAngle (radians,
 * positive = clockwise on screen), uFeather.
 */
export const ROTATE_BODY = `
uniform vec3 uTurn;
uniform float uAngle;
uniform float uFeather;
out vec4 o;
float cellZ(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= uGrid.x || c.y >= uGrid.y) return 0.0;
  int tx = c.x / L;
  vec4 t = decodeTexel(texelFetch(uS, ivec2(tx, c.y), 0));
  return t[c.x - tx * L];
}
float bilinear(vec2 s) {
  vec2 i0 = floor(s);
  vec2 f = s - i0;
  ivec2 i = ivec2(i0);
  float a = cellZ(i);
  float b = cellZ(i + ivec2(1, 0));
  float c = cellZ(i + ivec2(0, 1));
  float d = cellZ(i + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float turnWeight(float q) {
  if (q <= uTurn.z) return 1.0;
  if (q >= uTurn.z + uFeather) return 0.0;
  float t = 1.0 - (q - uTurn.z) / uFeather;
  return t * t * (3.0 - 2.0 * t);
}
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 cur = decodeTexel(texelFetch(uS, tc, 0));
  vec4 nv = cur;
  for (int k = 0; k < L; k++) {
    vec2 pc = vec2(float(tc.x * L + k) + 0.5, float(tc.y) + 0.5);
    vec2 d = pc - uTurn.xy;
    float w = turnWeight(length(d));
    if (w <= 0.0) continue;
    float a = -uAngle * w;
    float c = cos(a);
    float s = sin(a);
    vec2 src = uTurn.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y) - 0.5;
    nv[k] = bilinear(src) * dishInside(pc);
  }
  o = encodeTexel(nv);
}
`;

/** Maximum creature tints per frame (uniform array size). */
export const MAX_TINTS = 32;

/**
 * Species tint for the screen pass: matter near a tinted creature takes its species' row of the
 * tint colormap (tintlut.ts: the matter colormap re-coloured to one hue at the same OKLCH
 * lightness, docs/ARTE.md §8.2), and its contour and glow take the species' body colour.
 * Uniforms: uTint[i] = (x, y, radius, row) in grid cells; uTintCount; uTintAmt (0..1, 1 = the art
 * direction's tinted palette exactly); uTintLut (256 × TINT_LUT_ROWS).
 */
export const TINT_GLSL = `
uniform vec4 uTint[${MAX_TINTS}];   // x, y, radius (cells), row of uTintLut
uniform int uTintCount;
uniform float uTintAmt;
uniform sampler2D uTintLut;          // 256 × ${TINT_LUT_ROWS}: row 0 = matter colormap, rows 1.. = tinted copies
/**
 * Species tint at grid point g: atV = the tinted colormap colour at matter value v, body = the
 * species' body colour (value .6, for its contour and glow), both averaged over the nearby tints by
 * a gaussian of each creature's radius. Returns how much of them to use (0 = untinted).
 */
float tintAt(vec2 g, float v, out vec3 atV, out vec3 body) {
  float wsum = 0.0;
  vec3 csum = vec3(0.0);
  vec3 bsum = vec3(0.0);
  float u = (v * 255.0 + 0.5) / 256.0;
  float ub = (0.6 * 255.0 + 0.5) / 256.0;
  for (int i = 0; i < ${MAX_TINTS}; i++) {
    if (i >= uTintCount) break;
    vec4 t = uTint[i];
    vec2 d = (g - t.xy) / max(t.z, 1.0);
    float w = exp(-dot(d, d));
    if (w < 0.004) continue;
    float row = (t.w + 0.5) / ${TINT_LUT_ROWS}.0;
    wsum += w;
    csum += texture(uTintLut, vec2(u, row)).rgb * w;
    bsum += texture(uTintLut, vec2(ub, row)).rgb * w;
  }
  if (wsum < 1e-3) return 0.0;
  atV = csum / wsum;
  body = bsum / wsum;
  return uTintAmt * min(1.0, wsum);
}
`;
