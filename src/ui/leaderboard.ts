/**
 * Ranking modal: nickname setup on first open, three boards (lifetime essence,
 * species, eras), top 50 with medals, the player's row pinned at the bottom,
 * loading skeletons, offline/error state with retry and a submit button.
 */
import type { Ctx } from './ctx';
import { h, ic } from './dom';
import { fmt } from './format';
import { getLang, t, type StrKey } from './i18n';
import { icon } from './icons';
import { validateNickname, type LeaderboardBoard, type LeaderboardClient, type LeaderboardEntry, type LeaderboardResult } from './leaderboard-types';
import type { ModalHandle, ModalHost } from './modals';
import { cosmeticById, type BadgeData, type FrameData, type NameColorData } from '../store/catalog';

/** Catalog data of a ranking cosmetic id, only when it belongs to `slot`. */
function profileItem<S extends 'badge' | 'frame' | 'nameColor'>(slot: S, id: string | undefined) {
  const it = id ? cosmeticById(id) : undefined;
  return it && it.slot === slot ? (it.data as S extends 'badge' ? BadgeData : S extends 'frame' ? FrameData : NameColorData) : null;
}

/**
 * Name with the ranking cosmetics the server decided (badge, frame, name colour). Purely visual:
 * the same row, rank and score for everyone.
 */
function namePlate(name: string, c: LeaderboardEntry['cosmetics']): HTMLElement {
  const plate = h('span', { class: 'lb-plate' });
  const badge = profileItem('badge', c?.badge);
  const frame = profileItem('frame', c?.frame);
  const color = profileItem('nameColor', c?.nameColor);
  if (frame && frame.style !== 'none') {
    plate.classList.add('framed', `fr-${frame.style}`);
    const cols = frame.colors.length ? frame.colors : ['#5BC0EB'];
    plate.style.setProperty('--fr', frame.style === 'gradient' ? `linear-gradient(120deg, ${cols.join(', ')})` : cols[0]);
    plate.style.setProperty('--fr2', cols[1] ?? cols[0]);
    if (frame.glow) plate.style.setProperty('--fr-glow', frame.glow);
  }
  if (badge?.svg) {
    const b = h('span', {
      class: 'lb-badge',
      html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${badge.svg}</svg>`,
    });
    b.style.color = badge.color;
    if (badge.bg && badge.bg !== 'transparent') b.style.background = badge.bg;
    plate.appendChild(b);
  }
  const n = h('span', { class: 'lb-n' }, name);
  if (color?.gradient) {
    n.classList.add('grad');
    n.style.backgroundImage = `linear-gradient(90deg, ${color.gradient[0]}, ${color.gradient[1]})`;
  } else if (color) n.style.color = color.color;
  plate.appendChild(n);
  return plate;
}

const BOARDS: { id: LeaderboardBoard; label: StrKey }[] = [
  { id: 'essence', label: 'boardEssence' },
  { id: 'species', label: 'boardSpecies' },
  { id: 'era', label: 'boardEra' },
];

export function openLeaderboard(host: ModalHost, ctx: Ctx, client: LeaderboardClient): ModalHandle {
  const m = host.show({ kind: 'leaderboard', title: t('ranking'), titleIcon: 'trophy' });
  m.body.classList.add('lb-body');
  let board: LeaderboardBoard = 'essence';
  let token = 0;
  const cache = new Map<LeaderboardBoard, LeaderboardResult>();

  // ───────────── nickname ─────────────
  const showNickname = (initial = '') => {
    m.body.textContent = '';
    const input = h('input', {
      class: 'lb-input',
      type: 'text',
      maxlength: '16',
      value: initial,
      placeholder: t('nickPlaceholder'),
      autocomplete: 'nickname',
      spellcheck: 'false',
      'aria-label': t('nickTitle'),
    });
    const err = h('div', { class: 'lb-err', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn primary block' }, ic('check', 24), t('nickSave'));
    const msg: Record<string, StrKey> = { short: 'nickTooShort', long: 'nickTooLong', invalid: 'nickInvalid' };
    const check = () => {
      const r = validateNickname(input.value);
      save.disabled = r !== 'ok';
      err.textContent = r === 'ok' || input.value.trim() === '' ? '' : t(msg[r]);
      return r === 'ok';
    };
    const submit = async () => {
      if (!check()) return;
      save.disabled = true;
      save.classList.add('busy');
      try {
        const res = await client.setName(input.value.trim());
        if (res.ok) {
          ctx.sound('confirm');
          showBoards();
        } else {
          err.textContent = res.error || t('lbError');
          ctx.sound('deny');
        }
      } catch {
        err.textContent = t('lbOffline');
      } finally {
        save.classList.remove('busy');
        save.disabled = validateNickname(input.value) !== 'ok';
      }
    };
    input.addEventListener('input', check);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void submit();
    });
    save.addEventListener('click', () => void submit());
    m.body.append(
      h(
        'div',
        { class: 'lb-nick' },
        h('div', { class: 'lb-nick-ic' }, ic('trophy', 24)),
        h('h2', null, t('nickTitle')),
        h('p', null, t('nickHint')),
        input,
        err,
        save,
      ),
    );
    check();
    requestAnimationFrame(() => input.focus());
  };

  // ───────────── boards ─────────────
  let list: HTMLElement;
  let foot: HTMLElement;
  let meSlot: HTMLElement;
  let segBtns: { id: LeaderboardBoard; b: HTMLButtonElement }[] = [];

  const showBoards = () => {
    m.body.textContent = '';
    const seg = h('div', { class: 'seg text wide', role: 'tablist' });
    segBtns = BOARDS.map(({ id, label }) => {
      const b = h('button', { type: 'button', role: 'tab', text: t(label) });
      b.addEventListener('click', () => {
        if (board === id) return;
        board = id;
        ctx.sound('tab');
        void load(false);
      });
      seg.appendChild(b);
      return { id, b };
    });
    const sub = h('div', { class: 'lb-sub' });
    list = h('div', { class: 'lb-list', role: 'list' });
    meSlot = h('div', { class: 'lb-me-slot' });
    const submitBtn = h('button', { type: 'button', class: 'btn primary lb-submit' }, ic('upload', 24), t('submitScore'));
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      submitBtn.classList.add('busy');
      try {
        const r = await client.submitNow();
        ctx.toast(r.ok ? t('submitOk') : `${t('submitFail')}${r.error ? ': ' + r.error : ''}`, r.ok ? 'good' : 'bad', r.ok ? 'check' : 'warning');
        if (r.ok) {
          ctx.sound('confirm');
          ctx.fxBurst(submitBtn, '#5BC0EB');
          cache.clear();
          void load(true);
        }
      } catch {
        ctx.toast(t('lbOffline'), 'bad', 'warning');
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('busy');
      }
    });
    const rename = h('button', { type: 'button', class: 'btn ghost lb-rename', 'aria-label': t('nickChange'), title: t('nickChange') }, ic('pencil', 24));
    rename.addEventListener('click', () => showNickname(client.getName() ?? ''));
    foot = h('div', { class: 'lb-foot' }, meSlot, h('div', { class: 'lb-actions' }, submitBtn, rename));
    m.body.append(seg, sub, list, foot);
    const upd = () => {
      for (const { id, b } of segBtns) {
        b.classList.toggle('on', id === board);
        b.setAttribute('aria-selected', String(id === board));
      }
      sub.textContent = board === 'essence' ? t('boardEssenceLong') : '';
      sub.hidden = board !== 'essence';
    };
    upd();
    segUpdate = upd;
    void load(false);
  };
  let segUpdate = () => {};

  const skeleton = () => {
    list.textContent = '';
    meSlot.textContent = '';
    for (let i = 0; i < 8; i++) {
      list.appendChild(
        h(
          'div',
          { class: 'lb-row skel', 'aria-hidden': 'true', style: `animation-delay:${i * 60}ms` },
          h('span', { class: 'sk sk-rank' }),
          h('span', { class: 'sk sk-name', style: `width:${40 + ((i * 37) % 35)}%` }),
          h('span', { class: 'sk sk-score' }),
        ),
      );
    }
  };

  const row = (e: LeaderboardEntry, pinned = false): HTMLElement => {
    const lang = getLang();
    const rank =
      e.rank <= 3
        ? h('span', { class: `medal m${e.rank}`, 'aria-label': `#${e.rank}` }, String(e.rank))
        : h('span', { class: 'lb-rank mono' }, `#${e.rank}`);
    const name = h('div', { class: 'lb-name' }, e.cosmetics ? namePlate(e.name, e.cosmetics) : h('span', { class: 'lb-n' }, e.name));
    if (e.isMe) name.appendChild(h('span', { class: 'lb-you' }, t('lbYou')));
    if (e.flagged) name.appendChild(h('span', { class: 'lb-flag', title: t('lbFlagged'), html: icon('warning', 14) }));
    const meta =
      board === 'essence'
        ? `${e.species} ${t('lbSpeciesShort')} · ${t('era')} ${e.era}`
        : board === 'species'
          ? `${t('era')} ${e.era}`
          : `${e.species} ${t('lbSpeciesShort')}`;
    const score = board === 'essence' ? fmt(e.score, lang) : fmt(e.score, lang);
    return h(
      'div',
      { class: 'lb-row' + (e.isMe ? ' me' : '') + (pinned ? ' pinned' : '') + (e.flagged ? ' flagged' : ''), role: 'listitem' },
      rank,
      h('div', { class: 'lb-mid' }, name, h('div', { class: 'lb-meta' }, meta)),
      h(
        'span',
        { class: 'lb-score mono' },
        board === 'essence' ? h('span', { class: 'lb-sc-ic', html: icon('essence', 14) }) : null,
        score,
      ),
    );
  };

  const render = (res: LeaderboardResult) => {
    list.textContent = '';
    meSlot.textContent = '';
    if ('error' in res) {
      const retry = h('button', { type: 'button', class: 'btn' }, ic('rebirth', 24), t('retry'));
      retry.addEventListener('click', () => void load(true));
      list.appendChild(
        h(
          'div',
          { class: 'lb-state' },
          h('div', { class: 'lb-state-ic' }, ic('warning', 24)),
          h('p', null, /offline|network|fetch/i.test(res.error) ? t('lbOffline') : t('lbError')),
          h('code', null, res.error),
          retry,
        ),
      );
      return;
    }
    if (!res.entries.length) {
      list.appendChild(h('div', { class: 'lb-state' }, h('div', { class: 'lb-state-ic' }, ic('trophy', 24)), h('p', null, t('lbEmpty'))));
    }
    res.entries.slice(0, 50).forEach((e, i) => {
      const r = row(e);
      r.style.animationDelay = `${Math.min(i, 14) * 25}ms`;
      list.appendChild(r);
    });
    if (res.me) meSlot.appendChild(row(res.me, true));
    else meSlot.appendChild(h('div', { class: 'lb-note' }, t('lbNotRanked')));
  };

  const load = async (force: boolean) => {
    segUpdate();
    const my = ++token;
    const cached = cache.get(board);
    if (cached && !force) {
      render(cached);
      return;
    }
    skeleton();
    let res: LeaderboardResult;
    try {
      res = await client.fetchTop(board);
    } catch (err) {
      res = { error: err instanceof Error ? err.message : 'network error' };
    }
    if (my !== token || !m.body.isConnected) return;
    if (!('error' in res)) cache.set(board, res);
    render(res);
  };

  if (client.getName()) showBoards();
  else showNickname();
  m.relabel = () => (client.getName() ? showBoards() : showNickname());
  return m;
}
