import * as React from 'react';
import { createRoot } from 'react-dom/client';
import bundle from '../frontend/index.mjs';
import { ExtensionComponentRegistry } from '../../cove/ui/src/extensions/ExtensionComponentRegistry.ts';
import { HostPanels } from 'host-settings-fixture';
import { watchNudityFilters } from '../frontend/filters.mjs';
const h = React.createElement;
const manifest = await (await fetch('/fixture/manifest')).json();
const registry = new ExtensionComponentRegistry();
registry.register('io.github.jiwenjimiran.nudity-level', bundle.components);
function App() {
  const [value, setValue] = React.useState('high,full'); window.currentFilter = value;
  React.useEffect(() => { const watcher = watchNudityFilters(document); window.stopFilter = () => watcher.stop(); return () => watcher.stop(); }, []);
  return h('main', null, h('h1', null, 'Nudity Level'),
    h('section', { role: 'tabpanel', 'aria-label': 'Nudity level' }, h('div', null,
      h('div', { role: 'group', 'aria-label': 'Match' }, h('button', { 'data-modifier': 'EQUALS' }, '=')),
      h('label', null, 'Value', h('input', { 'aria-label': 'Value', value, onChange: e => setValue(e.target.value) })))),
    h(HostPanels, { manifest, registry, tab: new URLSearchParams(location.search).get('tab') ?? 'extensions' }));
}
createRoot(document.getElementById('root')).render(h(App));
