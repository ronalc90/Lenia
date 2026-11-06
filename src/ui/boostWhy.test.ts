import { describe, expect, it } from 'vitest';
import { boostDenial } from './boostWhy';

// QA-3 N9 (v0.026, shot 110): with «Ya no da tiempo» on the button and 177 de luz in the wallet, a tap on Nutrientes
// said «Te faltan 1 de luz»: a false reason, and «faltan 1» besides.
describe('a tap on Nutrientes that cannot buy says the true reason (QA-3 N9)', () => {
  it('QA-3: no time left is said as such, never as missing light', () => {
    expect(boostDenial({ cost: 16, noTime: true }, 177)).toEqual({ kind: 'noTime' });
  });

  it('waiting for the clock, no creature alive, or light short: each its own reason', () => {
    expect(boostDenial({ cost: 16, wait: 3 }, 177)).toEqual({ kind: 'wait', s: 3 });
    expect(boostDenial({ cost: 16, needsLife: true }, 177)).toEqual({ kind: 'needsLife' });
    expect(boostDenial({ cost: 16 }, 4)).toEqual({ kind: 'short', n: 12 });
    expect(boostDenial({ cost: 16 }, 15.2)).toEqual({ kind: 'short', n: 1 });
  });

  it('nothing short and no other reason: no made-up reason', () => {
    expect(boostDenial({ cost: 16 }, 177)).toEqual({ kind: 'none' });
  });
});
