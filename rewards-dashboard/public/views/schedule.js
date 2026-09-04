import * as U from "../util.js";
import { t } from "../i18n.js";
import { describeCron } from "../cronText.js";

// 预设：[文案 key, cron 表达式]。文案在渲染时按当前语言取。
const PRESETS = [
  ["sched.presetDaily9", "0 9 * * *"],
  ["sched.presetTwice", "0 9,21 * * *"],
  ["sched.preset6h", "0 */6 * * *"],
  ["sched.preset12h", "0 */12 * * *"],
  ["sched.presetWeekdays8", "0 8 * * 1-5"],
];

const targetLabel = (id) =>
  id === "remote" ? t("sched.targetRemote") : t("sched.targetLocal");

let rootEl = null;
let data = { local: null, remote: null, remoteSupported: false };
let target = "local";
let initialTargetChosen = false;
let current = null;
let dirty = false;
let accountOptions = [];

function syncCurrent() {
  current = data ? data[target] : null;
}

function fields() {
  const base = {
    enabled: U.$("#schedEnabled", rootEl).checked,
    cron: U.$("#schedCron", rootEl).value.trim(),
    skipIfRunning: U.$("#schedSkip", rootEl).checked,
    excludedAccountIndexes: U.$$(
      "input[data-exclude-account]:checked",
      rootEl,
    ).map((input) => Number(input.dataset.excludeAccount)),
  };
  if (target === "local") {
    base.misfirePolicy = U.$("#schedMisfire", rootEl).value;
    base.misfireGraceMinutes = Number(U.$("#schedGrace", rootEl).value);
  }
  return base;
}

function markDirty() {
  dirty = true;
  U.$("#schedSave", rootEl).disabled = false;
}

function paintTargetToggle() {
  const remoteBtn = U.$("#schedTargetRemote", rootEl);
  const localBtn = U.$("#schedTargetLocal", rootEl);
  if (!remoteBtn || !localBtn) return;

  remoteBtn.hidden = !data.remoteSupported;
  if (target === "remote" && !data.remoteSupported) target = "local";

  localBtn.setAttribute("aria-pressed", String(target === "local"));
  localBtn.classList.toggle("seg-btn--active", target === "local");
  remoteBtn.setAttribute("aria-pressed", String(target === "remote"));
  remoteBtn.classList.toggle("seg-btn--active", target === "remote");

  const bothActive = Boolean(
    data.local?.enabled && data.remote?.enabled && data.remoteSupported,
  );
  const warning = U.$("#schedDualWarning", rootEl);
  if (warning) warning.hidden = !bothActive;

  const note = U.$("#schedTargetNote", rootEl);
  if (note) {
    note.textContent =
      target === "remote" ? t("sched.noteRemote") : t("sched.noteLocal");
  }
}

// 服务端把 lastResult 以英文原文持久化进 SQLite（见 lib/scheduler.js），而语言
// 偏好只存在浏览器里，所以这里按已知的 7 种写法反查文案 key。认不出来的（比如
// 以后服务端改了措辞）原样显示，总比显示空白好。
const FIXED_RESULTS = {
  "skipped (a run was already in progress)": "sched.resSkippedRunning",
  "started after dashboard restart": "sched.resStartedAfterRestart",
  started: "sched.resStarted",
  "skipped (the API already had a run active)": "sched.resSkippedApiActive",
  "missed run skipped after dashboard restart": "sched.resMissedRestart",
};

function localizeResult(text) {
  if (!text) return null;

  const fixed = FIXED_RESULTS[text];
  if (fixed) return t(fixed);

  const failed = /^failed: ([\s\S]+)$/.exec(text);
  if (failed) return t("sched.resFailed", { msg: failed[1] });

  const grace = /^missed run skipped \(outside (\d+)-minute grace period\)$/.exec(
    text,
  );
  if (grace) return t("sched.resMissedGrace", { n: Number(grace[1]) });

  return text;
}

function paint() {
  syncCurrent();
  paintTargetToggle();

  const misfireGroup = U.$("#schedMisfireGroup", rootEl);
  if (misfireGroup) misfireGroup.hidden = target === "remote";

  if (!current) {
    U.$("#schedFormBody", rootEl).hidden = true;
    U.$("#schedUnavailable", rootEl).hidden = false;
    U.$("#schedSave", rootEl).disabled = true;
    return;
  }
  U.$("#schedFormBody", rootEl).hidden = false;
  U.$("#schedUnavailable", rootEl).hidden = true;

  U.$("#schedEnabled", rootEl).checked = Boolean(current.enabled);
  U.$("#schedCron", rootEl).value = current.cron || "";
  U.$("#schedSkip", rootEl).checked = current.skipIfRunning !== false;
  if (target === "local") {
    U.$("#schedMisfire", rootEl).value = current.misfirePolicy || "skip";
    U.$("#schedGrace", rootEl).value = current.misfireGraceMinutes || 60;
    U.$("#schedGraceField", rootEl).hidden =
      U.$("#schedMisfire", rootEl).value !== "grace-period";
  }
  renderAccountExclusions();

  U.$("#schedNext", rootEl).textContent = current.enabled
    ? current.nextRunAt
      ? `${U.fmtDateTime(current.nextRunAt)} (${U.fmtRelative(current.nextRunAt)})`
      : t("sched.notScheduled")
    : t("sched.disabled");

  if (target === "local") {
    U.$("#schedLast", rootEl).textContent = current.lastTriggeredAt
      ? U.fmtDateTime(current.lastTriggeredAt)
      : "\u2013";
    U.$("#schedResult", rootEl).textContent =
      localizeResult(current.lastResult) || "\u2013";
  } else {
    U.$("#schedLast", rootEl).textContent = "\u2013";
    U.$("#schedResult", rootEl).textContent = t("sched.notTrackedHere");
  }

  const excluded = current.excludedAccountIndexes || [];
  U.$("#schedExcluded", rootEl).textContent = excluded.length
    ? excluded.map((index) => `ACCOUNT_${index}`).join(", ")
    : t("sched.none");

  const tzLabel = U.$("#schedTz", rootEl);
  if (target === "local") {
    const offset = current.timezoneOffsetMinutes;
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset || 0);
    tzLabel.textContent =
      offset == null
        ? "\u2013"
        : `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } else {
    tzLabel.textContent = current.timezone || "\u2013";
  }

  dirty = false;
  U.$("#schedSave", rootEl).disabled = true;
  describe(current.cron || "");
}

function renderAccountExclusions() {
  const host = U.$("#schedAccounts", rootEl);
  if (!host) return;
  if (!accountOptions.length) {
    host.innerHTML = `<p class="empty-note">${U.escapeHtml(t("sched.noAccounts"))}</p>`;
    return;
  }
  const excluded = new Set(current?.excludedAccountIndexes || []);
  host.innerHTML = accountOptions
    .map((account) => {
      // \u6587\u6848\u91cc\u5e26 <strong> \u6807\u7b7e\uff0c\u53ea\u80fd\u539f\u6837\u63d2\u5165\uff1bemail \u5148\u8f6c\u4e49\u518d\u4ea4\u7ed9 t()\u3002
      const label = t("sched.excludeAccount", {
        index: account.index,
        email: U.escapeHtml(account.email),
      });
      return `<label class="check check--row">
                <input type="checkbox" data-exclude-account="${account.index}" ${excluded.has(account.index) ? "checked" : ""}>
                <span>${label}</span>
            </label>`;
    })
    .join("");
  U.$$("input[data-exclude-account]", host).forEach((input) =>
    input.addEventListener("change", markDirty),
  );
}

// 校验仍然交给服务端 /api/cron（只取 valid），但描述文本改由前端 cronText.js
// 按当前语言生成 —— 服务端返回的 description / error 都是硬编码英文。
async function describe(expr) {
  const out = U.$("#schedDesc", rootEl);
  if (!expr) {
    out.textContent = t("sched.enterCron");
    out.className = "sched-desc";
    return;
  }
  try {
    const res = await (
      await fetch(`/api/cron?expr=${encodeURIComponent(expr)}`)
    ).json();
    out.textContent = res.valid ? describeCron(expr) : t("cron.invalid");
    out.className = `sched-desc ${res.valid ? "sched-desc--ok" : "sched-desc--bad"}`;
    U.$("#schedSave", rootEl).disabled = !res.valid || !dirty;
  } catch {
    out.textContent = "";
  }
}

export default {
  id: "schedule",
  label: "Schedule",
  interval: 30000,

  mount(root, ctx) {
    rootEl = root;
    root.innerHTML = `
            <section class="panel" aria-labelledby="sched-heading">
                <div class="panel-head">
                    <h2 id="sched-heading">${U.escapeHtml(t("sched.heading"))}</h2>
                    <span class="panel-sub">${t("sched.headSub")}</span>
                </div>

                <div class="seg" id="schedTargetToggle" role="radiogroup" aria-label="${U.escapeAttr(t("sched.locationLabel"))}">
                    <button type="button" class="seg-btn seg-btn--active" id="schedTargetLocal" data-target="local" aria-pressed="true">${U.escapeHtml(targetLabel("local"))}</button>
                    <button type="button" class="seg-btn" id="schedTargetRemote" data-target="remote" aria-pressed="false" hidden>${U.escapeHtml(targetLabel("remote"))}</button>
                </div>
                <p class="hint" id="schedTargetNote"></p>
                <p class="empty-note chart-empty" id="schedDualWarning" hidden>
                    ${t("sched.dualWarning")}
                </p>

                <div class="form" id="schedFormBody">
                    <label class="check check--row">
                        <input type="checkbox" id="schedEnabled">
                        <span>${t("sched.enabledLabel")}</span>
                    </label>

                    <div id="schedMisfireGroup">
                        <label class="field">
                            <span>${U.escapeHtml(t("sched.misfireLabel"))}</span>
                            <select id="schedMisfire" class="input">
                                <option value="skip">${U.escapeHtml(t("sched.misfireSkip"))}</option>
                                <option value="run-on-startup">${U.escapeHtml(t("sched.misfireStartup"))}</option>
                                <option value="grace-period">${U.escapeHtml(t("sched.misfireGrace"))}</option>
                            </select>
                        </label>

                        <label class="field" id="schedGraceField" hidden>
                            <span>${U.escapeHtml(t("sched.graceLabel"))}</span>
                            <input id="schedGrace" class="input" type="number" min="1" max="1440" value="60">
                        </label>
                    </div>

                    <fieldset class="field">
                        <legend>${U.escapeHtml(t("sched.excludedLegend"))}</legend>
                        <div id="schedAccounts" class="schedule-account-list">
                            <p class="empty-note">${t("sched.loadingAccounts")}</p>
                        </div>
                    </fieldset>

                    <label class="field">
                        <span>${U.escapeHtml(t("sched.cronLabel"))}</span>
                        <input id="schedCron" class="input input--mono" type="text" placeholder="0 9 * * *"
                               spellcheck="false" autocomplete="off" aria-describedby="schedDesc">
                    </label>
                    <p class="sched-desc" id="schedDesc"></p>

                    <div class="preset-row" id="schedPresets">
                        ${PRESETS.map(
      ([key, expr]) =>
        `<button type="button" class="chip-btn" data-cron="${U.escapeAttr(expr)}" title="${U.escapeAttr(expr)}">${U.escapeHtml(t(key))}</button>`,
    ).join("")}
                    </div>

                    <label class="check check--row">
                        <input type="checkbox" id="schedSkip">
                        <span>${t("sched.skipLabel")}</span>
                    </label>

                    <div class="form-actions">
                        <button type="button" id="schedSave" class="btn btn-primary" disabled>${U.escapeHtml(t("sched.save"))}</button>
                        <button type="button" id="schedReset" class="btn">${U.escapeHtml(t("sched.discard"))}</button>
                    </div>
                </div>
                <p class="empty-note" id="schedUnavailable" hidden>
                    ${t("sched.unavailable")}
                </p>
            </section>

            <section class="panel" aria-labelledby="sched-state-heading">
                <div class="panel-head"><h2 id="sched-state-heading">${U.escapeHtml(t("sched.stateHeading"))}</h2></div>
                <dl class="kv">
                    <div><dt>${U.escapeHtml(t("sched.kvNext"))}</dt><dd id="schedNext">\u2013</dd></div>
                    <div><dt>${U.escapeHtml(t("sched.kvLast"))}</dt><dd id="schedLast">\u2013</dd></div>
                    <div><dt>${U.escapeHtml(t("sched.kvResult"))}</dt><dd id="schedResult">\u2013</dd></div>
                    <div><dt>${U.escapeHtml(t("sched.kvExcluded"))}</dt><dd id="schedExcluded">\u2013</dd></div>
                    <div><dt>${U.escapeHtml(t("sched.kvTz"))}</dt><dd id="schedTz">\u2013</dd></div>
                </dl>
                <p class="hint">${t("sched.stateHint")}</p>
            </section>`;

    const cronInput = U.$("#schedCron", root);
    cronInput.addEventListener(
      "input",
      U.debounce(() => {
        markDirty();
        describe(cronInput.value.trim());
      }, 250),
    );
    U.$("#schedEnabled", root).addEventListener("change", markDirty);
    U.$("#schedSkip", root).addEventListener("change", markDirty);
    U.$("#schedMisfire", root).addEventListener("change", (event) => {
      U.$("#schedGraceField", root).hidden =
        event.target.value !== "grace-period";
      markDirty();
    });
    U.$("#schedGrace", root).addEventListener("input", markDirty);

    U.$("#schedPresets", root).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-cron]");
      if (!btn) return;
      cronInput.value = btn.dataset.cron;
      markDirty();
      describe(btn.dataset.cron);
    });

    U.$("#schedTargetToggle", root).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-target]");
      if (!btn || btn.hidden) return;
      const next = btn.dataset.target;
      if (next === target) return;
      if (dirty && !window.confirm(t("sched.confirmSwitch"))) return;
      target = next;
      paint();
    });

    U.$("#schedReset", root).addEventListener("click", () => paint());

    U.$("#schedSave", root).addEventListener("click", async () => {
      const patch = fields();
      const btn = U.$("#schedSave", root);
      if (
        accountOptions.length &&
        patch.excludedAccountIndexes.length >= accountOptions.length
      ) {
        U.toast(t("sched.needOne"), "error");
        return;
      }
      btn.disabled = true;
      try {
        data = await ctx.api.saveSchedule(patch, target);
        paint();
        U.toast(
          patch.enabled
            ? t("sched.armed", { target: targetLabel(target) })
            : t("sched.disabledToast", { target: targetLabel(target) }),
          "success",
        );
        ctx.invalidate();
      } catch (e) {
        btn.disabled = false;
        U.toast(e.message, "error");
      }
    });
  },

  async refresh(ctx) {
    if (dirty) return;
    const [scheduleResp, accountsPayload] = await Promise.all([
      ctx.api.schedule(),
      ctx.api.accounts(0),
    ]);
    data = scheduleResp;

    // Land on whichever scheduler is actually doing something, the first
    // time we have real data to look at. Only ever runs once — after that,
    // whatever the person clicked wins, including on later refreshes.
    if (!initialTargetChosen) {
      initialTargetChosen = true;
      target =
        data.remoteSupported && data.remote?.enabled && !data.local?.enabled
          ? "remote"
          : "local";
    }

    accountOptions = (accountsPayload.accounts || []).filter(
      (account) => account.configured && Number.isInteger(account.index),
    );
    paint();
  },
};
