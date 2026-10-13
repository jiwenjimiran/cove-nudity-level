export const buckets = ['neutral', 'low', 'medium', 'high', 'full'];
export const levels = ['unknown', 'none', 'low', 'medium', 'high', 'full'];
export const title = text => text[0].toUpperCase() + text.slice(1);
export const copy = value => structuredClone(value);
export function moveTag(settings, key, bucket) {
  if (!buckets.includes(bucket)) throw new Error('Invalid bucket');
  return { ...settings, tags: settings.tags.map(tag => tag.key === key ? { ...tag, bucket } : tag) };
}
export function addTag(settings, tag, bucket, role = null) {
  const existing = settings.tags.find(item => item.tagId === tag.id || item.tagId == null && item.name.toLowerCase() === tag.name.toLowerCase());
  const next = { ...(existing ?? { key: `tag:${tag.id}`, genital: false, nipple: false }), tagId: tag.id, name: tag.name, missing: false,
    bucket: role && existing ? existing.bucket : bucket, ...(role ? { [role]: true } : {}) };
  return { ...settings, tags: existing ? settings.tags.map(item => item.key === existing.key ? next : item) : [...settings.tags, next] };
}
export function removeTag(settings, key) { return { ...settings, tags: settings.tags.filter(tag => tag.key !== key) }; }
export function setRole(settings, key, role, checked) {
  return { ...settings, tags: settings.tags.map(tag => tag.key === key ? { ...tag, [role]: checked } : tag) };
}
export function decodeLevels(value = '') { return levels.filter(level => value.split(',').includes(level)); }
export function encodeLevels(selected) { return levels.filter(level => selected.includes(level)).join(','); }
