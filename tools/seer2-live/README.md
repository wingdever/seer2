# seer2-live — 赛尔号2（约瑟传说）改服素材提取登陆器

## 目的声明

**本项目的主要目的是：通过本登陆器启动改服客户端，从改服下发的资源与配置中提取游戏资源素材**（地图背景、NPC 立绘、精灵图标/动画、界面素材、配置表等），供本仓库的本地复刻研究使用。

- **登进游戏是手段，不是目的**：只有让客户端完整跑起来，才能确认它的资源请求链、加载顺序与落盘格式；本 README 记录的启动阶梯即为此服务。
- **不是**提供长期在线的游戏客户端，也**不**是改服的分发/推广端；不修改改服、不调用写接口、不做压测。
- 提取出的素材版权归原权利方；**只在本地研究使用，禁止二次分发**（完整边界见文末「边界」）。

技术上，本目录把「Linux 无法跑 Flash」这个前提彻底推翻了，并记录可复现的启动阶梯。

## 如何启动（快速开始）

> 以下命令都在**仓库根**执行。正常使用走「网关模式」；直连模式只用来确认 Flash 能不能起。

### 1. 前置条件

- Linux x64 + 图形界面（窗口与 X11 截图判据都按 X11 写的）。
- Node.js（支持 ESM / 顶层 `await`；本机实测 v26）。
- 系统命令 `ar`、`bsdtar`（首次运行解 deb 用）。
- 改服客户端安装包放在 `projects/seer2-next-client-Linux-1.1.3-amd64.deb`。它被 gitignore，需要本机自备；`run.mjs` 只读它、不修改。
- **网关模式还需要**春树启动器的两份文件（同样在 `projects/` 下，被 gitignore）：
  - `projects/seer2-chunshu-launcher/src/common/core-net.js`（必需）
  - `projects/seer2-chunshu-launcher/src/variants/normal/local-game-index.normal.html`（缺失时回落到服务端 `play-local.html`，日志有提示）
- 能访问改服 `43.138.190.6`；版控未覆盖的文件由 core-net 回落官方 `seer2.61.com`。
- （可选，仅回归脚本用）`xwininfo` 与 ImageMagick 的 `magick`。
- 不需要 Wine，也不需要 Ruffle。

### 2. 两种启动模式

**A. 网关模式（日常使用 / 提取素材）**

```bash
SEER2_GATEWAY=1 node tools/seer2-live/run.mjs
```

走春树 `core-net` 源服务器，虚拟域名 `seer2.chunshu`，入口 `http://seer2.chunshu/seer2/`。这是能走到登录、进游戏、把资源落进缓存的模式。

默认 profile = `~/.config/seer2-live-app`；要隔离 / 多账号就另指目录（首次要重输凭据）：

```bash
SEER2_GATEWAY=1 SEER2_USER_DATA=~/.cache/seer2-live/profile node tools/seer2-live/run.mjs
```

想把请求打全，加 `SEER2_LOG_ALL=1`：

```bash
SEER2_GATEWAY=1 SEER2_LOG_ALL=1 node tools/seer2-live/run.mjs
```

全量资源归档默认开启；只想保留二进制 Smart Cache 时加 `SEER2_CACHE_ALL=0`：

```bash
SEER2_GATEWAY=1 SEER2_CACHE_ALL=0 node tools/seer2-live/run.mjs
```

**B. 直连模式（只验 Flash / 入口是否活）**

```bash
node tools/seer2-live/run.mjs
```

直接加载改服的 `http://43.138.190.6/seer2/play-local.html`。按实测，这条容易停在 `config/bean.xml`，**到不了登录模块**，不要拿它做素材提取或日常登录。可加 `SEER2_SHOT=/tmp/live.png SEER2_SHOT_AT=16000` 做页面截图自检（`capturePage` 抓不到 PPAPI 画面，详见下文）。

其他环境变量（`SEER2_BACKEND` / `SEER2_ENTRY_URL` / `SEER2_LOCAL_INDEX` 等）见下文「启动阶梯与实测证据」。

### 3. 首次运行会发生什么

1. `ensurePlugin` 从 deb 里取出 Linux 版 PPAPI Flash 34，落到 `~/.cache/seer2-live/flash/`。
2. `ensureRuntime` 解开同一个 deb 的 Electron 11 运行时到 `~/.cache/seer2-live/deb/`，再在 `~/.cache/seer2-live/runtime/` 搭软链；`resources/app` 指向本目录 `app/`（**官方 app.asar 不会被加载**）。
3. 拉起 Electron（`--no-sandbox --disable-gpu`），开一个 1200×660、标题 `seer2-live` 的窗口。
4. 网关模式还会启动本地 core-net 源服务器、挂 `interceptStreamProtocol('http')`、拉布隆路由；日志出现 `gateway-ready`、`cache-all-ready` 与一行行 `[live] gw 200 …` 就表示通了（`cache-all-ready` = 全量资源归档层已启用）。
5. 首次会边玩边下载资源并预热缓存；**deb 与仓库文件都不改**，运行时产物都在 `~/.cache/seer2-live/` 与 profile 目录下。
6. 之后启动复用这些缓存，通常更快。

### 4. 登录是手动的一步

- 改服**没有游客 / 自动登录**：客户端会停在登录页，必须由真人点「开始」。
- profile 里已有登录态时，点「开始」一般会自动回填；空的 / 新 profile 需要手动输入米米号与密码。
- 自动化点不进去：Electron 的 `sendInputEvent` 送不到 PPAPI Flash 插件，所以 `verify-live.mjs` 自动档只判到登录页；要判到进游戏得加 `--login` / `--keep`，由人完成这一步。
- ⚠️ profile 目录里存的是可重放的线上凭据（Cookie + SO），实验用临时 profile 用完就删。

### 5. 素材落点

- **资源缓存（主要落点）**：`~/.cache/seer2-live/game-cache/`。缓存分两层，写入同一棵目录树，都是**解压后的裸文件**（不是 deb 自带启动器那套加密缓存）：
  1. **二进制 Smart Cache**（春树 `core-net`）：只抓 `GET 200` 且扩展名属于 `swf / png / jpg / jpeg / mp3 / ogg`、大小 ≥ 64 B 的响应；命中后直接从磁盘回放。元数据在缓存根 `index.json`。
  2. **全量资源归档**（本启动器，默认开启）：归档其余**所有非页面 / 非动态端点的 `GET 200` 响应** —— `xml / json / js / css / txt / dat / data / bin / fnt / ttf / woff / gif` 等，以及 core-net 漏掉的二进制小文件；元数据在缓存根 `index-extra.json`。`res / module / dll / version / static` 下的**非二进制**文件命中后从磁盘回放；`config/` 与其它路径（含 `.json` 接口）**只归档、不回放**，避免旧数据卡住登录或进服。
  - `index-extra.json` 是数组，每项含 `url / relPath / ext / size / contentType / cachedAt / hitCount`，可据此批量转存。
  - 全量层只在网关模式生效；直连模式不经过 core-net 网关，不会落这套缓存。
  - 关闭全量层、只保留二进制 Smart Cache：`SEER2_CACHE_ALL=0`。
  - 需要让某个 `res/` 资源强制从服务端刷新时，删掉缓存里的对应文件即可（`config/` 本来就不回放）。
  - 全量层只记录客户端**实际请求过**的静态资源，不会主动遍历服务器；没被请求过的素材不会凭空出现。归档的是客户端实际收到的字节，若某些 GET 接口返回账号相关数据也会落盘，注意不要外传。
- **改服 vs 官方回落的目录前缀**：同一类资源会因来源不同落在两个位置 —— 改服下发的写裸 URL 路径（如 `res/pet/fight/90.swf`），改服版控未覆盖、回落到官方 `seer2.61.com` 的写 `http_seer2.61.com/` 前缀（如 `http_seer2.61.com/res/pet/fight/41.swf`）。所以某个目录里文件少**不等于**没请求过；查 `index.json` + `index-extra.json` 的 `url` 字段才是完整清单。
- **战斗素材路径速查**（相对 `game-cache/`，两套前缀下都适用）：

  | 路径 | 内容 |
  |---|---|
  | `res/pet/fight/{petId}.swf` | 战斗出场精灵动画 |
  | `res/pet/normal/{swfId}.swf` | 地图 / 普通形态动画 |
  | `res/pet/icon/{realId}.swf`、`res/pet/demo/*.swf` | 精灵图标、展示动画 |
  | `res/skill/effect/*.swf` | 技能特效 |
  | `res/skill/sound/*.mp3` | 技能音效 |
  | `res/skill/sideEffect/*.swf` | 附加效果 |
  | `res/pet/sound/*.mp3` | 精灵音效 |

  这些文件都是解压后的裸 SWF / MP3，可直接用 FFDec 打开或导出（`ffdec -export image <outdir> <file.swf>`）。
- **按需增长，不是全量素材库**：只有客户端实际请求过的资源才进缓存，总量随玩到哪里而变。2026-10-20 实测（全量层接入前，仅二进制部分）：登录并完成一场战斗后为 549 个文件 / 约 116 MB（战前为 457 个 / 约 99 MB），该场战斗新增 7 个 `res/pet/fight/*.swf`（3 个改服 + 4 个官方回落）、2 个 `res/pet/normal/*.swf`（官方回落）、26 个技能特效、26 个技能音效。全量层接入后，`config/seer.xml`、`config/binaryData/*.xml`、`res/map/config/*.xml` 等文本资源也会出现在同一目录树，总量继续增长。
- **不落盘的**：HTML 入口页（如 `play-local.html`）、`.php / .asp / .jsp / .do / .action` 等页面或动态端点、非 `GET` 或非 `200` 的响应不归档；socket 数据也不在 HTTP 缓存里。`.json` 接口与 `config/` 下的资源虽然落盘，但不会从缓存回放，仍以服务端返回为准。
- **请求日志**：控制台的 `[live] req` / `[live] gw 200` 行就是取数轨迹；全量层命中 / 落盘另有 `[live] extra-hit` / `[live] cache-all` 行。`SEER2_LOG_ALL=1` 会放宽到非图片类资源（图片被日志过滤掉，因此**不能拿日志当完整素材清单**）。
- **登录态不是素材**：profile 下的 `Pepper Data/Shockwave Flash/...` 是 SharedObject，不要和资源缓存混在一起。
- 提取出的素材版权归原权利方：**只在本地研究使用，禁止二次分发**（见文末「边界」）。

> 更细的探索记录、L1/L2/L3 实测与协议说明见下文各节；回归脚本见「回归入口」。

## 结论先说

**不需要 Ruffle，也不需要 Wine。** `projects/seer2-next-client-Linux-1.1.3-amd64.deb`
（改服项目组 ukuq 出的原生 Linux 客户端）里就带着**Linux 版 Flash PPAPI 插件**，
而它的运行时正是**Electron 11.5.0 / Chromium 87.0.4280.141 —— 与春树启动器完全同一版本**。

```
resources/runtime/linux/x64/libpepflashplayer64_34_0_0_330.dll
  → 文件名是 .dll，实际是 ELF 64-bit LSB shared object, x86-64, 19509216 字节
  → Flash Player 34.0.0.330（ccRelease，无 EOL 时间锁）
  → ldd 只依赖 libc/libstdc++/libm/libdl/librt/libpthread/libgcc_s，本机全部满足
```

因此原计划的 Stage 2（Ruffle socketProxy 分帧探测）作废：真 Flash 原生支持
`flash.net.Socket`，TCP 那条腿不需要任何 WS↔TCP 桥。实测已建立
`118.89.150.183:1277` 的 ESTAB 连接（见下文阶梯 L3）。

## 参考实现在 deb 里做了什么

解包 `app.asar`（302 个文件，只有 `out/main/index.js` 1192983 字节是自己写的代码，
其余是 koa + node-fetch）后的关键常量：

| 名字 | 值 |
|---|---|
| `DNS_ROOT` | `next-client-root.733702.xyz`（`dns.lookup` 得 IP，rootUrl = `http://<ip>/seer2`） |
| `SEER2_PATH` / `SEER2_PORT` | `/seer2` / `7337` |
| `SEER2_MEE_URL` | `http://seer2.61.com`（版控未覆盖的文件回落官方） |
| `LOCAL_HOSTNAME` | `seer2.client` |
| `LOCAL_ENTRY_URL` | `http://seer2.client/seer2/play-local.html?version=&platform=&arch=` |
| `BLOOM_PATH` | `/config/bloom-path.data`（与春树启动器同一个机制） |
| `CLIENT_CONFIG_PATH` | `/config/seer2-next-client-config.json`（远端下发菜单） |
| 版本闸门 | 版控里没有 `/version/seer2-next-client/v<APP_VERSION>` 就拒绝启动 |

它的模型是**源服务器 + 协议拦截**，不是 HTTP 代理：

```js
protocol.interceptBufferProtocol('http', createBufferProtocol('http'))
// hostname !== 'seer2.client'  → 直接 node-fetch 透传
// 否则按顺序：proxyFileRoot 本地目录 → 加密文件缓存 → rootUrl(改服) 或 seer2.61.com(官方)
// 缓存键 = md5(url) + "_" + url.length，内容用 aes-192-cbc(key=scryptSync(url,"salt",24), iv=0) 加解密
// 新鲜度用布隆过滤器双层判定：bloom(path) 与 bloom(path + "?v=" + mtimeMs)
```

`play-local.html` 是服务器侧文件（`43.138.190.6` 与 `o1.733702.xyz` 都有，4760 字节），
内容就是 swfobject 嵌 `Client.swf` 1200x660 + `wmode=opaque` + `allowScriptAccess=always`，
和春树的 `local-game-index.normal.html` 同构。窗口 `webPreferences.plugins = true`，
`appendSwitch('ppapi-flash-path', ...)` + `ppapi-flash-version 34.0.0.330`。

## 我方链路（复用春树网络层）

`app/gateway.cjs` 直接 require 启动器的 `src/common/core-net.js`（**未改动其源码**），
按启动器 main.js:12200-12310 的原样接法：

```
setBaseDir(common) → setGameBackend(backend) → setLocalGameIndex(variants/normal/local-game-index.normal.html)
→ setCacheDir → setUserReplaceRules([]) → startInterceptProxy() →
protocol.interceptStreamProtocol('http', → 绝对形式转发到 127.0.0.1:<port>)
```

全量资源归档层在 `lib/full-cache.cjs`，只包在 `protocol.interceptStreamProtocol` 外面；**core-net 源码仍未改**。

要点：**core-net 不是 CONNECT 代理，是绑在 127.0.0.1 的源服务器**，必须靠
`interceptStreamProtocol` 把 Chromium 请求灌进去（`session.setProxy` 那条路是错的）。
虚拟域名 `seer2.chunshu` 因此不需要 DNS。

`ensure-runtime.mjs` 把 deb 的 Electron 解到 `~/.cache/seer2-live/deb/`，再用
符号链接搭一个 `~/.cache/seer2-live/runtime/`，其中 `resources/app` 指向本目录 `app/`。
**exe 必须是真实拷贝**：Electron 用 `/proc/self/exe` 定位 `resources/`，
符号链接会把路径解析回 deb 目录，从而启动改服自己的 app.asar。

## 启动阶梯与实测证据

```bash
# 直连改服入口（只验 Flash）
SEER2_SHOT=/tmp/live.png SEER2_SHOT_AT=16000 node tools/seer2-live/run.mjs
# 走春树网络层
SEER2_GATEWAY=1 SEER2_LOG_ALL=1 node tools/seer2-live/run.mjs
# 日常玩：不设 SEER2_USER_DATA 就用默认 profile（~/.config/seer2-live-app，
# 用户自己的号 961073968 的 SO 已经在里面，登录页直接点开始即可）
SEER2_GATEWAY=1 node tools/seer2-live/run.mjs
# 想要隔离/多账号：另指一个 profile 目录（首次要重输凭据）
SEER2_GATEWAY=1 SEER2_USER_DATA=~/.cache/seer2-live/profile node tools/seer2-live/run.mjs
```

上表里的 L1/L2/L3 是**当时**的探索记录；现在的自动判据已经收进 `verify-live.mjs`（见文末「回归入口」）。
注意 `Client.swf` 的路径随承载页而变：春树的 `local-game-index` 用
`"http://"+location.host+"/Client.swf"`，即**虚拟域名根路径**；改服的 `play-local.html`
用相对路径，即 `/seer2/Client.swf`。写判据或加替换规则时别把两者混成一个。

| 级 | 判据 | 结果 |
|---|---|---|
| L1 直连 `http://43.138.190.6/seer2/play-local.html` | Flash 实例化、Client.swf 起播 | ✅ `Client.swf`→`config/seer.xml`→`version/zzz_config.txt`→`version/version1498790165.swf`→`dll/Assets.swf`→`config/bean.xml`，20s/45s 两帧有 3391 像素变化（舞台在动）。但从裸 IP 起会停在 bean.xml，走不到登录模块 |
| L2 `SEER2_GATEWAY=1` 用春树 `local-game-index.html` | 网关起来 + 布隆加载 | ✅ `[Proxy] intercept proxy on 127.0.0.1:41493`，`bloom bytes=14424`。但**Flash 没实例化**：该 html 里 `static/swfobject.js` 是相对路径，从 `/seer2/` 起解析成 `/static/…`；且官方 `gameSeer2.js` 抛 `Cannot read property 'style' of null` |
| L3 同 L2（修掉 swfobject 路径后） | 走到登录 UI 并登进去 | ✅ 全链路通了，见下 |

L3 实测请求序列（全部经我方网关，`[live] gw 200 …`）：

```
/seer2/  →  static/swfobject.js  →  Client.swf
config/seer.xml → version/zzz_config.txt → version/version1498790165.swf
dll/Assets.swf → config/bean.xml → config/Server.xml → dll/LoginModule.swf
res/login/{firstPage,backGround,moreUserLogin,mainPage,serverPage1,createRole}.swf
config/ip/sr2login.61.com → config/ip/ctsr2login.61.com
埋点 misc.js: stid=_newtrans_ sstid=fGetLoginSucc  uid=961073968   ← 登录成功
埋点 misc.js: sstid=fGetSrvlistSucc                                ← 服务器列表
dll/Seer2CoreDLL.swf                                               ← 按加密原样下发，客户端自己解
config/binaryData/*.xml（ItemConfig / SkillConfig / PetConfig / PetSkinConfig …）+ config/dyn-client-config.xml
埋点 misc.js: sstid=fSendOnlineReq item=前端执行进入Online服务IP:118.89.150.183 端口:1277
ss -tnp: ESTAB 192.168.31.66:38498 → 118.89.150.183:1277 (pid=网络服务进程)   ← TCP 腿成立
res/map/config/1071.xml, res/map/swf/100107_0.swf, res/npc/swf/172.swf,
module/app/{QuestPanel,MapPanel}.swf, res/item/pet/icon/200254.swf …          ← 已进游戏世界
```

两个和旧笔记不同的事实，值得记住：

1. **登录服务器地址不是 `cncsr2login.61.com/ip.txt`**，而是改服在虚拟域名下下发的
   `config/ip/sr2login.61.com` / `config/ip/ctsr2login.61.com`（两个都取，取完才 `fGetLoginSucc`）。
2. **`config/bloom-path.data` 客户端也会请求**，我方网关按启动器逻辑回 404，不影响流程。

CJK 文本在本机正常（`fc-list :lang=zh` 有 92 个字体，真 Flash 走 fontconfig 设备字体），
Ruffle 时代「中文空白」的问题在这条路上不存在。

### 视觉判据只能走 X11，不能用 `capturePage`

Electron `webContents.capturePage()` **抓不到 PPAPI 插件表面**（插件是独立进程绘制，
不进 Chromium 的合成层）。实测证据：L2（Flash 根本没起来）与 L3（已进游戏）的截图
`magick compare -metric AE` = **0**，两张逐像素完全相同、240862 色 —— 那是 DOM 背景，不是游戏画面。
所以 `SEER2_SHOT` 只能用来判断「页面载入了」，**不能**用来判断「Flash 画了什么」。

真画面要直接抓 X11 窗口（只抓我们自己的窗口 id，不抓 root，避免带入桌面上其它应用）：

```bash
DISPLAY=:0 xwininfo -root -tree | grep seer2-live-app     # → 0x2200007 "赛尔号2"
DISPLAY=:0 magick import -window 0x2200007 /tmp/live-x11.png
```

抓到的 `/tmp/live-x11.png` 是**已在游戏内**：精灵图鉴面板开在第 7/8 页（0630 皮肤「蓝霆雷耀」，
星级/身高/特性/专属纹章/简介齐全），左上角 Lv1「小赛尔」+65000 货币 +「测试工具」按钮，
底部导航 背包/精灵/图鉴/熔炼入口/指引/射击/好友/小屋/战队、商城、右上角 04:40 计时，
**中文全部正常渲染**。这与日志尾部的 `res/pet/icon/*.swf` + `res/pet/demo/*.swf` 批量取回一致。

补一组对照实验，把这条坑钉死：换用 `wmode=opaque` 的承载页
（`app/local-game-index.html`）再抓一次，`capturePage` 的结果与
`wmode=window` 的游戏内截图、以及 Flash **根本没实例化**的 L2 截图，三者 `AE` 全为 **0**
（逐像素相同）。→ Electron 11 的 `capturePage` 在任何 wmode 下都不含 PPAPI 内容，
**别指望用它做 Flash 判据**。同理，`webContents.sendInputEvent` 的鼠标事件也送不进插件：
按舞台坐标 (588,470)（= 窗口 465,654，「开始」按钮）注入点击后，埋点里始终没有
`开始按钮点击`，`uid` 停在 -1。**登录这一步目前只能真人用鼠标点**，自动化止步于登录页。

（`SEER2_LOCAL_INDEX` 现在支持仓库内相对路径，`gateway.cjs` 会按仓库根解析；
`SEER2_ENTRY_URL` 可在网关模式下换承载页。）

## 登录态与账号归属

`SEER2_USER_DATA` 固定 Electron 的 `userData`，登录态全在里面：

```
<userData>/Cookies                                       ← Chromium 管
<userData>/Pepper Data/Shockwave Flash/WritableRoot/
    #SharedObjects/<8位随机域>/<origin>/<uid>/*.sol       ← 精灵/设置/皮肤
    #SharedObjects/<8位随机域>/<origin>/common/login.sol  ← 账号表
```

`seer2-live` 的 origin 是虚拟域名 `seer2.chunshu`，所以 SO 与官方 next-client 的
`seer2.client`、春树启动器的 `login-data/` **互不可见**；换 origin 等于换账号库。

**登进去的就是用户自己的米米号 `961073968`（昵称「小赛尔」），凭据是用户手动输的。**
改服**没有游客/快速自动登录** —— 这条结论是被我自己一次错误推断逼出来的，记在这里防重犯：

我曾用全新空 profile 重跑、自己不发任何输入，看到日志照样 `开始按钮点击` →
`fGetLoginSucc uid=961073968`，就判定「这是改服内置的游客号」。错在把
「我没调 `SEER2_INPUT`」当成了「没有人在操作」：那一次用户就在机器前，亲手在那个窗口里
输了账号密码并点了开始。埋点里的 `开始按钮点击` 本身就是一条**人类点击**事件，不是自动流程。

反证很干脆：真正无人值守跑一遍（`verify-live.mjs` 自动档），客户端取完
`firstPage / moreUserLogin / serverPage / createRole` 就**停住**，`fGetLoginSucc` 永远不来，
`common/login.sol` 只写出一个 56 字节的空壳（有 `userAccount` 键、无 password、无 loginAccount）；
而用户手动登录过的两个 profile 里，同一个 `password` 混淆串 `Acda****…`（前缀已脱敏）与
`loginAccount 961073968` 都在。→ 凭据只能来自人。

顺带修正计划里的一处判断：登录**不是** HTTP 提交 —— 客户端先取
`config/ip/sr2login.61.com` / `config/ip/ctsr2login.61.com` 拿登录服地址，
密码验证在那条 TCP 腿上完成（HTTP 侧只有埋点 `misc.js` 与资源请求）。

计划 Stage 1 判据里的「能否找到注册入口」也有答案了：**有，就在登录页**。
X11 抓到的首页是「阿卡迪亚：传说」，底部三个控件 ——「注册米米号」「收藏赛尔号II」「开始」，
资源侧对应 `res/login/createRole.swf`。所以新号不需要去找项目组，页面上就能注册。

**凭据卫生**：SO 里存的不是明文密码，而是**双重 MD5 再按 8 字符一组轮换**
（`CookieAgent.getEncryptPassword`：`[0,8)[8,16)[16,24)[24,32)` → 拼成 `2+1+4+3`，自逆）。
但这**不等于安全**：客户端发给服务器的恰好就是同一个 `MD5(MD5(明文))`
（`MainLoginPanel:444`），所以存下来的那份**就是线上凭据本身**，拿到即可重放。
任何一份 profile 目录都约等于一份可用凭据，实验用的临时 profile（`/tmp/seer2-*`）用完就删。

（这里我先前写的「混淆存储而非哈希」是错的：底层确实是哈希，只是哈希之上又套了一层轮换，
而轮换后的值又正好等于要上线的值。结论没变，机制说反了，按代码改过。）

### 「下次打开要不要重输」—— 代码层面已有定论

不用重输，但**不是全自动**，中间还有一次选择。链路（`LoginModule.as` 反编译自
`dll/LoginModule.swf`）：

```
CookieAgent.init(rootUrl, callBack)      ← 启动就解析 SO，在闪屏之前
  └ parseSO() 读 userAccount / loginAccount 两份表，MAX_NUM = 3（只留最近 3 个号）
callBack() → showFirstPageView()         ← 「阿卡迪亚：传说」闪屏，只有 注册米米号/收藏/开始
点「开始」→ onLoginStart() → loginStart()
  ├ 有已存账号 → showMoreUserLoginPanel()   ← 多账号选择页（moreUserLogin.swf）
  │     选一个 → oneUserLogin 事件 → onOneUserLogin()
  │        └ _loginPanel.setAccountPassword(info.loginAccount, info.password)  ← 账号和密码都回填
  └ 没有 → showMainLoginView()             ← 空表单，只能手输
```

所以**只点一次「开始」就够了**（用户实测确认：「点完『开始』账号密码就自己填好了」）。
我先前根据 `onOneUserLogin` 推断成「两次点击（开始 → 选号）」，那是错的 ——
`LoginModule.as:262` 那个分支只有在**存了多个号**时才走 `showMoreUserLoginPanel()`；
只有最近一个号（`MAX_NUM = 3`，本机 profile 里就 1 个）时直接 `showMainLoginView()` 并回填。
教训：**分支条件要看全**，只看 `onOneUserLogin` 会把多账号路径当成唯一路径。

这也解释了为什么自动档日志里 `moreUserLogin.swf` 总是被取用：它在有无已存账号两条路上都会加载，
**不能**拿它当「登录态有效」的判据 —— 能当判据的只有 `fGetLoginSucc`。

**这条已被第二次真实登录实测**（同一个默认 profile、隔了一轮重启）：埋点序列是

```
基本数据 | 首页素材加载
基本数据 | 首页按钮点击        ← 只有一次点击，点完直接进
_newtrans_ | fGetLoginSucc
_newtrans_ | fStartSrvlistReq → fGetSrvlistSucc
_newtrans_ | fSendOnlineReq     （Online 118.89.149.189:1205）
_newtrans_ | fSocketOnline → fOnlineSucc → fSend1001Req → fLoadInfoSucc
```

`首页按钮点击` 与 `fGetLoginSucc` 之间**没有任何账号/密码相关的埋点**，
且 `common/login.sol` 在本次登录过程中被重新写过（mtime 与登录时刻一致）。
用户口述确认：**「点完『开始』账号密码就自己填好了」**。

另有一条与计划 Stage 0 的假设相左：登录**不只看 SO**，`getParamsFromJs()` 会从
`ExternalInterface.call("getUrlParams")` 读 `uid / sid / fromGameId / serviceType`，
`showAccount(sid)` 把 sid 的前 8 个 hex 字符 `parseInt(…,16)` 当账号、8..40 当会话。
也就是说承载页**可以**通过 JS 直接注入一个免登录会话 —— 这是网页 passport 那条路留下的接口，
`app/local-game-index.html` 目前没实现这两个 JS 函数，所以走的是 SO 那条。

### 计划 Stage 0 第 1 条（`_loginURL` 到底是什么）现在有确定答案

之前 `ffdec -export as3` 一直吐空目录，这条查不动。真实原因是 ffdec 的参数顺序写反了
（详见 `docs/legacy/web-client-notes.md` 的「ffdec CLI 的两个坑」：正确签名是
`ffdec -export script <输出目录> <输入文件>`，且 AS3 的类型名是 `script` 不是 `as3`）。
修正后 `Client.swf` 10 个类、`dll/LoginModule.swf` 94 个类，全部直接导出：

```
Client.as:208  载 config/seer.xml
Client.as:217  _loginURL = String(seerXml.login)      ← 登录模块的路径由改服的 seer.xml 决定
Client.as:303  loadLogin() → ROOT_URL + getVerURLByNameSpace(_loginURL)   （即 dll/LoginModule.swf）
Client.as:323  _loginContent["success"] = onLoginSuccess   ← 把回调**注入**进子模块
Client.as:324  _loginContent["setXmlInfo"](serverXML) / ["setVersionObj"] / ["init"](ROOT_URL)
Client.as:337  onLoginSuccess(param1:Object) → _loginData = param1 → loadDLL()
Client.as:419  ExternalInterface.addCallback("startWebSessionLogin", startWebSessionLogin)
Client.as:422  startWebSessionLogin(sid) → content["sessionId"] = sid; content["loginStart"]()
```

所以计划里那条「若登录由网页 passport 完成、SWF 只拿 session」的分支**确实存在**，
而且是官方留的一个 JS 后门：`Client.startWebSessionLogin(sid)` 可以在不点任何 UI 的情况下
直接推进到 `loginStart()`。但**它不是我们这台机器上走的路** —— 改服的 `seer.xml` 把
`login` 指向了自己的 `LoginModule.swf`，那条 UI（含 TCP 验密）才是实际生效的链路；
`startWebSessionLogin` 需要的 `sid` 格式（前 8 hex = 账号、8..40 = 会话）由 taomee 网页 passport 签发，
改服有没有对应的签发端未查，也不该去查（那是拿别人会话的事，越界）。

`onLoginSuccess` 收到的那个 `Object` 就是计划 Stage 0 想要的「1001 payload 里 session 的来源」：
`_loginData` → `loadDLL()` → `MainEntry.initialize1()` 接手，再由 `MainEntry.as:206-236`
发 `ONLINE_LOGIN_1001`。整条链现在闭合了。

## 回归入口

```bash
node tools/seer2-live/verify-live.mjs             # 自动档：跑到登录页为止，判完关窗
node tools/seer2-live/verify-live.mjs --login     # 等真人输凭据，判到进游戏（VERIFY_LOGIN_WAIT 毫秒，默认 300000）
node tools/seer2-live/verify-live.mjs --keep      # 判完保留窗口，直接玩（等同 --login）
```

自动档判据（当前全绿）：`Client.swf` 200 → `LoginModule.swf` 下发 →
登录页四件套 `firstPage / moreUserLogin / serverPage(或 serverPage1) / createRole` →
X11 抓到自己窗口且亮度 σ 非零 → 全程无 `plugin-crashed` / `render-process-gone`。
`fGetLoginSucc` / `fSend1001Req` / `res/map/*` 三格**必须有人**，没加 `--login` 就记 `–` 跳过，
不算失败（这正是把上面那个错误推断纠正过来后改的判据分层）。
每次用 `mkdtemp` 临时 profile，不污染正式登录态；用完记得删（里面可能有真人凭据）。

## 在线服协议：`lib/codec.mjs`

```bash
node tools/seer2-live/lib/codec.mjs     # 离线自测，15/15，不碰任何服务器
```

计划里把 `MEncrypt / MDecrypt / CLibInit.Desc` 当成**原生依赖**（`seer2.next.fcc` 这个名字像
C 扩展导出），并因此给 Stage 1 留了「找不到原生实现就卡住」的风险。实际不成立：
**反编译源码就在仓库里** `vendor/seer2-origin-as3/src/seer2/next/fcc/`，是纯 AS3，56 行读完：

- 密钥明文写在常量里 —— `KEY_RAW = "taomee_seer2_k_~#t"`（18 字节，循环异或）。
- `Desc(cid, len, lastSeq) = cid % 13 + len % 21 + lastSeq + 147 - lastSeq / 7`，
  序列号没有任何随机性，只是个线性递推（注意 AS3 的 `/` 对 int 是**向零截断**，负数与 `Math.floor` 不同）。
- 变换 = 循环 XOR 之后再整体左移 5 位、把溢出的高位补到下一字节的低 3 位；
  `NO_ENCRYPT_LEN = 6` 让「总长 + 协议号」这 6 字节**永远明文**（所以不解密也能按长度分帧）。
- `outBytes[j] |= 3` 不丢信息：那一位段刚被 `<< 5` 清空，纯粹是给解密留的填充标记。

帧布局（`Message.HEAD_LENGTH = 18`）：

```
明文  [uint 总长=18+body][short 协议号][uint sessionId][int 序列号][int Σ%100000][body…]
线上  [uint 总长+1][short 协议号]──以上 6 字节明文──[其余整段 XOR+移位，末尾多一字节]
```

分帧规则照抄 `TcpSocket.onSocketData`：读 4 字节 LE 长度，**载荷 = 长度 − 4**，且判定用
`bytesAvailable > 4`（严格大于），凑不齐就把整段退回临时缓冲等下一包。

自测覆盖的三件事：① `encrypt → decrypt` 在 body 0..40 字节的全部样本上**逐字节相等**
（用 `Uint8Array` 天然的 8 位截断模拟 AS3 ByteArray 的下标语义）；② 分帧器把两帧打散成
7 字节碎片喂进去，重组结果与原帧十六进制相同；③ `parseHead` 能解回自己发出去的
`commandId / userId`，以及 1001 / 999 的**字段对位**（body 长度、fromGame、session 原样字节、
tab 定长 64 补 0、IP 四段、端口 LE short）。

第 ③ 组不是补文档用的 —— 它当场抓出一个真 bug：`serialize()` 把数组传进了 rest-args 的
`bytes(...)`，于是**任何非空 body 都被压成 3 字节垃圾**，而 ① ② 两组全都没覆盖到这条路径
（① 用手工拼的明文做往返，② 只把自己的产出再喂回自己比对）。
教训：**往返自洽的测试如果两边共用同一个坏构造函数，是会全绿的** —— 必须有独立的
「字段对位」判据才能把构造函数本身证伪。

**这条测试证明的是「转写自洽」，不是「服务器认」**：仓库里没有抓到过真实线上字节
（两条 TCP 腿都由真 Flash 原生直连，没经过任何会记字节的中间层），所以要断言组包能被
改服接受，得先给 socket 腿加一层 L4 观测代理 —— 那是改网络路径的事，不在关键路径上，
本目录目前不做。

但**「转写的对象是不是改服真正在跑的那份代码」这一条已经交叉验证过了**：
`dll/Seer2CoreDLL.swf`（6369339 B，双层压缩，配方见 `docs/legacy/web-client-notes.md`）反编译出 4221 个类，
其中 `seer2/next/fcc/CLibInit.as` 与 `core/net/message/RequestPacker.as` 和
`vendor/seer2-origin-as3` 那份 2017 源**逐行一致** —— `KEY` 数组、`Desc` 公式、
`encrypt/decrypt` 两个循环、`packHead` 里硬编码的 `18 + param4`、`% 100000` 校验和、
`generateNewSequenceNum` 调 `CLibInit.Desc` 全对得上；差异只有 `NO_ENCRYPT_LEN` 被内联成字面量 6、
`|= 3` 被拆成临时变量，语义不变。所以这份 codec 对着的是线上那份实现，不是过期版本。

顺带把 1001 / 999 的字段布局钉死（`app/MainEntry.as:222-252` + `app/net/CommandSet.as` +
`org/taomee/utils/StringUtil.ipToBytes`）：

```
Connection.send(cmd, ...rest)  →  RequestPacker.pack(_userId, cmd.id, rest, "littleEndian")
                                   ↑ 帧头那个 uint 是 **uid**，不是会话票据；会话在 body 里

1001  ONLINE_LOGIN_1001 = [uint fromGame][session:ByteArray][64 字节 tab]
        GlobalsManager.fromGame / LoginInfo.session（ByteArray → writeBytes 原样拷）
        / getTopLeftTmcid()：LittleEndianByteArray.length = 64，写 GlobalsManager.tab，
          tab 为 null/"none"/"" 时写 "0"
999   DEPUTIZE_SEND_999 = [4 字节 IP][short 端口]
        ipToBytes 是按点分十进制逐段 writeByte；只在 _isDeputize 时先发，
        让代理 online 服转连真实 IP:Port（MainEntry.as:227-232）
```

`serializeBinary` 决定 body 怎么写：`Array` → 递归展开；`String` → `writeUTFBytes`
（**不带长度前缀**，所以字符串要么定长、要么放末尾）；`ByteArray` → `writeBytes`；
其余 → `writeUnsignedInt`（4 字节 LE）。`codec.mjs` 的 `serialize()` 就是这四条。

## 边界

- 只读取公开静态资源与改服自己下发的配置；没有 `wget --mirror`，没有并发压测，没调写接口。
- Flash 插件与 Electron 运行时只在 `~/.cache/seer2-live/` 下落地，不写入仓库；
  `projects/` 里的 deb 未被修改。
- 登录用的账号与游戏数据归改服项目组与账号所有者；本目录只为本地研究其运行方式。
- 产物有版权，禁止二次分发或用于同类站点。

## 待办

- [x] 登录态持久化：`SEER2_USER_DATA` → `app.setPath('userData')`，SO 与 Cookie 都随它走（见上）。
- [x] 确认「登进去」用的是谁：**用户自己的米米号 `961073968`（小赛尔），手动输的凭据**；
      改服无游客登录。我一度误判成内置游客号，反证与教训记在「登录态与账号归属」。
- [x] Stage 4 达成：用户自己的号进游戏，X11 抓到游戏内画面 + 在线服 ESTAB + SO 落盘。
- [ ] 若要接回春树的皮肤/替换面板：`setUserReplaceRules()` + `replace-rules.json` /
      `skin-mode-rules.json`，以及 `overlay.html` 系列悬浮面板移植。
- [x] 若要可观测协议：`lib/codec.mjs` 已完成并自带离线自测（见「在线服协议」）。
      计划里假设的「`MEncrypt/MDecrypt/Desc` 是原生依赖」被证伪 —— 纯 AS3，仓库里就有。
      现在两条 TCP 腿都由真 Flash 原生走通，这一项只是「看得见字节」的增强，不在关键路径上；
      要真拿线上字节做交叉验证，需要先给 socket 腿加 L4 观测代理，本目录暂不做。
