// Injected before load. Reports what the browser measured: overflow, clipping, target sizes, covered controls, styles.
export function auditHelpers() {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return (
      r.width > 0 &&
      r.height > 0 &&
      st.visibility !== 'hidden' &&
      st.display !== 'none' &&
      Number(st.opacity) > 0
    );
  };
  const name = (e) =>
    (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.alt || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || e.tagName.toLowerCase();
  const box = (r) => ({
    x: +r.x.toFixed(1),
    y: +r.y.toFixed(1),
    w: +r.width.toFixed(1),
    h: +r.height.toFixed(1)
  });
  const parseColor = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.99) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const contrast = (e) => {
    const fg = parseColor(getComputedStyle(e).color);
    if (!fg) return null;
    const a = lum(fg);
    const b = lum(bgOf(e));
    return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
  };
  const styleOf = (e) => {
    const s = getComputedStyle(e);
    return {
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      fontFamily: s.fontFamily.split(',')[0].replace(/"/g, ''),
      padding: s.padding,
      gap: s.gap,
      radius: s.borderRadius,
      color: s.color,
      background: s.backgroundColor,
      contrast: contrast(e),
      overflow: s.overflow,
      position: s.position,
      outline:
        s.outlineStyle === 'none'
          ? 'none'
          : `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
      boxShadow: s.boxShadow === 'none' ? 'none' : 'set'
    };
  };
  const INTERACTIVE =
    'button,a[href],input,select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox]';
  window.__capAudit = () => {
    const iw = document.documentElement.clientWidth;
    const ih = window.innerHeight;
    const all = [...document.querySelectorAll('body *')].filter(vis);
    const offenders = [];
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (r.right > iw + 1 || r.left < -1) {
        let scrolled = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
            scrolled = true;
            break;
          }
        }
        if (!scrolled) offenders.push({ el: e.tagName.toLowerCase(), name: name(e), ...box(r) });
      }
    }
    const clipped = [];
    for (const e of all) {
      if (e.children.length > 2 || !e.innerText?.trim()) continue;
      const s = getComputedStyle(e);
      const hid =
        s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis';
      if (hid && e.scrollWidth > e.clientWidth + 1)
        clipped.push({
          name: name(e),
          scrollWidth: e.scrollWidth,
          clientWidth: e.clientWidth,
          ellipsis: s.textOverflow === 'ellipsis'
        });
      const lc = parseInt(s.webkitLineClamp, 10);
      if (lc > 0 && e.scrollHeight > e.clientHeight + 1)
        clipped.push({ name: name(e), lineClamp: lc });
    }
    const inter = [...document.querySelectorAll(INTERACTIVE)].filter(vis);
    const small = [];
    for (const e of inter) {
      const t = (e.type || '').toLowerCase();
      if (t === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 44 || r.height < 44)
        small.push({
          name: name(e),
          el: e.tagName.toLowerCase(),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1)
        });
    }
    const covered = [];
    for (const e of inter) {
      const r = e.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cy < 0 || cy >= ih || cx < 0 || cx >= iw) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== e && !e.contains(top) && !top.contains(e))
        covered.push({ name: name(e), by: name(top).slice(0, 40) });
    }
    const sticky = all
      .filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position))
      .slice(0, 8)
      .map((e) => ({
        el: e.tagName.toLowerCase(),
        pos: getComputedStyle(e).position,
        name: name(e).slice(0, 40),
        ...box(e.getBoundingClientRect())
      }));
    const images = [...document.images].filter(vis).map((i) => {
      const r = i.getBoundingClientRect();
      return {
        alt: i.alt?.slice(0, 40) ?? '',
        broken: i.complete && i.naturalWidth === 0,
        scale: i.naturalWidth ? +(r.width / i.naturalWidth).toFixed(2) : null,
        ...box(r)
      };
    });
    const bgBroken = [];
    const lowContrast = [];
    for (const e of all) {
      if (
        !e.childNodes.length ||
        ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      )
        continue;
      const c = contrast(e);
      const s = getComputedStyle(e);
      const large =
        parseFloat(s.fontSize) >= 24 ||
        (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
      if (c !== null && c < (large ? 3 : 4.5))
        lowContrast.push({ name: name(e), contrast: c, fontSize: s.fontSize, color: s.color });
    }
    return {
      viewport: { w: iw, h: ih, dpr: window.devicePixelRatio },
      overflowX: document.documentElement.scrollWidth - iw,
      docHeight: document.documentElement.scrollHeight,
      offenders: offenders.slice(0, 12),
      clipped: clipped.slice(0, 15),
      smallTargetCount: small.length,
      smallTargets: small.slice(0, 15),
      covered: covered.slice(0, 12),
      sticky,
      images: images.slice(0, 12),
      brokenImages: images.filter((i) => i.broken).length + bgBroken.length,
      lowContrast: lowContrast.slice(0, 12),
      lowContrastCount: lowContrast.length,
      focused:
        document.activeElement && document.activeElement !== document.body
          ? {
              name: name(document.activeElement),
              ...styleOf(document.activeElement),
              ...box(document.activeElement.getBoundingClientRect())
            }
          : null,
      heading:
        [...document.querySelectorAll('h1')]
          .filter(vis)
          .map((e) => e.innerText.trim().slice(0, 70))[0] ?? null,
      dialog: document.querySelector('[role=dialog]')
        ? box(document.querySelector('[role=dialog]').getBoundingClientRect())
        : null
    };
  };
  window.__capMeasure = () => {
    const pick = [
      ['h1', 'h1', 1],
      ['h2', 'h2', 3],
      ['header', 'header', 1],
      ['rail', 'aside', 1],
      ['main', 'main', 1],
      ['nav', 'nav', 2],
      ['dialog', '[role=dialog]', 1],
      ['button', 'main button, [role=dialog] button', 10],
      ['input', 'input:not([type=hidden]),select,textarea', 8],
      ['tab', '[role=tab]', 4],
      ['image', 'img', 3],
      ['status', '[role=status],[role=alert]', 2],
      ['table', 'table', 1]
    ];
    const out = [];
    for (const [kind, sel, max] of pick) {
      let n = 0;
      for (const e of document.querySelectorAll(sel)) {
        if (!vis(e)) continue;
        out.push({ kind, name: name(e), ...box(e.getBoundingClientRect()), ...styleOf(e) });
        if (++n >= max) break;
      }
    }
    return out;
  };
  window.__capSettled = async () => {
    await document.fonts.ready;
    const imgs = [...document.images];
    await Promise.race([
      Promise.all(
        imgs
          .filter((i) => !i.complete)
          .map(
            (i) =>
              new Promise((r) => {
                i.onload = r;
                i.onerror = r;
              })
          )
      ),
      new Promise((r) => setTimeout(r, 900))
    ]);
    await Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {}))
      ),
      // Short on purpose: a message lasts about 2.5 seconds and must still be on screen in the shot.
      new Promise((r) => setTimeout(r, 450))
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  };
}
