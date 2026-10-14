const clamp = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function splitWords(el) {
  const words = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(part);
            continue;
          }
          const outer = document.createElement('span');
          outer.className = 'w';
          const inner = document.createElement('span');
          inner.textContent = part;
          outer.append(inner);
          frag.append(outer);
          words.push(inner);
        }
        child.replaceWith(frag);
      } else {
        walk(child);
      }
    }
  };
  walk(el);
  return words;
}

/* Staggered reveal of the hero copy. set(amount) drives it directly (used by the
   scroll animation on portrait screens); play() animates it in over time. */
export function initHeroCopy(hero) {
  const inner = hero.querySelector('.hero-inner');
  const items = [];
  for (const el of inner.children) {
    if (el.tagName === 'H1') for (const w of splitWords(el)) items.push({ el: w, word: true });
    else items.push({ el, word: false });
  }
  const step = 0.55 / (items.length - 1);
  let amount = -1;
  let playing = 0;

  function set(v) {
    v = clamp(v);
    if (v === amount) return;
    amount = v;
    items.forEach((item, i) => {
      const l = easeOut(clamp((v - i * step) / 0.45));
      if (item.word) item.el.style.transform = l < 1 ? `translateY(${(1 - l) * 105}%)` : '';
      else {
        item.el.style.opacity = l < 1 ? l.toFixed(3) : '';
        item.el.style.transform = l < 1 ? `translateY(${((1 - l) * 22).toFixed(1)}px)` : '';
      }
    });
    hero.style.setProperty('--hero-copy', v.toFixed(3));
    hero.classList.toggle('copy-hidden', v < 0.6);
    // iOS Safari can leave faded copy painted after a fast scroll back up, so fully hide it at 0
    hero.classList.toggle('copy-off', v === 0);
    hero.classList.add('copy-ready');
  }

  function play(duration = 1700) {
    if (playing || amount >= 1) return;
    const from = Math.max(0, amount);
    const t0 = performance.now();
    const tick = (now) => {
      if (!playing) return;
      const v = from + (1 - from) * clamp((now - t0) / duration);
      set(v);
      playing = v < 1 ? requestAnimationFrame(tick) : 0;
    };
    playing = requestAnimationFrame(tick);
  }

  function drive(v) {
    if (playing) cancelAnimationFrame(playing);
    playing = 0;
    set(v);
  }

  set(0);
  return { set: drive, play };
}
