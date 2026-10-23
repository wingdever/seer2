# 网页端复刻线 · 移植笔记（地图 / 加解密 / 野怪 / HUD / 背包 / SPA / 负结果）

> 2026-10-15 从 `projects/rocoshowdown/NOTES.md` 拆出。这里的内容属**网页端复刻线**（`game/**`、`tools/**`）与**官方 seer2 线**（`tools/seer2-live`、`dll/`），与 rocoshowdown.cn 镜像本身无关。

---

## 地图 config XML 与栅格真值

原版每张地图有一份 `swf/map/config/{mapId}.xml`（我方已爬到 259 份），字段全集（按出现次数）：

```xml
<map name="监狱" weather="0">
  <resource url="1.swf"/>          # 场景 SWF
  <fightMap id="100010"/>          # 进战斗时用哪张战斗图
  <initialPoint x="600" y="470"/>  # 出生点 —— 原版保证可走
  <entities>
    <teleport id name pos="454,278" targetMapId="2"/>   # 308 处
    <npc .../> <node .../> <eventHandler .../> <click .../> <mouseOver .../>
    <dialog><reply><branch>  <HandlerOpenDialogPanel/ShowNpcSlogan/ToggleModule>
    <doorTeleport/> <mineport/> <dreamTeleport/> <trainingPet/>
  </entities>
</map>
```

**里面没有可走栅格**——可走性只存在于场景 SWF 的 `path_mc`。但 `initialPoint` 是一个
可用的**单点真值**：原版进图必定把角色放这里，它必然可走。

`node tools/grid-truth.mjs` 用它校验栅格极性，259 张图结果：

```
出生点可走=25   出生点被阻挡=22   越界=0   无config=212(非清单图)
→ 46.8% 的图把出生点判成阻挡
```

正常实现该是 ~0%。所以 `path_mc` 栅格大面积不可信，与手工观察一致（`3 新手任务小屋`
栅格 231x99 = 2310x990px，而地图只有 1200x660，包围盒被杂散形状撑大，且出生点判为阻挡）。

已定位到的一个确切缺陷：`game/swfshape.mjs` 的 `geometryOf()`（324-346 行）只按填充索引
把轮廓分组栅格化，**从不读填充色的 alpha**，所以"用透明色画的形状"也被算成阻挡；
而 AS3 侧 `BitmapData.draw` 会尊重 alpha。两套实现此前只在监狱一张图上对过（差 0.7%），
在别的图上可能系统性分歧。待办：把同一个真值测试改跑 AS3 栅格，分离"JS 光栅化的锅"
和"极性本身反了"。在此之前 `MapRunner.USE_GRID=false`，整图可走，栅格只作调试叠加。

### 世界连通图（已实现）

`<teleport pos targetMapId>` 就是原版的地图间移动。`tools/build-map-index.mjs` 把它连同
`initialPoint`/`resource url` 一起编进 `game/data/maps.json`（新增 `swfOk` 字段标注场景文件
是否已在本地）：259 张图 / 308 个出口 / 190 张图有出口，**出口目标 308/308 都能在清单里找到**，
所以跳图不会走进黑洞。只有 4 张图的场景 SWF 当时没爬到（90 草目氏族主城→10009.swf、
414/415→10041_4/5、423→10042_3），下拉框标 `⚠缺图` 并禁用，跳进去会 404 → `mapFail` → 退回上一图。

链路：`map.html` 把出口表压成 `"x|y|targetMapId|目标名"` 用 `;` 拼接（XML 里 `pos` 是 `"x,y"`，
必须拆开——直接把 `"454,278"` 当一个字段传进 AS3 会得到 `Number()==NaN`，角色走到 NaN 卡死）
→ `MapRunner.setWorld()` 解析并 `post({type:"mapWorld"})` → 宿主在 `#ov` 覆盖层画热区圈 + 目标名。
点击时 `spotAt()` 在 `HOT_R=26px` 内命中出口才把 `enter` 挂上，寻路目标改成出口坐标本身；
**抵达（route 走完）才 `post({type:"mapEnter"})`**，路过/中途改道都不会误触发。
宿主收到后调 `M.player.loadWorld(url, initX, initY, spots)`，同一个 Ruffle 实例内换图：
`onMap` 清空 world 后要记得把 actor 重新 `addChild`（清空图层顺手把角色也摘了，表现为换图后角色消失，
`getStatus` 里加了 `actor=on/detached/none` 就是为这个）。角色不重新下载 8 个部件包。

坐标空间对齐：`initialPoint`、`teleport pos`、`path_mc` 的 `matrix.tx/ty` 都是 **mapRoot 本地坐标**，
和 `world` 容器同一空间，不要再加 `mapX/mapY`（`mapX` 是地面图层包围盒原点，两者不同）。

实测（`MAP=122 TPCHAIN=123,124 node tools/verify-map.mjs`）：朽木桥 → 异蘑小径 → 异蘑谷，
每跳都落在目标图 `initialPoint`（418,523 / 472,513），角色动画与镜头照常，返回栈 `["122","123"]` 逐层回退。


## 加解密（DLL / 协议 / 资源）

来源：`onesrc.cn/p/flash-game-seer2-toss-diary-5.html`《flash页游seer2折腾日记5-协议的加解密》，
下面每一条都已用我方 `vendor/seer2-origin-as3` 反编译源码或本地文件互证过。

### 1. DLL SWF：前 7 字节 + zlib

`Client.swf` 登录成功后加载 `ClientAppDLL.swf` / `ClientCoreDLL.swf` / `TaomeeCoreDLL.swf`，
三者都是**加密 SWF，ffdec 打不开**。解密在 `net/DLLLoader.as` 的 `onComplete()`：

```as
if (_isDebug == false) _stream.readBytes(new ByteArray(), 0, 7);  // 丢弃前 7 字节
_stream.readBytes(_loc_3);
if (_isDebug == false) _loc_3.uncompress();                       // 默认 zlib
_loader.loadBytes(_loc_3, new LoaderContext(false, ApplicationDomain.currentDomain));
```

即 **`swf = zlib.inflate(bytes[7:])`**，一行还原。拿到明文 SWF 后 ffdec 可正常反编译——
这就是绝大多数游戏代码的来源。

**这条已实测，并补两个细节**（`dll/Seer2CoreDLL.swf`，6369339 B → 4221 个 AS3 类）：

- 前 7 字节是**全 0**，第 8 字节起才是 `78 9c` zlib。
- inflate 出来的**不是**裸 tag 流，而是一个完整的 **`CWS` v43** SWF（即**双层压缩**：
  外层自定义 7 字节 + zlib，内层还是标准 CWS）。所以**直接把 inflate 的结果写成 `.swf` 交给
  ffdec 就行**；千万别手贱去补 `FWS` 头 —— 那会把内层的 `CWS` 签名当成 tag 流，
  ffdec 只会读出 `tagCount` 乱码、导出 0 个文件（我踩过一次，症状和上面那个参数顺序坑一模一样，
  又是一次「静默空导出」）。
- 版本号 43 不是官方值，但**不需要**改成 42/24，ffdec 照读（`-info` 里 `version=43 / compression=ZLIB`）。

```bash
node -e 'const f=require("fs"),z=require("zlib");f.writeFileSync("/tmp/S2C.swf",z.inflateSync(f.readFileSync("dll/Seer2CoreDLL.swf").slice(7)))'
ffdec -dumpAS3 /tmp/S2C.swf | grep -E "Connection|CommandSet"     # 先确认读得懂
ffdec -export script /tmp/s2c-out /tmp/S2C.swf                    # 再整包导出（4221 类，几分钟）
```

**ffdec CLI 的两个坑（此前多次「导出空目录」的真实原因，与文件无关）**：

1. `-export` 的参数顺序是 **`-export <itemtypes> <输出目录> <输入文件>`** —— 输出目录在输入文件**前面**。
   写反了不会报错，只会打印 `Export finished. Total export time: 00:00.007 / OK` 然后留一个空目录，
   极易被误读成「这个 SWF 反不了」。用 `-help -export` 才看得到正确签名。
2. `<itemtypes>` 里没有 `as3`，AS3 代码要用 **`script`**。（`-dumpAS3 <swf>` 可先列类名确认它读得懂。）

另外要修正一条过宽的判断：**不是所有 dll/ 下的 SWF 都加密**。
`dll/LoginModule.swf` 就是普通 `CWS`（版本号还是非官方的 **43**），ffdec **直接**就能读
（`-info` 报 `compression=ZLIB`、`version=43`，导出 94 个 `.as`），不需要丢 7 字节也不需要解压，
改版本号也是白做 —— 三个 ClientCoreDLL 才需要。判据很简单：头三字节是 `CWS`/`ZWS` 就是普通压缩 SWF，
`DLLLoader` 那个「丢 7 字节」只针对带自定义前缀的那几个。

### 2. 通信协议：XOR + 移位混淆

报文（`core/net/message/RequestPacker.as`，全小端）：

```
明文  u32 数据长度x | u16 协议号 | u32 用户账号 | u32 消息序列号 | u32 校验码 | (x-18) 数据
密文  u32 加密后长度y | u16 协议号 | (y-6) 加密数据
```

`MessageEncrypt.encrypt/decrypt` 保留前 `NO_ENCRYPT_LEN = 6` 字节不加密（长度 + 协议号），
其余交给 `seer2/next/fcc/CLibInit.as`（`com.fcc` 那套 `ESP/F_malloc/li8/si8` 是**把 C 编译成 AS3**
的产物，`li8`=load 8bit、`si8`=store 8bit，所以看着像 C 运行时）：

```
密钥  KEY_RAW = "taomee_seer2_k_~#t"（18 字节，CLibInit.KEY）
加密  for j in [6, len): out[j] = KEY[(j-6) % 18] ^ bytes[j]        # 逐字节循环异或
      for j = len-1 downto 7: out[j] |= (out[j-1] & 0xFF) >> 3; out[j-1] <<= 5   # 相邻半字节错位
      out[6] |= 3
解密  out[j] = ((bytes[j] & 0xFF) >> 5) | (bytes[j+1] << 3); out[j] ^= KEY[i]
校验  Desc(cid, len, last_seq) = cid % 13 + len % 21 + last_seq + 147 - last_seq / 7
```

日记里那条"密钥在 21184 字节 binaryData 的偏移 208（0xd0）"也对上了：
`L__2E_str5 = S__2E_rodata + 208`，`S__2E_rodata` 由 `allocDataSect` 分配 21184 字节，
即 SWF `DefineBinaryData` 里那个 21184B 的 rodata 段；同包那个名字超长的 `DS2*` 类就是它的读取器。
**结论：密钥不在代码里硬编码于字符串，而是藏在 SWF 的二进制段中，靠 rodata 基址 + 偏移取用。**

登录链路：先明文请求 `http://cncsr2login.61.com/ip.txt` 换 session 与服务器地址，
之后与所选服务器全程走上面的加密通道。

### 3. 资源 SWF（精灵/装备/地图）并不加密

实测我方 `swf/fight/*.swf` 1604/1606 个都是普通 `CWS`（zlib 压缩 SWF），直接可读。
唯二的例外 `1055.swf` / `3055.swf` 也不是"加密"，而是**另一种容器**：
自定义头 + 一整张调色板 PNG 图集（3055: `png@44` 111x133；1055: `png@380` 2870x417），
即这两个精灵在抓取时已经是 H5 侧烘焙过的图集，不是 Flash 原件。
用 `node tools/try-decrypt.mjs swf/fight/1055.swf` 可复现这个判定（前 64 字节逐个试
inflate/inflateRaw/gunzip，全部落空）。

### 4. 对我方链路的意义

- 想再拿原始 AS3 代码：`ClientCoreDLL.swf` 那三个文件用「丢 7 字节 + zlib」即可还原，不需要任何密钥。
- 想解协议：`CLibInit` 已完整给出，18 字节密钥 + 两步变换，纯对称，可直接 Node 复刻。
  → 已复刻：`tools/seer2-live/lib/codec.mjs`（`node tools/seer2-live/lib/codec.mjs` 跑离线自测，
  含 encrypt→decrypt 逐字节往返与 `TcpSocket` 的 4 字节长度分帧）。这条「原生依赖」的风险假设是虚警。
- 精灵动画"身体被加密"的旧判断要修正：加密只发生在 **DLL 与网络协议**两层，
  资源层是明文 CWS；`1055/3055` 属于容器格式不同，不是加密。


---

## 野怪：地图上站怪 → 点击开战

原版链路（`vendor/seer2-origin-as3`，逐段对照移植到 `game/maprunner/WildPet.as`）：

- `app/lobby/messageHandler/MessageHandlerPetSpawn.as:22-58` 注册 `PET_SPAWN_1103`：
  `uint count` + 每条 `uint positionIndex, uint petResourceId, ushort level`（还有一个被忽略的 uint/byte），
  → `new SpawnedPet(resourceId, positionIndex, level)` → `MobileManager.addMobile(…, SPAWNED_PET)`。
  地图 **1/139/220 排除**（`:40`），192 有任务步门槛（`:35-38`）。
- `app/pet/SpawnedPet.as`：`isSpawnedPosition = 0..9`；`initialize()` = setResource + showLabel + addClickEventListener + hideAimation；
  `resourceUrl = URLUtil.getPetSwf(id)`；阴影 `UI_PetShadow` 且 `scaleX=scaleY=width/40`；
  标签 `setLabelStyle(13395456, 16777215)` + `"Lv"+level+" "+name`（等级 0 → `Lv???`）；
  `MAX_IDEL_INTERVAL=250`、`ACTOR_CLOSE_DISTANCE=20`、`generateMaxIdelTime() = 125 + 125*random()`；
  `checkIdleState()` 超 250 帧 → `playIdelAnimation()`，超 maxIdel → `randomWalk()`（在整个 `Rect(0,0,root.width, root.height-80)` 里随机取可走点）；
  点击 → `stopAction()`（站定 + `UI_FightSuprise` 挂在 `y = -height+20`，跑到 totalFrames 回收）
  → `actorMoveClose()`（脚下 ±20 方框取可走点 → `actor.runToLocation` → `MoveEvent.FINISHED` → `onActorReached`
  → `if (isActorArrived) startFight()` → `openInteraction()`）
  → `FightManager.startFightWithWild(positionIndex)`。
- `app/arena/FightManager.as:188` → `record/WildMonster.as:80-99` 发 `FIGHT_START_WILD_1500`，**载荷只有 positionIndex**，
  怪的种类/等级由服务端回。所以：
- **刷怪表在客户端不存在**，1103 的载荷本身就是服务端配置；连坐标都不存（`present()` 每次运行时随机）。
  我们的 `game/data/wild.json`（`tools/build-wild-index.mjs`）因此是**合成的**，只有字段语义照原版：
  槽位 0..9、等级、petResourceId。`NO_SPAWN = {1,139,220}` 照抄，等级带按地图深度分三档。
- `core/map/MapModel.as:135-141` 的 `fightMapId` 取自地图 XML 的 `<fightMap id>`，本地 258 张图有该字段、77 张战斗场景在库；
  缺图时 `map.html` 不带 `map` 参数，battle.html 退回缺省场景（已在图 70 验过）。
- `core/entity/Mobile.as` 的 `_labelPosition` 缺省 0 = `MobileLabelPosition.UNDER_FEET` → 标签贴在脚下、只横向居中，
  **不是头顶**。`core/utils/LabelRenderer.as` 是一次性把同一个 TextField 用矩阵画 5 遍
  （上(1,0)/左(0,1)/右(2,1)/下(1,2) 涂背景色，中(1,1) 涂前景色）到 `BitmapData(w+2,h+2)` 做描边。

本地偏离（都记在 `WildPet.as` 头注里）：

- `res/ui/UI_PetShadow.swf` / `UI_FightSuprise.swf` 在 CDN 上 404 —— 它们本就不是独立文件，
  `UIManager.getSprite` 是从**已加载的 UI 库的 applicationDomain** 里取。改用同仓库抽出的
  `UI_ActorShadow` / `UI_SurpriseMark` 帧包顶替；阴影把角色那圈金色光环用
  `ColorTransform(0,0,0,0.45)` 压成暗剪影（只借形状与帧动画）。出场特效取不到，
  原版 `checkout()` 返回 null 时本就直接 `showAnimation()`，行为一致。
- `randomWalk()` 的目标点限制在半径 `ROAM_R=160` 内，否则野怪会一路走出镜头。
- Ruffle 对纯 `Bitmap` 子对象的命中测试不可靠 → 额外叠一个 `beginFill(0,0)` 的矢量矩形当点热区。

## 主界面 HUD：压在地图之上的 uiLayer

原版链路：`core/scene/LayerManager` 把 `uiLayer` 和地图的 `mapLayer` 分家，`app/scene/LobbyPanel.show()`
按固定顺序往 uiLayer 里塞面板（ToolBar → PetAvatarPanel → MinorToolBar → MapTitlePanel → …），
每块面板自己 `UIManager.getMovieClip("UI_Xxx")` 取符号、自己算摆位。

Ruffle 里 `UIManager` 那条路当时看起来是死的（`ApplicationDomain.currentDomain.hasDefinition()` 全抛
#1065，见任务 #20）—— **这条结论后来被修正了**：导出类其实注册在**被载入 SWF 自己的**
ApplicationDomain 里，`src.loaderInfo.applicationDomain.getDefinition()` 能拿到 Class 并 `new`，
见下面「物品背包面板」。HUD 这一层仍然沿用注入路线（已经跑通，没必要为了统一去改）。
所以当时换成的是**只改数据模型**的路线：

- `tools/inject-ui-panels.mjs` 直接往 `swf/ui/UI_hud.swf` 的空根时间轴写 PlaceObject2，
  把 `UI_ToolBarUI / UI_PetAvatar_Panel / UI_ActorAvatar_Panel / UI_Toolbar_Minor / UI_MapTitle /
  rightToolbarBg` 以及 **6 份 `PetAvstarPetItem`**（AS3 没有 `DisplayObject.clone()`，
  一个背包格就是一次独立投放，各自 depth + 名字 `PetItem0..5`）变成根帧上的命名实例。
  面板内部的命名子对象（`mapBtn/petBag/chatInput`、`nameTxt/conisTxt`、`title→mapTitleTxt`、
  `petIcon→cell`）跟着符号一起进来，`getChildByName` 链与原版逐字一致
  （核对脚本 `tools/probes/tmp-panel-path.mjs`）。
- `game/maprunner/HudRunner.as` = 我们的 `uiLayer`：`MapRunner` 里它是 `world` 的兄弟容器且在
  `world` 之后 `addChild`，所以永远压着地图、又不参与 `placeActor()` 的相机平移（舞台坐标）。
  摆位逐条照抄反编译常量，一个都没自创：

  | 面板 | 原版出处 | 公式 |
  | --- | --- | --- |
  | ToolBar | `app/controls/ToolBar.as:layIcons` | `scaleX=stageW/1200`，`y = stageH - 342*scaleY` |
  | ActorAvatarPanel | `ActorAvatarPanel.as` ctor + `_showXPos/_hideXPos` | `x = 0 / -207`，`y = 0` |
  | PetAvatarPanel | `PetAvatarPanel.as` ctor | `x=169, y=100`；`_petListSp(180,31)`；展开格 `x=-182, y=2+(h+2)*i+37`；`bg.height=5+57*n` |
  | MinorToolBar | `MinorToolBar.as` ctor | `x=611`（收起 940）`, y=8`，`btnRetract.gotoAndStop(2)` |
  | MapTitlePanel | `MapTitlePanel.as:layOut` | `x = stageW/2 - 41*(stageW/1200)`，`y = stageH - height + 76` |
  | RightToolbarConter | `RightToolbarConter.as` | `_mcPanel(stageW,-30)`，`_mcBg.y=31` 置于 index 0 |

- 背包格图标：原版 `PetItem.initSet` 把 `IconDisplayer` 挂进 `petIcon.cell`（scale .8，(-2,-5)），
  图标来自 `res/pet/icon/{resourceId}.swf` —— 本地没镜像。改用 `/swf/pet/normal/{id}.swf`
  的 `standDown` 首帧（与野怪同一份原版动作包，`WildPet.packOf()` 复用已解码的那份），
  只按格子等比缩放、脚对齐格底。
- 宿主只喂内容：`game/app/scenes/mapScene.js` 的 `SAVE`（localStorage `rocoshowdown.save.v1`）+
  `game/data/pets.json` → `hudProfile/hudBag/hudTitle`，换图时随 `mapReady` 重推。

浏览器实测（`tools/probes/tmp-hud-crop.mjs`，图 1「监狱」）：6 块面板全部绑定成功、
背包格 1+5、悬停展开三格（奥罗/豚豚/啾啾 + HP 条 + 图标）、底栏 `actorBag/petBag/dicPanel`
点击都回报到宿主。**两处运行时坑**：

1. `PetAvstarPetItem` 的 `petIcon` 时间轴 depth2 是遮罩层，Ruffle 把 depth1 那个 `cell` 整层裁没
   → 原版挂法（`cell.addChild`）图标全隐。改挂到 `petIcon` 自己头上（depth 最大），位置用
   `cell.x/cell.y` 换算，版面不变。
2. TextField 换上去的中文没有墨（`UI_hud` 的 DefineFont2 只按设计期文本做了子集，
   「小赛尔 / 监狱 / 奥罗」都不在里头；`Lv1 / 5000 / 728/728` 这些 ASCII 正常）。
   所以 `HudRunner.flushTexts()` 每次把 `{key|x|y|WxH|text}` 报给宿主，
   `map.html` 的 `#hudtxt` 画布层只补描含非 ASCII 的那几条，字号取 TextField 自己的包围盒高。

## 物品背包面板（ItemBagPanel 复刻）

原版底栏「背包」→ `ActorBagWidgetClick` → `ModuleManager` 按需 load `module/app/ItemBagPanel.swf`。
单机复刻在 `game/maprunner/ItemBagRunner.as`，宿主侧 `game/app/scenes/mapScene.js` 的 `toggleBag()`。

- **素材路线和 HUD 不同：不用注入符号。** 关键实测（`tools/probes/bagtest/BagProbe.as`）：
  Loader 载入的 SWF，其 SymbolClass 导出类**注册在那个 SWF 自己的 ApplicationDomain 里**，
  `src.loaderInfo.applicationDomain.getDefinition(类名) as Class` + `new cls()` 直接可用。
  HUD 当年只验过 `ApplicationDomain.currentDomain.hasDefinition()` → 全 false，才退到注入那条路。
  这条正好是原版 `UIManager.getMovieClip()` + `new UI_Xxx()` 的语义，格子数量也不用在设计期预放。
- **物品字典**：`vendor/seer2-origin-as3/src/_assets/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml`
  （原版 `[Embed]` 的 9629 条、10 个大类）→ `tools/build-items.mjs` → `game/data/items.json`。
  图标路径不猜：`ItemConfig.getItemIconUrl` + `ItemIdRange` 是**按 ID 段**（不是 XML 的 Cat）路由到
  `res/item/<类>/icon/<id>.swf`，逐条抄进 build-items.mjs，产物里 `icon` / `iconOrigin` 两个字段就是结果。
  抓取：`tools/fetch-item-icons.mjs <id>…`（并发 3、每请求 150ms、跳过已有）。
- **版面常量是反推的**：原版这层的摆放写在模块自己的 DoABC 里，vendor 没有 `ItemBagPanel.as`。
  所以按 BagProbe 在 Ruffle 里量到的符号包围盒推：右箱 420x376 放 6 列 x 5 行、间距取格子画布宽 63
  （6x63=378 左右各余 21；5x63=315 + 页签 53 ≈ 376）。事后看，格子/页签/翻页的注册点都落在
  整数格上，反推是准的。页签 → 分类的对应里 `vip→MEDAL(5)`、`element→EMBLEM(3)` 仍是推断。
- **三个 Ruffle/AVM2 的硬坑**（都值得记住）：
  1. `Error #2069 The Loader class does not implement this method` —— **载入的显示对象摘不出 Loader**
     （`content.parent.removeChild(content)` 直接抛）。原先想"缓存一个对象、哪个格子要就搬过去"，
     结果 `putIcon` 全抛。改成原版 `IconDisplayer` 的做法：**每格常驻一个 Loader**，换物品就往同一个
     Loader 里 load 新 URL，缩放/摆位作用在 Loader 自己身上。
  2. `Loader.load()` 的返回值在 Ruffle 里可能是 `null` —— `var info:* = ld.load(...)` 然后
     `info.addEventListener` 抛 TypeError，把整条 `refresh()` 打断（表现是面板根本不弹，很像"没绑上"）。
     事件一律挂 `ld.contentLoaderInfo`。
  3. 页签符号的 `x/y` 是注册点，**真正的绘制在负偏移上**（equip 实例在 47,37 但包围盒是 -37,-50 40x51）。
     只靠美术命中的话，第一第二个页签点不着；给每个页签按 `getBounds` 钉一块 `hitArea` 才稳。
     同理格子也靠 `hitArea`（`ItemBagCellUI` 自带的 `bg` 是个带子层级的 MovieClip，会吃掉 ROLL_OVER）。
- `ItemBagCellUI` 自带的 `vipFlag` 角标**默认是显示的**，30 个空格子全戴 VIP 标。原版只在
  `VipOnly` 物品上显；这里建格子就统一藏起来，`fillCell` 再按 `items.json` 的 `viponly` 决定。
- 中文说明气泡走 DOM（`#bagtip`，`textContent` 拼，不用 innerHTML）：`UI_hud`/面板字体是子集，
  新写的中文没有墨（见「负结果记录」）。数量字 `x5` 是 ASCII，留在 SWF 里画。
- 验证：`node tools/probes/tmp-bag-shot.mjs`（开面板 → 悬停出说明 → 六个页签逐个点 → 关 → 收 4xx），
  `tools/probes/tmp-bag-icons.mjs`（看 bagStatus + 图标链），`tools/probes/tmp-bag-pix.mjs`（在画布像素里定位某个点）。
  当前结果：六个页签过滤正确（equip 1 / petRelate 9 / collection 2 / vip 1 / element 2 / petSpirtTrain 0），
  图标与数量正常，翻页码显示第 1 页，关面板隐藏，无资源 404。
  注：截图里网格左下那颗黄点是**地图本身透过面板半透明底显示出来的**（关面板也在同一位置），不是面板的毛病。

- **下一步（精灵背包 PetBagPanel 复刻）的交接文档：`docs/legacy/petbag-handoff.md`**，符号清单 `docs/legacy/petbag-symbols.txt`。
  冷启动直接读这两份即可 —— 本轮的可复用结论（ApplicationDomain 路线、四个 Ruffle/AVM2 硬坑、数据接口、
  验证脚本、以及「主面板导出名是裸类 `starPanel1`、格子符号 id1256 未导出」这两个关键差异）都写在里面。

## 精灵背包面板（PetBagPanel 复刻 · MVP 主体面板）

底栏「精灵」(HUD `petBag`) → `game/maprunner/PetBagRunner.as`，宿主侧 `game/app/scenes/mapScene.js` 的 `togglePetBag()`。
范围 = 主面板 `starPanel1`：出战 5 + 背包 12（翻页）+ 仓库 18 + TabUI 五页签 + 货币栏 + 关闭；详情/技能子面板未做。

- **素材**：头像路由抄 `URLUtil.getPetIcon` = `res/pet/icon/{resourceId}.swf`（resourceId==id），
  `tools/fetch-pet-icons.mjs`（预算 80、并发 2、160ms 间隔）按野怪池 48 只一次抓全，0 失败 → `swf/pet/icon/`。
- **符号差异坐实**（handoff 预警的两条都对）：导出名是混合清单，`starPanel1`/`TabUI` 是**裸名**，
  不能照抄 ItemBagRunner 的包前缀拼接；格子符号 id1256 未导出 → 只能 `getChildByName("bag"+i)` 摘时间轴实例。
  TabUI 不在 1377 时间轴上，要自己 `new` 挂 (20,6)。
- **`newGuideMc` 是本轮最大的坑**：TabUI 的第 7 个子对象，一个 937x506 的新手引导层默认可见，
  把左边四个页签的点击**连同它下面整块面板**（格子悬停/翻页）全吃掉 —— 实测只有 z 序在它上面的
  itemTabBtn 能点中。建好就 `visible=false`。同类：`heChenMc/zhezhuMc/newShow1/3/4` 弹窗层默认也是显的。
- **空 hitTest 的 SimpleButton 永远点不中**：`pageUp/pageDown` 是 SimpleButton（pinHit 只能钉在 Sprite 上），
  hitTest 帧是空的 → 任何位置都收不到 CLICK（`closeBtn` 同为 SimpleButton 但 hitTest 有内容，正常）。
  解法 = 在原位盖一块按 `getBounds` 画的透明 Sprite 代理收点击。
- **货币栏**：`smoney/money/starmoney` 是 TCMText 写不进字，且其**设计期文本**（"9100/9000/89"，ASCII 有墨）
  会和覆盖层叠成花字 → 能按 TextField 摘到的先清空，数值全走注册点旁的 ASCII 覆盖层（`setMoney`）。
- **面板尺寸**：`getBounds(panel)` 被引导层美术炸到 1000786x512（±50 万），居中/点算一律用实测硬编码 910x482。
- **几何**（PlaceObject 矩阵反推 + Ruffle 实测核对）：背包网格 x500 起、列距 60.45、行 y=76/134；
  仓库三行 y=242/300/357；出战五芒星 pet0(258,39) pet1(128,131) pet2(182,287) pet3(338,287) pet4(391,130)；
  closeBtn(865,22)、pageUp/Down(57,18/456)。页签按钮 166x44 两帧符号（1 常态/2 选中），
  `introduceBtn` 是 19x25 的 SimpleButton。runner 建好会自报「精灵背包点击点(面板内)」，验证脚本不再猜坐标。
- **数据**：`petRows()` 把 `SAVE.bag`（24 只，播种自野怪池）映射成 `{id,swfId,name,type,level,hp,hpMax,icon}`；
  前 5 行出战、其后每 12 条一页进背包、再往后 18 条铺仓库。中文提示走 `#bagtip` DOM（同物品背包）。
- 验证：`node tools/probes/tmp-petbag-shot.mjs --click`（HUD 真点击开 → 悬停/选中 → 五页签 → 翻页 → 关）+
  `tools/probes/tmp-petbag-census.mjs`（73+ 层清单与 TabUI 子清单落盘，注意 `#log` 只留 40 行，要先劫持 `logLine`）。
  当前结果：五页签全可切换、翻页 1→2 正确、closeBtn 关闭、24 图标 0 失败、货币 5000/0/0 与 SAVE 一致、无素材 404。

## 单页应用（移植 S0）：入口收敛到 `game/index.html`

- 两个页面合成两个场景组件：`game/app/scenes/mapScene.js` / `battleScene.js`，路由 `game/app/router.js`，
  引导 `game/app/main.js`，跨场景内存态 `game/app/state.js`（`window.APP = { lastResult, scene }`）。
  路由是 hash：`#/map?map=2&renderer=canvas`、`#/battle?wild=22&level=5&slot=4&back=2&map=100002`，
  **场景参数从 hash 的 query 读**，不再读 `location.search`（`main.js` 之后 `location.search` 恒空）。
- 原来的跨页契约 `sessionStorage['roco.battle.result.v1']` 换成 `APP.lastResult`：地图场景 `applyBattleResult()`
  读一次即置 null，所以**刷新即丢**（这正是内存态该有的语义），E2 断言随之改成
  「回图日志含 `✦ 战果:` 且 `APP.lastResult === null`」。
- `#wrap` 是唯一舞台，切场景走 `unmount()`：`wrap.innerHTML=''` + 摘掉 `message` 监听。
  这依赖 Ruffle 的一条实测行为 —— `<ruffle-player>` 的 `disconnectedCallback` 会 `destroy()`，
  所以清空 DOM 就是有效拆解，不需要额外调 player API。
  另两条依赖：`BattleKernel.events()` 用 `Set` 存监听并返回退订函数，同一函数重复注册不会叠加；
  战斗场景 `unmount()` 里必须置 `battle.armed=false; battle.over=true; battle.logEl=null`，
  否则遗留的 `await` 链会往复用着的 `#log` 里继续写回合。
- 地图场景 `mount()` 每次都重置 `_sessPromise`/`S` 并重解析 `SAVE`：整页刷新时代天然的「重读存档」在 SPA 里不会自动发生。
- 旧页面移到 `game/legacy/{map,battle}.html` 留作对照（仓库不是 git，不删）。`tools/` 下所有脚本已改指 hash 路由。
- 已知噪声（**不是 SPA 引入的**）：老页面重载地图时会有一条
  `HUD 喂数据失败: TypeError: p.hudProfile is not a function`。
  判据：`tools/probes/tmp-hudrace.mjs` 对同一动作（进图 → 反复点 `reloadBtn`）分别跑
  `game/legacy/map.html` 与 SPA `#/map`，**每轮挂载后各读一次 `#log`** —— `#log` 只留 40 行，
  末尾一次性统计会把前面的失败行截掉（我第一版就是这么误读成「两边各 1 条」的）：
  - `GAP=15000 N=3`：老页面 `boot fail2/ok1 → r0 3/2 → r1 4/3 → r2 5/4`，即每次挂载摊上一次；
    SPA `boot 0/1 → r0 0/2 → r1 0/3 → r2 0/4 → tail 0/4`，**0 失败、0 超时、每次挂载都 ok**。
  - 换序 `GAP=6000 N=4` 再跑一遍，结论同向：老页面逐轮 +1 失败，SPA 全 0。
  所以 SPA 的重载路径事实上没有这个竞态，老页面有；**机理未坐实**，只确认了
  `p.hudProfile` 这类方法是 SWF 里 `ExternalInterface.addCallback` 挂到播放器元素上的
  （`game/maprunner/MapRunner.as:112`），挂之前调用必抛，而 `loadMapRunner()` 的
  `ready` 有一条 25s 兜底超时（超时也照样 `M.player = p` 并 `pushHud()`）。
  移植时顺手把这条窗口显式化了：新增 `⚠ mapReady 25s 未回, 按超时继续` 与
  `HUD 暂缓: 播放器回调未挂, 等 hudBind/mapReady`（`pushHud` 先判 `typeof p.hudProfile === 'function'` 再喂），
  以后真出现就是可归因的，而不是像现在这样吞在 try/catch 里。

## 负结果记录

- **没找到同类的开源"整个私服前端"**。搜「洛克王国」只命中自动化脚本（Makapic/RocoPilot ★256、ColinHong10/NRC_AI ★169，按键精灵类），不是重制项目。**这条链路目前只有闭源实现。**
- **Ruffle 里 TextField 画不出中文**，两条路都堵：
  - 设备字体没有中日韩字形。`_sans/_serif/_typewriter` 以及直接写系统里真实存在的中文字体名
    （`Noto Sans CJK SC` / `WenQuanYi Micro Hei` / `SimSun`…）全部**墨点为 0**，只拿到 4px 的 notdef 前进宽度。
    原版能显示中文靠的是 Flash 播放器在 Windows 上的系统字体回退，Ruffle 不做这件事。
  - 嵌入字体被整个忽略。`tools/ttc-extract.mjs` 能把 `wqy-microhei.ttc` 的第 0 个字面重写成标准 SFNT，
    mxmlc `[Embed(..., embedAsCFF=false, unicodeRange=...)]` 也能编出 15KB 的子集，`Font.enumerateFonts()`
    里能看到它 —— 但 `TextFormat('WqyTest')` 的度量与 `_sans` **逐像素相同**（"Lv5" 都是 393 个墨点），
    说明 Ruffle 根本没用到它（mxmlc 出的是 DefineFont4，classic text engine 不认）。
  - 结论：野怪脚标改由 `game/app/scenes/mapScene.js` 的 `#lbl` 画布层描，五遍描边算法照搬 `LabelRenderer`
    （12px、前景 `#cc9900`、轮廓 `#ffffff`、UNDER_FEET 贴脚居中），文字内容/位置/配色不变。
    复现脚本：`tools/probes/fonttest/{FontTest.as,fonttest.html}` + `tools/fonttest.mjs`。
  - **补一条**：SWF 里自带的 TextField 也不是都能画中文。`UI_hud.swf` 的 DefineFont2 是**子集**，
    只含设计期那几个字，所以 `Lv1 / 5000 / 728/728` 有墨、换上去的「小赛尔 / 监狱 / 奥罗」没有。
    同一个原因也解释了为什么面板里印死的「战斗力 / 变身 / 训练师」照常显示 —— 那些是原版就有的字。
- **Ruffle 的 canvas 后端不支持 `BitmapData.draw`**：调用直接抛
  `RustError("Render backend does not support BitmapData.draw")`，而且这个错**不被 AVM2 的 `try/catch` 接住**，
  会把整个 `Loader.complete` 处理器打断。`MapRunner.onMap()` 里照搬原版 `extractPath()` 的那条路因此
  用编译期常量 `NATIVE_GRID=false` 关掉（否则 `mapReady` 永远发不出来，地图卡在载入中）。
  webgl 后端在软件 GPU 上 `readPixels` 回读要几十秒，也不可用；可走栅格继续由宿主的矢量解析提供。
- 印象中的 `webgl-compressed-texture-s3tc` 扩展库在猜测路径下 404，未定位到。
- ~~`1055` / `3055` 两只精灵"被加密、永久不可烘焙"~~ —— 判断错了。它们不是加密，是**容器格式不同**
  （自定义头 + 单张调色板 PNG 图集）。详见「加解密」第 3 条。
