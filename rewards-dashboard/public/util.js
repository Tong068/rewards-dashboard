import { t, intlLocale } from "./i18n.js";

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) =>
  Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

// fomrat

const DASH = "\u2013";

export function fmtNumber(n) {
  if (n == null || Number.isNaN(n)) return DASH;
  return Number(n).toLocaleString(intlLocale());
}

export function fmtSigned(n) {
  if (n == null || Number.isNaN(n)) return DASH;
  return (n > 0 ? "+" : "") + Number(n).toLocaleString(intlLocale());
}

// 全站统一 24 小时制（hourCycle: "h23"），中英文都一样。
export function fmtDateTime(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString(intlLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// 日期和时间分开取再用 ", " 拼接：logs.js 依赖这个逗号把两段拆开显示，
// 而各语言 toLocaleString 的默认分隔符并不一致（中文里根本没有逗号）。
export function fmtTime(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const tz = timeZone || undefined;
  const datePart = d.toLocaleDateString(intlLocale(), {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(intlLocale(), {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return `${datePart}, ${timePart}`;
}

export function fmtRelative(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minsAgo", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.round(hours / 24) });
}

export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return DASH;
  if (sec < 60) return t("time.sec", { n: Math.round(sec) });
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60)
    return s ? t("time.minSec", { n: m, s }) : t("time.min", { n: m });
  const h = Math.floor(m / 60);
  return t("time.hourMin", { h, m: m % 60 });
}

export function fmtUptime(sec) {
  if (sec == null) return DASH;
  if (sec < 60) return t("time.sec", { n: Math.round(sec) });
  return fmtDuration(sec);
}

// day bucket

let timeZone = null;
export function setTimeZone(tz) {
  timeZone = tz || null;
}

export function tzDateParts(instant) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(instant));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function tzDayKey(instant) {
  const { year, month, day } = tzDateParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isoWeekStartKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}

export function localDateLabel(key, options) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale(), options);
}

export function bucketByDay(history) {
  const days = new Map();
  for (const h of history) {
    const { year, month, day } = tzDateParts(h.ts);
    const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!days.has(dayKey)) {
      days.set(dayKey, {
        dayKey,
        weekKey: isoWeekStartKey(year, month, day),
        gained: 0,
        lastTotal: h.points,
      });
    }
    const bucket = days.get(dayKey);
    bucket.gained += h.gained ?? 0;
    bucket.lastTotal = h.points;
  }
  return [...days.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

// toooooooooooooooast

let toastHost = null;

export function toast(message, kind = "info", ms = 4000) {
  if (!toastHost) {
    toastHost = el("div", {
      class: "toast-host",
      role: "status",
      "aria-live": "polite",
    });
    document.body.appendChild(toastHost);
  }
  const node = el(
    "div",
    { class: `toast toast--${kind}` },
    escapeHtml(message),
  );
  toastHost.appendChild(node);
  setTimeout(() => {
    node.classList.add("toast--out");
    setTimeout(() => node.remove(), 200);
  }, ms);
}

// ticker

// Renders `text` into `container` as plain content by default. On mobile
// (or always, if mobileOnly is false), if the content actually overflows
// the element's width, it's promoted to a scrolling ticker instead of
// being clipped or wrapped - otherwise it stays a normal static line.
// Shared by any component that needs this (run-progress meta, the
// control-strip detail line, etc.) rather than each one reimplementing it.
//
// Callers may invoke this very frequently (once per SSE state push, easily
// several times a second during an active run), so this updates text in
// place and only touches the ticker/animation state when the overflow
// status actually changes - rebuilding the DOM (and restarting the CSS
// animation) on every call would mean a multi-second scroll animation
// never gets the uninterrupted time it needs to complete a single loop.
// Activating vs deactivating also uses different thresholds (hysteresis):
// a line sitting right at the fits/doesn't-fit boundary would otherwise
// flip in and out of ticker mode on consecutive renders, resetting the
// animation each time and looking like it never moves at all.
//
// The track is duplicated (each copy carrying a trailing `separator` once
// ticking, so the loop doesn't run text directly into itself) and the pair
// (the wrap) animated from 0 to -50% of its own combined width - i.e.
// exactly one copy's width - so the loop hands off seamlessly: no blank
// lead-in, no snap-back partway through.
export function renderTicker(
  container,
  text,
  { mobileOnly = true, separator = "\u00a0\u00a0\u2022\u00a0\u00a0" } = {},
) {
  text = text ?? "";

  let wrap = container.querySelector(":scope > .ticker-track-wrap");
  let track;
  let clone;

  if (wrap) {
    track = wrap.querySelector(".ticker-track:not([aria-hidden])");
    clone = wrap.querySelector(".ticker-track[aria-hidden]");
  } else {
    container.classList.add("ticker");
    container.innerHTML = "";
    wrap = el("span", { class: "ticker-track-wrap" });
    track = el("span", { class: "ticker-track" });
    wrap.appendChild(track);
    container.appendChild(wrap);
  }

  const wasTicker = container.classList.contains("is-ticker");
  const displayText = wasTicker ? text + separator : text;
  if (track.textContent !== displayText) {
    track.textContent = displayText;
    if (clone) clone.textContent = displayText;
  }

  const isMobile = !mobileOnly || window.matchMedia("(max-width: 768px)").matches;

  if (!text || !isMobile) {
    if (wasTicker) {
      container.classList.remove("is-ticker");
      container.style.removeProperty("--ticker-duration");
      clone?.remove();
      track.textContent = text;
    }
    return;
  }

  // Needs the mobile CSS's overflow:hidden/white-space:nowrap already in
  // effect on `container` to measure correctly.
  const overflowing = track.scrollWidth > container.clientWidth + 1;
  const clearlyFits = track.scrollWidth <= container.clientWidth - 6;

  if (overflowing && !wasTicker) {
    container.classList.add("is-ticker");
    track.textContent = text + separator;
    clone = track.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    wrap.appendChild(clone);
    // ~40px/sec, clamped so very short overflow doesn't whip by and very
    // long lines don't take forever to loop.
    const seconds = Math.min(30, Math.max(8, Math.round(track.scrollWidth / 40)));
    container.style.setProperty("--ticker-duration", `${seconds}s`);
  } else if (clearlyFits && wasTicker) {
    container.classList.remove("is-ticker");
    container.style.removeProperty("--ticker-duration");
    clone?.remove();
    track.textContent = text;
  }
  // Otherwise the overflow status is unchanged - leave the animation
  // running uninterrupted even though the text may have just been updated.
}

// other

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 状态 → [CSS 类, 文案 key]。文案在 pillParts() 里按当前语言取。
const PILLS = {
  success: ["pill-success", "pill.success"],
  done: ["pill-success", "pill.done"],
  error: ["pill-error", "pill.error"],
  crashed: ["pill-error", "pill.crashed"],
  interrupted: ["pill-warn", "pill.interrupted"],
  stopped: ["pill-warn", "pill.stopped"],
  running: ["pill-running", "pill.running"],
  starting: ["pill-running", "pill.starting"],
  stopping: ["pill-warn", "pill.stopping"],
  pending: ["pill-pending", "pill.pending"],
  idle: ["pill-idle", "pill.idle"],
};

export function pillParts(status) {
  const [cls, key] = PILLS[status] || PILLS.idle;
  return { cls, label: t(key) };
}

export function statusPill(status) {
  const { cls, label } = pillParts(status);
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}
