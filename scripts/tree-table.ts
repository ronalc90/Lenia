/**
 * Prints the research tree as the Markdown tables of docs/CICLO.md §4.2 (Spanish, from the real data:
 * names, rings, prices and every "antes → después" value), so the doc never drifts from the code.
 *
 *   npx vite-node scripts/tree-table.ts > /tmp/tree.md
 */
import { BRANCHES, TREE_BY_ID, beforeAfter, nodeCost, priceRule, ringNight, routeNodes, ENDLESS_LEVELS } from '../src/game/tree';
import { BRANCH_TEXT, NODE_TEXT } from '../src/game/treeText';

const es = (n: number): string => (n >= 10000 ? n.toLocaleString('es-ES').replace(/\./g, '.') : String(n));
const factor = (g: number): string => `×${String(Math.round(g * 100) / 100).replace('.', ',')}`;

for (const b of BRANCHES) {
  console.log(`**${BRANCH_TEXT[b].name.es}** — ${BRANCH_TEXT[b].desc.es}\n`);
  console.log('| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |');
  console.log('|---|---|---|---|---|---|');
  const nodes = routeNodes(b);
  const owned: Record<string, number> = { lab: 4 };
  nodes.forEach((n, i) => {
    const endless = n.maxLevel >= ENDLESS_LEVELS;
    const shown = endless ? 5 : n.maxLevel;
    const prices: string[] = [];
    for (let l = 0; l < shown; l++) prices.push(es(nodeCost(n.id, l)));
    const values: string[] = [];
    const levels = { ...owned };
    for (let l = 0; l <= shown; l++) {
      const ba = beforeAfter({ ...levels, [n.id]: l }, n.id);
      if (l === 0) values.push(ba.before.es);
      if (ba.after) values.push(ba.after.es);
      else break;
    }
    const r = priceRule(n.id);
    console.log(
      `| ${i + 1} | ${NODE_TEXT[n.id].name.es} | ${n.ring} · ${ringNight(n.ring)} | ${endless ? '∞' : n.maxLevel} | ${prices.join(' · ')}${endless ? ' · …' : ''} (${factor(r.growth)}) | ${values.join(' → ')}${endless ? ' → …' : ''} |`,
    );
    owned[n.id] = n.maxLevel >= ENDLESS_LEVELS ? 0 : n.maxLevel;
    void TREE_BY_ID;
  });
  console.log('');
}
