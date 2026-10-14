const KEY = 'kesar-order-v1';
const listeners = new Set();

let items = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn(items));
}

export const cart = {
  get items() {
    return items;
  },
  get count() {
    return items.reduce((n, i) => n + i.qty, 0);
  },
  get subtotal() {
    return items.reduce((s, i) => s + i.qty * i.price, 0);
  },
  add(item) {
    const existing = items.find((i) => i.id === item.id);
    if (existing) existing.qty = Math.min(20, existing.qty + 1);
    else items.push({ ...item, qty: 1 });
    save();
  },
  setQty(id, qty) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    it.qty = Math.max(0, Math.min(20, qty));
    if (it.qty === 0) items = items.filter((i) => i.id !== id);
    save();
  },
  qtyOf(id) {
    return items.find((i) => i.id === id)?.qty ?? 0;
  },
  clear() {
    items = [];
    save();
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(items);
  },
};
