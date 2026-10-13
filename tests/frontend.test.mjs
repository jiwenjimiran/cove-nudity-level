import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { moveTag, addTag, removeTag, addRule, updateRule, toggleRuleTag, draftError, encodeLevels, decodeLevels } from '../frontend/model.mjs';
import { watchNudityFilters } from '../frontend/filters.mjs';
import { createSettingsPanel } from '../frontend/settings.mjs';

const tick = (ms = 45) => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await tick(10); }
  throw new Error('UI did not reach the expected state.');
};
const initial = { schemaVersion: 2, combinationEnabled: false, defaultsRevision: 2, rules: [{ key: 'full', name: 'Genital + nipples', level: 'full', enabled: true, groups: [['p'], ['n']] }], tags: [
  { key: 'p', name: 'Pussy', tagId: 1, bucket: 'high', genital: true, nipple: false },
  { key: 'n', name: 'Nipples', tagId: 2, bucket: 'high', genital: false, nipple: true },
  { key: 'h', name: 'Pussy Hair', tagId: 3, bucket: 'medium', genital: false, nipple: false }
] };
test('tag moves, role edits, duplicate prevention and removals preserve configuration semantics', () => {
  const moved = moveTag(initial, 'p', 'low'); assert.equal(moved.tags[0].genital, true); assert.equal(initial.tags[0].bucket, 'high');
  const added = addTag(initial, { id: 1, name: 'Renamed' }, 'medium'); assert.equal(added.tags.length, 3); assert.equal(added.tags[0].name, 'Renamed');
  assert.equal(added.tags[0].bucket, 'medium'); assert.equal(added.tags[0].genital, true);
  const custom = addTag(initial, { id: 4, name: 'Custom' }, 'high'); assert.equal(custom.tags[3].bucket, 'high');
  assert.ok(toggleRuleTag(initial, 'full', 0, 'h', true).rules[0].groups[0].includes('h'));
  assert.equal(removeTag(initial, 'p').rules[0].enabled, false);
  assert.deepEqual(moveTag(initial, 'p', 'low').rules, initial.rules);
  assert.equal(encodeLevels(['full', 'high', 'full']), 'high,full'); assert.deepEqual(decodeLevels('full,high'), ['high', 'full']);
});
test('React filter editor publishes exact levels, reloads saved values, clears and cleans up', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const React = await import('react'); const { createRoot } = await import('react-dom/client');
  const h = React.createElement; let current, setSaved, changePanel;
  function Host() {
    const [value, setValue] = React.useState('high,full'); const [name, setName] = React.useState('Nudity level');
    current = value; setSaved = setValue; changePanel = setName;
    return h('div', { role: 'tabpanel', 'aria-label': name }, h('div', null,
      h('div', { role: 'group', 'aria-label': 'Match' }, h('button', { 'data-modifier': 'EQUALS' }, '=')),
      h('label', null, 'Value', h('input', { 'aria-label': 'Value', value, onChange: e => setValue(e.target.value) }))));
  }
  const root = createRoot(document.querySelector('#root')); root.render(h(Host)); await until(() => document.querySelector('input[aria-label="Value"]'));
  const watcher = watchNudityFilters(document);
  const box = value => document.querySelector(`input[type="checkbox"][value="${value}"]`);
  assert.equal(box('high').checked, true); assert.equal(box('full').checked, true);
  box('medium').click(); await tick(); assert.equal(current, 'medium,high,full');
  setSaved('none'); await tick(250); assert.equal(box('none').checked, true); assert.equal(box('medium').checked, false);
  box('none').click(); await tick(); assert.equal(current, '');
  setSaved('unknown'); await tick(250); assert.equal(box('unknown').checked, true);
  changePanel('Title'); await tick(); assert.equal(document.querySelectorAll('.nl-filter').length, 0);
  changePanel('Nudity level'); await tick(); assert.equal(document.querySelectorAll('.nl-filter').length, 1);
  watcher.stop(); assert.equal(document.querySelectorAll('.nl-filter,.nl-native-editor').length, 0);
  root.unmount(); dom.window.close();
});
test('settings editor moves tags, searches full database, edits Full, saves/cancels/restores and handles errors', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }); globalThis.window = dom.window; globalThis.document = dom.window.document;
  const React = await import('react'); const { createRoot } = await import('react-dom/client');
  let persisted = structuredClone(initial), failSave = false; const calls = [];
  const api = async (path, options = {}) => {
    calls.push(path);
    if (path === '/settings' && options.method === 'PUT') { if (failSave) throw new Error('Save rejected'); persisted = JSON.parse(options.body); return structuredClone(persisted); }
    if (path === '/settings') return { settings: structuredClone(persisted), canWrite: true };
    if (path === '/defaults') return structuredClone(initial);
    if (path.startsWith('/tags')) return { items: [{ id: 4, name: 'Custom library tag' }, { id: 1, name: 'Pussy' }], hasMore: new URLSearchParams(path.split('?')[1]).get('page') === '1' };
    throw new Error(path);
  };
  const Panel = createSettingsPanel(React, api); const root = createRoot(document.querySelector('#root')); root.render(React.createElement(Panel));
  await until(() => document.querySelector('select[aria-label="Move Pussy to bucket"]'));
  const button = name => [...document.querySelectorAll('button')].find(b => b.textContent === name);
  const select = document.querySelector('select[aria-label="Move Pussy to bucket"]'); select.value = 'low'; select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await until(() => document.querySelector('[aria-label="Low bucket"]').textContent.includes('Pussy'));
  assert.match(document.querySelector('[aria-label="Low bucket"]').textContent, /Pussy/);
  button('Cancel').click(); await until(() => !document.querySelector('[aria-label="Low bucket"]').textContent.includes('Pussy'));
  assert.match(document.querySelector('[aria-label="High bucket"]').textContent, /Pussy/);
  document.querySelector('button[aria-label="Add tag to Medium"]').click();
  await until(() => button('Next') && !button('Next').disabled);
  assert.ok(calls.some(p => p.startsWith('/tags?'))); button('Next').click();
  await until(() => calls.some(p => p.endsWith('page=2')) && button('Custom library tag') && !button('Previous').disabled);
  button('Custom library tag').click(); await until(() => document.querySelector('[aria-label="Medium bucket"]').textContent.includes('Custom library tag'));
  assert.match(document.querySelector('[aria-label="Medium bucket"]').textContent, /Custom library tag/);
  const search = document.querySelector('input[aria-label="Search Genital + nipples group 1"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, 'Custom');
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await until(() => document.querySelector('input[aria-label="Custom library tag in Genital + nipples group 1"]'));
  const role = document.querySelector('input[aria-label="Custom library tag in Genital + nipples group 1"]'); role.click(); await tick();
  button('Save').click(); await until(() => document.body.textContent.includes('Settings saved'));
  assert.ok(persisted.rules[0].groups[0].includes('tag:4'));
  assert.match(document.body.textContent, /Settings saved/);
  button('Restore defaults').click(); await until(() => document.querySelectorAll('.nl-tag').length === 3); assert.equal(persisted.tags.length, 4);
  failSave = true; button('Save').click(); await until(() => document.querySelector('[role="alert"]')); assert.match(document.querySelector('[role="alert"]').textContent, /Save rejected/);
  button('Cancel').click(); await until(() => document.querySelectorAll('.nl-tag').length === 4);
  root.unmount(); dom.window.close();
});
test('compound rules allow custom results and groups, reject incomplete enabled rules, and remove memberships', () => {
  let draft = addRule(initial);
  const key = draft.rules[1].key;
  assert.equal(draft.rules[1].enabled, false); assert.equal(draftError(draft), '');
  draft = updateRule(draft, key, { name: 'Custom High', level: 'high', enabled: true });
  assert.match(draftError(draft), /nonempty|every group/);
  draft = toggleRuleTag(draft, key, 0, 'h', true);
  draft = toggleRuleTag(draft, key, 1, 'n', true);
  assert.equal(draftError(draft), ''); assert.equal(draft.rules[1].level, 'high');
  assert.equal(removeTag(draft, 'h').rules[1].enabled, false);
  draft = updateRule(draft, key, { name: '' }); assert.match(draftError(draft), /name/);
});
test('settings editor with no write permission disables editing', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }); globalThis.window = dom.window; globalThis.document = dom.window.document;
  const React = await import('react'); const { createRoot } = await import('react-dom/client');
  const Panel = createSettingsPanel(React, async () => ({ settings: initial, canWrite: false }));
  const root = createRoot(document.querySelector('#root')); root.render(React.createElement(Panel)); await until(() => document.querySelector('fieldset'));
  assert.equal(document.querySelector('fieldset').disabled, true); assert.equal(document.querySelector('.nl-tag').draggable, false);
  assert.match(document.body.textContent, /read-only/); root.unmount(); dom.window.close();
});
