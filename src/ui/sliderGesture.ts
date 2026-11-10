/**
 * A range slider that a scrolling finger never moves (QA-4 N13: a vertical swipe over «Ambiente» set it from 50 to
 * 10, because the native slider jumps to where a touch lands). The touch decides after SLIDER_SLOP_PX: mostly
 * sideways → it drags the slider; mostly up or down → it scrolls the page and the slider stays. A tap that stays put
 * sets the value where it lands, as before. A mouse drags at once.
 */
export const SLIDER_SLOP_PX = 8;

export function sliderGesture(dx: number, dy: number, pointerType: string): 'drag' | 'scroll' | 'wait' {
  if (pointerType === 'mouse') return 'drag';
  if (Math.hypot(dx, dy) < SLIDER_SLOP_PX) return 'wait';
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? 'drag' : 'scroll';
}

/** The value under clientX on a track of `rect` (its thumb `thumb` px wide), rounded to `step`, in [0, 1]. */
export function sliderValueAt(clientX: number, rect: { left: number; width: number }, thumb: number, step: number): number {
  const f = (clientX - rect.left - thumb / 2) / Math.max(1, rect.width - thumb);
  const v = Math.round(Math.min(1, Math.max(0, f)) / step) * step;
  return Math.round(v * 1000) / 1000;
}

/** Wire `input` (a range in [0, 1]) inside `wrap`: the wrap takes the pointer, the input keeps the keyboard. */
export function guardSlider(wrap: HTMLElement, input: HTMLInputElement, thumb = 26): void {
  const step = parseFloat(input.step) || 0.05;
  let g: { id: number; x: number; y: number; type: string; drag: boolean } | null = null;
  const set = (clientX: number) => {
    const v = sliderValueAt(clientX, input.getBoundingClientRect(), thumb, step);
    if (String(v) === input.value) return;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  wrap.addEventListener('pointerdown', (e) => {
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, drag: false };
    if (sliderGesture(0, 0, e.pointerType) === 'drag') {
      g.drag = true;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      set(e.clientX);
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (!g.drag) {
      const d = sliderGesture(e.clientX - g.x, e.clientY - g.y, g.type);
      if (d === 'scroll') {
        g = null;
        return;
      }
      if (d === 'wait') return;
      g.drag = true;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    set(e.clientX);
  });
  wrap.addEventListener('pointerup', (e) => {
    if (g && e.pointerId === g.id && !g.drag && sliderGesture(e.clientX - g.x, e.clientY - g.y, g.type) === 'wait') set(e.clientX);
    g = null;
  });
  wrap.addEventListener('pointercancel', () => (g = null));
}
