import * as U from "../util.js";
import { cached } from "../api.js";
import { t } from "../i18n.js";

let accountsPayload = null;
let rootEl = null;
let mounted = false;
let context = null;

const launching = new Set();

// 积分来源 → 文案 key（文案按当前语言在 sourceBreakdown() 里取）。
const SOURCE_KEYS = {
  search: "acc.srcSearch",
  bonus: "acc.srcBonus",
  read: "acc.srcRead",
  checkIn: "acc.srcCheckIn",
  claimReward: "acc.srcClaimReward",
  claimBonus: "acc.srcClaimBonus",
  urlReward: "acc.srcUrlReward",
  visualSearch: "acc.srcVisualSearch",
  appReward: "acc.srcAppReward",
  punchcard: "acc.srcPunchcard",
  searchOnBing: "acc.srcSearchOnBing",
};

function controlState() {
  const status = context?.status;
  const usable = Boolean(status?.reachable && status?.authOk !== false);
  const running = Boolean(status?.botRunning);
  return { usable, running };
}

async function runAccount(account) {
  if (!context || !account.configured || !Number.isInteger(account.index)) return;

  launching.add(account.index);
  render(rootEl);
  try {
    await context.api.control("start", { accountIndex: account.index });
    context.toast(
      t("ovw.startedOnly", { index: account.index, email: account.email }),
      "success",
    );
    context.invalidate();
    await context.refresh();
  } catch (error) {
    context.toast(error.message, error.status === 409 ? "warn" : "error");
  } finally {
    launching.delete(account.index);
    render(rootEl);
  }
}

function earnableBadge(account) {
  const earnable = account.earnable || account.live?.earnable;
  const total = earnable
    ? Object.values(earnable).reduce((sum, points) => sum + (Number(points) || 0), 0)
    : 0;
  if (total <= 0) return "";
  return `<span class="point-source point-source--target"><strong>${U.escapeHtml(t("acc.earnable"))}</strong> ${U.escapeHtml(U.fmtNumber(total))}</span>`;
}

// Only sources that actually earned something today — ten "+0" chips per
// account is noise, not detail.
function sourceBreakdown(account) {
  const bySource = account.live?.bySource || {};
  return Object.entries(SOURCE_KEYS)
    .filter(([source]) => Number(bySource[source]) > 0)
    .map(
      ([source, key]) =>
        `<span class="point-source"><strong>${U.escapeHtml(t(key))}</strong> ${U.escapeHtml(U.fmtSigned(Number(bySource[source])))}</span>`,
    )
    .join("");
}

function protectionPresentation(account) {
  if (account.streakProtectionEnabled == null) return null;

  const remaining = account.streakProtectionRemainingDays;
  const days =
    remaining == null
      ? t("acc.daysUnavailable")
      : t("acc.protectionDaysLeft", { n: remaining, count: remaining });
  // 布尔而非 "On"/"Off" 字符串：文案会随语言变化，调用方必须判布尔。
  const on = Boolean(account.streakProtectionEnabled);
  const streak =
    account.streakCounter == null
      ? t("acc.streakUnavailable")
      : t("acc.currentStreakDays", {
        n: U.fmtNumber(account.streakCounter),
        count: account.streakCounter,
      });

  return {
    on,
    stateLabel: on ? t("acc.protOn") : t("acc.protOff"),
    days,
    streak,
    pillClass:
      account.streakProtectionEnabled && remaining !== 0
        ? "pill-success"
        : remaining === 0
          ? "pill-warn"
          : "pill-idle",
  };
}

function kv(items) {
  return `<dl class="kv">${items
    .map(
      ([k, v]) =>
        `<div><dt>${U.escapeHtml(k)}</dt><dd>${U.escapeHtml(String(v))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function detailGroups(a, protection) {
  const groups = [];

  groups.push([
    t("acc.groupConfig"),
    [
      [
        t("acc.configuredInEnv"),
        a.configured ? t("acc.yes") : t("acc.noLogsOnly"),
      ],
      ...(a.geoLocale ? [[t("acc.geoLocale"), a.geoLocale]] : []),
      ...(a.langCode ? [[t("acc.language"), a.langCode]] : []),
      ...(a.hasTotp != null
        ? [[t("acc.totpSecret"), a.hasTotp ? t("acc.set") : t("acc.notSet")]]
        : []),
      ...(a.hasRecoveryEmail != null
        ? [
          [
            t("acc.recoveryEmail"),
            a.hasRecoveryEmail ? t("acc.set") : t("acc.notSet"),
          ],
        ]
        : []),
      [
        t("acc.proxy"),
        a.proxy
          ? `${a.proxy.url}${a.proxy.port ? `:${a.proxy.port}` : ""}${a.proxy.hasCredentials ? t("acc.proxyAuthed") : ""}`
          : t("acc.none"),
      ],
    ],
  ]);

  groups.push([
    t("acc.groupStreak"),
    [
      [
        t("acc.successStreak"),
        t("acc.runsCount", { n: a.successStreak, count: a.successStreak }),
      ],
      ...(protection
        ? [
          [
            t("acc.currentStreak"),
            a.streakCounter == null
              ? t("acc.unavailable")
              : t("acc.days", {
                n: U.fmtNumber(a.streakCounter),
                count: a.streakCounter,
              }),
          ],
          [
            t("acc.streakProtection"),
            protection.on ? t("acc.enabled") : t("acc.disabled"),
          ],
          [
            t("acc.protectionDaysRemaining"),
            a.streakProtectionRemainingDays == null
              ? t("acc.unavailable")
              : t("acc.days", {
                n: a.streakProtectionRemainingDays,
                count: a.streakProtectionRemainingDays,
              }),
          ],
          ...(a.streakProtectionUpdatedAt
            ? [
              [
                t("acc.protectionChecked"),
                U.fmtRelative(a.streakProtectionUpdatedAt),
              ],
            ]
            : []),
        ]
        : []),
    ],
  ]);

  groups.push([
    t("acc.groupHistory"),
    [
      [t("acc.apiRuns"), U.fmtNumber(a.apiRuns)],
      [t("acc.apiCollected"), U.fmtSigned(a.apiTotalCollected)],
      [t("acc.lastDuration"), U.fmtDuration(a.lastDurationSec)],
      [t("acc.historyPoints"), U.fmtNumber(a.historyCount)],
    ],
  ]);

  return `<div class="acc-detail-groups">${groups
    .map(
      ([title, items]) => `
        <div class="acc-detail-group">
            <h3 class="acc-detail-group-title">${title}</h3>
            ${kv(items)}
        </div>`,
    )
    .join("")}</div>`;
}

// Mirrors overview.js's statCard icon convention (stat-icon-check /
// -running / -alert icon-alert-active / -idle with \u2713 / \u25CF / ! / \u2013)
// so an account's live status reads the same way here as it does there.
function statusIconParts(statusKey) {
  switch (statusKey) {
    case "success":
    case "done":
      return { cls: "stat-icon-check", icon: "\u2713", label: U.pillParts("success").label };
    case "running":
    case "starting":
    case "stopping":
      return { cls: "stat-icon-running", icon: "\u25CF", label: U.pillParts(statusKey).label };
    case "pending":
      return { cls: "stat-icon-pending", icon: "\u25CF", label: U.pillParts(statusKey).label };
    case "error":
    case "crashed":
    case "interrupted":
    case "stopped":
      return { cls: "stat-icon-alert icon-alert-active", icon: "!", label: U.pillParts(statusKey).label };
    default:
      return { cls: "stat-icon-idle", icon: "\u2013", label: U.pillParts("idle").label };
  }
}

function renderAccountPanel(a, live) {
  const protection = protectionPresentation(a);
  const { usable, running } = controlState();

  // Accounts now start one at a time (accountDelay), so mid-run there can be
  // several accounts that already finished this run while another is still
  // going - `live` just means "has a record in this run", true for both.
  // a.status is this account's own last-observed outcome (idle/running/
  // success/error), so it correctly tells finished accounts apart from the
  // one actually in progress right now.
  // Mirrors overview.js: while waiting between accounts, the one named by
  // pendingDelay.nextEmail is up next, so it reads as "pending" rather than
  // whatever its last-observed status happened to be.
  const nextAccountEmail = context?.status?.pendingDelay?.nextEmail || null;
  const statusKey = launching.has(a.index)
    ? "starting"
    : a.status !== "running" && nextAccountEmail && a.email === nextAccountEmail
      ? "pending"
      : a.status;

  const runButton =
    a.configured && Number.isInteger(a.index)
      ? `<button type="button" class="btn btn-primary btn-small" data-run-account="${a.index}" ${!usable || running || launching.has(a.index) ? "disabled" : ""
      } title="${U.escapeAttr(t("ovw.runOnlyTitle", { index: a.index }))}">${U.escapeHtml(launching.has(a.index) ? t("ovw.starting") : t("ovw.runOnly"))}</button>`
      : "";

  const { cls: statusIconCls, icon: statusIcon, label: statusLabel } = statusIconParts(statusKey);

  const chips = [
    protection
      ? `<span class="pill ${protection.pillClass}" title="${U.escapeAttr(
        t("acc.protectionPillTitle", {
          streak: protection.streak,
          state: protection.stateLabel,
          days: protection.days,
        }),
      )}">${U.escapeHtml(
        t("acc.protectionPill", {
          state: protection.stateLabel,
          days:
            a.streakProtectionRemainingDays == null
              ? t("acc.daysUnavailable")
              : t("acc.daysLeft", {
                n: a.streakProtectionRemainingDays,
                count: a.streakProtectionRemainingDays,
              }),
        }),
      )}</span>`
      : "",
    earnableBadge(live || {}),
    sourceBreakdown(live || {}),
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="panel account-detail-panel">
        <div class="panel-head">
            <h2><span class="acc-status-icon ${statusIconCls}" role="img" aria-label="${U.escapeAttr(statusLabel)}" title="${U.escapeAttr(statusLabel)}">${statusIcon}</span>${U.escapeHtml(a.email)}</h2>
            ${a.index != null ? `<span class="tag-mini acc-tag-account-id">ACCOUNT_${a.index}</span>` : ""}
            ${a.configured ? "" : `<span class="tag-mini">${U.escapeHtml(t("ovw.unconfigured"))}</span>`}
            <span class="acc-detail-actions">
                <span class="acc-status-pill">${U.statusPill(statusKey)}</span>
                ${runButton}
            </span>
        </div>
        <div class="panel-body">
            ${detailGroups(a, protection)}
        </div>
        ${chips ? `<div class="account-today-row">
            <span class="account-today-label">${U.escapeHtml(t("acc.today"))}</span>
            <div class="account-today-chips">${chips}</div>
        </div>` : ""}
    </div>`;
}

function render(root) {
  const container = U.$("#accountsContainer", root);
  const accounts = accountsPayload?.accounts || [];

  const liveByEmail = new Map(
    (context?.status?.bot?.run?.accounts || []).map((la) => [la.email, la]),
  );

  const errEl = U.$("#accountsError", root);
  if (errEl) {
    errEl.hidden = !accountsPayload?.apiError;
    if (accountsPayload?.apiError) errEl.textContent = accountsPayload.apiError;
  }

  if (!accounts.length) {
    container.innerHTML = `<p class="empty-note" style="padding:1.25rem">${U.escapeHtml(t("ovw.noAccounts"))}</p>`;
    return;
  }

  container.innerHTML = accounts.map(a => {
    const live = liveByEmail.get(a.email) || null;
    return renderAccountPanel(a, live);
  }).join("");

  container.querySelectorAll("button[data-run-account]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.runAccount);
      const account = accounts.find((a) => a.index === index);
      if (account) runAccount(account);
    }),
  );
}

export default {
  id: "accounts",
  label: "Accounts",
  interval: 10000,

  mount(root, ctx) {
    rootEl = root;
    context = ctx;
    root.innerHTML = `
      <p class="notice notice--warn" id="accountsError" hidden></p>
      <div id="accountsContainer">
          <p class="empty-note" style="padding:1.25rem">${U.escapeHtml(t("acc.loading"))}</p>
      </div>
      <p class="hint" style="margin-top: 1.5rem;">${t("acc.hint")}</p>
    `;
    mounted = true;
  },

  async refresh(ctx) {
    context = ctx;
    accountsPayload = await cached("accounts", ctx.api.accounts, 5000);
    this.redraw(ctx);
  },

  redraw(ctx) {
    context = ctx || context;
    if (!mounted || !accountsPayload) return;
    render(rootEl);
  }
};