/**
 * QA-3 N1 («Encargo pagado 12 veces»): the child opened the Bestiary as session 9 ended; session 10 started with
 * «20 luz + 288 de un encargo que cumpliste entre sesiones = 308» and its summary listed 12 identical «✓ Un encargo
 * +2». It was not one Encargo paid 12 times: the objective chain had waited 8 sessions on «Mira tu criatura en el
 * Bestiario», 11 later steps were already met by another route (remembered so the chain never stalls, QA2 H-24), and
 * the look cleared all 12 at once. Met while no clock ran, they were carried as a bare count: every one became «Un
 * encargo» and the start card said «de un encargo». A step paid between sessions keeps its name, and the start card
 * knows how many there were.
 */
import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import { createGame } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, run, seededRng } from './testUtil';
import { SESSION_UI } from './treeText';

const stable = (n: number) => Array.from({ length: n }, (_, i) => creature({ id: 1 + i, x: 20 + 30 * i, y: 40 }));

describe('steps met between sessions keep their names (QA-3 N1)', () => {
  it('a look at the Bestiary that clears a backlog of steps lists each one by name, once', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: seededRng(1), cycle: 'sessions' });
    const st = g.state as unknown as GameState;
    g.actions.seedAt(150, 200);
    run(g, 3, report(stable(2)), 0.5);
    // The chain waits on «look»; later steps are met by another route (two at once, the Gotero bought).
    st.research!.levels.dropper = 1;
    run(g, 1, report(stable(2)), 0.5);
    g.actions.endSessionNow!();
    expect(g.session!.phase).toBe('over');
    const essence0 = st.carry?.essence ?? 0;
    // On the summary: the Bestiary.
    g.actions.noteTabOpened!('bestiary');
    const carried = st.carry!;
    expect(carried.encargos).toBeGreaterThanOrEqual(3); // look, dropper, two (at least)
    expect(carried.essence).toBeGreaterThan(essence0);
    // The next run: the start card knows how many Encargos the Luz came from…
    g.actions.startSession!();
    expect(g.sessionStart!.carryEncargos).toBe(carried.encargos);
    expect(SESSION_UI.startCarry('20', '288', '308', 12).es).toMatch(/\+ 288 de 12 encargos/);
    expect(SESSION_UI.startCarry('20', '24', '44', 1).es).toMatch(/de un encargo/);
    // …and its summary names each one, never «Un encargo» for a step of the chain.
    g.actions.seedAt(150, 200);
    run(g, 1, report(stable(2)), 0.5);
    g.actions.endSessionNow!();
    const goals = g.lastSummary!.goals;
    const generic = SESSION_UI.encargoName.es;
    const carriedRows = goals.filter((x) => x.kind === 'step');
    expect(carriedRows.length).toBeGreaterThanOrEqual(carried.encargos);
    expect(goals.map((x) => x.name.es)).not.toContain(generic);
    expect(new Set(carriedRows.map((x) => x.name.es)).size).toBe(carriedRows.length);
    for (const x of carriedRows) expect(x.datos).toBe(C.DATOS_PER_ENCARGO);
  });

  it('a save between sessions keeps the names of what waits', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: seededRng(2), cycle: 'sessions' });
    const st = g.state as unknown as GameState;
    g.actions.seedAt(150, 200);
    run(g, 3, report(stable(2)), 0.5);
    g.actions.endSessionNow!();
    g.actions.noteTabOpened!('bestiary');
    const names = (st.carry?.goals ?? []).map((x) => x.name.es);
    expect(names.length).toBe(st.carry!.encargos);
    const g2 = createGame({ bus: recordingBus().bus, rng: seededRng(2), cycle: 'sessions' }, g.serialize());
    expect(((g2.state as unknown as GameState).carry?.goals ?? []).map((x) => x.name.es)).toEqual(names);
  });
});
