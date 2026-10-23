# 地图黑边 bug 修复记录（2026-10-20）

> 本文件是本次会话「消除 SWF 地图黑边 bug」的**独立、自足记录**。按人类要求**新建文档写入**，避免与并行编辑共享文档（map-impl.md / AGENTS.md）冲突。
> 代码已落：game/maprunner/MapRunner.as（onMap + placeActor）+ 重编译 game/maprunner/mapRunner.swf。
> 关联（共享文档里的小条目，若与并行编辑有冲突，**以本文件为黑边修复的真值**）：AGENTS.md §4.16④、docs/map/map-impl.md §7.3.16 / §8.12。

---

## 1. 症状

§4.16（人类 2026-10-20 选 C）把地图分流翻回「有 swf 映射走 Flash/AS3（enterSwfMode 进 mapRunner.swf）」后，约 170 张图重走 MapRunner.as 通路，部分图渲染后一边露黑边。黄金之路（map 360 → swf/map/10036.swf）最典型：

- canvas 后端：**右边一条黑**；
- webgl 后端：**左边缺一块**。

左右随后端不同，实为**同一个 bug 的两种露法**。人类手测确认**上游原版无此黑边** ⇒ 是移植版与上游的**相机分歧**，不是素材问题、也不是后端问题。

---

## 2. 病根

MapRunner.as 的 onMap 取 mapX = sizeMc.x / mapY = sizeMc.y，而 size_mc 只是个**尺寸标记**，它的 .x/.y 是它自己被 PlaceObject **摆放的位置**：

- 黄金之路 size_mc 摆在 (119, 51)，而真实地面 ground_mc 在 (0, -20)、尺寸 1200×700。
- placeActor 的相机算式 world.x = (sw - mapW) / 2 - mapX = 0 - 119 = **-119**，把整张图**左移 119px**：左边 119px 被挪出屏（裁掉）、右边空 119px（canvas 露黑 / webgl 露缺）。

**证据**：

- 上游 MapAssetExtractor.as:90-95（_x = _size.x）与 LayerManager.as:173-198。
- 10036.swf 拆包实测：size_mc 摆放 (119,51)、ground_mc drawnBounds (0,-20,1200×700)、content_mc 并集被装饰物（funnyFlower / teapot / funnyPet）的畸形巨 shape 污染到约 34000×24855（所以 world.getBounds 不可信，不能拿它缩放）。

---

## 3. 上游口径（照它改）

LayerManager.as:173-198 的相机**从不扣 mapModel.x/y**：

- 内容不超过舞台 ⇒ _loc4_ / _loc5_ = 0（mapLayer.x/y = 0，内容按原位铺）；
- 只有宽/高溢出舞台才 clamp(actor - stage/2, 0, size - stage) 跟随角色滚动。

移植版多扣了 mapX/mapY 才歪。

---

## 4. 修法（game/maprunner/MapRunner.as，已重编译 mapRunner.swf）

1. onMap：**位置改用内容包围盒**（mapX/mapY = ground.getBounds(world).x/y，真实内容位）；size_mc **只贡献宽高**（mapW/mapH = sizeMc.getBounds 的 width/height，沿用上游 _size 尺寸口径），**不再取它的 .x/.y 当位置**。
2. placeActor：相机对齐上游 —— 内容不超过舞台 ⇒ world.x/y = 0（原位铺，不扣 mapX/mapY）；宽/高溢出舞台才走原滚动 clamp(...)。world.scaleX/Y = 1（**不缩放**）。
3. 加一行诊断日志 mapExtent content=x,y 宽x高。
4. **未采纳 / 回退**：曾试「按 world.getBounds 等比放大铺满」—— content_mc 装饰物巨 shape 污染 getBounds、且上游本就不缩放，弃；也**回退**了误判的「地图默认 webgl 后端」（黑边是相机 bug、与后端无关，改回 canvas；URL 仍可 ?renderer=webgl/wgpu 试后端）。

---

## 5. 门禁

- tools/build-maprunner.sh（mxmlc + playerglobal 11.1）重编译通过。
- node --check（game/app/scenes/mapScene.js，.mjs 副本）通过。
- 围栏：本修动了 §4.11/§4.14「不碰 MapRunner.as / SWF 路逐字节不变」—— 属「对齐上游相机」的**授权例外**（AGENTS.md §4.16④ 追认）。

---

## 6. 请人测

1. **黄金之路铺满**：左右都不裁、不空、不黑边；地图 1200×700 比舞台高 40px，按上游口径上下各露/裁一点（可接受）。
2. **正常图回归**：抽 1 张一直正常的 SWF 图（如 10001 传送仓）⇒ 画面/走位/光口/NPC 与本批前一致（相机 offset 0 对满舞台图 = 原位，无变化）。
3. **窄图按上游**：抽 1 张窄图（size_mc 宽小于 1200，如 10024 / 1042 / 1170）⇒ 现按上游**左对齐（offset 0）**，右侧可能空（= 上游行为）；确认可接受（若要窄图也铺满，是偏离上游的额外决策，另议）。
4. **功能回归**：黄金之路走一圈 —— 点光口传送、点 NPC 对话/开战、点野怪开战、走位点击落点准确。
5. **诊断日志**（可选）：#log 里该图进图时有一行 mapExtent content=x,y 宽x高（黄金之路约 content=0,-20 1200x700），与上游口径互证。

---

## 7. 影响面

- 对所有「size_mc 被 PlaceObject 摆歪（它的 .x/.y 与内容原位不一致）」的 SWF 图都生效 —— 此前它们都被多扣了 mapX/mapY 而挪歪。
- 对 size_mc 摆在与内容原位一致的图无变化。
- JS/PNG 回退路（enterJsMode）不受影响（不走 MapRunner.as 相机）。
- 扫描实测：226 张地图 SWF 里 210 张 size_mc = 1200（满舞台）、3 张窄（10024=960 / 1042=960 / 1170=1131）、13 张无 size_mc。
