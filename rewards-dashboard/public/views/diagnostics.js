import * as U from "../util.js";
import { cached } from "../api.js";
import { t } from "../i18n.js";

let rootEl = null;
let context = null;
let payload = null;
let open = null;

let accountsPayload = null;
let sessionsPayload = null;
let clearing = new Set();

function render() {
  if (!rootEl || !payload) return;

  U.$("#diagMeta", rootEl).textContent = payload.dir
    ? t("diag.meta", {
      n: U.fmtNumber(payload.count),
      dir: payload.dir,
      count: payload.count,
    })
    : "";

  const list = U.$("#diagList", rootEl);
  const entries = payload.entries || [];

  if (!entries.length) {
    list.innerHTML = `<li class="empty-note">${t("diag.noCaptures")}</li>`;
    return;
  }

  list.innerHTML = entries
    .map((entry) => {
      const isOpen = open === entry.name;
      const badges = [
        // error.txt / dump.html 是实际文件名，不翻译。
        entry.hasScreenshot
          ? `<span class="tag-mini">${U.escapeHtml(t("diag.tagScreenshot"))}</span>`
          : "",
        entry.hasError ? '<span class="tag-mini">error.txt</span>' : "",
        entry.hasHtml ? '<span class="tag-mini">dump.html</span>' : "",
      ].join("");

      const firstLine =
        (entry.error || "").split("\n").find((l) => l.trim()) ||
        t("diag.noErrorText");

      const body = isOpen
        ? `<div class="diag-body">
                    ${entry.hasError
          ? `<pre class="diag-pre">${U.escapeHtml(entry.error || "")}</pre>`
          : `<p class="empty-note">${U.escapeHtml(t("diag.noErrorTxt"))}</p>`
        }
                    ${entry.hasScreenshot
          ? `<a class="diag-shot" href="${U.escapeAttr(diagUrl(entry.name, "screenshot.png"))}" target="_blank" rel="noopener">
                                 <img src="${U.escapeAttr(diagUrl(entry.name, "screenshot.png"))}" alt="${U.escapeAttr(t("diag.shotAlt", { name: entry.name }))}" loading="lazy">
                               </a>`
          : ""
        }
                    ${entry.hasHtml
          ? `<p><a class="btn btn-small" href="${U.escapeAttr(diagUrl(entry.name, "dump.html"))}" download>${U.escapeHtml(t("diag.downloadDump"))}</a></p>`
          : ""
        }
                   </div>`
        : "";

      return `<li class="diag-item">
                <button type="button" class="diag-head" data-diag="${U.escapeAttr(entry.name)}" aria-expanded="${isOpen}">
                    <span class="diag-when">${U.escapeHtml(U.fmtDateTime(entry.createdAt))}</span>
                    <span class="diag-name">${U.escapeHtml(entry.name)}</span>
                    <span class="diag-badges">${badges}</span>
                    <span class="exit-chevron" aria-hidden="true">${isOpen ? "\u25BE" : "\u25B8"}</span>
                </button>
                ${isOpen ? body : `<p class="diag-preview">${U.escapeHtml(String(firstLine || "").slice(0, 180))}</p>`}
            </li>`;
    })
    .join("");

  list.querySelectorAll("button[data-diag]").forEach((btn) =>
    btn.addEventListener("click", () => {
      open = open === btn.dataset.diag ? null : btn.dataset.diag;
      render();
    }),
  );
}

function diagUrl(name, file) {
  return `/api/diagnostics/${encodeURIComponent(name)}/${encodeURIComponent(file)}`;
}

// sessions

async function clearSession(email) {
  if (!context) return;
  const confirmed = window.confirm(t("diag.confirmClear", { email }));
  if (!confirmed) return;

  clearing.add(email);
  renderSessions();
  try {
    await context.api.clearSession(email);
    context.toast(t("diag.cleared", { email }), "success");
    context.invalidate();
    await context.refresh();
  } catch (e) {
    context.toast(e.message, e.status === 409 ? "warn" : "error");
  } finally {
    clearing.delete(email);
    renderSessions();
  }
}

function renderSessions() {
  if (!rootEl) return;
  const list = U.$("#sessionCardList", rootEl);
  if (!list) return;

  if (!accountsPayload || !sessionsPayload) {
    list.innerHTML = `<p class="empty-note" style="padding:1.25rem">${t("diag.loading")}</p>`;
    return;
  }

  const accounts = (accountsPayload.accounts || []).filter(
    (a) => a.configured,
  );
  if (!accounts.length) {
    list.innerHTML = `<p class="empty-note" style="padding:1.25rem">${U.escapeHtml(t("diag.noAccounts"))}</p>`;
    return;
  }

  const byEmail = new Map();
  for (const s of sessionsPayload.sessions || []) {
    const key = s.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(s);
  }

  const running = Boolean(context?.status?.botRunning);

  list.innerHTML = accounts
    .map((a) => {
      const sessions = byEmail.get(a.email.toLowerCase()) || [];
      const hasSessions = sessions.length > 0;
      const latest = sessions.reduce(
        (max, s) => (!max || s.updatedAt > max ? s.updatedAt : max),
        null,
      );
      // meta \u4f1a\u539f\u6837\u63d2\u8fdb innerHTML\uff0c\u6240\u4ee5\u5e73\u53f0\u540d\u548c\u65f6\u95f4\u8981\u5148\u5404\u81ea\u8f6c\u4e49\u3002
      const meta = hasSessions
        ? t("diag.sessionMeta", {
          platforms: sessions
            .map((s) => U.escapeHtml(s.platform))
            .join(" \u00b7 "),
          when: U.escapeHtml(U.fmtRelative(latest)),
        })
        : U.escapeHtml(t("diag.noSessions"));

      const isClearing = clearing.has(a.email);
      const disabled = !hasSessions || running || isClearing;
      const title = running
        ? t("diag.titleBusy")
        : !hasSessions
          ? t("diag.titleEmpty")
          : "";

      return `<div class="session-card">
                <div class="session-card-info">
                    <span class="session-card-email">${U.escapeHtml(a.email)}${a.index != null ? ` <span class="tag-mini">ACCOUNT_${a.index}</span>` : ""}</span>
                    <span class="session-card-meta">${meta}</span>
                </div>
                <button type="button" class="btn btn-danger btn-small" data-clear-session="${U.escapeAttr(a.email)}"
                    ${disabled ? "disabled" : ""} ${title ? `title="${U.escapeAttr(title)}"` : ""}>
                    ${U.escapeHtml(isClearing ? t("diag.clearing") : t("diag.clearSessions"))}
                </button>
            </div>`;
    })
    .join("");

  list.querySelectorAll("button[data-clear-session]").forEach((btn) =>
    btn.addEventListener("click", () =>
      clearSession(btn.dataset.clearSession),
    ),
  );
}

export default {
  id: "diagnostics",
  label: "Diagnostics",
  interval: 30000,

  mount(root, ctx) {
    rootEl = root;
    context = ctx;
    root.innerHTML = `
            <section class="panel" aria-labelledby="sessions-heading">
                <div class="panel-head">
                    <h2 id="sessions-heading">${U.escapeHtml(t("diag.sessionsHeading"))}</h2>
                    <span class="panel-sub">${U.escapeHtml(t("diag.sessionsSub"))}</span>
                </div>
                <p class="notice notice--warn">
                    ${t("diag.sessionsNotice")}
                </p>
                <div class="session-card-list" id="sessionCardList">
                    <p class="empty-note" style="padding:1.25rem">${t("diag.loading")}</p>
                </div>
            </section>

            <section class="panel" aria-labelledby="diag-heading">
                <div class="panel-head">
                    <h2 id="diag-heading">${U.escapeHtml(t("diag.capturesHeading"))}</h2>
                    <span class="panel-sub" id="diagMeta"></span>
                    <button type="button" id="diagRefresh" class="btn btn-small">${U.escapeHtml(t("diag.refresh"))}</button>
                </div>
                <ul class="diag-list" id="diagList">
                    <li class="empty-note">${t("diag.loading")}</li>
                </ul>
            </section>`;

    U.$("#diagRefresh", root).addEventListener("click", () =>
      this.refresh(ctx),
    );
  },

  async refresh(ctx) {
    context = ctx;
    try {
      payload = await ctx.api.diagnostics();
      render();
    } catch (e) {
      U.$("#diagList", rootEl).innerHTML =
        `<li class="notice notice--warn">${U.escapeHtml(e.message)}</li>`;
    }

    try {
      [accountsPayload, sessionsPayload] = await Promise.all([
        cached("accounts", ctx.api.accounts, 5000),
        ctx.api.sessions(),
      ]);
    } catch (e) {
      U.$("#sessionCardList", rootEl).innerHTML =
        `<p class="notice notice--warn">${U.escapeHtml(e.message)}</p>`;
      return;
    }
    renderSessions();
  },

  redraw() {
    render();
    renderSessions();
  },

  onState(state, ctx) {
    context = ctx;
    renderSessions();
  },
};