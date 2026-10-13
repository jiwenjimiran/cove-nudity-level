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
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } }); const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: 'Compound rules' }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Nudity Level settings panel' }).count(), 1);
  assert.equal(await page.locator('.nl-tag').count(), 155);
  assert.equal(await page.getByRole('button', { name: 'Remove Face', exact: true }).textContent(), '×');
  assert.equal(await page.locator('.nl-rule-card input[type="text"]').count(), 0, 'rule inputs stay out of the summary');
  assert.equal(await page.getByLabel('Value', { exact: true }).isVisible(), false);
  const filter = page.getByRole('group', { name: 'Match any selected nudity level' });
  await filter.getByLabel('Medium', { exact: true }).check();
  assert.equal(await page.evaluate(() => window.currentFilter), 'medium,high,full');
  await page.getByRole('button', { name: 'Move Pussy Hair', exact: true }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert.equal(await page.locator('.nl-tag select').count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Low bucket', exact: true }).getByText('Pussy Hair', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle Neutral bucket', exact: true }).click();
  const face = page.getByRole('button', { name: 'Move Face', exact: true });
  const target = page.getByRole('button', { name: 'Toggle Low bucket', exact: true });
  await face.scrollIntoViewIfNeeded();
  const origin = await face.boundingBox(), destination = await target.boundingBox();
  await page.mouse.move(origin.x + 8, origin.y + 8); await page.mouse.down();
  await page.mouse.move(origin.x + 45, origin.y + 20, { steps: 5 });
  await page.locator('.nl-drag-preview').waitFor();
  const firstPreview = await page.locator('.nl-drag-preview').boundingBox();
  await page.mouse.move(destination.x + 90, destination.y + 15, { steps: 12 });
  await page.waitForTimeout(30);
  const lastPreview = await page.locator('.nl-drag-preview').boundingBox();
  assert.ok(Math.abs(lastPreview.y - firstPreview.y) > 20, 'real chip preview follows pointer');
  assert.equal(await page.locator('[data-nl-bucket="low"].nl-drop-target').count(), 1);
  assert.equal(await page.locator('.nl-drag-origin').count(), 1);
  await page.mouse.up();
  assert.equal(await target.getAttribute('aria-expanded'), 'false', 'closed target stays closed after drop');
  assert.equal(await page.locator('[data-nl-bucket="low"] .nl-tag-name').filter({ hasText: /^Face$/ }).count(), 1);
  assert.equal(await page.locator('.nl-drag-preview').count(), 0);
  await target.click();
  const movedFace = await face.boundingBox(), medium = await page.getByRole('button', { name: 'Toggle Medium bucket', exact: true }).boundingBox();
  await page.mouse.move(movedFace.x + 5, movedFace.y + 5); await page.mouse.down();
  await page.mouse.move(medium.x + 60, medium.y + 15, { steps: 10 });
  await page.locator('.nl-drag-preview').waitFor(); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await page.locator('.nl-drag-preview').count(), 0);
  assert.equal(await page.locator('[data-nl-bucket="low"] .nl-tag-name').filter({ hasText: /^Face$/ }).count(), 1, 'Escape preserves source assignment');
  // Touch uses the same pointer-following drag, including a collapsed destination.
  const touchSource = await face.boundingBox(), touchTarget = await page.getByRole('button', { name: 'Toggle High bucket', exact: true }).boundingBox();
  await face.dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch', button: 0, clientX: touchSource.x + 5, clientY: touchSource.y + 5 });
  await page.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 21, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true })), { x: touchTarget.x + 50, y: touchTarget.y + 15 });
  await page.locator('.nl-drag-preview').waitFor();
  await page.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), { x: touchTarget.x + 50, y: touchTarget.y + 15 });
  assert.equal(await page.locator('[data-nl-bucket="high"] .nl-tag-name').filter({ hasText: /^Face$/ }).count(), 1, 'touch drop moves the tag into a closed row');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle Neutral bucket', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle Medium bucket', exact: true }).click();
  const rows = await page.locator('.nl-group').evaluateAll(rows => rows.map(row => ({ x: row.getBoundingClientRect().x, width: row.getBoundingClientRect().width })));
  assert.ok(rows.every(row => row.x === rows[0].x && row.width === rows[0].width), 'every bucket spans the same full width');
  await page.getByRole('button', { name: 'Toggle Neutral bucket', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Unused1', exact: true }).click();
  assert.equal(await page.locator('.nl-tag').count(), 154, 'chip x removes the assignment');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add tag to Medium', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search all library tags' }).fill('custom');
  await page.getByRole('button', { name: 'Custom body tag', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Genital + nipples', exact: true }).click();
  await page.getByRole('button', { name: 'Add alternative to Genital + nipples group 1', exact: true }).click();
  await page.getByLabel('Search Genital + nipples group 1', { exact: true }).fill('Custom body');
  await page.getByRole('button', { name: 'Add Custom body tag to Genital + nipples group 1', exact: true }).click();
  await page.getByRole('button', { name: '+ New rule', exact: true }).click();
  await page.getByLabel('New rule name', { exact: true }).fill('Proxy High');
  await page.getByLabel('Proxy High target level', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Add alternative to Proxy High group 1', exact: true }).click();
  await page.getByLabel('Search Proxy High group 1', { exact: true }).fill('Kissing');
  await page.getByRole('button', { name: 'Add Kissing to Proxy High group 1', exact: true }).click();
  await page.getByRole('button', { name: 'Add alternative to Proxy High group 2', exact: true }).click();
  await page.getByLabel('Search Proxy High group 2', { exact: true }).fill('Handcuffed');
  await page.getByRole('button', { name: 'Add Handcuffed to Proxy High group 2', exact: true }).click();
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
  const expand = page.getByRole('button', { name: 'Expand all', exact: true });
  if (!(await expand.count())) await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/settings-preview.png', import.meta.url)), fullPage: true });
  await page.evaluate(() => window.stopFilter()); assert.equal(await page.getByLabel('Value', { exact: true }).isVisible(), true);
  await page.goto(`http://127.0.0.1:${server.address().port}/?tab=extensions/nudity-level`);
  await page.getByRole('heading', { name: 'Compound rules' }).waitFor();
  assert.equal(await page.locator('.nl-tag').count(), 156);
  await page.getByRole('button', { name: 'Edit Proxy High', exact: true }).click();
  assert.equal(await page.getByLabel('Proxy High target level', { exact: true }).inputValue(), 'high');
  // Reproduce the old manifest: the dedicated-only panel disappears from Installed.
  const oldManifest = { ...manifest, settingsPanels: manifest.settingsPanels.filter(p => p.targetTab !== 'extensions') };
  const fixed = manifest.settingsPanels; manifest.settingsPanels = oldManifest.settingsPanels;
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForTimeout(150);
  assert.equal(await page.locator('.nl-settings').count(), 0); manifest.settingsPanels = fixed;
  assert.deepEqual(errors, []);
  console.log('PASS host settings rendering and component registry: old visibility bug reproduced, both fixed entry points, full-width collapsible rows, pointer-following chips, collapsed-target drops, Escape cancellation, database search, focused compound editing/persistence, cleanup and three widths');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
