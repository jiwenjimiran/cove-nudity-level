import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../src/NudityLevel/Settings.cs', import.meta.url), 'utf8');
const tags = [...source.matchAll(/Add\("(neutral|low|medium|high|full)", "([^"]+)"\)/g)].flatMap(([, bucket, names]) => names.split('|').map(name => ({
  key: 'default:' + name.toLowerCase(), name, bucket, genital: bucket === 'high' && name !== 'Nipples', nipple: name === 'Nipples', missing: false
}))).map((tag, i) => ({ ...tag, tagId: i + 1 }));
assert.equal(tags.length, 37);
const defaults = { schemaVersion: 1, combinationEnabled: true, tags }; let saved = structuredClone(defaults);
const bundle = await build({ entryPoints: [fileURLToPath(new URL('browser-entry.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile(new URL('../frontend/nudity-level.css', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url.startsWith('/fixture')) {
    res.setHeader('Content-Type', 'application/json');
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
  await page.getByRole('heading', { name: 'Full combination rule' }).waitFor();
  assert.equal(await page.locator('.nl-tag').count(), 37);
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
  await page.getByLabel('Custom body tag genital evidence', { exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Settings saved. New filter requests use these rules.', { exact: true }).waitFor();
  assert.equal(saved.tags.find(t => t.tagId === 999).genital, true);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
  }
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.getByText('Defaults restored in the draft. Save to apply.', { exact: true }).waitFor();
  assert.equal(await page.locator('.nl-tag').count(), 37); assert.equal(saved.tags.length, 38);
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/settings-preview.png', import.meta.url)), fullPage: true });
  await page.evaluate(() => window.stopFilter()); assert.equal(await page.getByLabel('Value', { exact: true }).isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS browser: checkbox filter, drag/drop, accessible moves, database search, Full roles, save/cancel/defaults, cleanup and three responsive widths');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
