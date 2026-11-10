import { describe, expect, it } from 'vitest';
import type { EncargoDone, EncargoView } from '../../story/encargos';
import { bubbleSeconds, nextBubble, offersTitle, type EncargoItem } from './encargoQueue';

const view = (id: string, who: EncargoView['who'] = 'vela'): EncargoView =>
  ({ id, who, kind: 'main', plain: { es: id, en: id }, name: { es: who, en: who } }) as unknown as EncargoView;
const offer = (id: string, who?: EncargoView['who']): EncargoItem => ({ kind: 'offer', view: view(id, who) });
const cheer = (id: string): EncargoItem => ({ kind: 'cheer', done: { encargo: view(id) } as unknown as EncargoDone });

// QA-4 N5 (c1-104): at the start of Night 2 three Encargo cards (Comité, Albor, VELA) came one after another, 6.6 s
// each, over the top half of the dish. Offers that wait together become one card.
describe('Encargo bubbles: offers that wait together are one card (QA-4 N5)', () => {
  it('three offers in the queue make a single «3 encargos nuevos» card', () => {
    const { bubble, rest } = nextBubble([offer('a', 'committee'), offer('b', 'albor'), offer('c')], new Set());
    expect(bubble?.kind).toBe('offers');
    expect(bubble?.kind === 'offers' && bubble.views.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(rest).toEqual([]);
    expect(offersTitle(3)).toEqual({ es: '3 encargos nuevos', en: '3 new requests' });
  });

  it('a lone offer stays a normal card, and a cheer keeps its own turn', () => {
    const q = [offer('a'), cheer('x'), offer('b')];
    const first = nextBubble(q, new Set());
    expect(first.bubble?.kind).toBe('offers');
    expect(first.rest.map((i) => i.kind)).toEqual(['cheer']);
    const one = nextBubble([offer('a'), cheer('x')], new Set());
    expect(one.bubble?.kind).toBe('offer');
    expect(one.rest.map((i) => i.kind)).toEqual(['cheer']);
    expect(nextBubble([cheer('x'), offer('a')], new Set()).bubble?.kind).toBe('cheer');
  });

  it('offers already done are dropped (the cheer tells it)', () => {
    const { bubble } = nextBubble([offer('a'), offer('b')], new Set(['a']));
    expect(bubble?.kind).toBe('offer');
    expect(nextBubble([offer('a')], new Set(['a'])).bubble).toBeNull();
  });

  it('a batch stays a little longer than one offer, never three times as long', () => {
    expect(bubbleSeconds({ kind: 'offers', views: [view('a'), view('b'), view('c')] })).toBeGreaterThan(bubbleSeconds({ kind: 'offer', view: view('a') }));
    expect(bubbleSeconds({ kind: 'offers', views: [view('a'), view('b'), view('c')] })).toBeLessThan(2 * bubbleSeconds({ kind: 'offer', view: view('a') }));
  });
});
