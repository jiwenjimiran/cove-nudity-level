import { levels, title, decodeLevels, encodeLevels } from './model.mjs';
export function watchNudityFilters(document) {
  const window = document.defaultView;
  const editors = new Map();
  function scan() {
    for (const [input, editor] of editors) if (!input.isConnected || !input.closest('[role="tabpanel"][aria-label="Nudity level"]')) {
      editor.remove(); editors.delete(input);
    }
    for (const panel of document.querySelectorAll('[role="tabpanel"][aria-label="Nudity level"]')) {
      for (const input of panel.querySelectorAll('input[aria-label="Value"]')) {
        if (editors.has(input)) { editors.get(input).sync(); continue; }
        const native = input.parentElement?.parentElement;
        if (!native || !panel.contains(native)) continue;
        const editor = document.createElement('fieldset');
        editor.className = 'nl-filter';
        const legend = document.createElement('legend'); legend.textContent = 'Match any selected nudity level'; editor.append(legend);
        const boxes = new Map(); let lastValue = input.value;
        for (const level of levels) {
          const label = document.createElement('label'); const box = document.createElement('input');
          box.type = 'checkbox'; box.value = level; box.checked = decodeLevels(input.value).includes(level);
          box.addEventListener('change', () => {
            const value = encodeLevels([...boxes].filter(([, control]) => control.checked).map(([key]) => key));
            lastValue = value;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
            input.dispatchEvent(new window.Event('input', { bubbles: true }));
          });
          label.append(box, document.createTextNode(title(level))); editor.append(label); boxes.set(level, box);
        }
        editor.sync = () => {
          if (lastValue === input.value) return;
          lastValue = input.value;
          for (const [level, box] of boxes) box.checked = decodeLevels(input.value).includes(level);
        };
        native.classList.add('nl-native-editor'); native.after(editor);
        const equals = native.querySelector('button[data-modifier="EQUALS"]');
        if (equals?.getAttribute('aria-pressed') === 'false') equals.click();
        if (document.activeElement === input) boxes.values().next().value.focus();
        editor.remove = () => { native.classList.remove('nl-native-editor'); window.Element.prototype.remove.call(editor); };
        editors.set(input, editor);
      }
    }
  }
  const observer = new window.MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
  const timer = window.setInterval(scan, 200); scan();
  return { stop() { observer.disconnect(); window.clearInterval(timer); for (const editor of editors.values()) editor.remove(); editors.clear(); } };
}
