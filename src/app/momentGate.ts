/**
 * When a Momento may open (docs/MOMENTOS.md §2, docs/CLARIDAD.md §3: one message at a time, never over
 * what the player is reading). src/main.ts reads each surface; a queued card or label waits while any
 * of them is up and opens when the screen is free. The run's own budget (one pausing card, none in the
 * first 5 s, nothing carried to the next run) is src/moments/policy.ts (ADR-030, docs/CLARIDAD2.md §2.8).
 */
export interface MomentScreen {
  /** The title screen or a modal (Settings, a species sheet…). */
  covered: boolean;
  /** The opening intro. */
  intro: boolean;
  /** A session card (start, summary, welcome) or the research tree. */
  flow: boolean;
  /** VELA is talking. */
  story: boolean;
  /** A price or behaviour sheet. */
  sheet: boolean;
  /** An Encargo celebration or a secret's reveal card. */
  celebration: boolean;
  /**
   * The Bestiary drawer: the player is reading their creatures. A new species' card slid in over the
   * open drawer and covered its chips (release-checks RF-06); it waits until the drawer closes.
   */
  drawer: boolean;
  /** The run's culture is lit: "¡VIDA!" about the starter waits until the player can see it (ARTE-PULIDO §7.2b). */
  lit: boolean;
}

export function momentWaits(s: MomentScreen): boolean {
  return s.covered || s.intro || s.flow || s.story || s.sheet || s.celebration || s.drawer || !s.lit;
}
