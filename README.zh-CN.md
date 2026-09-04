# Rewards Dashboard

[English](./README.md) | **简体中文**

[microsoft-rewards-script](https://github.com/thenetsky/microsoft-rewards-script) 的配套仪表盘，全程通过 HTTP 与脚本的 [Control API](https://github.com/thenetsky/microsoft-rewards-script/tree/v4/scripts/api)（`API_MODE=true`）通信。它在 `http://<host-ip>:8890` 上展示账号状态、积分总量与趋势，也能启动／停止／定时运行，并编辑脚本的配置。

## 截图

| 桌面端 | 移动端 |
| --- | --- |
| ![桌面端截图](./docs/Screenshot-dash.png) | ![移动端截图](./docs/Screenshot-mobile.png) |

## 功能特性
- **纯本地** —— 所有数据都存在本地，你的账号数据只属于你自己。
- **账号总览** —— 每个账号的积分、运行状态与错误高亮
- **积分累积条** —— 每个账号按天一格、按周分隔，趋势和错误一眼可见；悬停可看准确的日期／积分／总量
- **免密登录码** —— 显示两位数的免密登录码并带 60 秒实时倒计时，不必再从日志里翻找
- **历史记录** —— 解析后的事件存进本地 SQLite 数据库，重启不丢；不依赖脚本自身的内存日志缓冲
- **主题支持** —— 内置 Nord、Dracula、Catppuccin、Gruvbox、Tokyo Night 等多套主题！
- **响应式** —— 提供简化的移动端视图

## 快速开始（Docker）

1. 在脚本一侧启用 Control API —— 给 `microsoft-rewards-script` 服务设置 `API_MODE=true` 和 `API_TOKEN=<一串足够长的随机字符串>`，并开放 `3010` 端口。

> [!TIP]
> 同时在脚本一侧启用 `API_ALLOW_SCHEDULE_WRITE` 和 `API_ALLOW_CONFIG_WRITE`，仪表盘才能修改脚本的配置与定时计划。

2. 检查本仓库的 `compose.yaml`，把 `CONTROL_API_TOKEN`（写在它旁边的 `.env` 文件里）设成同一个 token。
3. 构建并启动容器：`docker compose up -d`。
4. 打开 `http://<host-ip>:8890` 访问仪表盘。

> [!WARNING]
> 两个服务必须共用同一个 Docker 网络，仪表盘才能按容器名访问到 Control API。
> 最简单的办法是把 rewards-dashboard 这一整段服务定义复制到脚本的 compose.yaml 里，参见 [sample-stack-compose.yaml](sample-stack-compose.yaml)。
> 另一种办法是建一个 docker 网络（例如 `rewards`），然后在脚本和仪表盘两边的 compose.yaml 里都加上：

```yaml
  networks:
    - rewards

networks:
  rewards:
    driver: bridge
    external: true

```

## 快速开始（裸机部署）
需要 Node 22.13 及以上版本（用到了内置的 `node:sqlite`）。零 npm 依赖。

```bash
# 在脚本仓库里
API_TOKEN=some-long-random-string node scripts/api/server.js
```

然后让仪表盘指向它 —— `CONTROL_API_TOKEN` 必须与 API 的 `API_TOKEN` 一致：

```bash
cp env.example .env       # 编辑 CONTROL_API_URL + CONTROL_API_TOKEN
npm start                 # http://localhost:8890
```

## 身份认证
仪表盘的登录保护是单独用 `DASHBOARD_USERNAME` 和 `DASHBOARD_PASSWORD` 配置的。
只有两个值都非空时才会启用 Basic 认证。把任意一个留空，打开仪表盘就不会弹出
浏览器登录框。这与仪表盘和 Control API 之间的认证无关 —— `CONTROL_API_TOKEN`
仍然必须与 API 的 `API_TOKEN` 相同。


## 可选的 API 开关

有两项功能由 _API_ 一侧控制，且默认关闭：

| 在 Control API 上设置           | 解锁什么                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `API_ALLOW_CONFIG_WRITE=true`  | **配置**页可以保存改动。不开的话配置是只读的，保存会返回 403（页面上会有提示）。                 |
| `API_ALLOW_CONFIG_REVEAL=true` | **配置**页的「显示密钥」开关。不开的话 webhook 地址和 token 会一直显示为 `***REDACTED***`。      |

---

## 标签页

**总览（Overview）** —— 统计卡片（账号数、总余额、上次运行、出错账号数、下次计划运行），脚本工作时还有一个带进度条和分账号行的实时运行面板，以及最近活动流。

**账号（Accounts）** —— 列出所有已配置的账号，并与日志里实际观测到的情况合并：当前余额、每日累积条、今日收益、成功／错误状态、当前连续天数、连续保护状态与剩余保护天数，还有一个详情抽屉（槽位、地区、语言、TOTP、恢复邮箱、代理、累计已收集）。账号信息存在脚本的 `.env` 里，所以这一页只做展示，不做编辑。

**日志（Logs）** —— 基于 SSE 的实时日志查看器。等级过滤、文本搜索、暂停（暂停期间继续缓冲）、自动滚动、加载更多、下载、清空。

**运行记录（Runs）** —— 每日收集的积分（14／30／90 天视图），加上一张运行历史表，以及一个可折叠的进程退出列表（从 API 取得）—— 它能抓到那些根本没来得及打出 `RUN-END` 行的崩溃。中途死掉的运行会被收尾并标记为 **已崩溃**（附退出码），而不是永远停在「运行中」。

**定时任务（Schedule）** —— 仪表盘自带的 cron。预设方案、带实时校验和人话描述的 cron 输入框、账号排除、漏跑补偿、「已在运行则跳过」、下次／上次运行时间和上次结果。它存在仪表盘自己的数据库里，到点会替你按下 API 的启动。

**配置（Config）** —— 脚本的 `config.json`。常用布尔项有快捷开关，另有原始 JSON 编辑器。保存时只发送**你改动过的字段的 PATCH**，绝不会提交整份文档 —— 所以你视图里被打码的 webhook 密钥不可能覆盖掉真实值。如果你真去编辑了被打码的字段，保存会被拒绝并给出说明。脚本自带校验器返回的校验错误会就地显示。

**诊断（Diagnostics）** —— 脚本抓取到的错误现场。错误文本、截图和 HTML 转储，都经由仪表盘转发。

标签页上方是常驻的控制条：**开始运行**、**停止**、**重启**，以及 ⋮ 菜单里的**强制停止**和**关闭控制 API**。登录审批码一出现在日志里就会立刻显示在页面顶部，并带倒计时。

---

## 工作原理

**一条 SSE 连接，扇出给所有页面。** 服务端只与 Control API 保持一条事件流，然后广播给每个打开的标签页（`lib/eventHub.js`），支持 `Last-Event-ID` 续传和重连退避。开十个浏览器标签，对脚本来说仍然只有一条连接。

**两条数据通路。** 日志行既实时推给浏览器，_也_ 经解析器写入 SQLite（`lib/store.js`）。API 只保留 2000 行内存缓冲、随进程一起消失；而仪表盘的积分历史、运行记录、活动和定时计划在两者重启后都还在。

**实时积分。** 脚本会在赚到积分时打印余额和每一次收益，API 把这些行折算成实时累计值（`GET /points`）。所以总览页能看到积分在运行 _过程中_ 就往上涨，而不是只有最终总数。某个账号跑完后，实时累计值会被权威的 `ACCOUNT-END` 数字替换。

**两层独立认证。** `CONTROL_API_TOKEN` 只会由仪表盘作为 Bearer token 发给 Control API，且必须与 API 的 `API_TOKEN` 相同。浏览器访问用的是另一套可选的 `DASHBOARD_USERNAME` 和 `DASHBOARD_PASSWORD`。

**零依赖。** 图表是手写的内联 SVG（`public/charts.js`），颜色取自 CSS 变量，所以会跟随主题、离线也能用。原版仪表盘的 14 套主题一并保留、未作改动。

---

## 环境变量

| 变量                   | 默认值                                  |                                                                                          |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `CONTROL_API_URL`     | `http://microsoft-rewards-script:3010` | Control API 的监听地址                                                                     |
| `CONTROL_API_TOKEN`   | -                                      | 发给 Control API 的 Bearer token，必须与 API 的 `API_TOKEN` 相同                            |
| `DASHBOARD_USERNAME`  | -                                      | 可选的 Basic 认证用户名；只有用户名和密码都设置了才会启用认证                                  |
| `DASHBOARD_PASSWORD`  | -                                      | 可选的 Basic 认证密码；两者任意一个留空即可关闭登录                                           |
| `PORT`                | `8890`                                 |                                                                                           |
| `TZ`                  | `UTC`                                  | 把积分按天归集所用的时区 —— 一定要设置                                                       |
| `DASHBOARD_TITLE`     | `Microsoft Rewards`                    | 页头标题                                                                                   |
| `POLL_MS`             | `5000`                                 | 状态轮询间隔（日志是流式推送的）                                                             |
| `LOG_REPLAY`          | `300`                                  | 数据流连上时回放多少行日志                                                                   |
| `DATA_DIR`            | `./data`                               | `dashboard.sqlite` 的存放目录 —— 全项目唯一会写入的文件夹。Docker 里设为 `/data`。            |

---

## 故障排查

**「控制 API 不可用」（Control API unreachable）** —— 仪表盘连不上 TCP。检查 `CONTROL_API_URL`。在 Docker 里，`localhost` 指的是仪表盘自己的容器：要用 API 的服务名，或者配合 `extra_hosts` 用 `host.docker.internal`。

**「控制 API 令牌被拒绝」（Control API rejected our token）** —— `CONTROL_API_TOKEN` ≠ `API_TOKEN`。

**浏览器不弹登录框** —— `DASHBOARD_USERNAME` 和 `DASHBOARD_PASSWORD` 必须都非空。任意一个为空时认证会被有意关闭。

**保存配置返回 403** —— API 启动时没有设置 `API_ALLOW_CONFIG_WRITE=true`。

**每日累积条的跨日时点不对** —— `TZ` 没设置。

**定时任务没有触发** —— 检查定时任务页的漏跑策略、被排除的账号，以及「上次结果」。

## 支持作者

如果这个项目对你有帮助，欢迎考虑捐赠以支持后续开发，谢谢：

[![Donate with PayPal](https://img.shields.io/badge/PayPal-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=R4QX73RWYB3ZA)
[![Liberapay](https://img.shields.io/badge/Liberapay-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/cammarata.m/)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://www.ko-fi.com/mgrimace)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/cammaratam)




