// cron 表达式的本地化描述。
//
// 为什么要在前端再写一遍：服务端 lib/cron.js 生成的描述是硬编码英文，而语言
// 偏好只存在浏览器里（服务端并不知道当前用户选了哪种语言）。所以校验仍然交给
// /api/cron（isValidCron），描述文本改由这里按当前语言生成。
//
// 解析规则与 lib/cron.js 的 parseField / describeWeekdays / describeCron 保持
// 一致，改动那边的规则时这里要同步。
import { t } from "./i18n.js";

function parseField(field) {
  if (field === "*") return { any: true };
  const stepMatch = /^\*\/(\d+)$/.exec(field);
  if (stepMatch) return { every: Number(stepMatch[1]) };
  const values = field
    .split(",")
    .flatMap((part) => {
      const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
      if (rangeMatch) {
        const [, a, b] = rangeMatch;
        const out = [];
        for (let i = Number(a); i <= Number(b); i++) out.push(i);
        return out;
      }
      return [Number(part)];
    })
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  return { values };
}

function describeWeekdays(field) {
  if (field.any) return null;
  if (field.every) return t("cron.everyNthWeekday", { n: field.every });
  const isWeekdays =
    field.values.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => field.values.includes(d));
  const isWeekend =
    field.values.length === 2 && [0, 6].every((d) => field.values.includes(d));
  if (isWeekdays) return t("cron.weekdays");
  if (isWeekend) return t("cron.weekends");
  return t("cron.timeJoin", {
    items: field.values.map((d) => t(`cron.dow${d % 7}`)),
  });
}

/**
 * 把 cron 表达式描述成一句人话。无法总结时返回原表达式（与服务端一致）。
 */
export function describeCron(expr) {
  if (!expr || typeof expr !== "string") return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  const minute = parseField(minuteRaw);
  const hour = parseField(hourRaw);
  const dow = parseField(dowRaw);

  // 限定了具体日期/月份的时间表：不猜，直接显示原表达式。
  if (domRaw !== "*" || monthRaw !== "*") return expr;

  if (minute.every && hour.any) {
    return t("cron.everyMinutes", { n: minute.every });
  }

  if (hour.every && minute.values?.length === 1 && minute.values[0] === 0) {
    return t("cron.everyHours", { n: hour.every });
  }

  // 固定分钟 + 一个或多个固定小时 —— 最常见的情况。
  if (minute.values?.length === 1 && hour.values && !hour.every) {
    const times = hour.values.map((h) =>
      t("cron.time", { hour: h, minute: minute.values[0] }),
    );
    const timesText = t("cron.timeJoin", { items: times });
    const dayPart = describeWeekdays(dow);
    return dayPart
      ? t("cron.onDaysAt", { days: dayPart, times: timesText })
      : t("cron.dailyAt", { times: timesText });
  }

  return expr;
}
