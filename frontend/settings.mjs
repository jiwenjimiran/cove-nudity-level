import { buckets, title, copy, moveTag, addTag, removeTag, setRole } from './model.mjs';

export function createSettingsPanel(React, api) {
  const { createElement: h, useEffect, useState } = React;
  function TagSearch({ settings, onChoose, onClose, label }) {
    const [q, setQ] = useState(''); const [page, setPage] = useState(1);
    const [result, setResult] = useState(null); const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      const controller = new AbortController(); setLoading(true); setResult(null); setError('');
      const timer = setTimeout(() => api(`/tags?q=${encodeURIComponent(q)}&page=${page}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResult(data); })
        .catch(err => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); }), 250);
      return () => { clearTimeout(timer); controller.abort(); };
    }, [q, page]);
    return h('section', { className: 'nl-search', 'aria-label': label },
      h('h4', null, label), h('label', null, 'Search all library tags', h('input', { type: 'search', value: q, autoFocus: true,
        onChange: e => { setQ(e.target.value); setPage(1); }, placeholder: 'Name or alias' })),
      loading && h('p', { role: 'status' }, 'Searching…'), error && h('p', { role: 'alert' }, error),
      result && h('ul', null, result.items.map(tag => {
        const existing = settings.tags.find(item => item.tagId === tag.id);
        return h('li', { key: tag.id }, h('button', { type: 'button', onClick: () => onChoose(tag) },
          tag.name, existing && ` (${title(existing.bucket)})`));
      })), result && result.items.length === 0 && h('p', null, 'No matching tags.'),
      h('div', { className: 'nl-actions' },
        h('button', { type: 'button', disabled: loading || page === 1, onClick: () => setPage(page - 1) }, 'Previous'),
        h('span', null, `Page ${page}`), h('button', { type: 'button', disabled: loading || !result?.hasMore, onClick: () => setPage(page + 1) }, 'Next'),
        h('button', { type: 'button', onClick: onClose }, 'Close search')));
  }
  return function NuditySettingsPanel() {
    const [saved, setSaved] = useState(null); const [draft, setDraft] = useState(null);
    const [canWrite, setCanWrite] = useState(false); const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(''); const [error, setError] = useState('');
    const [search, setSearch] = useState(null); const [ruleQ, setRuleQ] = useState('');
    useEffect(() => {
      const controller = new AbortController();
      api('/settings', { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) { setSaved(copy(data.settings)); setDraft(copy(data.settings)); setCanWrite(data.canWrite); }
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
      return () => controller.abort();
    }, []);
    async function save() {
      setBusy(true); setError(''); setMessage('');
      try { const data = await api('/settings', { method: 'PUT', body: JSON.stringify(draft) }); setSaved(copy(data)); setDraft(copy(data)); setMessage('Settings saved. New filter requests use these rules.'); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    async function defaults() {
      setBusy(true); setError(''); setMessage('');
      try { setDraft(await api('/defaults')); setSearch(null); setMessage('Defaults restored in the draft. Save to apply.'); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    if (!draft) return h('div', { className: 'nl-settings' }, error ? h('p', { role: 'alert' }, error) : h('p', { role: 'status' }, 'Loading nudity settings…'));
    const disabled = !canWrite || busy;
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    function update(next) { setDraft(next); setMessage(''); }
    function move(key, bucket) { update(moveTag(draft, key, bucket)); }
    return h('div', { className: 'nl-settings' },
      h('p', { className: 'nl-intro' }, 'Nudity level uses your configured AI tags first, with manual tags as a fallback when no applicable AI evidence exists. Scraper tags are ignored. The highest bucket wins unless the Full combination below matches. Pussy + Nipples and Asshole + Nipples are Full by default; Balls or Dick alone are also Full. Video tags can occur anywhere in the video.'),
      h('p', null, 'Unknown means no usable analysis or configured manual tags. None means analyzed with no Low-or-higher evidence, or only neutral manual tags. Neutral tags do not raise the level. Drag a tag to another group, or use its Move to control. Bucket moves preserve combination membership; removing a tag removes all its memberships.'),
      !canWrite && h('p', { role: 'status' }, 'These shared settings are read-only. An administrator can grant the Nudity Level settings-write permission.'),
      error && h('p', { role: 'alert', className: 'nl-error' }, error), message && h('p', { role: 'status' }, message),
      h('fieldset', { disabled, className: 'nl-editor' },
        h('legend', { className: 'nl-sr-only' }, 'Nudity classification settings'),
        h('div', { className: 'nl-groups' }, buckets.map(bucket => h('section', { key: bucket, className: `nl-group nl-${bucket}`, 'aria-label': `${title(bucket)} bucket`,
          onDragOver: e => { if (!disabled) e.preventDefault(); }, onDrop: e => {
            e.preventDefault(); const key = e.dataTransfer.getData('application/x-nudity-tag'); if (!disabled && draft.tags.some(t => t.key === key)) move(key, bucket);
          } }, h('div', { className: 'nl-group-heading' }, h('h3', null, title(bucket)),
            h('button', { type: 'button', onClick: () => setSearch({ bucket }), 'aria-label': `Add tag to ${title(bucket)}` }, 'Add tag')),
          h('ul', { className: 'nl-tags' }, draft.tags.filter(tag => tag.bucket === bucket).map(tag => h('li', { key: tag.key, className: 'nl-tag', draggable: !disabled,
            onDragStart: e => { e.dataTransfer.setData('application/x-nudity-tag', tag.key); e.dataTransfer.effectAllowed = 'move'; } },
            h('strong', null, tag.name), tag.missing && h('small', null, tag.tagId ? 'Deleted / unavailable tag' : 'Not yet in library'),
            (tag.genital || tag.nipple) && h('small', null, `Full rule: ${[tag.genital && 'genital', tag.nipple && 'nipple'].filter(Boolean).join(' + ')}`),
            h('div', { className: 'nl-tag-controls' }, h('select', { 'aria-label': `Move ${tag.name} to bucket`, value: bucket, onChange: e => move(tag.key, e.target.value) },
              buckets.map(value => h('option', { key: value, value }, title(value)))),
              h('button', { type: 'button', 'aria-label': `Remove ${tag.name}`, onClick: () => update(removeTag(draft, tag.key)) }, 'Remove')))))))),
        search && h(TagSearch, { key: `${search.bucket}:${search.role ?? ''}`, settings: draft, label: search.role ? `Add ${search.role} evidence` : `Add tag to ${title(search.bucket)}`,
          onClose: () => setSearch(null), onChoose: tag => { update(addTag(draft, tag, search.bucket, search.role)); setSearch(null); } }),
        h('section', { className: 'nl-full-rule' }, h('h3', null, 'Full combination rule'),
          h('label', null, h('input', { type: 'checkbox', checked: draft.combinationEnabled, onChange: e => update({ ...draft, combinationEnabled: e.target.checked }) }), 'Enable genital + nipple combination'),
          h('p', null, 'Any genital-evidence tag AND any nipple-evidence tag produces Full, regardless of their individual buckets. An empty set disables this combination. Tags in the Full bucket qualify independently.'),
          h('p', { role: 'status' }, `${draft.tags.filter(t => t.genital).length} genital tags; ${draft.tags.filter(t => t.nipple).length} nipple tags. ${!draft.combinationEnabled || !draft.tags.some(t => t.genital) || !draft.tags.some(t => t.nipple) ? 'Combination inactive.' : 'Combination active.'}`),
          h('div', { className: 'nl-actions' }, h('button', { type: 'button', onClick: () => setSearch({ bucket: 'high', role: 'genital' }) }, 'Add genital evidence'),
            h('button', { type: 'button', onClick: () => setSearch({ bucket: 'high', role: 'nipple' }) }, 'Add nipple evidence')),
          h('label', null, 'Find configured rule tags', h('input', { type: 'search', value: ruleQ, onChange: e => setRuleQ(e.target.value) })),
          h('div', { className: 'nl-rule-tags' }, draft.tags.filter(tag => tag.name.toLowerCase().includes(ruleQ.toLowerCase())).map(tag => h('div', { key: tag.key, className: 'nl-rule-row' },
            h('span', null, tag.name), ...['genital', 'nipple'].map(role => h('label', { key: role }, h('input', { type: 'checkbox', checked: tag[role],
              'aria-label': `${tag.name} ${role} evidence`, onChange: e => update(setRole(draft, tag.key, role, e.target.checked)) }), title(role))))))),
        h('div', { className: 'nl-actions' }, h('button', { type: 'button', disabled: !dirty, onClick: save }, busy ? 'Saving…' : 'Save'),
          h('button', { type: 'button', disabled: !dirty, onClick: () => { setDraft(copy(saved)); setSearch(null); setError(''); setMessage('Draft changes cancelled.'); } }, 'Cancel'),
          h('button', { type: 'button', onClick: defaults }, 'Restore defaults'), h('span', { role: 'status' }, dirty ? 'Unsaved changes' : 'Saved'))));
  };
}
