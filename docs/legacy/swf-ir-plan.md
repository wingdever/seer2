# SWF 精灵动画烘焙方案 · 设计文档(IR 层)

> 状态:设计稿 v1 · 2026-10-13
> 关联文档:`projects/bake/PIPELINE.md`(光栅烘焙管线)、`projects/rocoshowdown/NOTES.md`、`projects/bake/RESUME.md`
> 定位:本文档描述**矢量 IR 层**——在已完成的光栅 spritesheet 交付之上,把 SWF 动画转换为引擎无关的中间表示,使同一份数据可在 HTML 与 Godot 中运行。

---

## 1. 目标与定位

将 SWF 文件中的精灵动画转换为引擎无关的中间表示(Intermediate Representation, IR),使同一份数据能够在 HTML 和 Godot 中运行。

核心策略:**不做逐帧快照,按对象存变化,把每个实例抽成轨道,只记录变化,不记录状态。**

与现有资产的关系:

| 层 | 产物 | 用途 | 状态 |
|:---|:---|:---|:---|
| 光栅层 | `projects/bake/baked/<id>/<state>.{png,json}` spritesheet | 浏览器图鉴直放、低门槛播放 | 已完成(1604 宠) |
| 矢量层(本文) | `ir/<id>.json` + 共享形状库 | Godot/引擎复用、无损缩放、二次编辑 | 设计阶段 |

两层并存互不冲突:光栅层保底可播放,矢量层追求可移植与可编辑。

---

## 2. 第一版支持范围

### 2.1 支持

| 类别 | 内容 |
|:---|:---|
| 形状定义 | 轮廓路径(M/L/C/Z)+ 纯色填充 |
| 实例变换 | 平移、旋转、缩放、透明度 |
| 时间轴 | 关键帧 + 线性插值 |
| 生命周期 | 出现 / 消失 |
| 形状补间 | 仅拓扑不变时插值;拓扑变化时跳变或忽略 |
| 动作分段 | 按 SWF 帧标签(state)切分为多条命名动画 |

### 2.2 暂不支持(后续扩展)

- 位图填充(后续手动转 SVG 或单独处理)
- 描边样式
- 渐变填充
- 滤镜、遮罩、混合模式
- 形状补间的拓扑变化(后续考虑分段或逐帧烘焙)
- 嵌套 MovieClip 的变换继承(第一版扁平结构)
- ActionScript 交互逻辑

---

## 3. 核心设计原则

1. **数据与结构分离**:形状定义共享存储,实例只存变换和生命周期。
2. **轨道化而非快照化**:每个实例的每个可动画属性独立成轨道,只在变化处打关键帧。
3. **增量记录**:只记录状态变化,静止对象只保留少量关键帧。
4. **时间单位统一**:IR 内部使用秒(浮点),导入时按 SWF 帧率转换。
5. **拓扑不变才插值**:第一版只对点数、路径数一致的轮廓做线性插值。

---

## 4. IR 数据结构

```
IR
├── version                         schema 版本号(整数,递增)
├── source                          { swf: "<id>.swf", fps, stage: {w,h} }
├── shapes                          形状定义库(共享,按 shape_id)
│   └── [shape_id]
│       ├── paths[]                 每条路径
│       │   ├── commands[]          轮廓点序列:M/L/C/Z
│       │   └── fill                纯色填充 { type: "solid", color: "#rrggbb" }
│       └── topology_id             拓扑标识(点数 + 路径数 + 命令类型序列的哈希)
│
└── animations[]                    动画列表(= 动作状态)
    └── [animation]
        ├── name                    状态名(如 待机/物理攻击/必杀…)
        ├── duration                总时长(秒)
        ├── fps                     原始帧率
        └── instances[]             实例列表
            └── [instance]
                ├── id              实例 id(SWF character id)
                ├── depth           显示层深(时间轴内唯一槽位)
                ├── shape_ref       引用 shapes 中的形状
                ├── lifetime        { start, end }(秒)
                └── tracks          轨道集合
                    ├── transform[] 变换关键帧
                    │   └── { time, x, y, rotation, scaleX, scaleY }
                    ├── alpha[]     透明度关键帧
                    │   └── { time, value: 0..1 }
                    └── contour[]   轮廓关键帧(仅拓扑不变时)
                        └── { time, points[] }
```

最小示例(一个实例平移 + 淡出):

```json
{
  "version": 1,
  "source": { "swf": "139.swf", "fps": 24, "stage": { "w": 640, "h": 420 } },
  "shapes": {
    "101": {
      "paths": [{ "commands": [["M",0,0],["C",8,-6,18,-6,24,0],["Z"]], "fill": { "type": "solid", "color": "#e84b3c" } }],
      "topology_id": "t_4a1f…"
    }
  },
  "animations": [{
    "name": "物理攻击", "duration": 1.25, "fps": 24,
    "instances": [{
      "id": 101, "depth": 3, "shape_ref": "101",
      "lifetime": { "start": 0.0, "end": 1.25 },
      "tracks": {
        "transform": [
          { "time": 0.0,  "x": 120, "y": 200, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          { "time": 0.5,  "x": 180, "y": 200, "rotation": 0, "scaleX": 1, "scaleY": 1 }
        ],
        "alpha": [{ "time": 0.9, "value": 1 }, { "time": 1.25, "value": 0 }]
      }
    }]
  }]
}
```

---

## 5. SWF → IR 映射规则

| SWF 标签 | IR 映射 |
|:---|:---|
| `DefineShape`(1/2/3/4) | 生成 `shapes[shape_id]`,轮廓转 commands,纯色填充转 fill;样式/位图填充先跳过并计数 |
| `PlaceObject2`(move=false) | 新建 `instance`,记录 `shape_ref`、初始变换、`lifetime.start` |
| `PlaceObject2`(move=true) | 为对应实例追加变换/透明度关键帧 |
| `RemoveObject2` | 设置对应 `instance.lifetime.end` |
| `ShowFrame` | 推进时间轴,记录本帧发生的属性变化为关键帧 |
| `FrameLabel` | 划分 `animations[]` 边界(每个标签 = 一个状态段;本项目即 待机/攻击 等动作分段依据) |
| Matrix | 分解为 `x, y, rotation, scaleX, scaleY`(FIXED16 八分之一定点 → 浮点) |
| ColorTransform | 只取 alpha 部分,映射到 `alpha` 轨道 |
| `DefineShape2/3/4` 同 id 重定义 | 视为形状突变:追加新 `shape_ref` 关键帧(第一版不做跨形状插值) |
| 形状补间 | 每帧轮廓变化记录为 `contour` 关键帧;拓扑变化时跳变或忽略 |

### 关键帧定位逻辑

1. **首次出现**:`PlaceObject2` 且 `move=false` → 实例起点 + 第一个关键帧。
2. **后续变化**:同一 `depth` 的 `PlaceObject2` 且 `move=true` → 追加关键帧。
3. **消失**:`RemoveObject2` → 生命周期终点。

SWF 中关键帧是显式存储的,中间帧由播放器插值计算,转换器无需推断——这是轨道化成立的根基。

### 本项目语料的具体约定

- 输入:`swf/fight/<id>.swf`(1606 个;1055/3055 为加密非 SWF,永久排除,目标 1604)。
- 动作划分与光栅层保持一致:`待机/物理攻击/属性攻击/特殊攻击/必杀/被打/被暴击/胜利/失败/闪避/濒死/个性出场/合体攻击/变身效果`(`空` 状态跳过)。
- 舞台约 640×420,渲染缩放 2×(与光栅层 `scaleX/scaleY=2` 对齐)。
- 同一宠可先复用光栅层的对齐结果(`meta.json.offset`)作为 IR 整体偏移参考,便于两层互相对拍。

---

## 6. 转换管线

```
SWF 文件
  │
  ├─ 1. 解析标签流
  │     ├─ 识别 DefineShape / PlaceObject2 / RemoveObject2 / ShowFrame / FrameLabel
  │     └─ 提取 Matrix / ColorTransform
  │
  ├─ 2. 构建形状库
  │     ├─ 轮廓路径 → commands[]
  │     ├─ 纯色填充 → fill
  │     └─ 计算 topology_id
  │
  ├─ 3. 构建实例轨道
  │     ├─ 按 depth 追踪实例
  │     ├─ 首次出现 → 创建实例 + lifetime.start
  │     ├─ move=true → 追加 transform / alpha 关键帧
  │     └─ RemoveObject2 → 设置 lifetime.end
  │
  ├─ 4. 处理形状补间
  │     ├─ 拓扑不变 → contour 轨道 + 线性插值
  │     └─ 拓扑变化 → 跳变或忽略
  │
  └─ 5. 输出 IR JSON(ir/<id>.json)
```

实现选型建议:优先在 Node 侧做纯标签流解析(本项目已有 puppeteer/Ruffle 环境但不依赖其导出内部状态);若解析成本超预期,可用成熟解码器(如 `swf` npm 包或 ffswf/swfmill 的 dump)作为 1-2 步的辅助,自研只做 3-5 步的轨道化。

---

## 7. 运行时要求

### 7.1 HTML 端

- 用 Canvas 2D 的 `Path2D` 渲染矢量路径。
- 按时间采样各轨道,线性插值变换和透明度。
- 按 `lifetime` 控制实例的创建与销毁。
- 可直接挂进现有图鉴:新增第三种模式(光栅 / Ruffle / **IR 矢量**),与 `#btnMode` 切换机制同构。

### 7.2 Godot 端

- 自定义矢量渲染层,将路径动态构建为 `Polygon2D` 或网格。
- 自行实现轨道采样和线性插值(不依赖 `AnimationPlayer`,因为 IR 不是 Godot 原生格式)。
- 或编写导入插件,将 IR 转换为 Godot 原生 `Skeleton2D` + `AnimationPlayer` 节点树(仅限骨骼兼容部分)。

### 7.3 双端一致性

- 同一份 IR 在两端渲染结果需视觉一致。
- 建立验证用例:纯色矢量形状 + 基础变换的 SWF,双端对比。
- 建议量化指标:对若干时刻截帧,与 Ruffle 渲染同帧截图做像素级 diff,可控阈内为通过。

---

## 8. 实施步骤

| 阶段 | 任务 | 产出 |
|:---|:---|:---|
| 1 | 定义 IR JSON Schema | `ir/schema.json`(字段、类型、必填约束) |
| 2 | 实现 SWF 标签解析器 | 能解析 DefineShape/PlaceObject2/RemoveObject2/ShowFrame/FrameLabel |
| 3 | 实现 IR 生成器 | SWF → `ir/<id>.json` |
| 4 | 实现 HTML 运行时 | 能播放 IR 动画 |
| 5 | 实现 Godot 运行时 | 能播放 IR 动画 |
| 6 | 验证用例与对比 | 双端视觉一致 |
| 7 | 试点批:3~5 个代表性宠物 | 覆盖简单宠、必杀大特效宠、含形状补间宠 |
| 8 | 扩展:描边、渐变、嵌套 | 后续迭代 |
| 9 | 扩展:位图填充 | 后续迭代 |

试点批建议从现有语料直接取材:轻宠(如 id 1)、深帧宠(如 id 139,60 帧必杀)、以及光栅层已标记 `truncated=true` 的重特效宠——它们最能暴露 IR 层的解析难点,且光栅产物可直接作对拍参照。

---

## 9. 后续扩展路线

1. **描边样式**:在 fill 旁增加 stroke 定义(宽度/颜色/线端)。
2. **渐变填充**:增加 linear/radial gradient 类型。
3. **嵌套 MovieClip**:支持变换继承,实例可引用子动画。
4. **形状补间拓扑变化**:拓扑分段 + 段内插值,或逐帧烘焙。
5. **位图填充**:纹理引用 + 填充矩阵,或手动转 SVG。
6. **滤镜与遮罩**:定义效果抽象,目标引擎各自实现。
7. **AI 生成数据预留**:为未来 AI 工具链预留扩展字段(未知标签原文透传区)。

---

## 10. 风险与应对

| 风险 | 应对 |
|:---|:---|
| SWF 解析复杂度高 | 第一版只解析必要标签,其余跳过并计数,保留原文透传 |
| 双端渲染不一致 | 建立量化对拍(截帧 diff),逐项对齐 |
| 形状补间拓扑变化 | 第一版跳变或忽略,后续分段 |
| Godot 矢量渲染缺失 | 自定义渲染层,动态构建网格 |
| 数据膨胀 | 轨道化 + 增量记录 + 形状共享 |
| 同 id 形状被逐帧重定义(常见于渐变/换色) | 视为 shape_ref 突变,不做跨形状插值;IR 体积监控 |
| 与光栅层职责混淆 | 两层独立产物、独立验收;IR 失败不回退损坏光栅层 |

---

## 11. 验收标准(第一版)

- [ ] 能解析包含纯色矢量形状和基础变换的 SWF。
- [ ] 生成的 IR 包含 shapes、instances、tracks、lifetime。
- [ ] HTML 端能正确播放动画。
- [ ] Godot 端能正确播放动画。
- [ ] 双端渲染结果视觉一致(量化 diff 达标)。
- [ ] 静止实例不产生冗余关键帧。
- [ ] 拓扑变化的形状补间不导致崩溃或错误插值。
- [ ] 试点批(3~5 宠)全部通过上述各项。
