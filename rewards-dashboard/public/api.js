import { t } from "./i18n.js";

async function call(method, path, body) {
  const opts = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error(t("api.serverUnreachable"));
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // 服务端给了 error/message 就用它的原文（通常含上游原始报错，翻译反而丢信息），
    // 只有什么都没给时才用本地文案兜底。
    const err = new Error(
      (data && (data.error || data.message)) ||
      t("api.requestFailed", { status: res.status }),
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data ?? {};
}

export const api = {
  summary: () => call("GET", "/api/summary"),
  accounts: (historyDays = 365) =>
    call("GET", `/api/accounts?historyDays=${historyDays}`),
  runs: (limit = 50) => call("GET", `/api/runs?limit=${limit}`),
  logs: (limit = 500, level = null) =>
    call(
      "GET",
      `/api/logs?limit=${limit}${level ? `&level=${encodeURIComponent(level)}` : ""}`,
    ),
  errors: (limit = 100) => call("GET", `/api/errors?limit=${limit}`),
  loginCodes: () => call("GET", "/api/login-codes"),

  // schedule() returns { local, remote, remoteSupported }. saveSchedule's
  // `target` selects which scheduler the patch applies to: "local" (this
  // dashboard's own cron, default) or "remote" (the bot container's cron,
  // via its Control API's /schedule endpoint).
  schedule: () => call("GET", "/api/schedule"),
  saveSchedule: (patch, target = "local") =>
    call("PUT", "/api/schedule", { ...patch, target }),
  describeCron: (expr) =>
    call("GET", `/api/cron?expr=${encodeURIComponent(expr)}`),

  config: (reveal = false) =>
    call("GET", `/api/config${reveal ? "?reveal=1" : ""}`),
  replaceConfig: (cfg) => call("PUT", "/api/config", cfg),
  patchConfig: (patch) => call("PATCH", "/api/config", patch),
  configDiff: () => call("GET", "/api/config/diff"),
  syncConfig: () => call("POST", "/api/config/sync"),

  diagnostics: () => call("GET", "/api/diagnostics"),
  diagnosticFile: (name, file) =>
    `/api/diagnostics/${encodeURIComponent(name)}/${encodeURIComponent(file)}`,

  sessions: () => call("GET", "/api/sessions"),
  clearSession: (email) =>
    call("DELETE", `/api/sessions/${encodeURIComponent(email)}`),

  control: (action, body = {}) => call("POST", `/api/control/${action}`, body),
};

const cache = new Map();

export async function cached(key, fetcher, ttlMs = 4000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fetcher();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidate(key) {
  if (key) cache.delete(key);
  else cache.clear();
}