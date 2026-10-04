import { describe, expect, it } from 'vitest';
import { clipGraphemes } from './format';

describe('names are clipped by what the player sees, not by UTF-16 units (QA1 #5)', () => {
  it('never splits an emoji, a flag or a ZWJ family', () => {
    expect(clipGraphemes('A'.repeat(23) + '🦠🦠', 24)).toBe('A'.repeat(23) + '🦠');
    const family = '👨‍👩‍👧‍👦';
    expect(clipGraphemes('🦠🧬✨ Ñandú 漢字 ' + family + 'xyz', 14)).toBe('🦠🧬✨ Ñandú 漢字 ' + family);
    expect(clipGraphemes('corto', 24)).toBe('corto');
    for (const s of [clipGraphemes('x'.repeat(23) + '🇪🇸🇪🇸', 24), clipGraphemes('🦠'.repeat(30), 24)]) {
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)).toBe(false); // no lone surrogate
    }
  });
});
