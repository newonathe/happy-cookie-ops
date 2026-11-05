// Injected into each page before load. Reads the DOM and clicks like a person; it never touches app internals.
export function pageHelpers() {
  const SEL =
    'button,a[href],[role=button],[role=tab],[role=switch],[role=checkbox],summary,input[type=checkbox],input[type=radio]';
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const label = (e) =>
    (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) ||
    e.getAttribute('name') ||
    e.tagName;
  const inRoot = () => document.querySelector('[role=dialog]') ?? document;
  window.__capControls = () => {
    const seen = {};
    return [...inRoot().querySelectorAll(SEL)].filter(vis).map((e) => {
      const l = label(e);
      seen[l] = (seen[l] ?? 0) + 1;
      return {
        label: l,
        idx: seen[l] - 1,
        tag: e.tagName,
        disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
        rail: !!e.closest('nav,aside')
      };
    });
  };
  window.__capFind = (lbl, idx) => {
    const seen = {};
    for (const e of [...inRoot().querySelectorAll(SEL)].filter(vis)) {
      const l = label(e);
      seen[l] = (seen[l] ?? 0) + 1;
      if (l === lbl && seen[l] - 1 === idx) return e;
    }
    return null;
  };
  window.__capClick = (lbl, idx) => {
    const e = window.__capFind(lbl, idx);
    if (!e) return null;
    // Scroll only when a person would have to: keep the page where it is if the control is already in view.
    const before = e.getBoundingClientRect();
    const clear = before.top >= 72 && before.bottom <= window.innerHeight - 96;
    if (!clear) e.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  window.__capInputs = () =>
    [...document.querySelectorAll('input,select,textarea')].filter(vis).map((e) => ({
      tag: e.tagName,
      type: e.type,
      label: (
        e.labels?.[0]?.innerText ||
        e.getAttribute('aria-label') ||
        e.placeholder ||
        e.name ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60),
      value: e.type === 'password' ? '' : String(e.value).slice(0, 40)
    }));
  window.__capFill = () => {
    const set = (el, v) => {
      const proto =
        el.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : el.tagName === 'SELECT'
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let n = 0;
    for (const el of inRoot().querySelectorAll('input,textarea,select')) {
      if (!vis(el) || el.disabled || el.readOnly) continue;
      const t = (el.type || '').toLowerCase();
      if (['checkbox', 'radio', 'file', 'hidden', 'search'].includes(t)) continue;
      if (el.tagName === 'SELECT') {
        if (!el.value && el.options.length > 1) {
          set(el, el.options[1].value);
          n++;
        }
        continue;
      }
      if (el.value) continue;
      const hint = (
        el.name +
        ' ' +
        el.placeholder +
        ' ' +
        (el.labels?.[0]?.innerText ?? '') +
        ' ' +
        (el.getAttribute('aria-label') ?? '')
      ).toLowerCase();
      let v = 'Sample text';
      if (
        t === 'number' ||
        el.inputMode === 'numeric' ||
        el.inputMode === 'decimal' ||
        /qty|count|peso|₱|price|amount|counted|how many|cookies|paid/.test(hint)
      )
        v = '5';
      if (t === 'date') v = '2026-11-14';
      if (t === 'time') v = '10:00';
      if (t === 'tel' || /mobile|phone/.test(hint)) v = '09170000000';
      if (t === 'email') v = 'sample@synthetic.invalid';
      if (t === 'password') v = 'synthetic-test-value';
      set(el, v);
      n++;
    }
    return n;
  };
  window.__capSig = () => {
    const txt = (e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 70);
    const dialog = document.querySelector('[role=dialog]');
    const heads = [...(dialog ?? document.body).querySelectorAll('h1,h2,h3')].filter(vis).map(txt);
    const h1 = [...document.querySelectorAll('h1')].filter(vis).map(txt)[0] ?? '';
    const dt = dialog
      ? (
          dialog.getAttribute('aria-label') ||
          dialog.querySelector('h1,h2,h3')?.innerText ||
          'dialog'
        )
          .trim()
          .slice(0, 60)
      : '';
    const inputs = [...document.querySelectorAll('input,select,textarea')].filter(vis).length;
    const alerts = [...document.querySelectorAll('[role=alert],[role=status]')]
      .filter(vis)
      .map(txt)
      .filter(Boolean)
      .slice(0, 3);
    return {
      screen: window.__hcOps?.state?.screen ?? null,
      url: location.pathname,
      h1,
      dt,
      heads: heads.slice(0, 12),
      inputs,
      alerts
    };
  };
}
