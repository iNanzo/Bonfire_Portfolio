// The Run tab once the event has finished (the design's "Event finished" state): the final team
// standings, the full individual ranking (U10, host only), and Export Results, Export Backup and
// Delete Event Data together. host.js hostView shows it in the Run tab's place; the top bar's one
// primary button stays Export Results (U04). Interface: host.js's Screen. Styles: host-review.css
// (the standings tables are History's).
/**
 * @typedef {import('./host.js').Screen} Screen
 * @typedef {import('./host.js').ScreenCtx} ScreenCtx
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./app.js').App} App
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./dom.js').Handlers} Handlers
 */
import { esc } from '../html.js';
import { t } from './strings.js';
import { standings } from './scoring.js';
import { button } from './ui.js';
import { memberRanking, renderTotals } from './hostReview.js';
import { resultsFileName } from './hostSetup.js';

/**
 * The finished event's view model.
 * @param {ScreenCtx} ctx
 */
export function finishedVm(ctx) {
  const { event, lang } = ctx;
  const teamOf = new Map(event.teams.map((tm) => [tm.id, tm]));
  return {
    lang,
    title: t('phase.finished', lang),
    hint: t('hint.eventFinished', lang),
    teams: standings(event).map((r) => ({ id: r.id, place: r.place, total: r.total, team: teamOf.get(r.id) ?? null })),
    members: memberRanking(event, lang),
  };
}

/**
 * The finished event's markup: the files together, then the standings and the full ranking.
 * @param {ReturnType<typeof finishedVm>} vm
 * @returns {string}
 */
export function renderFinished(vm) {
  const { lang } = vm;
  const files = [
    button(t('action.exportResultsCsv', lang), 'finished.exportResults'),
    button(t('action.exportBackup', lang), 'exportBackup', { focus: 'exportBackup-finished' }),
    button(t('action.deleteEventData', lang), 'finished.delete', { variant: 'danger' }),
  ].join('');
  return `<div class="larp-history larp-finished">
<section class="larp-panel larp-finished-files" aria-labelledby="finished-title"><h2 class="larp-h2" id="finished-title">${esc(vm.title)}</h2><p class="larp-hint">${esc(vm.hint)}</p><div class="larp-run-actions">${files}</div></section>
${renderTotals(vm)}
</div>`;
}

/**
 * The finished event's handlers (Export Backup is the shell's).
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function finishedActions(app, ui, env) {
  return {
    'finished.exportResults': () => env.download(resultsFileName(env.now()), app.exportResultsCsv(), 'text/csv'),
    'finished.delete': ({ confirmed }) => {
      if (!confirmed) {
        env.confirm({ action: 'finished.delete', hintKey: 'hint.confirmDelete', labelKey: 'action.deleteEventData' });
        return;
      }
      app.deleteEventData();
      ui.set({ flash: { kind: 'info', key: 'hint.deleted' } });
    },
  };
}

/** @type {Screen} */
export const finishedTab = {
  id: 'run',
  labelKey: 'tab.run',
  vm: finishedVm,
  render: renderFinished,
  actions: finishedActions,
};
