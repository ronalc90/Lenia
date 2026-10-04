import { describe, expect, it } from 'vitest';
import { TREE_NODES } from '../../game/tree';
import { hasTreeIcon, treeIcon } from './icons';

describe('tree icons', () => {
  it('every node has its own hand-drawn icon', () => {
    for (const n of TREE_NODES) expect(hasTreeIcon(n.icon), n.id).toBe(true);
    expect(new Set(TREE_NODES.map((n) => n.icon)).size).toBe(TREE_NODES.length);
  });

  it('renders accessible-neutral inline SVG and falls back to "?"', () => {
    expect(treeIcon('clock', 24)).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(treeIcon('nope')).toBe(treeIcon('question'));
  });
});
