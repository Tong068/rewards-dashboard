// 轻量 i18n：key → 文案查表 + {占位符} 插值。
//
// 设计取舍：
//  - 字典值可以是字符串（走 {name} 插值）或函数（用于英文复数等需要逻辑的场景）。
//  - 语言偏好存 localStorage，切换后直接 location.reload()。视图的文案大多在
//    mount() 里一次性写进 innerHTML，重挂载所有视图的成本和风险都高于整页刷新。
//  - index.html 的静态文案默认写中文（本项目主要面向中文用户），英文由
//    applyStaticI18n() 在启动时替换，这样中文下不会有文案闪烁。
import zhCN from "./locales/zh-CN.js";
import en from "./locales/en.js";

export const LOCALES = [
  { id: "zh-CN", name: "简体中文" },
  { id: "en", name: "English" },
];

const BUNDLES = { "zh-CN": zhCN, en };
const FALLBACK = "zh-CN";
const STORAGE_KEY_LANG = "rewards-dashboard:lang";

function detect() {
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || ""];
  for (const raw of langs) {
    const tag = String(raw).toLowerCase();
    if (tag.startsWith("zh")) return "zh-CN";
    if (tag.startsWith("en")) return "en";
  }
  return FALLBACK;
}

function stored() {
  try {
    const id = localStorage.getItem(STORAGE_KEY_LANG);
    return BUNDLES[id] ? id : null;
  } catch {
    return null;
  }
}

let locale = stored() || detect();
let bundle = BUNDLES[locale] || BUNDLES[FALLBACK];

export function getLocale() {
  return locale;
}

export function isZh() {
  return locale === "zh-CN";
}

/** Intl / toLocaleString 用的 BCP 47 标签。 */
export function intlLocale() {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

export function setLocale(id) {
  if (!BUNDLES[id] || id === locale) return;
  try {
    localStorage.setItem(STORAGE_KEY_LANG, id);
  } catch {
    // 私密浏览模式下写入会抛异常 —— 本次会话内切换仍然生效，只是记不住。
  }
  location.reload();
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * 取文案。缺 key 时回落到中文字典，再缺则原样返回 key（方便一眼看出漏翻）。
 */
export function t(key, vars) {
  let value = bundle[key];
  if (value === undefined && bundle !== BUNDLES[FALLBACK]) {
    value = BUNDLES[FALLBACK][key];
  }
  if (value === undefined) return key;
  if (typeof value === "function") return value(vars || {});
  return interpolate(value, vars);
}

/** key 是否存在（用于「有翻译就用，没有就保留原文」的场景）。 */
export function has(key) {
  return bundle[key] !== undefined || BUNDLES[FALLBACK][key] !== undefined;
}

/**
 * config 页的开关/字段文案按配置路径覆盖，避免把上百条 label/desc
 * 从 config.js 搬进字典。没有覆盖时返回 null，调用方保留源文件里的英文原文。
 */
export function configText(path) {
  return bundle.__config?.[path] || null;
}

/**
 * 填充 index.html 里的静态文案。约定：
 *   data-i18n="key"           → textContent
 *   data-i18n-html="key"      → innerHTML（文案含 &mdash; 等实体或标签时）
 *   data-i18n-attr="title:key;aria-label:key"
 */
export function applyStaticI18n(root = document) {
  document.documentElement.lang = locale;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const idx = pair.indexOf(":");
      if (idx === -1) continue;
      el.setAttribute(pair.slice(0, idx).trim(), t(pair.slice(idx + 1).trim()));
    }
  });
}
