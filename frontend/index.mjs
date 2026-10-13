import * as React from '@cove/runtime/react';
import { extensionFetch } from '@cove/runtime/api';
import { createSettingsPanel } from './settings.mjs';
import { watchNudityFilters } from './filters.mjs';

async function api(path, options = {}) {
  const response = await extensionFetch(`/api/ext/nudity-level${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.detail ?? `Request failed (${response.status})`);
  return data;
}
export const NuditySettingsPanel = createSettingsPanel(React, api);
export function NudityFilters() {
  React.useEffect(() => { const watcher = watchNudityFilters(document); return () => watcher.stop(); }, []);
  return null;
}
export default { components: { NuditySettingsPanel, NudityFilters } };
