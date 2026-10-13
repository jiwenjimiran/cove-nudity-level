import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const defaults = JSON.parse(await readFile(new URL('../artifacts/defaults.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../artifacts/ui-manifest.json', import.meta.url), 'utf8'));
assert.equal(defaults.tags.length, 155); let saved = structuredClone(defaults);
// Compile the real host selection callback and installed/dedicated rendering paths.
const settingsPage = (await readFile(new URL('../../cove/ui/src/pages/SettingsPage.tsx', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const loader = (await readFile(new URL('../../cove/ui/src/extensions/ExtensionLoader.tsx', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const callbackStart = loader.indexOf('  const getSettingsPanelsForTab = useCallback(');
const callback = loader.slice(callbackStart, loader.indexOf('  const getActionsForContext', callbackStart));
const installedStart = settingsPage.indexOf('{mode === "installed" &&\n        settingsPanels.length');
const installed = settingsPage.slice(installedStart, settingsPage.indexOf('\n\n      {/* Find and Install', installedStart));
const dedicatedStart = settingsPage.indexOf('  const renderExtensionSettingsPanels = (');
const dedicated = settingsPage.slice(dedicatedStart, settingsPage.indexOf('  const commitCustomFieldDraft', dedicatedStart));
assert.ok(callbackStart > 0 && installedStart > 0 && dedicatedStart > 0, 'host settings integration source located');
const hostFixture = `import React, {useCallback} from 'react';
type SettingsTab = string;
function SectionCard({title,description,children}:any) {return <section aria-label={title+' settings panel'}><h2>{title}</h2><p>{description}</p>{children}</section>}
function usePanelSelector(manifest:any) {const settingsPanels = manifest.settingsPanels; ${callback} return getSettingsPanelsForTab;}
export function HostPanels({manifest,registry,tab}:any) {
const getSettingsPanelsForTab = usePanelSelector(manifest);
const resolveComponent = (owner:string,name:string) => registry.resolve(owner,name);
const settingsPanels = getSettingsPanelsForTab('extensions'); const mode='installed';
${dedicated}
return tab==='extensions' ? <>${installed}</> : <>{renderExtensionSettingsPanels(tab,'Nudity Level','No settings')}</>;
}`;
const bundle = await build({ entryPoints: [fileURLToPath(new URL('browser-entry.mjs', import.meta.url))], bundle: true, write: false, format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'host-fixture', setup(build) {
    build.onResolve({ filter: /^host-settings-fixture$/ }, () => ({ path: 'host-settings', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: hostFixture, loader: 'tsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }));
    build.onResolve({ filter: /^@cove\/runtime\/react$/ }, () => ({ path: require.resolve('react') }));
    build.onResolve({ filter: /^@cove\/runtime\/api$/ }, () => ({ path: 'api', namespace: 'api-fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'api-fixture' }, () => ({ contents: 'export const extensionFetch = (path,options) => fetch(path,options);' }));
  } }] });
const css = await readFile(new URL('../frontend/nudity-level.css', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url.startsWith('/fixture') || req.url.startsWith('/api/ext/nudity-level')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/fixture/manifest') { res.end(JSON.stringify(manifest)); return; }
    if (req.method === 'PUT') { let body = ''; for await (const chunk of req) body += chunk; saved = JSON.parse(body); res.end(JSON.stringify(saved)); return; }
    if (req.url.includes('/defaults')) { res.end(JSON.stringify(defaults)); return; }
    if (req.url.includes('/tags?')) { res.end(JSON.stringify({ items: [{ id: 999, name: 'Custom body tag' }, { id: 1, name: 'Face' }], hasMore: false })); return; }
    res.end(JSON.stringify({ settings: saved, canWrite: true })); return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nudity Level preview</title><style>body{margin:0;padding:20px;background:#111827;color:#e5e7eb;font:14px system-ui}*{box-sizing:border-box}main{max-width:1200px;margin:auto}${css}</style><div id="root"></div><script type="module" src="/bundle.js"></script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: 'Compound rules' }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Nudity Level settings panel' }).count(), 1);
  assert.equal(await page.locator('.nl-tag').count(), 155);
  assert.equal(await page.getByLabel('Value', { exact: true }).isVisible(), false);
  const filter = page.getByRole('group', { name: 'Match any selected nudity level' });
  await filter.getByLabel('Medium', { exact: true }).check();
  assert.equal(await page.evaluate(() => window.currentFilter), 'medium,high,full');
  await page.getByLabel('Move Pussy Hair to bucket', { exact: true }).selectOption('low');
  assert.equal(await page.getByRole('region', { name: 'Low bucket', exact: true }).getByText('Pussy Hair', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const face = page.locator('.nl-tag').filter({ has: page.locator('strong').getByText('Face', { exact: true }) });
  await face.locator('strong').dragTo(page.getByRole('region', { name: 'Low bucket', exact: true }).getByRole('heading', { name: 'Low', exact: true }));
  assert.equal(await page.getByLabel('Move Face to bucket', { exact: true }).inputValue(), 'low');
  await page.getByRole('button', { name: 'Add tag to Medium', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search all library tags' }).fill('custom');
  await page.getByRole('button', { name: 'Custom body tag', exact: true }).click();
  await page.getByLabel('Search Genital + nipples group 1', { exact: true }).fill('Custom body');
  await page.getByLabel('Custom body tag in Genital + nipples group 1', { exact: true }).check();
  await page.getByRole('button', { name: 'Add compound rule', exact: true }).click();
  await page.getByLabel('New rule name', { exact: true }).fill('Proxy High');
  await page.getByLabel('Proxy High target level', { exact: true }).selectOption('high');
  await page.getByLabel('Search Proxy High group 1', { exact: true }).fill('Kissing');
  await page.getByLabel('Kissing in Proxy High group 1', { exact: true }).check();
  await page.getByLabel('Search Proxy High group 2', { exact: true }).fill('Handcuffed');
  await page.getByLabel('Handcuffed in Proxy High group 2', { exact: true }).check();
  await page.getByLabel('Enable Proxy High', { exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Settings saved. New filter requests use these rules.', { exact: true }).waitFor();
  assert.ok(saved.rules[0].groups[0].includes('tag:999'));
  assert.equal(saved.rules[1].level, 'high'); assert.equal(saved.rules[1].enabled, true);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
  }
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.getByText('Defaults restored in the draft. Save to apply.', { exact: true }).waitFor();
  assert.equal(await page.locator('.nl-tag').count(), 155); assert.equal(saved.tags.length, 156);
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/settings-preview.png', import.meta.url)), fullPage: true });
  await page.evaluate(() => window.stopFilter()); assert.equal(await page.getByLabel('Value', { exact: true }).isVisible(), true);
  await page.goto(`http://127.0.0.1:${server.address().port}/?tab=extensions/nudity-level`);
  await page.getByRole('heading', { name: 'Compound rules' }).waitFor();
  assert.equal(await page.locator('.nl-tag').count(), 156);
  assert.equal(await page.getByLabel('Proxy High target level', { exact: true }).inputValue(), 'high');
  // Reproduce the old manifest: the dedicated-only panel disappears from Installed.
  const oldManifest = { ...manifest, settingsPanels: manifest.settingsPanels.filter(p => p.targetTab !== 'extensions') };
  const fixed = manifest.settingsPanels; manifest.settingsPanels = oldManifest.settingsPanels;
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForTimeout(150);
  assert.equal(await page.locator('.nl-settings').count(), 0); manifest.settingsPanels = fixed;
  assert.deepEqual(errors, []);
  console.log('PASS host settings rendering and component registry: old visibility bug reproduced, both fixed entry points, drag/drop, database search, compound creation/persistence, cleanup and three widths');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
