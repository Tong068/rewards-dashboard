import * as U from "../util.js";
import { cached } from "../api.js";
import { t } from "../i18n.js";
import { barChart } from "../charts.js";

let rootEl = null;
let runsPayload = null;
let accountsPayload = null;
let days = 30;
let openExit = null;

function dailyBars() {
  const histories = accountsPayload?.histories || {};
  const totals = new Map();

  for (const history of Object.values(histories)) {
    for (const day of U.bucketByDay(history)) {
      totals.set(day.dayKey, (totals.get(day.dayKey) || 0) + day.gained);
    }
  }

  const out = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = U.tzDayKey(cursor);
    out.push({ key, value: totals.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function renderChart() {
  const bars = dailyBars();
  const total = bars.reduce((sum, b) => sum + b.value, 0);
  const active = bars.filter((b) => b.value > 0).length;

  U.$("#runsChartMeta", rootEl).textContent = t("runs.chartMeta", {
    days,
    total: U.fmtSigned(total),
    active,
  });
  barChart(U.$("#runsChart", rootEl), bars, {
    emptyMessage: t("runs.noHistory"),
  });
}

// A single actual bot execution currently produces up to 4 rows in the
// underlying run history (a wrapper-level lock-acquire/release pair with no
// point data, alongside the app's own RUN-START/RUN-END pair that has the
// real numbers) - filter down to what's actually informative: rows with
// real data, plus anything that isn't a plain success (errors/crashes are
// worth seeing even without full data).
function hasData(r) {
  return r.accountsProcessed != null || r.totalGained != null || r.newTotal != null;
}
function isInformative(r) {
  if (r.status === "running" || r.status === "done") return hasData(r);
  return true;
}

function renderRuns() {
  const runs = (runsPayload?.runs || []).filter(isInformative);
  const body = U.$("#runsBody", rootEl);

  if (!runs.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty-note">${U.escapeHtml(t("runs.noRuns"))}</td></tr>`;
    return;
  }

  body.innerHTML = runs
    .map((r) => {
      const duration =
        r.runtimeMin != null
          ? U.fmtDuration(r.runtimeMin * 60)
          : r.startTs && r.endTs
            ? U.fmtDuration(
              (Date.parse(r.endTs) - Date.parse(r.startTs)) / 1000,
            )
            : "\u2013";
      return `<tr>
                <td>${U.statusPill(r.status)}</td>
                <td>${U.escapeHtml(U.fmtDateTime(r.startTs || r.endTs))}</td>
                <td>${U.escapeHtml(duration)}</td>
                <td class="num">${r.accountsProcessed != null ? U.fmtNumber(r.accountsProcessed) : "\u2013"}${r.totalAccounts ? ` / ${U.fmtNumber(r.totalAccounts)}` : ""}</td>
                <td class="num strong">${r.totalGained != null ? U.fmtSigned(r.totalGained) : "\u2013"}</td>
                <td class="num">${r.newTotal != null ? U.fmtNumber(r.newTotal) : "\u2013"}</td>
                <td>${r.version ? `v${U.escapeHtml(r.version)}` : "\u2013"}</td>
            </tr>`;
    })
    .join("");
}

function exitPill(exit) {
  if (!exit) return U.statusPill("idle");
  if (exit.code === 0)
    return `<span class="pill pill-success">${U.escapeHtml(t("runs.exit0"))}</span>`;
  if (exit.signal)
    return `<span class="pill pill-warn">${U.escapeHtml(exit.signal)}</span>`;
  return `<span class="pill pill-error">${U.escapeHtml(t("runs.exitCode", { code: exit.code ?? t("runs.na") }))}</span>`;
}

function renderExits() {
  const exits = runsPayload?.exits || [];
  const list = U.$("#exitList", rootEl);

  U.$("#exitsError", rootEl).hidden = !runsPayload?.apiError;
  if (runsPayload?.apiError)
    U.$("#exitsError", rootEl).textContent = runsPayload.apiError;

  if (!exits.length) {
    list.innerHTML = `<li class="empty-note">${U.escapeHtml(t("runs.noExits"))}</li>`;
    return;
  }

  list.innerHTML = exits
    .map((run, i) => {
      const failed = (run.accounts || []).filter(
        (a) => a.success === false,
      ).length;
      const ok = (run.accounts || []).filter((a) => a.success === true).length;
      const isOpen = openExit === i;
      const detail = isOpen
        ? `<ul class="runacc-list">${(run.accounts || [])
          .map(
            (a) => `<li class="runacc">
                            ${U.statusPill(a.success === false ? "error" : "success")}
                            <span class="runacc-email">${U.escapeHtml(a.email)}</span>
                            <span class="runacc-detail">${U.escapeHtml(a.error ? a.error : t("runs.accPts", { pts: U.fmtSigned(a.collected) }))}</span>
                          </li>`,
          )
          .join("")}</ul>`
        : "";

      return `<li class="exit-item">
                <button type="button" class="exit-head" data-exit="${i}" aria-expanded="${isOpen}">
                    ${exitPill(run.exit)}
                    <span class="exit-when">${U.escapeHtml(U.fmtDateTime(run.endedAt || run.startedAt))}</span>
                    <span class="exit-meta">${U.escapeHtml(
                      failed
                        ? t("runs.exitMetaFailed", {
                          pts: U.fmtSigned(run.collected || 0),
                          ok,
                          failed,
                        })
                        : t("runs.exitMeta", {
                          pts: U.fmtSigned(run.collected || 0),
                          ok,
                        }),
                    )}</span>
                    <span class="exit-chevron" aria-hidden="true">${isOpen ? "\u25BE" : "\u25B8"}</span>
                </button>
                ${detail}
            </li>`;
    })
    .join("");

  list.querySelectorAll("button[data-exit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.exit);
      openExit = openExit === i ? null : i;
      renderExits();
    }),
  );
}

export default {
  id: "runs",
  label: "Runs",
  interval: 20000,

  mount(root) {
    rootEl = root;
    root.innerHTML = `
            <section class="panel" aria-labelledby="runs-chart-heading">
                <div class="panel-head">
                    <h2 id="runs-chart-heading">${U.escapeHtml(t("runs.chartTitle"))}</h2>
                    <span class="panel-sub" id="runsChartMeta"></span>
                    <div class="seg" role="group" aria-label="${U.escapeAttr(t("runs.rangeLabel"))}">
                        <button type="button" class="seg-btn" data-days="14">${U.escapeHtml(t("runs.d14"))}</button>
                        <button type="button" class="seg-btn seg-btn--active" data-days="30">${U.escapeHtml(t("runs.d30"))}</button>
                        <button type="button" class="seg-btn" data-days="90">${U.escapeHtml(t("runs.d90"))}</button>
                    </div>
                </div>
                <div id="runsChart" class="chart-wrap"></div>
            </section>

            <section class="panel" aria-labelledby="runs-table-heading">
                <div class="panel-head">
                    <h2 id="runs-table-heading">${U.escapeHtml(t("runs.historyTitle"))}</h2>
                    <span class="panel-sub">${t("runs.historySub")}</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>${U.escapeHtml(t("runs.thStatus"))}</th><th>${U.escapeHtml(t("runs.thStarted"))}</th><th>${U.escapeHtml(t("runs.thDuration"))}</th>
                                <th>${U.escapeHtml(t("runs.thAccounts"))}</th><th>${U.escapeHtml(t("runs.thGained"))}</th><th>${U.escapeHtml(t("runs.thNewTotal"))}</th><th>${U.escapeHtml(t("runs.thVersion"))}</th>
                            </tr>
                        </thead>
                        <tbody id="runsBody"></tbody>
                    </table>
                </div>
            </section>

            <section class="panel" aria-labelledby="exits-heading">
                <div class="panel-head">
                    <h2 id="exits-heading">${U.escapeHtml(t("runs.exitsTitle"))}</h2>
                    <span class="panel-sub">${U.escapeHtml(t("runs.exitsSub"))}</span>
                </div>
                <p class="notice notice--warn" id="exitsError" hidden></p>
                <ul class="exit-list" id="exitList"></ul>
            </section>`;

    root.querySelectorAll("button[data-days]").forEach((btn) =>
      btn.addEventListener("click", () => {
        days = Number(btn.dataset.days);
        root
          .querySelectorAll("button[data-days]")
          .forEach((b) => b.classList.toggle("seg-btn--active", b === btn));
        renderChart();
      }),
    );
  },

  async refresh(ctx) {
    [runsPayload, accountsPayload] = await Promise.all([
      cached("runs", () => ctx.api.runs(100), 5000),
      cached("accounts", ctx.api.accounts, 5000),
    ]);
    this.redraw();
  },

  redraw() {
    if (!rootEl || !runsPayload) return;
    renderChart();
    renderRuns();
    renderExits();
  },
};
