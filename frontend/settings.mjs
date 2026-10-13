import { buckets, levels, title, copy, moveTag, addTag, removeTag, addRule, updateRule, toggleRuleTag, draftError } from './model.mjs';

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
  function RuleGroup({ settings, rule, index, update, search }) {
    const [q, setQ] = useState('');
    const selected = rule.groups[index];
    return h('fieldset', { className: 'nl-compound-group' }, h('legend', null, `Group ${index + 1}: match ANY selected tag`),
      h('p', null, selected.length ? selected.map(key => settings.tags.find(t => t.key === key)?.name ?? key).join(' OR ') : 'No tags selected'),
      h('label', null, 'Find configured tags', h('input', { type: 'search', value: q, 'aria-label': `Search ${rule.name} group ${index + 1}`, onChange: e => setQ(e.target.value) })),
      h('div', { className: 'nl-rule-tags' }, settings.tags.filter(tag => q ? tag.name.toLowerCase().includes(q.toLowerCase()) : selected.includes(tag.key)).map(tag =>
        h('label', { key: tag.key, className: 'nl-rule-row' }, h('input', { type: 'checkbox', checked: selected.includes(tag.key),
          'aria-label': `${tag.name} in ${rule.name} group ${index + 1}`, onChange: e => update(toggleRuleTag(settings, rule.key, index, tag.key, e.target.checked)) }), tag.name))),
      h('small', null, 'Search to add another configured tag, or search the whole library below.'),
      h('div', { className: 'nl-actions' }, h('button', { type: 'button', onClick: () => search({ bucket: 'neutral', ruleKey: rule.key, group: index }) }, 'Add library tag'),
        h('button', { type: 'button', onClick: () => update(updateRule(settings, rule.key, { groups: rule.groups.filter((_, i) => i !== index) })) }, 'Remove group')));
  }
  return function NuditySettingsPanel() {
    const [saved, setSaved] = useState(null); const [draft, setDraft] = useState(null);
    const [canWrite, setCanWrite] = useState(false); const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(''); const [error, setError] = useState('');
    const [search, setSearch] = useState(null);
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
    const validation = draftError(draft);
    function update(next) { setDraft(next); setMessage(''); }
    function move(key, bucket) { update(moveTag(draft, key, bucket)); }
    return h('div', { className: 'nl-settings' },
      h('p', { className: 'nl-intro' }, 'Nudity level combines body, positions, actions and BDSM tags. Explicit sex acts and sexual positions produce Full even without body analysis. AI evidence takes priority, with manual tags as a fallback; scraper tags are ignored. The highest individual bucket or matching compound-rule result wins. Pussy + Nipples and Asshole + Nipples are Full by default. Video tags can occur anywhere in the video.'),
      h('p', null, 'Unknown means no usable nudity evidence. Generic poses, camera angles, performer counts and non-specific bondage tags do not establish None by themselves. Completed body analysis can establish None. Drag a tag between buckets or use Move to. Bucket moves preserve rule membership; removing a tag removes its memberships and disables any rule left with an empty group.'),
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
            tag.bucket === 'neutral' && tag.establishesCoverage === false && h('small', null, 'No nudity signal'),
            draft.rules.some(rule => rule.groups.some(group => group.includes(tag.key))) && h('small', null,
              `Rules: ${draft.rules.filter(rule => rule.groups.some(group => group.includes(tag.key))).map(rule => rule.name).join(', ')}`),
            h('div', { className: 'nl-tag-controls' }, h('select', { 'aria-label': `Move ${tag.name} to bucket`, value: bucket, onChange: e => move(tag.key, e.target.value) },
              buckets.map(value => h('option', { key: value, value }, title(value)))),
              h('button', { type: 'button', 'aria-label': `Remove ${tag.name}`, onClick: () => update(removeTag(draft, tag.key)) }, 'Remove')))))))),
        search && h(TagSearch, { key: `${search.bucket}:${search.ruleKey ?? ''}:${search.group ?? ''}`, settings: draft,
          label: search.ruleKey ? 'Add tag to compound rule' : `Add tag to ${title(search.bucket)}`,
          onClose: () => setSearch(null), onChoose: tag => {
            let next = addTag(draft, tag, search.bucket, !!search.ruleKey);
            if (search.ruleKey) next = toggleRuleTag(next, search.ruleKey, search.group, next.tags.find(t => t.tagId === tag.id).key, true);
            update(next); setSearch(null);
          } }),
        h('section', { className: 'nl-full-rule' }, h('h3', null, 'Compound rules'),
          h('p', null, 'ALL groups must match; ANY selected tag within a group can match. For example: (Pussy OR Asshole) AND Nipples → Full. Results can raise a level but cannot lower stronger evidence. Add a library tag here to assign it Neutral and include it in the group without moving existing assignments.'),
          h('button', { type: 'button', disabled: draft.rules.length >= 100, onClick: () => update(addRule(draft)) }, 'Add compound rule'),
          draft.rules.map(rule => h('section', { key: rule.key, className: 'nl-compound-rule', 'aria-label': `${rule.name} rule` },
            h('div', { className: 'nl-actions' }, h('label', null, 'Name', h('input', { type: 'text', value: rule.name, maxLength: 256,
              'aria-label': `${rule.name} name`, onChange: e => update(updateRule(draft, rule.key, { name: e.target.value })) })),
              h('label', null, 'Result', h('select', { value: rule.level, 'aria-label': `${rule.name} target level`,
                onChange: e => update(updateRule(draft, rule.key, { level: e.target.value })) }, levels.slice(1).map(level => h('option', { key: level, value: level }, title(level))))),
              h('label', null, h('input', { type: 'checkbox', checked: rule.enabled, 'aria-label': `Enable ${rule.name}`,
                onChange: e => update(updateRule(draft, rule.key, { enabled: e.target.checked })) }), 'Enabled'),
              h('button', { type: 'button', onClick: () => { update({ ...draft, rules: draft.rules.filter(item => item.key !== rule.key) }); setSearch(null); } }, 'Remove rule')),
            h('div', { className: 'nl-compound-groups' }, rule.groups.map((_, index) => h(RuleGroup, { key: index, settings: draft, rule, index, update, search: setSearch }))),
            h('button', { type: 'button', disabled: rule.groups.length >= 20, onClick: () => update(updateRule(draft, rule.key, { groups: [...rule.groups, []] })) }, 'Add AND group')))),
        validation && h('p', { role: 'alert' }, validation),
        h('div', { className: 'nl-actions' }, h('button', { type: 'button', disabled: !dirty || !!validation, onClick: save }, busy ? 'Saving…' : 'Save'),
          h('button', { type: 'button', disabled: !dirty, onClick: () => { setDraft(copy(saved)); setSearch(null); setError(''); setMessage('Draft changes cancelled.'); } }, 'Cancel'),
          h('button', { type: 'button', onClick: defaults }, 'Restore defaults'), h('span', { role: 'status' }, dirty ? 'Unsaved changes' : 'Saved'))));
  };
}
