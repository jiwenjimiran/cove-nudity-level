export const buckets = ['neutral', 'low', 'medium', 'high', 'full'];
export const levels = ['unknown', 'none', 'low', 'medium', 'high', 'full'];
export const title = text => text[0].toUpperCase() + text.slice(1);
export const copy = value => structuredClone(value);
export function moveTag(settings, key, bucket) {
  if (!buckets.includes(bucket)) throw new Error('Invalid bucket');
  return { ...settings, tags: settings.tags.map(tag => tag.key === key ? { ...tag, bucket } : tag) };
}
export function addTag(settings, tag, bucket, preserveBucket = false) {
  const existing = settings.tags.find(item => item.tagId === tag.id || item.tagId == null && item.name.toLowerCase() === tag.name.toLowerCase());
  const next = { ...(existing ?? { key: `tag:${tag.id}`, establishesCoverage: bucket !== 'neutral' }), tagId: tag.id, name: tag.name, missing: false,
    bucket: preserveBucket && existing ? existing.bucket : bucket };
  return { ...settings, tags: existing ? settings.tags.map(item => item.key === existing.key ? next : item) : [...settings.tags, next] };
}
export function removeTag(settings, key) { return { ...settings, tags: settings.tags.filter(tag => tag.key !== key),
  rules: (settings.rules ?? []).map(rule => {
    const groups = rule.groups.map(group => group.filter(item => item !== key));
    return { ...rule, groups, enabled: rule.enabled && groups.every(group => group.length > 0) };
  }) }; }
export function updateRule(settings, key, changes) {
  return { ...settings, rules: settings.rules.map(rule => rule.key === key ? { ...rule, ...changes } : rule) };
}
export function toggleRuleTag(settings, key, index, tagKey, checked) {
  const rule = settings.rules.find(rule => rule.key === key);
  const groups = rule.groups.map((group, i) => i !== index ? group : checked ? [...new Set([...group, tagKey])] : group.filter(item => item !== tagKey));
  return updateRule(settings, key, { groups });
}
export function addRule(settings) {
  return { ...settings, rules: [...settings.rules, { key: `rule:${crypto.randomUUID()}`, name: 'New rule', level: 'full', enabled: false, groups: [[], []] }] };
}
export function draftError(settings) {
  if (settings.rules.some(rule => !rule.name.trim())) return 'Give every compound rule a name.';
  if (settings.rules.some(rule => rule.enabled && (!rule.groups.length || rule.groups.some(group => !group.length))))
    return 'Enabled rules need a tag in every group. Select tags or disable the incomplete rule.';
  return '';
}
export function decodeLevels(value = '') { return levels.filter(level => value.split(',').includes(level)); }
export function encodeLevels(selected) { return levels.filter(level => selected.includes(level)).join(','); }
