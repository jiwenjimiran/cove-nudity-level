import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createSettingsPanel } from '../frontend/settings.mjs';
import { watchNudityFilters } from '../frontend/filters.mjs';
const h = React.createElement;
const api = async (path, options = {}) => {
  const response = await fetch('/fixture' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
  return response.json();
};
const Panel = createSettingsPanel(React, api);
function App() {
  const [value, setValue] = React.useState('high,full'); window.currentFilter = value;
  React.useEffect(() => { const watcher = watchNudityFilters(document); window.stopFilter = () => watcher.stop(); return () => watcher.stop(); }, []);
  return h('main', null, h('h1', null, 'Nudity Level'),
    h('section', { role: 'tabpanel', 'aria-label': 'Nudity level' }, h('div', null,
      h('div', { role: 'group', 'aria-label': 'Match' }, h('button', { 'data-modifier': 'EQUALS' }, '=')),
      h('label', null, 'Value', h('input', { 'aria-label': 'Value', value, onChange: e => setValue(e.target.value) })))), h(Panel));
}
createRoot(document.getElementById('root')).render(h(App));
