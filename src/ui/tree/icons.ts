/**
 * Hand-drawn line icons of the research tree and the session screens (24×24, stroke = currentColor,
 * round caps; a few small fills). One icon per tree node id (game/tree.ts `icon`) plus the UI set.
 * No library, no AI art (CLAUDE.md rule 10).
 */

const P: Record<string, string> = {
  // ── centre & UI ──
  lab: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17.4a2 2 0 0 0 1.7 3.1h9.4a2 2 0 0 0 1.7-3.1l-4.9-8.7V3.5"/><path d="M14.6 13.2a2.6 2.6 0 1 1-2.2-3.4 2 2 0 0 0 2.2 3.4z" fill="currentColor" stroke="none"/>',
  datos: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 16.5v-3M12 16.5v-6M16 16.5V8"/>',
  question: '<path d="M9 9.2a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9v.7"/><circle cx="12" cy="17.6" r="1" fill="currentColor" stroke="none"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  moon: '<path d="M18.6 14.8A7.2 7.2 0 0 1 9.2 5.4a7.5 7.5 0 1 0 9.4 9.4z"/>',
  check: '<path d="M5.5 12.5l4 4 9-9"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  minus: '<path d="M6 12h12"/>',
  centre: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  play: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l9.6-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6z" fill="currentColor"/>',
  tree: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="19" cy="15" r="1.8"/><circle cx="5" cy="15" r="1.8"/><path d="M12 9.4V6.3M14.3 13.2l3.1 1.2M9.7 13.2l-3.1 1.2"/>',
  clockIcon: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.6 1.6M9.5 3.5h5"/>',
  drop: '<path d="M12 3.2c3.4 4.4 5.8 7.6 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3 2.4-6.2 5.8-10.6z"/>',
  species: '<circle cx="12" cy="12" r="6.5"/><path d="M8.5 12.5c1.5-2.5 5.5-2.5 7 0" /><circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  behavior: '<path d="M4 12h11m-4-5 5 5-5 5"/><circle cx="18.5" cy="12" r="2"/>',
  encargo: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3.5h6v1M8.8 12.3l2.2 2.2 4.2-4.4"/>',
  star: '<path d="M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.8 4.8 12 6.6l2.2-1.8M9.8 19.2 12 17.4l2.2 1.8"/>',
  sprintIcon: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  trophy: '<path d="M8 4.5h8v4a4 4 0 0 1-8 0z"/><path d="M8 6.2H5.5a2.5 2.5 0 0 0 2.6 3M16 6.2h2.5a2.5 2.5 0 0 1-2.6 3M12 12.5v3.5M8.5 19.5h7M9.8 16h4.4l.6 3.5H9.2z"/>',

  // ── ⏱ Reloj ──
  clock: '<circle cx="11" cy="13" r="7"/><path d="M11 9.5V13l2.4 1.5"/><path d="M18.5 3v4.5M16.2 5.2h4.6"/>',
  clock2: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.2"/><path d="M12 9.6V12l1.8 1.1"/>',
  encTime: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 3.5v-3.5h-1a2 2 0 0 1-2-2z"/><path d="M12 7.5v3.2l2 1.2"/>',
  sprint: '<path d="M13.5 3 6.5 13h5l-1 8 7-10.5h-5z"/><path d="M3 8h2.5M2.5 12H5M3 16h2.5"/>',
  clock3: '<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4.5 4.5 5.8 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.8-4.5 8.5s4.5 4 4.5 8.5"/><path d="M9.5 18.5c.8-1.3 1.6-2 2.5-2.3.9.3 1.7 1 2.5 2.3z" fill="currentColor" stroke="none"/>',
  clock4: '<circle cx="12" cy="12" r="9"/><path d="M9 7.5h6M9 16.5h6M9.6 7.5c0 2.5 2.4 3 2.4 4.5s-2.4 2-2.4 4.5M14.4 7.5c0 2.5-2.4 3-2.4 4.5s2.4 2 2.4 4.5"/>',

  // ── 💧 Gotero ──
  dropper: '<path d="M14.5 3.5l6 6M12.5 5.5l6 6M17.5 6.5l-8.8 8.8-3 .7.7-3 8.8-8.8"/><path d="M5 17.5c-1 1.4-1.5 2.4-1.5 3a1.5 1.5 0 0 0 3 0c0-.6-.5-1.6-1.5-3z" fill="currentColor" stroke="none"/>',
  startEssence: '<path d="M5 9.5h14l-1.2 9.3a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7z"/><path d="M8 9.5c0-3 1.8-5 4-5s4 2 4 5"/><path d="M12 11.8c1.3 1.6 2 2.7 2 3.6a2 2 0 0 1-4 0c0-.9.7-2 2-3.6z" fill="currentColor" stroke="none"/>',
  freeSeeds: '<rect x="3.5" y="10" width="13" height="10" rx="1.5"/><path d="M2.8 10h14.4M10 10v10M10 10c-1.6-3.3-4.8-3.3-4.8-1.2S7.6 10 10 10zm0 0c1.6-3.3 4.8-3.3 4.8-1.2S12.4 10 10 10z"/><path d="M19.5 3.5c1.6 2.1 2.6 3.6 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.2 1-2.7 2.6-4.8z"/>',
  bigSeed: '<path d="M10 3.5c3.8 5 6.5 8.6 6.5 12a6.5 6.5 0 0 1-13 0c0-3.4 2.7-7 6.5-12z"/><path d="M19.5 12c1.2 1.6 2 2.7 2 3.6a2 2 0 0 1-4 0c0-.9.8-2 2-3.6z"/>',
  stabilizer: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8" stroke-dasharray="2.2 2"/><path d="M12 9c1 1.3 1.6 2.2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.7 1.6-3z" fill="currentColor" stroke="none"/>',
  cheapSeeds: '<path d="M9.5 3.5c3 3.9 5 6.7 5 9.4a5 5 0 0 1-10 0c0-2.7 2-5.5 5-9.4z"/><path d="M18.5 11v8.5m-3-3 3 3 3-3"/>',
  dropperMax: '<path d="M14.5 6.5l3 3M12.5 8.5l3 3M15.5 9.5l-7.3 7.3-2.6.6.6-2.6 7.3-7.3"/><path d="M4.5 19.5c-.9 1.2-1.3 2-1.3 2.5a1.3 1.3 0 0 0 2.6 0c0-.5-.4-1.3-1.3-2.5z" fill="currentColor" stroke="none"/><path d="M15 2.5l1.6 1.6L19 2l.9 3.2L22 6.8l-3.5.4" />',
  fridge: '<rect x="6" y="2.8" width="12" height="18.4" rx="2"/><path d="M6 9.5h12M9 5.6v2M9 12.2v3"/><path d="M14.5 13v5M12.3 15.5h4.4M13 14l3 3M16 14l-3 3"/>',
  autoSeeder: '<rect x="4.5" y="7.5" width="15" height="10" rx="3"/><circle cx="9.5" cy="12.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.5" r="1.3" fill="currentColor" stroke="none"/><path d="M12 7.5V4.5M10.5 4.5h3M8 17.5v2.5M16 17.5v2.5"/><path d="M2.5 11v3M21.5 11v3"/>',

  // ── 🧫 Placa ──
  dish: '<ellipse cx="12" cy="13" rx="8.5" ry="5"/><path d="M3.5 13v1.5c0 2.8 3.8 5 8.5 5s8.5-2.2 8.5-5V13"/><path d="M3 5.5h4M5 3.5v4M17 5.5h4M19 3.5v4"/>',
  slots: '<circle cx="6" cy="14" r="2.8"/><circle cx="13" cy="14" r="2.8"/><circle cx="20" cy="14" r="2.3" stroke-dasharray="1.6 1.4"/><path d="M13 4.5v5M10.5 7h5"/>',
  nursery: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><ellipse cx="12" cy="8.2" rx="2.8" ry="3.4"/><path d="M6 20.5l1.5-2M18 20.5l-1.5-2"/>',
  crowdCost: '<circle cx="12" cy="12" r="3.2"/><path d="M2.5 12h4.5m-2-2.2L7.3 12 5 14.2M21.5 12H17m2-2.2L16.7 12 19 14.2M12 2.5V7m-2.2-2 2.2 2.3L14.2 5M12 21.5V17m-2.2 2 2.2-2.3 2.2 2.3"/>',
  incubator: '<path d="M3.8 16.5a8.5 8.5 0 1 1 16.4 0"/><path d="M12 15.5l4.5-5"/><circle cx="12" cy="15.5" r="1.6" fill="currentColor" stroke="none"/><path d="M6.5 11.5l1.2.8M12 7v1.4M17.5 11.5l-1.2.8"/>',
  dishXL: '<circle cx="12" cy="12" r="5.5"/><path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16M4 4l4 4M20 4l-4 4M20 20l-4-4M4 20l4-4"/>',
  ecosystem: '<circle cx="12" cy="5.5" r="2.6"/><rect x="3.5" y="15" width="5" height="5" rx="1"/><path d="M18 14.5l3 5.5h-6z"/><path d="M10.5 7.8 7 14.6M13.5 7.8l3.6 6.4M9 17.5h5.6"/>',

  // ── 🌱 Vida ──
  culture: '<path d="M8.5 3.5h7M9.5 3.5v6L5 18a2 2 0 0 0 1.8 2.5h10.4A2 2 0 0 0 19 18l-4.5-8.5v-6"/><path d="M6.6 15h10.8"/><circle cx="10" cy="17.6" r=".9" fill="currentColor" stroke="none"/><circle cx="13.5" cy="18" r=".7" fill="currentColor" stroke="none"/><circle cx="12" cy="11.8" r=".8" fill="currentColor" stroke="none"/>',
  nutrient: '<path d="M12 21v-9"/><path d="M12 13c-4.8.4-7.2-2-7.2-6.5 4.6-.2 7.2 2 7.2 6.5zM12 11.5c.3-4.3 2.6-6.6 7.2-6.7 0 4.4-2.6 6.7-7.2 6.7z"/><path d="M8 21h8"/>',
  swimAffinity: '<path d="M3 12c2.5-4 7.5-6 12-2.5L19 12l-4 2.5C10.5 18 5.5 16 3 12z"/><path d="M19 12l2.5-3v6z"/><circle cx="7.5" cy="11.3" r=".9" fill="currentColor" stroke="none"/>',
  sessileAffinity: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.4" stroke-dasharray="2.4 2"/><circle cx="12" cy="12" r="9.3" opacity=".55"/>',
  culture2: '<path d="M3.5 12.5h17a8.5 7 0 0 1-17 0z"/><path d="M8.5 9.5c-1-1.4 1-2.4 0-3.8M12 9.5c-1-1.6 1-2.8 0-4.6M15.5 9.5c-1-1.4 1-2.4 0-3.8"/><path d="M7 20.5h10"/>',
  abundance: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8c1.5 2 1.5 4 0 6M12 15.2c1.5 2 1.5 4 0 6M2.8 12c2-1.5 4-1.5 6 0M15.2 12c2-1.5 4-1.5 6 0M5.4 5.4c2.4.4 3.8 1.8 4.2 4.2M14.4 14.4c2.4.4 3.8 1.8 4.2 4.2M18.6 5.4c-.4 2.4-1.8 3.8-4.2 4.2M9.6 14.4c-.4 2.4-1.8 3.8-4.2 4.2"/>',
  colonyAffinity: '<circle cx="12" cy="7" r="3.2"/><circle cx="6.8" cy="15.8" r="3.2"/><circle cx="17.2" cy="15.8" r="3.2"/><path d="M10.4 9.8 8.5 13M13.6 9.8l1.9 3.2M10 15.8h4" stroke-dasharray="1.4 1.4"/>',
  eternalLife: '<path d="M12 12c-2-2.8-3.8-4-5.6-4a4 4 0 0 0 0 8c1.8 0 3.6-1.2 5.6-4zm0 0c2 2.8 3.8 4 5.6 4a4 4 0 0 0 0-8c-1.8 0-3.6 1.2-5.6 4z"/><path d="M12 6.5c.4-1.8 1.6-2.9 3.4-3.2-.1 1.9-1.3 3-3.4 3.2z" fill="currentColor" stroke="none"/>',
  symbiosis: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/><path d="M12 14.6s-1.6-1-1.6-2.2a.9.9 0 0 1 1.6-.6.9.9 0 0 1 1.6.6c0 1.2-1.6 2.2-1.6 2.2z" fill="currentColor" stroke="none"/>',

  // ── 🔬 Descubrir ──
  notebook: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 3.5v17M11 8h5M11 11h5M11 14h3"/><path d="M16.5 15.5l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.3.7.2-1.5-1-1 1.5-.2z" fill="currentColor" stroke="none"/>',
  print: '<rect x="3.5" y="7.5" width="11" height="11" rx="2"/><rect x="9.5" y="3.5" width="11" height="11" rx="2"/><circle cx="15" cy="9" r="2.4"/><circle cx="9" cy="13" r="2.4" stroke-dasharray="1.4 1.2"/>',
  cataloguing: '<path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7l9 9-8 8z"/><circle cx="8" cy="8" r="1.6"/><path d="M13 14.2l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.3.7.3-1.4-1-1 1.4-.2z" fill="currentColor" stroke="none"/>',
  microscope: '<path d="M9 3.5l3 1.7-3.5 6-3-1.7z"/><path d="M10.5 4.3 12 1.8M7.2 10.4l-1 1.7"/><path d="M14 8.5a6 6 0 0 1-3.5 10.5M5 20.5h14M8.5 17h5"/>',
  archive: '<rect x="3.5" y="4" width="17" height="5" rx="1"/><path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 12.5h4"/><circle cx="12" cy="16.2" r="1.4"/>',
  discoBonus: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.6 10.2 6 3.5h4l2 4.2 2-4.2h4l-2.6 6.7"/><path d="M12 12.2l.8 1.6 1.8.3-1.3 1.2.3 1.8-1.6-.8-1.6.8.3-1.8-1.3-1.2 1.8-.3z" fill="currentColor" stroke="none"/>',
  mutations: '<path d="M7 3c0 4.5 7 4.5 7 9s-7 4.5-7 9M14 3c0 4.5-7 4.5-7 9s7 4.5 7 9M8 6.5h5M8 17.5h5"/><path d="M18.8 8c.4 2 1.1 2.7 3 3-1.9.4-2.6 1.1-3 3-.4-1.9-1.1-2.6-3-3 1.9-.3 2.6-1 3-3z" fill="currentColor" stroke="none"/>',
  rareSpores: '<circle cx="10" cy="13" r="3"/><path d="M10 6.5V8M10 18v1.5M3.5 13H5M15 13h1.5M5.4 8.4l1 1M13.6 16.6l1 1M5.4 17.6l1-1M13.6 9.4l1-1"/><path d="M18.5 2.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" fill="currentColor" stroke="none"/>',
  encyclopedia: '<rect x="4" y="13.5" width="16" height="6" rx="1"/><rect x="5.5" y="8" width="13" height="5.5" rx="1"/><rect x="7" y="3.5" width="10" height="4.5" rx="1"/><path d="M7.5 16.5h3M9 10.8h2.5M10.5 5.8h2"/>',

  // ── 🌍 Mundos ──
  world: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c-2.6 2.5-3.8 5.3-3.8 8.5s1.2 6 3.8 8.5c2.6-2.5 3.8-5.3 3.8-8.5S14.6 6 12 3.5z"/>',
  worldGyro: '<path d="M12 12.4a1.6 1.6 0 1 1 1.6-1.6c0 2.6-2.9 3.8-5 2.8-2.6-1.3-2.8-5.1-.5-7 2.9-2.4 7.5-1.2 8.8 2.5 1.5 4.4-1.8 9-6.7 9.2-4.7.2-8.2-3.5-8.2-8"/><path d="M19.8 17.6l1.4 2.4M3.2 4.6 4.6 7"/>',
  worldCold: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 6.6l2.4-2M9.6 19.4 12 17.4l2.4 2M4.3 10.4 6.7 9.4l-.4-2.9M19.7 13.6l-2.4 1 .4 2.9M4.3 13.6l2.4 1-.4 2.9M19.7 10.4l-2.4-1 .4-2.9"/>',
  worldLegs: '<ellipse cx="12" cy="10.5" rx="5.5" ry="4.2"/><path d="M8 13.8 5.8 18.5M10.6 14.6 9.8 19.8M13.4 14.6l.8 5.2M16 13.8l2.2 4.7"/><circle cx="10.2" cy="9.6" r=".9" fill="currentColor" stroke="none"/><circle cx="13.8" cy="9.6" r=".9" fill="currentColor" stroke="none"/>',
  worldShields: '<path d="M12 3.2 19 6v5.6c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V6z"/><path d="M12 7v10M8.4 10.5h7.2"/>',
  worldHelix: '<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9"/><path d="M8.5 6.5h7M8.5 17.5h7M10 12h4"/>',
  worldGiants: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 1.5v2.2M12 20.3v2.2M1.5 12h2.2M20.3 12h2.2"/>',

  // ── ✨ Destello ──
  spark: '<path d="M12 2.8c.7 4.9 2.6 6.8 7.4 7.4-4.8.7-6.7 2.6-7.4 7.4-.7-4.8-2.6-6.7-7.4-7.4 4.8-.6 6.7-2.5 7.4-7.4z"/><path d="M18.5 16.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="currentColor" stroke="none"/>',
  sparkLife: '<path d="M12 6.2c.5 3.3 1.8 4.6 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.4 4.5-1.7 5-5z"/><path d="M20.2 15.5A8.8 8.8 0 1 1 18 5.2"/><path d="M18 2.5v2.9h-2.9"/>',
  sparkGift: '<rect x="4" y="11" width="14" height="9.5" rx="1.5"/><path d="M3.2 11h15.6M11 11v9.5M11 11c-1.7-3.4-5.2-3.4-5.2-1.2S8.4 11 11 11zm0 0c1.7-3.4 5.2-3.4 5.2-1.2S13.6 11 11 11z"/><path d="M19.5 2.5c.4 2 1.1 2.7 3 3-1.9.4-2.6 1.1-3 3-.4-1.9-1.1-2.6-3-3 1.9-.3 2.6-1 3-3z" fill="currentColor" stroke="none"/>',
  sparkDatos: '<path d="M8 2.8c.5 3.4 1.8 4.7 5.2 5.2-3.4.5-4.7 1.8-5.2 5.2-.5-3.4-1.8-4.7-5.2-5.2 3.4-.5 4.7-1.8 5.2-5.2z"/><rect x="11.5" y="11.5" width="9.5" height="9.5" rx="2.4"/><path d="M14.3 18.3v-1.6M16.3 18.3v-3.2M18.3 18.3v-4.4"/>',
  sparkFirst: '<path d="M10 3.5c.6 4.1 2.2 5.7 6.3 6.3-4.1.6-5.7 2.2-6.3 6.3-.6-4.1-2.2-5.7-6.3-6.3 4.1-.6 5.7-2.2 6.3-6.3z"/><path d="M16 15.5v6l4.6-3z" fill="currentColor" stroke="none"/>',
  sparkMutagen: '<path d="M8.5 3.5h5M9.5 3.5v5L5 17.5a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3l-4.5-9v-5"/><path d="M11 12.8c.4 2.4 1.3 3.3 3.6 3.6-2.3.4-3.2 1.3-3.6 3.6-.4-2.3-1.3-3.2-3.6-3.6 2.3-.3 3.2-1.2 3.6-3.6z" fill="currentColor" stroke="none"/>',
  sparkTime: '<circle cx="10.5" cy="13.5" r="7"/><path d="M10.5 9.5v4l2.4 1.4"/><path d="M19 2.5c.4 2.2 1.2 3 3.3 3.3-2.1.4-2.9 1.2-3.3 3.3-.4-2.1-1.2-2.9-3.3-3.3 2.1-.3 2.9-1.1 3.3-3.3z" fill="currentColor" stroke="none"/>',
};

export type TreeIconName = keyof typeof P;

/** Inline SVG markup of an icon (unknown names fall back to the "?" icon). */
export function treeIcon(name: string, size = 24, cls = ''): string {
  const body = P[name] ?? P.question;
  return `<svg class="rt-ic${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function hasTreeIcon(name: string): boolean {
  return name in P;
}
