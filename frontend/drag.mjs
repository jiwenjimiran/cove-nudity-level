// Pointer-driven dragging keeps a real chip under the pointer, including on touch.
export function beginTagDrag(event, chip, onDrop) {
  if (event.button !== 0 || event.target.closest('[data-nl-remove]')) return () => {};
  const document = chip.ownerDocument, window = document.defaultView;
  const start = { x: event.clientX, y: event.clientY }, pointerId = event.pointerId;
  let active = false, preview, target, frame, x = start.x, y = start.y, offset;
  function clean() {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', keyboard); window.removeEventListener('blur', cancel);
    window.cancelAnimationFrame(frame); preview?.remove(); target?.classList.remove('nl-drop-target');
    chip.classList.remove('nl-drag-origin'); document.documentElement.classList.remove('nl-dragging');
  }
  function paint() {
    if (!active) return;
    preview.style.transform = `translate3d(${x - offset.x}px,${y - offset.y}px,0)`;
    const next = document.elementFromPoint(x, y)?.closest('[data-nl-bucket]');
    if (next !== target) { target?.classList.remove('nl-drop-target'); target = next; target?.classList.add('nl-drop-target'); }
    // Scroll the page while a chip is held near its top or bottom edge.
    const delta = y < 55 ? -12 : y > window.innerHeight - 55 ? 12 : 0;
    if (delta) window.scrollBy(0, delta);
    frame = window.requestAnimationFrame(paint);
  }
  function move(e) {
    if (e.pointerId !== pointerId) return;
    x = e.clientX; y = e.clientY;
    if (!active && Math.hypot(x - start.x, y - start.y) > 6) {
      active = true;
      const rect = chip.getBoundingClientRect(); offset = { x: start.x - rect.left, y: start.y - rect.top };
      preview = chip.cloneNode(true); preview.classList.add('nl-drag-preview'); preview.setAttribute('aria-hidden', 'true');
      preview.style.width = `${rect.width}px`; preview.style.height = `${rect.height}px`;
      preview.removeAttribute('id'); preview.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      document.body.append(preview); chip.classList.add('nl-drag-origin'); document.documentElement.classList.add('nl-dragging'); paint();
    }
    if (active) e.preventDefault();
  }
  function up(e) {
    if (e.pointerId !== pointerId) return;
    const bucket = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-nl-bucket]')?.dataset.nlBucket;
    clean(); if (active && bucket) onDrop(bucket);
  }
  function cancel() { clean(); }
  function keyboard(e) { if (e.key === 'Escape') { e.preventDefault(); clean(); } }
  document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel); document.addEventListener('keydown', keyboard); window.addEventListener('blur', cancel);
  return clean;
}
