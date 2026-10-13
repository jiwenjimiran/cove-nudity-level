import { buckets, levels, title, copy, moveTag, addTag, removeTag, addRule, updateRule, toggleRuleTag, draftError } from './model.mjs';
import { beginTagDrag } from './drag.mjs';

export function createSettingsPanel(React, api) {
  const { createElement: h, useEffect, useState, useRef } = React;
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
    const [adding, setAdding] = useState(false), [q, setQ] = useState('');
    const selected = rule.groups[index];
    return h('div', { className: 'nl-condition' },
      h('div', { className: 'nl-condition-heading' }, h('span', { className: 'nl-eyebrow' }, index === 0 ? 'WHEN' : 'AND'),
        h('span', null, 'Any of these tags'), h('button', { type: 'button', className: 'nl-icon-button',
          'aria-label': `Remove condition ${index + 1} from ${rule.name}`,
          onClick: () => update(updateRule(settings, rule.key, { groups: rule.groups.filter((_, i) => i !== index) })) }, '×')),
      h('div', { className: 'nl-condition-tags' }, selected.map(key => {
        const tag = settings.tags.find(t => t.key === key);
        return h('span', { key, className: 'nl-token' }, tag?.name ?? key,
          h('button', { type: 'button', className: 'nl-token-remove', 'aria-label': `Remove ${tag?.name ?? key} from ${rule.name} group ${index + 1}`,
            onClick: () => update(toggleRuleTag(settings, rule.key, index, key, false)) }, '×'));
      }), selected.length === 0 && h('span', { className: 'nl-empty' }, 'Choose a tag to start this condition'),
      h('button', { type: 'button', className: 'nl-add-token', onClick: () => setAdding(!adding), 'aria-expanded': adding,
        'aria-label': `Add alternative to ${rule.name} group ${index + 1}` }, '+ Add tag')),
      adding && h('div', { className: 'nl-picker' },
        h('input', { type: 'search', value: q, autoFocus: true, placeholder: 'Find a configured tag…',
          'aria-label': `Search ${rule.name} group ${index + 1}`, onChange: e => setQ(e.target.value) }),
        h('div', { className: 'nl-picker-results' }, settings.tags.filter(tag => !selected.includes(tag.key) && tag.name.toLowerCase().includes(q.toLowerCase())).map(tag =>
          h('button', { key: tag.key, type: 'button', 'aria-label': `Add ${tag.name} to ${rule.name} group ${index + 1}`,
            onClick: () => { update(toggleRuleTag(settings, rule.key, index, tag.key, true)); setAdding(false); setQ(''); } }, tag.name))),
        h('button', { type: 'button', className: 'nl-text-button', onClick: () => { setAdding(false); search({ bucket: 'neutral', ruleKey: rule.key, group: index }); } }, 'Search the entire library →')));
  }
  function RuleSummary({ settings, rule }) {
    return h('div', { className: 'nl-rule-expression' }, rule.groups.map((group, index) => h(React.Fragment, { key: index },
      index > 0 && h('span', { className: 'nl-operator' }, 'AND'),
      h('span', { className: 'nl-summary-group' }, group.length === 0 ? h('span', { className: 'nl-empty' }, 'No tags yet') :
        group.slice(0, 3).map((key, i) => h(React.Fragment, { key }, i > 0 && h('span', { className: 'nl-or' }, 'or'),
          h('span', null, settings.tags.find(t => t.key === key)?.name ?? key))),
        group.length > 3 && h('span', { className: 'nl-more', title: group.slice(3).map(key => settings.tags.find(t => t.key === key)?.name ?? key).join(', ') }, `+${group.length - 3} more`)))),
      h('span', { className: 'nl-result-arrow', 'aria-hidden': true }, '→'), h('span', { className: `nl-level-pill nl-${rule.level}` }, title(rule.level)));
  }
  return function NuditySettingsPanel() {
    const [saved, setSaved] = useState(null), [draft, setDraft] = useState(null);
    const [canWrite, setCanWrite] = useState(false), [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(''), [error, setError] = useState('');
    const [search, setSearch] = useState(null), [editing, setEditing] = useState(null), [collapsed, setCollapsed] = useState(new Set());
    const dragCleanup = useRef(null), panelId = React.useId();
    useEffect(() => () => dragCleanup.current?.(), []);
    useEffect(() => { if (busy || !canWrite) dragCleanup.current?.(); }, [busy, canWrite]);
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
      try { setDraft(await api('/defaults')); setSearch(null); setEditing(null); setMessage('Defaults restored in the draft. Save to apply.'); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    if (!draft) return h('div', { className: 'nl-settings' }, error ? h('p', { role: 'alert' }, error) : h('p', { role: 'status' }, 'Loading nudity settings…'));
    const disabled = !canWrite || busy, dirty = JSON.stringify(draft) !== JSON.stringify(saved), validation = draftError(draft);
    function update(next) { setDraft(next); setMessage(''); }
    function move(key, bucket) { update(moveTag(draft, key, bucket)); }
    function collapse(bucket) { setCollapsed(current => { const next = new Set(current); next.has(bucket) ? next.delete(bucket) : next.add(bucket); return next; }); }
    const descriptions = { neutral: 'No increase in nudity', low: 'Limited exposure', medium: 'Partial nudity', high: 'Intimate exposure', full: 'Full nudity or explicit sex' };
    return h('div', { className: 'nl-settings' },
      h('div', { className: 'nl-intro' }, h('span', { className: 'nl-eyebrow' }, 'YOUR CLASSIFICATION RULES'),
        h('p', null, 'AI tags first. The highest matching level wins.'),
        h('span', null, 'Drag tags between levels to shape your defaults. Compound rules let combinations produce a specific level.'),
        h('details', { className: 'nl-explanation' }, h('summary', null, 'How classification works'),
          h('p', null, 'Body, positions, actions and BDSM tags all contribute. Explicit sex defaults to Full even without body analysis. AI evidence takes priority; manual tags are the fallback, and scraper tags are ignored. Generic poses and equipment alone stay Unknown. Completed body analysis can establish None. Video tags may appear anywhere in the item.'),
          h('p', null, 'Moving a tag preserves its rule memberships. Removing it removes those memberships and disables rules left with an empty condition. The highest individual or compound result always wins.'))),
      !canWrite && h('p', { role: 'status' }, 'These shared settings are read-only. An administrator can grant the Nudity Level settings-write permission.'),
      error && h('p', { role: 'alert', className: 'nl-error' }, error), message && h('p', { role: 'status' }, message),
      h('fieldset', { disabled, className: 'nl-editor' }, h('legend', { className: 'nl-sr-only' }, 'Nudity classification settings'),
        h('div', { className: 'nl-section-heading' }, h('div', null, h('h3', null, 'Tag levels'), h('p', null, 'One tag, one level. Drop onto any row, even when it is closed.')),
          h('button', { type: 'button', className: 'nl-text-button', onClick: () => setCollapsed(collapsed.size === buckets.length ? new Set() : new Set(buckets)) }, collapsed.size === buckets.length ? 'Expand all' : 'Collapse all')),
        h('div', { className: 'nl-groups' }, buckets.map(bucket => {
          const tags = draft.tags.filter(tag => tag.bucket === bucket), closed = collapsed.has(bucket);
          return h('section', { key: bucket, className: `nl-group nl-${bucket}`, 'aria-label': `${title(bucket)} bucket`, 'data-nl-bucket': bucket },
            h('div', { className: 'nl-group-heading' },
              h('button', { type: 'button', className: 'nl-bucket-toggle', 'aria-label': `Toggle ${title(bucket)} bucket`, 'aria-expanded': !closed, 'aria-controls': `${panelId}-${bucket}`,
                onClick: () => collapse(bucket) }, h('span', { className: 'nl-chevron', 'aria-hidden': true }, closed ? '›' : '⌄'),
                h('span', { className: 'nl-dot', 'aria-hidden': true }), h('strong', null, title(bucket)), h('span', { className: 'nl-count' }, tags.length), h('span', { className: 'nl-bucket-description' }, descriptions[bucket])),
              h('button', { type: 'button', className: 'nl-text-button', onClick: () => setSearch({ bucket }), 'aria-label': `Add tag to ${title(bucket)}` }, '+ Add tag')),
            h('ul', { id: `${panelId}-${bucket}`, className: 'nl-tags', hidden: closed }, tags.map(tag => {
              const memberships = draft.rules.filter(rule => rule.groups.some(group => group.includes(tag.key))).map(rule => rule.name);
              const hint = [tag.missing && (tag.tagId ? 'Unavailable tag' : 'Not yet in library'), tag.bucket === 'neutral' && tag.establishesCoverage === false && 'No nudity signal', memberships.length && `Rules: ${memberships.join(', ')}`, 'Drag to move. Keyboard: Alt + Up/Down moves between levels.'].filter(Boolean).join(' · ');
              return h('li', { key: tag.key, className: 'nl-tag', title: hint,
                onPointerDown: e => { if (!disabled) { dragCleanup.current?.(); dragCleanup.current = beginTagDrag(e.nativeEvent, e.currentTarget, bucket => move(tag.key, bucket)); } } },
                h('span', { className: 'nl-tag-name', tabIndex: disabled ? -1 : 0, role: 'button', 'aria-label': `Move ${tag.name}`,
                  onKeyDown: e => { if (!disabled && e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault(); const next = buckets[buckets.indexOf(bucket) + (e.key === 'ArrowUp' ? -1 : 1)]; if (next) move(tag.key, next);
                  } } }, tag.name), memberships.length > 0 && h('span', { className: 'nl-member-dot', 'aria-hidden': true }),
                h('button', { type: 'button', className: 'nl-token-remove', 'data-nl-remove': true, 'aria-label': `Remove ${tag.name}`, onClick: () => update(removeTag(draft, tag.key)) }, '×'));
            })), !closed && tags.length === 0 && h('p', { className: 'nl-empty nl-empty-bucket' }, 'Drop a tag here or add one from your library.'));
        })),
        search && h(TagSearch, { key: `${search.bucket}:${search.ruleKey ?? ''}:${search.group ?? ''}`, settings: draft,
          label: search.ruleKey ? 'Add tag to compound rule' : `Add tag to ${title(search.bucket)}`, onClose: () => setSearch(null), onChoose: tag => {
            let next = addTag(draft, tag, search.bucket, !!search.ruleKey);
            if (search.ruleKey) next = toggleRuleTag(next, search.ruleKey, search.group, next.tags.find(t => t.tagId === tag.id).key, true);
            update(next); setSearch(null);
          } }),
        h('section', { className: 'nl-rules-section' },
          h('div', { className: 'nl-section-heading' }, h('div', null, h('h3', null, 'Compound rules'), h('p', null, 'Match every condition. Any tag inside a condition can satisfy it.')),
            h('button', { type: 'button', disabled: draft.rules.length >= 100, onClick: () => { const next = addRule(draft); update(next); setEditing(next.rules.at(-1).key); } }, '+ New rule')),
          draft.rules.length === 0 && h('p', { className: 'nl-empty' }, 'No compound rules. Individual tag levels still apply.'),
          draft.rules.map(rule => h('section', { key: rule.key, className: `nl-rule-card ${editing === rule.key ? 'nl-rule-editing' : ''}`, 'aria-label': `${rule.name} rule` },
            h('div', { className: 'nl-rule-heading' }, h('div', null, h('h4', null, rule.name || 'Untitled rule'), h('span', { className: 'nl-rule-status' }, rule.enabled ? 'Active' : 'Paused')),
              h('div', { className: 'nl-actions' }, h('label', { className: 'nl-switch' }, h('input', { type: 'checkbox', checked: rule.enabled, 'aria-label': `Enable ${rule.name}`,
                onChange: e => update(updateRule(draft, rule.key, { enabled: e.target.checked })) }), h('span', { 'aria-hidden': true })),
                h('button', { type: 'button', className: 'nl-text-button', 'aria-label': `Edit ${rule.name}`, 'aria-expanded': editing === rule.key,
                  onClick: () => { setEditing(editing === rule.key ? null : rule.key); setSearch(null); } }, editing === rule.key ? 'Done' : 'Edit'))),
            editing !== rule.key ? h(RuleSummary, { settings: draft, rule }) : h('div', { className: 'nl-rule-editor' },
              h('label', { className: 'nl-field' }, 'Rule name', h('input', { type: 'text', value: rule.name, maxLength: 256, 'aria-label': `${rule.name} name`,
                onChange: e => update(updateRule(draft, rule.key, { name: e.target.value })) })),
              h('div', { className: 'nl-conditions' }, rule.groups.map((_, index) => h(RuleGroup, { key: index, settings: draft, rule, index, update, search: setSearch }))),
              h('button', { type: 'button', className: 'nl-text-button', disabled: rule.groups.length >= 20, onClick: () => update(updateRule(draft, rule.key, { groups: [...rule.groups, []] })) }, '+ Add condition'),
              h('div', { className: 'nl-rule-outcome' }, h('span', { className: 'nl-eyebrow' }, 'THEN'), h('span', null, 'Set nudity level to'),
                h('select', { value: rule.level, 'aria-label': `${rule.name} target level`, onChange: e => update(updateRule(draft, rule.key, { level: e.target.value })) },
                  levels.slice(1).map(level => h('option', { key: level, value: level }, title(level))))),
              h('button', { type: 'button', className: 'nl-delete-rule', 'aria-label': `Delete ${rule.name}`, onClick: () => { update({ ...draft, rules: draft.rules.filter(item => item.key !== rule.key) }); setEditing(null); setSearch(null); } }, 'Delete rule'))))),
        validation && h('p', { role: 'alert', className: 'nl-error' }, validation),
        h('div', { className: 'nl-savebar' }, h('span', { role: 'status' }, dirty ? 'Unsaved changes' : 'All changes saved'),
          h('div', { className: 'nl-actions' }, h('button', { type: 'button', className: 'nl-text-button', onClick: defaults }, 'Restore defaults'),
            h('button', { type: 'button', disabled: !dirty, onClick: () => { setDraft(copy(saved)); setEditing(null); setSearch(null); setError(''); setMessage('Draft changes cancelled.'); } }, 'Cancel'),
            h('button', { type: 'button', className: 'nl-primary', disabled: !dirty || !!validation, onClick: save }, busy ? 'Saving…' : 'Save')))));
  };
}
