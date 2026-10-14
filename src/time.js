const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A Date whose local fields read as the current wall-clock time in Northern Ireland.
export function belfastNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

export const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

export const dayName = (i) => DAYS[i];

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function nextOpening(branch, now) {
  for (let i = 1; i <= 7; i++) {
    const day = (now.getDay() + i) % 7;
    const h = branch.hours[day];
    if (h) return { offset: i, day, open: h[0], close: h[1] };
  }
  return null;
}

export function branchStatus(branch, now = belfastNow()) {
  const h = branch.hours[now.getDay()];
  const mins = minutesOf(now);
  if (h && mins >= toMinutes(h[0]) && mins < toMinutes(h[1])) {
    const left = toMinutes(h[1]) - mins;
    return { open: true, short: 'Open now', text: left <= 45 ? `Open now · kitchen closes soon (${formatTime(h[1])})` : `Open now · until ${formatTime(h[1])}` };
  }
  if (h && mins < toMinutes(h[0])) {
    return { open: false, short: `Opens ${formatTime(h[0])}`, text: `Closed · opens today at ${formatTime(h[0])}` };
  }
  const next = nextOpening(branch, now);
  const when = next.offset === 1 ? 'tomorrow' : DAYS[next.day];
  return { open: false, short: 'Closed', text: `Closed · opens ${when} at ${formatTime(next.open)}` };
}

const roundUp = (m, step) => Math.ceil(m / step) * step;

// Order times for the next session that can still take orders. Last orders are 15 minutes before closing.
export function orderSlots(branch, prep, now = belfastNow()) {
  const mins = minutesOf(now);
  const today = branch.hours[now.getDay()];
  if (today) {
    const last = toMinutes(today[1]) - 15;
    const start = roundUp(Math.max(mins, toMinutes(today[0])) + prep, 15);
    if (start <= last) {
      const isOpen = mins >= toMinutes(today[0]);
      return { label: 'Today', date: isoDate(now), asap: isOpen ? prep : null, times: range(start, last, 15) };
    }
  }
  const next = nextOpening(branch, now);
  const date = addDays(now, next.offset);
  return {
    label: next.offset === 1 ? 'Tomorrow' : DAYS[next.day],
    date: isoDate(date),
    asap: null,
    times: range(roundUp(toMinutes(next.open) + prep, 15), toMinutes(next.close) - 15, 15),
  };
}

// Table times: every 30 minutes from opening until 90 minutes before closing.
export function bookingSlots(branch, date, now = belfastNow()) {
  const h = branch.hours[date.getDay()];
  if (!h) return [];
  let times = range(toMinutes(h[0]), toMinutes(h[1]) - 90, 30);
  if (isoDate(date) === isoDate(now)) times = times.filter((t) => toMinutes(t) >= minutesOf(now) + 30);
  return times;
}

function range(from, to, step) {
  const out = [];
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m));
  return out;
}
