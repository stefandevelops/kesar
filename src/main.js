import Lenis from 'lenis';
import { BRANCHES, MENU, CATEGORIES, ALLERGENS, OFFERS, ORDER_RULES as R } from './data.js';
import { cart } from './cart.js';
import { initHeroCopy } from './heroCopy.js';
import { belfastNow, branchStatus, orderSlots, bookingSlots, formatTime, dayName, isoDate, addDays, toMinutes } from './time.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => `£${n.toFixed(2)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const telHref = (p) => `tel:+44${p.replace(/\s/g, '').slice(1)}`;
const IMG = 'img/';

const state = {
  branchId: localStorage.getItem('kesar-branch'),
  mode: sessionStorage.getItem('kesar-mode') || 'collection',
  postcode: sessionStorage.getItem('kesar-postcode') || '',
  diet: new Set(),
};
const currentBranch = () => BRANCHES.find((b) => b.id === state.branchId) || null;

/* ---------- smooth scroll ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.1 });
if (lenis) {
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
const hero = $('.hero');
const heroCopy = initHeroCopy(hero);
if (reduceMotion) heroCopy.set(1);
else {
  if (!matchMedia('(max-aspect-ratio: 9 / 10)').matches) heroCopy.play();
  import('./poppadom.js')
    .then(async (m) => (await m.initPoppadom(hero, heroCopy)) || heroCopy.play())
    .catch(() => heroCopy.play());
}

const headerOffset = () => $('#header').offsetHeight + 12;
function scrollToTarget(target) {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -headerOffset(), duration: 1.1 });
  else scrollTo({ top: el.getBoundingClientRect().top + scrollY - headerOffset() });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  e.preventDefault();
  closeMenu();
  scrollToTarget(a.getAttribute('href'));
});

/* ---------- header ---------- */
const header = $('#header');
const setHeaderVar = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
addEventListener('resize', setHeaderVar);
setHeaderVar();
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });

const menuBtn = $('#menu-btn');
const nav = $('#nav');
function closeMenu() {
  nav.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.textContent = 'Menu';
}
menuBtn.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'Close' : 'Menu';
});

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- dialogs ---------- */
$$('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-dialog-close]')) d.close();
  });
});

/* ---------- branch selection ---------- */
const branchDialog = $('#branch-dialog');
function renderBranchOptions() {
  const now = belfastNow();
  $('#branch-options').innerHTML = BRANCHES.map((b) => {
    const s = branchStatus(b, now);
    return `<button type="button" class="branch-option ${b.id === state.branchId ? 'selected' : ''}" data-branch="${b.id}">
      <span><b>${b.name}</b> · ${b.area}</span>
      <span class="status ${s.open ? 'open' : ''}">${s.text}</span>
    </button>`;
  }).join('');
}
function openBranchDialog() {
  renderBranchOptions();
  branchDialog.showModal();
}
$('#branch-btn').addEventListener('click', openBranchDialog);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-branches]')) openBranchDialog();
  const pick = e.target.closest('[data-branch]');
  if (pick) {
    setBranch(pick.dataset.branch);
    if (branchDialog.open) branchDialog.close();
    toast(`Kesar ${currentBranch().name} is now your restaurant`);
  }
});

function setBranch(id) {
  state.branchId = id;
  localStorage.setItem('kesar-branch', id);
  renderBranchUI();
  renderLocations();
  syncBookingBranch();
  checkPostcode(false);
  if (drawer.classList.contains('open')) renderDrawer(true);
}

function renderBranchUI() {
  const b = currentBranch();
  const now = belfastNow();
  const dot = $('#branch-dot');
  if (!b) {
    $('#branch-label').textContent = 'Choose a restaurant';
    dot.className = 'dot';
    $('#hero-branch').innerHTML = `<span>Find your nearest Kesar for opening times, collection and delivery.</span><button type="button" class="link-btn" data-open-branches>Choose restaurant</button>`;
    $('#order-status').innerHTML = `<p>Choose a restaurant to see collection and delivery times. <button type="button" class="link-btn" data-open-branches>Choose restaurant</button></p>`;
    return;
  }
  const s = branchStatus(b, now);
  $('#branch-label').textContent = b.name;
  dot.className = `dot ${s.open ? 'open' : 'closed'}`;
  $('#branch-btn').title = s.text;
  $('#hero-branch').innerHTML = `<span><b>Kesar ${b.name}</b>, ${b.area} · <span class="status ${s.open ? 'open' : ''}">${s.text}</span></span><button type="button" class="link-btn" data-open-branches>Change</button>`;

  const collect = orderSlots(b, R.prepCollection, now);
  $('#collect-eta').textContent = collect.asap ? `Ready in about ${collect.asap} min` : `From ${collect.label.toLowerCase()} at ${formatTime(collect.times[0])}`;
  const prep = state.mode === 'delivery' ? R.prepDelivery : R.prepCollection;
  const slots = orderSlots(b, prep, now);
  const verb = state.mode === 'delivery' ? 'Delivery' : 'Collection';
  const when = slots.asap
    ? `${verb} as soon as ${slots.asap} minutes, or choose a time up to ${formatTime(slots.times.at(-1))}.`
    : `We're closed right now. You can order ahead for ${slots.label.toLowerCase()} from ${formatTime(slots.times[0])}.`;
  $('#order-status').innerHTML = `<p>Ordering from <b>Kesar ${b.name}</b>, ${esc(b.address)}. ${when} <button type="button" class="link-btn" data-open-branches>Change</button></p>`;
}

/* ---------- menu ---------- */
const chilli = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 2.5c-.6.2-1 .8-1 1.4-3.5.4-6 3-7.4 6.6-.5 1.3-1.3 2.3-2.6 3 4.6.9 9.5-1.4 10.7-6.5.3-1.2.2-2.2-.2-3 .6-.3.9-.9.5-1.5z" fill="currentColor"/></svg>';
const HEAT = ['Mild', 'Medium', 'Hot', 'Very hot'];

function heatHtml(h) {
  if (h === 0) return '<span class="heat mild">Mild</span>';
  return `<span class="heat" aria-label="${HEAT[h]}" title="${HEAT[h]}">${chilli.repeat(h)}</span>`;
}

function addControl(id) {
  const q = cart.qtyOf(id);
  if (!q) return `<button class="add-btn" type="button" data-add="${id}" aria-label="Add ${esc(MENU.find((m) => m.id === id).name)}">Add</button>`;
  return `<div class="stepper" role="group" aria-label="Quantity"><button type="button" data-dec="${id}" aria-label="Remove one">−</button><span>${q}</span><button type="button" data-inc="${id}" aria-label="Add one">+</button></div>`;
}

function dishHtml(d) {
  const tags = [d.vg ? '<i class="tag vg" title="Vegan">VG</i>' : d.v ? '<i class="tag v" title="Vegetarian">V</i>' : '', d.gf ? '<i class="tag gf" title="Gluten-free">GF</i>' : ''].join('');
  return `<article class="dish ${d.img ? 'has-img' : ''}" data-id="${d.id}">
    ${d.img ? `<img src="${IMG}${d.img}" alt="${esc(d.name)}" loading="lazy" />` : ''}
    <div class="dish-body">
      <div class="dish-top"><h4>${d.name}${d.popular ? '<span class="pop">Popular</span>' : ''}</h4><span class="price">${money(d.price)}</span></div>
      <p>${d.desc}</p>
      <div class="dish-meta">${tags}${heatHtml(d.heat)}<button type="button" class="allergen-btn" data-allergens="${d.id}">Allergens</button></div>
    </div>
    <div class="dish-add" data-add-wrap="${d.id}">${addControl(d.id)}</div>
  </article>`;
}

$('#cat-tabs').innerHTML = CATEGORIES.map(([id, label], i) => `<button type="button" role="tab" data-cat="${id}" aria-selected="${i === 0}">${label}</button>`).join('');
$('#menu-list').innerHTML = CATEGORIES.map(
  ([id, label]) => `<section class="menu-cat" id="cat-${id}" aria-labelledby="h-${id}">
    <h3 id="h-${id}">${label}</h3>
    <div class="dishes">${MENU.filter((d) => d.cat === id).map(dishHtml).join('')}</div>
  </section>`
).join('');

$('#cat-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const target = $(`#cat-${b.dataset.cat}`);
  const bar = $('#menu-bar').offsetHeight;
  if (lenis) lenis.scrollTo(target, { offset: -(headerOffset() + bar), duration: 1 });
  else scrollTo({ top: target.getBoundingClientRect().top + scrollY - headerOffset() - bar });
});

const catObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id.replace('cat-', '');
      $$('#cat-tabs [data-cat]').forEach((b) => {
        const on = b.dataset.cat === id;
        b.setAttribute('aria-selected', String(on));
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
  },
  { rootMargin: '-35% 0px -60% 0px' }
);
$$('.menu-cat').forEach((s) => catObserver.observe(s));

function applyDiet() {
  const f = state.diet;
  let shown = 0;
  MENU.forEach((d) => {
    const ok = (!f.has('v') || d.v) && (!f.has('vg') || d.vg) && (!f.has('gf') || d.gf) && (!f.has('mild') || d.heat === 0);
    $(`.dish[data-id="${d.id}"]`).hidden = !ok;
    if (ok) shown++;
  });
  $$('.menu-cat').forEach((s) => (s.hidden = !$$('.dish', s).some((d) => !d.hidden)));
  $$('#cat-tabs [data-cat]').forEach((b) => (b.hidden = $(`#cat-${b.dataset.cat}`).hidden));
  $('#menu-empty').hidden = shown > 0;
  lenis?.resize();
}
$$('[data-diet]').forEach((b) =>
  b.addEventListener('click', () => {
    const k = b.dataset.diet;
    if (state.diet.has(k)) state.diet.delete(k);
    else state.diet.add(k);
    b.setAttribute('aria-pressed', String(state.diet.has(k)));
    applyDiet();
  })
);

document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  const inc = e.target.closest('[data-inc]');
  const dec = e.target.closest('[data-dec]');
  const alg = e.target.closest('[data-allergens]');
  if (add) {
    const d = MENU.find((m) => m.id === add.dataset.add);
    cart.add({ id: d.id, name: d.name, price: d.price });
    toast(`${d.name} added to your order`);
  } else if (inc) cart.setQty(inc.dataset.inc, cart.qtyOf(inc.dataset.inc) + 1);
  else if (dec) cart.setQty(dec.dataset.dec, cart.qtyOf(dec.dataset.dec) - 1);
  else if (alg) showAllergens(alg.dataset.allergens);
});

function showAllergens(id) {
  const d = MENU.find((m) => m.id === id);
  $('#allergen-title').textContent = d.name;
  const contains = d.allergens.map((a) => ALLERGENS[a]);
  $('#allergen-body').innerHTML = `
    <p class="allergen-sum">${contains.length ? `Contains: <b>${contains.join(', ')}</b>.` : 'Contains none of the 14 major allergens.'}</p>
    <ul class="allergen-grid">${Object.entries(ALLERGENS)
      .map(([k, label]) => `<li class="${d.allergens.includes(k) ? 'yes' : ''}"><span>${d.allergens.includes(k) ? 'Contains' : 'No'}</span>${label}</li>`)
      .join('')}</ul>
    <p class="small">${[d.vg ? 'Vegan' : d.v ? 'Vegetarian' : '', d.gf ? 'Made without gluten' : ''].filter(Boolean).join(' · ') || '&nbsp;'}</p>
    <p class="small">Made in a kitchen that handles all 14 allergens. Please tell us about any allergy.</p>`;
  $('#allergen-dialog').showModal();
}

/* ---------- order section: mode + postcode ---------- */
function setMode(mode) {
  state.mode = mode;
  sessionStorage.setItem('kesar-mode', mode);
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('#pc-form').hidden = mode !== 'delivery';
  renderBranchUI();
  if (drawer.classList.contains('open')) renderDrawer(true);
}
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

export function postcodeDistrict(raw) {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  if (!s) return { error: 'empty' };
  const full = s.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  const outward = full ? full[1] : /^[A-Z]{1,2}\d[A-Z\d]?$/.test(s) ? s : null;
  if (!outward) return { error: 'invalid' };
  const m = outward.match(/^BT(\d{1,2})$/);
  if (!m) return { error: 'outside' };
  return { pc: full ? `${full[1]} ${full[2]}` : outward, district: Number(m[1]) };
}

function deliveryCheck(raw, branch) {
  const r = postcodeDistrict(raw);
  if (r.error === 'empty') return { tone: '', html: 'Enter your postcode to check delivery.' };
  if (r.error === 'invalid') return { tone: 'warn', html: "That doesn't look like a UK postcode. Try something like BT7 1JL." };
  if (r.error === 'outside') return { tone: 'warn', html: 'We only deliver in Northern Ireland. Collection is available from all five restaurants.' };
  if (branch?.delivery.districts.includes(r.district)) {
    return { ok: true, tone: 'ok', pc: r.pc, html: `<b>Kesar ${branch.name} delivers to ${r.pc}.</b> Usually ${branch.delivery.eta}. £2.50, free over £30. Minimum order £15.` };
  }
  const other = BRANCHES.find((b) => b.delivery.districts.includes(r.district));
  if (other) {
    return {
      tone: 'warn',
      pc: r.pc,
      html: `${branch ? `Kesar ${branch.name} doesn't deliver to ${r.pc}, but ` : ''}<b>Kesar ${other.name}</b> does. <button type="button" class="link-btn" data-branch="${other.id}">Order from ${other.name}</button>`,
    };
  }
  return { tone: 'warn', pc: r.pc, html: `Sorry, none of our restaurants deliver to BT${r.district} yet. You can still order for collection.` };
}

function checkPostcode(fromUser = true) {
  const input = $('#pc-input');
  if (fromUser) state.postcode = input.value.trim();
  else input.value = state.postcode;
  sessionStorage.setItem('kesar-postcode', state.postcode);
  if (!fromUser && !state.postcode) return ($('#pc-result').innerHTML = '');
  const res = deliveryCheck(state.postcode, currentBranch());
  const el = $('#pc-result');
  el.className = `pc-result ${res.tone}`;
  el.innerHTML = res.html;
}
$('#pc-form').addEventListener('submit', (e) => {
  e.preventDefault();
  checkPostcode(true);
});

/* ---------- offers ---------- */
$('#offers-list').innerHTML = OFFERS.map((o) => `<article class="offer reveal"><span class="offer-price">${o.price}</span><h3>${o.title}</h3><p>${o.text}</p></article>`).join('');

/* ---------- booking ---------- */
const bookBranch = $('#book-branch');
const bookDate = $('#book-date');
const bookTime = $('#book-time');
const bookGuests = $('#book-guests');
bookBranch.innerHTML = `<option value="">Choose…</option>${BRANCHES.map((b) => `<option value="${b.id}">${b.name}, ${b.area}</option>`).join('')}`;
bookGuests.innerHTML = [...Array(10)].map((_, i) => `<option value="${i + 1}" ${i === 1 ? 'selected' : ''}>${i + 1} ${i ? 'guests' : 'guest'}</option>`).join('') + '<option value="11">11 or more</option>';

function renderBookingDates() {
  const b = BRANCHES.find((x) => x.id === bookBranch.value);
  const now = belfastNow();
  const keep = bookDate.value;
  bookDate.innerHTML = [...Array(30)]
    .map((_, i) => {
      const d = addDays(now, i);
      const closed = b && !b.hours[d.getDay()];
      const full = b && !closed && bookingSlots(b, d, now).length === 0;
      const base = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const label = i === 0 ? `Today, ${base}` : i === 1 ? `Tomorrow, ${base}` : base;
      return `<option value="${isoDate(d)}" ${closed || full ? 'disabled' : ''}>${label}${closed ? ' (closed)' : full ? ' (no tables left)' : ''}</option>`;
    })
    .join('');
  const firstOk = $$('option:not([disabled])', bookDate)[0];
  bookDate.value = keep && !$(`option[value="${keep}"]`, bookDate)?.disabled ? keep : firstOk?.value;
  renderBookingTimes();
}

function renderBookingTimes() {
  const b = BRANCHES.find((x) => x.id === bookBranch.value);
  const note = $('#book-note');
  if (!b) {
    bookTime.innerHTML = '<option value="">Choose a restaurant first</option>';
    note.textContent = '';
    return;
  }
  const [y, m, d] = bookDate.value.split('-').map(Number);
  const times = bookingSlots(b, new Date(y, m - 1, d));
  const keep = bookTime.value;
  bookTime.innerHTML = times.length ? times.map((t) => `<option value="${t}">${formatTime(t)}</option>`).join('') : '<option value="">No times available</option>';
  if (times.includes(keep)) bookTime.value = keep;
  else {
    const seven = times.find((t) => toMinutes(t) >= toMinutes('19:00'));
    if (seven) bookTime.value = seven;
  }
  const closedDays = b.hours.map((h, i) => (h ? null : dayName(i))).filter(Boolean);
  note.textContent = bookGuests.value === '11'
    ? `For 11 or more guests please call Kesar ${b.name} on ${b.phone} so we can set up the right table.`
    : `Kesar ${b.name} · ${b.address}${closedDays.length ? ` · Closed ${closedDays.join(', ')}s` : ''}`;
  note.classList.toggle('warn', bookGuests.value === '11');
}

function syncBookingBranch() {
  if (state.branchId && !bookBranch.dataset.touched) {
    bookBranch.value = state.branchId;
    renderBookingDates();
  }
}
bookBranch.addEventListener('change', () => {
  bookBranch.dataset.touched = '1';
  renderBookingDates();
});
bookDate.addEventListener('change', renderBookingTimes);
bookGuests.addEventListener('change', renderBookingTimes);

function validate(form) {
  let first = null;
  $$('input[required], select[required], textarea[required]', form).forEach((el) => {
    const bad = !el.value.trim() || (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) || (el.type === 'tel' && el.value.replace(/\D/g, '').length < 10);
    el.classList.toggle('invalid', bad);
    el.setAttribute('aria-invalid', String(bad));
    if (bad && !first) first = el;
  });
  first?.focus();
  return !first;
}
document.addEventListener('input', (e) => {
  if (e.target.classList?.contains('invalid')) {
    e.target.classList.remove('invalid');
    e.target.removeAttribute('aria-invalid');
  }
});

const ref = (p) => `${p}-${Math.floor(100000 + Math.random() * 900000)}`;

$('#book-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $('#book-msg');
  msg.className = 'form-msg';
  if (bookGuests.value === '11') {
    msg.textContent = 'Large groups are booked by phone. The number is just above.';
    msg.classList.add('warn');
    return;
  }
  if (!validate(form)) return;
  const b = BRANCHES.find((x) => x.id === bookBranch.value);
  const date = $(`option[value="${bookDate.value}"]`, bookDate).textContent.replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase());
  msg.classList.add('ok');
  msg.innerHTML = `<b>Table booked.</b> ${bookGuests.value} ${bookGuests.value === '1' ? 'guest' : 'guests'} at Kesar ${b.name}, ${date} at ${formatTime(bookTime.value)}. Reference <b>${ref('KB')}</b>. <span class="demo">Demo only: no booking was made and nothing was sent.</span>`;
  form.name.value = form.phone.value = form.email.value = form.notes.value = '';
});

/* ---------- locations ---------- */
function hoursTable(b, now) {
  return [1, 2, 3, 4, 5, 6, 0]
    .map((i) => {
      const h = b.hours[i];
      return `<tr class="${i === now.getDay() ? 'today' : ''}"><td>${dayName(i)}</td><td>${h ? `${formatTime(h[0])} – ${formatTime(h[1])}` : 'Closed'}</td></tr>`;
    })
    .join('');
}

function renderLocations() {
  const now = belfastNow();
  $('#locations-list').innerHTML = BRANCHES.map((b) => {
    const s = branchStatus(b, now);
    const mine = b.id === state.branchId;
    return `<article class="loc ${mine ? 'mine' : ''}">
      <div class="loc-head"><h3>${b.name}</h3>${mine ? '<span class="mine-tag">Your restaurant</span>' : ''}</div>
      <p class="status ${s.open ? 'open' : ''}">${s.text}</p>
      <p>${b.address}</p>
      <p><a href="${telHref(b.phone)}">${b.phone}</a></p>
      <p class="small">${b.note}</p>
      <ul class="features">${b.features.map((f) => `<li>${f}</li>`).join('')}</ul>
      <details><summary>Opening hours</summary><table class="hours">${hoursTable(b, now)}</table></details>
      <div class="loc-actions">
        ${mine ? '' : `<button type="button" class="btn btn-small btn-gold" data-branch="${b.id}" aria-label="Choose Kesar ${b.name}">Choose</button>`}
        <a class="btn btn-small btn-line" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}" target="_blank" rel="noopener">Directions</a>
      </div>
    </article>`;
  }).join('');
  const b = currentBranch() || BRANCHES[0];
  const bbox = [b.lon - 0.012, b.lat - 0.006, b.lon + 0.012, b.lat + 0.006].join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.lat},${b.lon}`;
  const map = $('#map');
  if (map.getAttribute('src') !== src) {
    map.src = src;
    map.title = `Map showing Kesar ${b.name}, ${b.address}`;
  }
}

$('#footer-branches').innerHTML = BRANCHES.map((b) => `<li>${b.name} · <a href="${telHref(b.phone)}">${b.phone}</a></li>`).join('');

/* ---------- gift cards ---------- */
let giftAmount = 50;
$$('[data-amount]').forEach((b) =>
  b.addEventListener('click', () => {
    giftAmount = Number(b.dataset.amount);
    $$('[data-amount]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    $('#gc-amount').textContent = `£${giftAmount}`;
  })
);
$('#gift-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(e.target)) return;
  const msg = $('#gift-msg');
  msg.className = 'form-msg ok';
  msg.innerHTML = `<b>£${giftAmount} gift card ready for ${esc(e.target.to.value)}.</b> <span class="demo">Demo only: no payment was taken and no email was sent.</span>`;
  e.target.reset();
});

/* ---------- club ---------- */
$('#club-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(e.target)) return;
  const msg = $('#club-msg');
  msg.className = 'form-msg ok';
  msg.textContent = "Welcome to the Kesar Club (demo only, nothing was sent).";
  e.target.reset();
});

/* ---------- order drawer ---------- */
const drawer = $('#drawer');
const scrim = $('#scrim');
const body = $('#drawer-body');
const foot = $('#drawer-foot');
let step = 'bag';
let lastFocus = null;

function totals() {
  const sub = cart.subtotal;
  const discount = state.mode === 'collection' && sub >= R.collectionDiscountOver ? sub * R.collectionDiscount : 0;
  const fee = state.mode === 'delivery' && sub < R.freeDeliveryOver ? R.deliveryFee : 0;
  return { sub, discount, fee, total: sub - discount + fee };
}

function totalsHtml() {
  const t = totals();
  return `<dl class="totals">
    <div><dt>Subtotal</dt><dd>${money(t.sub)}</dd></div>
    ${t.discount ? `<div class="save"><dt>15% collection discount</dt><dd>−${money(t.discount)}</dd></div>` : ''}
    ${state.mode === 'delivery' ? `<div><dt>Delivery</dt><dd>${t.fee ? money(t.fee) : 'Free'}</dd></div>` : ''}
    <div class="grand"><dt>Total</dt><dd>${money(t.total)}</dd></div>
  </dl>`;
}

function openDrawer() {
  lastFocus = document.activeElement;
  if (step === 'done') step = 'bag';
  renderDrawer();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('show'));
  lenis?.stop();
  $('[data-close]', drawer).focus();
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  scrim.classList.remove('show');
  setTimeout(() => (scrim.hidden = true), 300);
  lenis?.start();
  lastFocus?.focus?.();
}
$('#bag-btn').addEventListener('click', openDrawer);
scrim.addEventListener('click', closeDrawer);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open') && !$('dialog[open]')) closeDrawer();
});

function renderDrawer(keepValues = false) {
  const keep = keepValues && $('#checkout-form') ? Object.fromEntries(new FormData($('#checkout-form'))) : null;
  if (!cart.items.length && step !== 'done') step = 'bag';
  if (step === 'bag') renderBag();
  else if (step === 'checkout') renderCheckout(keep);
}

function modeSwitch() {
  return `<div class="mode small-mode" role="radiogroup" aria-label="Collection or delivery">
    <button type="button" role="radio" data-mode-d="collection" aria-checked="${state.mode === 'collection'}"><b>Collection</b></button>
    <button type="button" role="radio" data-mode-d="delivery" aria-checked="${state.mode === 'delivery'}"><b>Delivery</b></button>
  </div>`;
}

function renderBag() {
  $('#drawer-title').textContent = 'Your order';
  if (!cart.items.length) {
    body.innerHTML = `<div class="empty-bag"><p>Your order is empty.</p><a class="btn btn-gold" href="#menu" data-close>Browse the menu</a></div>`;
    foot.innerHTML = '';
    return;
  }
  const b = currentBranch();
  body.innerHTML = `
    ${modeSwitch()}
    <p class="from">${b ? `From <b>Kesar ${b.name}</b>` : 'No restaurant chosen yet'} · <button type="button" class="link-btn" data-open-branches>${b ? 'Change' : 'Choose'}</button></p>
    <ul class="lines">${cart.items
      .map(
        (i) => `<li class="line"><div><b>${i.name}</b><span>${money(i.price)}</span></div>
        <div class="stepper" role="group" aria-label="Quantity of ${esc(i.name)}"><button type="button" data-dec="${i.id}" aria-label="Remove one">−</button><span>${i.qty}</span><button type="button" data-inc="${i.id}" aria-label="Add one">+</button></div>
        <span class="line-total">${money(i.price * i.qty)}</span></li>`
      )
      .join('')}</ul>`;
  const t = totals();
  const short = state.mode === 'delivery' && t.sub < R.minDelivery;
  const hint =
    state.mode === 'collection' && t.sub < R.collectionDiscountOver
      ? `Add ${money(R.collectionDiscountOver - t.sub)} more to get 15% off.`
      : state.mode === 'delivery' && !short && t.fee
        ? `Add ${money(R.freeDeliveryOver - t.sub)} more for free delivery.`
        : '';
  foot.innerHTML = `${totalsHtml()}
    ${short ? `<p class="hint warn">Minimum for delivery is ${money(R.minDelivery)}. Add ${money(R.minDelivery - t.sub)} more.</p>` : hint ? `<p class="hint">${hint}</p>` : ''}
    <button class="btn btn-gold btn-block" type="button" data-next ${short ? 'disabled' : ''}>Checkout · ${money(t.total)}</button>`;
}

function renderCheckout(keep) {
  $('#drawer-title').textContent = 'Checkout';
  const b = currentBranch();
  const delivery = state.mode === 'delivery';
  const pcRes = delivery ? deliveryCheck(state.postcode, b) : null;
  const slots = b ? orderSlots(b, delivery ? R.prepDelivery : R.prepCollection) : null;
  const timeOptions = slots
    ? `${slots.asap ? `<option value="asap">As soon as possible (about ${slots.asap} min)</option>` : ''}${slots.times
        .map((t) => `<option value="${t}">${slots.label}, ${formatTime(t)}</option>`)
        .join('')}`
    : '';

  body.innerHTML = `<form class="checkout" id="checkout-form" novalidate>
    ${modeSwitch()}
    <label>Restaurant
      <select name="branch" id="co-branch" required>
        <option value="">Choose…</option>
        ${BRANCHES.map((x) => `<option value="${x.id}" ${x.id === state.branchId ? 'selected' : ''}>${x.name}, ${x.area}</option>`).join('')}
      </select>
    </label>
    ${
      delivery
        ? `<label>Postcode<input name="postcode" id="co-postcode" autocomplete="postal-code" value="${esc(state.postcode)}" required /></label>
           ${state.postcode ? `<p class="pc-result ${pcRes.tone}">${pcRes.html}</p>` : ''}
           <label>Address<input name="address" autocomplete="street-address" required /></label>`
        : b
          ? `<p class="small">Collect from ${esc(b.address)}. We'll text you when it's ready.</p>`
          : ''
    }
    ${b ? `<label>${delivery ? 'Delivery' : 'Collection'} time<select name="time" required>${timeOptions}</select></label>` : ''}
    <div class="row">
      <label>Name<input name="name" autocomplete="name" required /></label>
      <label>Mobile<input name="phone" type="tel" autocomplete="tel" required /></label>
    </div>
    <label>Email<input name="email" type="email" autocomplete="email" required /></label>
    <label>Allergies or notes for the kitchen (optional)<textarea name="notes" rows="2" maxlength="200"></textarea></label>
    <p class="small">Pay by card ${delivery ? 'to the driver' : 'when you collect'}. This demo doesn't take payments.</p>
  </form>`;
  if (keep) {
    const form = $('#checkout-form');
    for (const [k, v] of Object.entries(keep)) if (form[k] && !['branch', 'postcode'].includes(k)) form[k].value = v;
    if (form.time && !form.time.value) form.time.selectedIndex = 0;
  }
  const blocked = delivery && (!pcRes?.ok || totals().sub < R.minDelivery);
  foot.innerHTML = `${totalsHtml()}
    <button class="btn btn-gold btn-block" type="button" data-place ${blocked && state.postcode && pcRes && !pcRes.ok ? 'disabled' : ''}>Place order · ${money(totals().total)}</button>
    <button class="back-link" type="button" data-back>Back to your order</button>`;

  $('#co-branch').addEventListener('change', (e) => e.target.value && setBranch(e.target.value));
  $('#co-postcode')?.addEventListener('change', (e) => {
    state.postcode = e.target.value.trim();
    sessionStorage.setItem('kesar-postcode', state.postcode);
    checkPostcode(false);
    renderDrawer(true);
  });
}

function placeOrder() {
  const form = $('#checkout-form');
  if (form.postcode && form.postcode.value.trim() !== state.postcode) {
    form.postcode.dispatchEvent(new Event('change'));
    return;
  }
  if (!validate(form)) return;
  const b = currentBranch();
  if (state.mode === 'delivery' && !deliveryCheck(state.postcode, b).ok) {
    form.postcode.classList.add('invalid');
    form.postcode.focus();
    return;
  }
  const t = totals();
  const opt = form.time.selectedOptions[0].textContent;
  const when = form.time.value === 'asap' ? opt.replace('As soon as possible', 'as soon as possible') : opt;
  const where = state.mode === 'delivery' ? `Delivering to ${esc(form.address.value)}, ${esc(state.postcode)}` : `Collect from Kesar ${b.name}, ${esc(b.address)}`;
  const reference = ref('KO');
  step = 'done';
  cart.clear();
  $('#drawer-title').textContent = 'Order placed';
  body.innerHTML = `<div class="confirm">
    <div class="tick">✓</div>
    <h3>Thanks, ${esc(form.name.value.split(' ')[0])}!</h3>
    <p>Order <b>${reference}</b> · ${money(t.total)}</p>
    <p>${where}. ${when}.</p>
    <p class="demo">This is a demo site. The order wasn't sent to a kitchen and no payment was taken.</p>
    <button class="btn btn-gold" type="button" data-close>Done</button>
  </div>`;
  foot.innerHTML = '';
}

drawer.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) return closeDrawer();
  const m = t.closest('[data-mode-d]');
  if (m) return setMode(m.dataset.modeD);
  if (t.closest('[data-next]')) {
    step = 'checkout';
    renderDrawer();
    body.scrollTop = 0;
    return;
  }
  if (t.closest('[data-back]')) {
    step = 'bag';
    return renderDrawer();
  }
  if (t.closest('[data-place]')) placeOrder();
});
body.addEventListener('submit', (e) => {
  e.preventDefault();
  placeOrder();
});

cart.subscribe(() => {
  const c = $('#bag-count');
  c.textContent = cart.count;
  c.classList.toggle('has', cart.count > 0);
  MENU.forEach((d) => {
    const wrap = $(`[data-add-wrap="${d.id}"]`);
    if (wrap) wrap.innerHTML = addControl(d.id);
  });
  if (drawer.classList.contains('open') && step !== 'done') renderDrawer(true);
});

/* ---------- reveal ---------- */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    }),
  { rootMargin: '0px 0px -8% 0px' }
);
function observeReveals() {
  $$('.reveal:not(.in)').forEach((el) => io.observe(el));
}
$$('.section-head, .dish, .loc, .review-grid figure, .order-grid > *, .book-grid > *, .story-grid > *, .gift-grid > *').forEach((el) => el.classList.add('reveal'));

/* ---------- init ---------- */
setMode(state.mode);
renderBranchUI();
renderLocations();
bookBranch.value = state.branchId || '';
renderBookingDates();
checkPostcode(false);
observeReveals();

setInterval(() => {
  renderBranchUI();
  renderLocations();
}, 60000);
