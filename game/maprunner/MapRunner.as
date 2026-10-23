// 地图交互容器:复刻原版 MapAssetExtractor + MapConfigurator + PathScene + AStar 的最小可玩子集
// 素材 = 原版地图 SWF (swf/map/{id}.swf, 明文) + 裸装小赛尔帧序列包 (game/data/actor/*.bin, 抽自 swf/ui/UI.swf)
//        角色装配见 ActorView.as / FrameSequence.as (原版 EquipPlayer + MultipleEquipPlayer + FramePlayer)
// 规则来源 (vendor/seer2-origin-as3):
//   MapAssetExtractor.as:104-125  path_mc 栅格: GRID_SIZE=10, 本地坐标, 格数=path.width, 透明像素=可走
//   MapModel.as:106-115           canWalk(x,y) = data[x/gridSize][y/gridSize]
//   PathScene.as:54-69            ground_mc CLICK → localX/localY → actor.walk(x,y)
//   AStar.as                      8 邻域网格寻路
//   animation/frame/* + EquipPlayer + MultipleEquipPlayer + EquipSlotDepth
//                                 角色帧序列包装配 (见 ActorView.as)
// 可走栅格 = 原版 MapAssetExtractor.extractPath() 逐行照搬 (见 extractPathNative),
// 实测 Ruffle canvas/webgl/wgpu 三种后端 BitmapData.draw 均可用;
// 宿主页面 game/swfshape.mjs 另有一套直接解析 SWF 矢量记录的独立实现, 用于交叉校验 (差异 0.7%)。
// 但两套实现同一语义, 而这个语义本身对不上原版: 226 张图里 17 张"可走>90%", 新手任务小屋
// 一类填充/透明几乎整体相反, 个别图 path_mc 包围盒被杂散形状撑到 3349x1873 格。
// 在没有原版运行时真值之前 USE_GRID=false: 整图可走, 栅格只作为调试叠加层输出。
package
{
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.geom.Matrix;
import flash.geom.Point;
import flash.geom.Rectangle;
import flash.net.URLRequest;
import flash.system.Security;
import flash.utils.ByteArray;
import flash.utils.Timer;

public class MapRunner extends Sprite
{
    private static const GRID_SIZE:int = 10;      // 原版 MapAssetExtractor.GRID_SIZE
    private static const FALLBACK_CELL:int = 20;  // 无 path_mc 时的粗栅格 (px)
    private static const SPEED:Number = 4;        // 每帧移动像素
    // path_mc 的填充/透明极性尚未用原版运行时真值核过: 实测 226 张图里 17 张"可走>90%",
    // 新手任务小屋一类几乎完全反了, 个别图包围盒被杂散形状撑到 3349x1873 格。
    // 因此暂不拿它做阻挡 (整图可走), 解析结果只作为调试叠加层输出。见 docs/legacy/web-client-notes.md「栅格体检」。
    private static const USE_GRID:Boolean = false;
    // 原版 extractPath() 靠 BitmapData.draw 回读 path_mc, Ruffle 的 canvas 后端直接抛
    // "Render backend does not support BitmapData.draw", 而且这个错不被 AVM2 的 try/catch 接住,
    // 会把整个 Loader.complete 处理器打断 → mapReady 永远发不出来。栅格既已不参与阻挡,
    // 这条原版路径就关掉; 旁路校验 (宿主矢量解析 → setWalkGrid) 不受影响。
    private static const NATIVE_GRID:Boolean = false;

    private var world:Sprite;                     // 相机容器 (含图层+角色)
    private var hud:HudRunner;                    // 主界面 HUD: world 的兄弟层, 不参与相机平移
    private var bag:ItemBagRunner;                // 物品背包面板 (原版 module/app/ItemBagPanel.swf)
    private var bagReady:Boolean = false;
    private var petBag:PetBagRunner;              // 精灵背包面板 (原版 module/app/PetBagPanel.swf)
    private var petBagReady:Boolean = false;
    private var mapRoot:MovieClip;
    private var ground:DisplayObject;

    private var mapX:Number = 0, mapY:Number = 0, mapW:Number = 1200, mapH:Number = 660;
    private var freeRoam:Boolean = false;         // 无 path_mc 的场景类型: 全图可走

    // 寻路栅格 (原版 data[] 的等价物): 原点 pOx/pOy, 边长 pCell, pW x pH 格
    private var pOx:Number = 0, pOy:Number = 0, pCell:Number = FALLBACK_CELL;
    private var pW:int = 0, pH:int = 0;
    private var gridReady:Boolean = false;        // 栅格数据已解析出来 (仅供叠加层/交叉校验)
    private var gridOn:Boolean = false;           // 栅格是否参与阻挡 = USE_GRID
    private var gridBits:String = "";             // '1' = 被 path_mc 填充 = 不可走

    private var actor:ActorView;
    private var ax:Number = 0, ay:Number = 0;     // 角色世界坐标
    private var route:Array = [];                 // 待走航点 (Point 世界坐标)
    private var moving:Boolean = false;
    private var lookUp:Boolean = false;           // 原版: 上下是两套美术, 由 y 方向决定并保持

    private var ready:Boolean = false;
    private var puppet:Boolean = false;           // ★M9：提线位 = 角色走位/相机由 JS 逐帧驱动（见 docs/map/map-swf-puppet.md）
    private var inst:String = "";
    private var frameN:int = 0;

    // 世界出口 (config XML 的 <teleport pos targetMapId>): {x, y, target, label}
    private var spots:Array = [];
    private var enter:Object = null;              // 本次点击锁定的传送点, 抵达后才切图
    private var spawnX:Number = -1, spawnY:Number = -1;
    private var mapUrlNow:String = "";            // 当前场景 SWF 路径 (角色换色时重载本图用)
    private static const HOT_R:Number = 26;       // 点击判定半径 (px)
    private static const ARRIVE_R:Number = 18;    // 抵达判定半径 (px)

    // 野怪 (原版 socket 1103 的载荷 = 服务端配置, 已不可得; 出怪表由 tools/build-wild-index.mjs 合成,
    // 字段语义仍是原版的 positionIndex/petResourceId/level)。表现层逐段对照 SpawnedPet.as, 见 WildPet.as
    private var pets:Array = [];
    private var wildStr:String = "";
    private var wildSpec:Array = [];
    private var wildReady:Boolean = false;        // 阴影/标记共享包已就绪
    private var fightOut:Boolean = false;         // 已发起战斗, 不再响应任何交互
    private var callCb:Function = null;           // 野怪把角色叫到脚下的抵达回调

    // HUD 数据在 UI_hud.swf 到位前先到, 缓存下来等 hud.load 完成再灌
    private var pendingBag:Array = [];
    private var pendingTitle:String = "";
    private var pendingProfile:Array = [];
    private var pendingItemBag:Array = [];        // 物品背包数据同理 (ItemBagPanel.swf 到位前先到)
    private var pendingPetBag:Array = [];         // 精灵背包数据同理

    public function MapRunner()
    {
        Security.allowDomain("*");
        stage.align = "left";
        stage.scaleMode = "noScale";
        inst = loaderInfo.parameters.instanceId || "";
        // ★M9：puppet 默认开（全图一致）；调试 `#/map?…&puppet=0` 经 URL 参数透传关旧链（回退保险）。
        puppet = (loaderInfo.parameters.puppet || "1") != "0";
        FrameSequence.debug = ActorView.debug = function(m:String):void { log("actor " + m); };
        WildPet.debug = function(m:String):void { log("wild " + m); };
        ExternalInterface.addCallback("loadWorld", jsLoadWorld);
        ExternalInterface.addCallback("walkTo", jsWalkTo);
        ExternalInterface.addCallback("setWalkGrid", jsSetWalkGrid);
        ExternalInterface.addCallback("actorVisible", jsActorVisible);
        // ★M9：提线协议 —— JS 逐帧喂角色位（setPos 回报相机 world.x/y 供校准）、野怪走到点后回应（walkReached）
        ExternalInterface.addCallback("setPos", jsSetPos);
        ExternalInterface.addCallback("walkReached", jsWalkReached);
        ExternalInterface.addCallback("getStatus", jsGetStatus);
        ExternalInterface.addCallback("petPositions", jsPetPositions);
        ExternalInterface.addCallback("hudBag", jsHudBag);
        ExternalInterface.addCallback("hudProfile", jsHudProfile);
        ExternalInterface.addCallback("hudTitle", jsHudTitle);
        ExternalInterface.addCallback("hudToggle", jsHudToggle);
        ExternalInterface.addCallback("hudStatus", jsHudStatus);
        ExternalInterface.addCallback("bagOpen", jsBagOpen);
        ExternalInterface.addCallback("bagItems", jsBagItems);
        ExternalInterface.addCallback("bagMoney", jsBagMoney);
        ExternalInterface.addCallback("bagStatus", jsBagStatus);
        ExternalInterface.addCallback("petBagOpen", jsPetBagOpen);
        ExternalInterface.addCallback("petBagItems", jsPetBagItems);
        ExternalInterface.addCallback("petBagMoney", jsPetBagMoney);
        ExternalInterface.addCallback("petBagStatus", jsPetBagStatus);
        world = new Sprite();
        addChild(world);
        // HUD = 原版 LayerManager.uiLayer: 与 world 同层的兄弟容器, addChild 在 world 之后所以永远压着地图,
        // 且不参与 placeActor() 的相机平移 (舞台坐标, 不随角色移动)
        // 重启原生 HUD (UI 线 U3): 宿主传 hud=0 时整块 SWF HUD 不建 (由 DOM 常驻层接管);
        // as3 线不传该参数 → 默认 "1", 逐字节同旧。jsHud* 回调本就有 hud==null 短路, 不建即空操作。
        if ((loaderInfo.parameters.hud || "1") != "0") {
            HudRunner.debug = function(m:String):void { log("hud " + m); };
            hud = new HudRunner();
            hud.report = function(o:Object):void { post(o); };
            addChild(hud);
            hud.load(function(ok:Boolean):void
            {
                post({ type: "hudBind", ok: ok, info: hud.status() });
                // 宿主可能在 UI_hud.swf 载入完成前就喂过数据, 这里补上
                if (pendingBag.length > 0) hud.setBag(pendingBag);
                if (pendingTitle.length > 0) hud.setMapTitle(pendingTitle, 0);
                if (pendingProfile.length == 4) hud.setProfile(pendingProfile[0], pendingProfile[1], pendingProfile[2], pendingProfile[3]);
            });
        }
        setWorld(loaderInfo.parameters.spots || "",
                 Number(loaderInfo.parameters.initX || -1),
                 Number(loaderInfo.parameters.initY || -1));
        setWild(loaderInfo.parameters.wild || "");
        WildPet.loadShared(function():void { wildReady = true; spawnPets(); });
        loadMap(loaderInfo.parameters.mapUrl || "/swf/map/1.swf",
                loaderInfo.parameters.actorColor || "BLUE");
    }

    private function post(o:Object):void { o.instanceId = inst; ExternalInterface.call("postMessage", o, "*"); }
    private function log(m:String):void { post({ type: "mapLog", msg: m }); }

    // 宿主切图入口: 换地图 + 换出生点 + 换出口表 + 换野怪表 (角色不重载)
    private function jsLoadWorld(mapUrl:String, initX:Number, initY:Number, spotsStr:String, wildStr:String):void
    {
        setWorld(spotsStr, initX, initY);
        setWild(wildStr || "");
        fightOut = false;
        loadMap(mapUrl, loaderInfo.parameters.actorColor || "BLUE");
    }

    // spots = "x|y|targetMapId|目标名" 用 ';' 分隔 (来自 tools/build-map-index.mjs 解析的 config XML)
    private function setWorld(spotsStr:String, initX:Number, initY:Number):void
    {
        spots = [];
        spawnX = initX; spawnY = initY;
        enter = null;
        for each (var rec:String in spotsStr.split(";"))
        {
            if (rec.length == 0) continue;
            var f:Array = rec.split("|");
            if (f.length < 3) continue;
            var sx:Number = Number(f[0]), sy:Number = Number(f[1]), tid:String = f[2];
            if (isNaN(sx) || isNaN(sy) || tid.length == 0) { log("出口记录非法: " + rec); continue; }
            spots.push({ x: sx, y: sy, target: tid, label: f.length > 3 ? f[3] : tid });
        }
        post({ type: "mapWorld", spots: spots });
    }

    // 野怪记录 = "positionIndex|精灵swfId|等级|fx|fy|名字" (';' 分隔); fx/fy 是图内比例位置,
    // 由 tools/build-wild-index.mjs 用 hash(mapId) 确定性生成 (同图永远同一批怪、同一位置)
    private function setWild(str:String):void
    {
        wildStr = str;
        wildSpec = [];
        for each (var rec:String in str.split(";"))
        {
            if (rec.length == 0) continue;
            var f:Array = rec.split("|");
            if (f.length < 5) { log("野怪记录非法: " + rec); continue; }
            var fx:Number = Number(f[3]), fy:Number = Number(f[4]);
            if (isNaN(fx) || isNaN(fy)) { log("野怪坐标非法: " + rec); continue; }
            wildSpec.push({ idx: int(f[0]), swf: int(f[1]), level: int(f[2]), fx: fx, fy: fy,
                            name: f.length > 5 ? f[5] : ("怪" + f[1]) });
        }
    }

    // 场景/角色都到位后刷怪: 换图时 world 会被清空, 所以每次都重建
    private function spawnPets():void
    {
        if (!wildReady || mapRoot == null || fightOut) return;
        for each (var old:WildPet in pets) if (old.parent != null) old.parent.removeChild(old);
        pets = [];
        var self:MapRunner = this;
        var got:int = 0, miss:int = 0;
        var f:Function = function():void
        {
            if (got + miss == wildSpec.length)
            {
                log("野怪: 记录 " + wildSpec.length + " / 出怪 " + got + (miss ? " / 缺包 " + miss : ""));
                post({ type: "mapWild", count: got, miss: miss });
            }
        };
        for each (var sp:Object in wildSpec)
        {
            (function(sp:Object):void
            {
                WildPet.loadPack(sp.swf, function(seq:FrameSequence):void
                {
                    if (seq == null) { miss++; f(); return; }
                    var wx:Number = mapX + sp.fx * mapW;
                    var wy:Number = mapY + sp.fy * mapH;
                    if (!walkable(wx, wy)) { var q:Point = nearestWalkable(wx, wy); wx = q.x; wy = q.y; }
                    var pet:WildPet = new WildPet(sp.idx, sp.swf, sp.level, sp.name, seq, self);
                    pet.x = wx; pet.y = wy;
                    world.addChild(pet);
                    pets.push(pet);
                    if (actor != null) world.addChild(actor);      // 角色保持在野怪之上
                    got++; f();
                });
            })(sp);
        }
        f();
    }

    private function loadMap(mapUrl:String, actorColor:String):void
    {
        ready = false;
        mapUrlNow = mapUrl;
        fightOut = false;
        callCb = null;
        for each (var wp:WildPet in pets) if (wp.parent != null) wp.parent.removeChild(wp);
        pets = [];
        gridOn = false;
        gridReady = false;
        gridBits = "";
        route = [];
        moving = false;
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void { onMap(e.target.content as DisplayObject, actorColor); });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            log("map load failed " + mapUrl);
            post({ type: "mapFail", url: mapUrl });
        });
        l.load(new URLRequest(mapUrl));
    }

    private function onMap(content:DisplayObject, actorColor:String):void
    {
        while (world.numChildren > 0) world.removeChildAt(0);
        mapRoot = content as MovieClip;
        if (mapRoot == null) { log("map root null"); return; }
        // 原版叠层顺序: far, ground, content, front
        var far:DisplayObject = mapRoot.getChildByName("far_mc");
        ground = mapRoot.getChildByName("ground_mc");
        var contentMc:DisplayObject = mapRoot.getChildByName("content_mc");
        var front:DisplayObject = mapRoot.getChildByName("front_mc");
        var path:DisplayObject = mapRoot.getChildByName("path_mc");
        var sizeMc:DisplayObject = mapRoot.getChildByName("size_mc");
        var layers:Array = [far, ground, contentMc, front];
        for each (var ly:DisplayObject in layers) if (ly) world.addChild(ly);

        // 地图位置 = 内容包围盒（ground 的 x/y）；尺寸优先取 size_mc 的 width/height（原版 _size 的尺寸部分）。
        // ⚠️ 绝不拿 sizeMc.x / sizeMc.y 当 mapX / mapY：size_mc 只是尺寸标记，它的 .x/.y 是它自己被 PlaceObject
        //   摆的位置（黄金之路 size_mc 摆在 119,51，而真实地面在 0,-20）—— 拿它当位置会把整张图挪歪、左边被裁（黑/漏边 bug 根因）。
        var b:Rectangle = new Rectangle();
        if (ground != null) b = ground.getBounds(world);
        else if (contentMc != null) b = contentMc.getBounds(world);
        mapX = b.x; mapY = b.y; mapW = b.width; mapH = b.height;
        if (sizeMc != null)
        {
            var sb:Rectangle = sizeMc.getBounds(world);
            if (sb.width > 2 && sb.height > 2) { mapW = sb.width; mapH = sb.height; }
        }
        if (mapW < 2) mapW = 1200;
        if (mapH < 2) mapH = 660;
        log("mapExtent content=" + Math.round(mapX) + "," + Math.round(mapY) + " " + Math.round(mapW) + "x" + Math.round(mapH));

        var hasPath:Boolean = (path != null);
        freeRoam = !USE_GRID || !hasPath;
        // 兜底栅格 (可走栅格就绪之前的粗网格)
        pOx = mapX; pOy = mapY; pCell = FALLBACK_CELL;
        pW = Math.max(1, Math.ceil(mapW / pCell));
        pH = Math.max(1, Math.ceil(mapH / pCell));
        log("stage=layers map=" + mapW + "x" + mapH + "@" + mapX + "," + mapY + " hasPath=" + hasPath
            + " 阻挡=" + (USE_GRID ? "栅格" : "关(整图可走)"));

        if (hasPath && NATIVE_GRID) extractPathNative(Sprite(path));

        try { if (ground != null) ground.addEventListener(MouseEvent.CLICK, onGroundClick); }
        catch (e2:*) { log("ground click bind failed: " + e2); }

        // 出生点: config XML 的 <initialPoint> 与 path_mc/图层同为 mapRoot 本地坐标, 直接采用
        ax = (spawnX >= 0 ? spawnX : mapX + mapW / 2);
        ay = (spawnY >= 0 ? spawnY : mapY + mapH * 0.7);
        if (actor != null) { world.addChild(actor); finishInit(); }   // 换图清空了 world, 角色要重新挂回图层之上
        else loadActor(actorColor);
        spawnPets();
    }

    // ---- 原版 MapAssetExtractor.extractPath() 逐行照搬 ----
    // scaleX=scaleY=1/GRID_SIZE 使 path.width/height 变成格数; 透明像素=可走
    private function extractPathNative(path:Sprite):void
    {
        if (path == null) { log("as3grid path 非 Sprite"); return; }
        var ox:Number = path.x, oy:Number = path.y;
        var ratio:Number = 1 / GRID_SIZE;
        try
        {
            // path_mc 只是遮罩, 不参与显示; 从显示列表摘除后再 draw (在舞台上的对象 draw 会卡住 Ruffle)
            var holder:Sprite = new Sprite()
            if (path.parent != null) path.parent.removeChild(path);
            holder.addChild(path);
            path.scaleX = path.scaleY = ratio;
            var gw:int = path.width, gh:int = path.height;
            if (gw < 1 || gh < 1) { log("as3grid 尺寸无效 " + gw + "x" + gh); return; }
            var bmp:BitmapData = new BitmapData(gw, gh, true, 0x00FFFFFF);
            bmp.draw(path, new Matrix(ratio, 0, 0, ratio));
            // 一次性取回 ARGB 字节: getPixel32 每像素一次 GPU 回读, 8000 次会拖到分钟级
            var px:ByteArray = bmp.getPixels(new Rectangle(0, 0, gw, gh));
            px.position = 0;
            var bits:Array = [];
            var walkable:int = 0;
            var total:int = gw * gh;
            // 行主序展平 (与宿主侧矢量解析同一布局)
            for (var j:int = 0; j < gh; j++)
                for (var i:int = 0; i < gw; i++)
                {
                    var w:Boolean = px[(j * gw + i) * 4] == 0;   // ARGB 第 0 字节 = alpha
                    if (w) walkable++;
                    bits.push(w ? "0" : "1");
                }
            bmp.dispose();
            applyGrid(ox, oy, GRID_SIZE, gw, gh, bits.join(""));
            log("as3grid " + gw + "x" + gh + " walkable=" + walkable + "/" + total);
            post({ type: "mapGridNative", gw: gw, gh: gh, walkable: walkable, total: total });
        }
        catch (e:*) { log("as3grid 失败: " + e); }
    }

    private function applyGrid(ox:Number, oy:Number, cell:Number, gwIn:int, ghIn:int, bits:String):void
    {
        if (gwIn <= 0 || ghIn <= 0 || cell <= 0 || bits.length < gwIn * ghIn) { log("bad grid " + gwIn + "x" + ghIn); return; }
        pOx = ox; pOy = oy; pCell = cell; pW = gwIn; pH = ghIn; gridBits = bits;
        gridReady = true;
        gridOn = USE_GRID;
        var blocked:int = 0;
        for (var i:int = 0; i < gwIn * ghIn; i++) if (bits.charAt(i) == "1") blocked++;
        if (ready)
        {
            var p:Point = nearestWalkable(ax, ay);
            ax = p.x; ay = p.y;
            placeActor();
        }
        post({ type: "mapGrid", ox: pOx, oy: pOy, cell: pCell, gw: pW, gh: pH, blocked: blocked, ratio: blocked / (pW * pH) });
    }

    // 宿主页面的矢量解析结果: 与 as3 结果交叉校验 (两套实现同一语义), 不改变阻挡行为
    private function jsSetWalkGrid(ox:Number, oy:Number, cell:Number, gwIn:int, ghIn:int, bits:String):void
    {
        if (gridReady && (gwIn == pW && pH == ghIn))
        {
            var diff:int = 0;
            for (var i:int = 0; i < gwIn * ghIn; i++) if (bits.charAt(i) != gridBits.charAt(i)) diff++;
            log("grid 对比 as3 vs 矢量解析: 差异格 " + diff + "/" + (gwIn * ghIn));
            return;
        }
        log("grid 仅矢量解析可用 " + gwIn + "x" + ghIn + " cell=" + cell + " (as3 未出结果)");
    }

    // 宿主 canvas 叠层接管外观时, 隐藏本容器的裸装角色 (M8-f2); 只拨显示开关, 走位/相机/交互全不动
    private function jsActorVisible(v:Boolean):void
    {
        if (actor != null) actor.visible = v;
    }

    // ★M9 提线协议: JS 逐帧把角色世界坐标 + moving 喂进来 ⇒ 挪 ax/ay、跑相机 placeActor, 回报本次相机偏移 (world.x/y) 供 JS 校准叠层位置。
    //   提线位下 tick 已跳过内部走路段 (见 tick), 所以这里写 ax/ay 就是唯一位置源; 静止时 JS 不再调, tick 的 placeActor 用最后 ax/ay 保持相机。
    private function jsSetPos(x:Number, y:Number, mov:Boolean):String
    {
        ax = x; ay = y; moving = mov;
        placeActor();
        return world.x + "," + world.y;
    }

    // ★M9 提线协议: 野怪把角色叫到脚下 = JS 走到后回应 (walkReached) ⇒ 触发暂存的 callCb (WildPet.onActorReached → startFight)
    private function jsWalkReached():void
    {
        if (callCb != null) { var cb:Function = callCb; callCb = null; cb(); }
    }

    private function loadActor(color:String):void
    {
        ActorView.load(color, "/game/data/actor/", onActor);
    }

    private function onActor(view:ActorView):void
    {
        actor = view;
        log("stage=actorOk 部件 " + view.readyParts() + "/7" + (view.hasBody() ? "" : " (BODY 未就绪, 检查 /game/data/actor/*.bin)"));
        world.addChild(actor);
        if (puppet) actor.visible = false;        // ★M9：提线位下角色由 canvas 叠层常开画出, 自带裸装恒隐 (消除双角色); puppet=0 旧链仍走 actorVisible(f2)
        finishInit();
    }

    private function finishInit():void
    {
        ready = true;
        var p:Point = nearestWalkable(ax, ay);
        ax = p.x; ay = p.y;
        placeActor();
        if (!hasEventListener(Event.ENTER_FRAME)) addEventListener(Event.ENTER_FRAME, tick);
        // ★M9：提线协议 —— mapReady 追加出生位 (x/y) + 舞台尺寸 (sw/sh) + puppet 位, 供 JS 初始化逐帧走位与本地相机钳位
        post({ type: "mapReady", mapX: mapX, mapY: mapY, mapW: mapW, mapH: mapH, gw: pW, gh: pH, cell: pCell, freeRoam: freeRoam,
               x: ax, y: ay, sw: stage.stageWidth, sh: stage.stageHeight, puppet: puppet });
    }

    // ---- 可走性 (MapModel.canWalk 等价) ----
    private function walkable(wx:Number, wy:Number):Boolean
    {
        if (!gridOn)
        {
            if (!freeRoam) return false;
            return wx >= mapX && wy >= mapY && wx < mapX + mapW && wy < mapY + mapH;
        }
        var cx:int = Math.floor((wx - pOx) / pCell);
        var cy:int = Math.floor((wy - pOy) / pCell);
        if (cx < 0 || cy < 0 || cx >= pW || cy >= pH) return false;
        return gridBits.charAt(cy * pW + cx) != "1";
    }

    private function cellWalk(cx:int, cy:int):Boolean
    {
        if (!gridOn) return freeRoam;
        return gridBits.charAt(cy * pW + cx) != "1";
    }

    private function nearestWalkable(wx:Number, wy:Number):Point
    {
        if (walkable(wx, wy)) return new Point(wx, wy);
        for (var r:int = 1; r <= 16; r++)
        {
            for (var dy:int = -r; dy <= r; dy++)
                for (var dx:int = -r; dx <= r; dx++)
                {
                    if (Math.abs(dx) != r && Math.abs(dy) != r) continue;
                    var px:Number = wx + dx * pCell, py:Number = wy + dy * pCell;
                    if (walkable(px, py)) return new Point(px, py);
                }
        }
        log("no walkable near " + Math.round(wx) + "," + Math.round(wy));
        return new Point(wx, wy);
    }

    // ---- A* (8 邻域, 禁穿角) ----
    private function findPath(sx:Number, sy:Number, tx:Number, ty:Number):Array
    {
        var scx:int = cellX(sx), scy:int = cellY(sy), tcx:int = cellX(tx), tcy:int = cellY(ty);
        var result:Array = [];
        if (scx == tcx && scy == tcy) { result.push(new Point(tx, ty)); return result; }
        var n:int = pW * pH;
        var open:Array = [];
        var gCost:Vector.<Number> = new Vector.<Number>(n, true);
        var came:Vector.<int> = new Vector.<int>(n, true);
        var closed:Vector.<Boolean> = new Vector.<Boolean>(n, true);
        for (var i:int = 0; i < n; i++) { gCost[i] = 1e9; came[i] = -1; }
        var sidx:int = scy * pW + scx, tidx:int = tcy * pW + tcx;
        gCost[sidx] = 0;
        open.push(sidx);
        var guard:int = 0;
        while (open.length > 0 && guard++ < 40000)
        {
            var bi:int = 0, bf:Number = 1e18;
            for (var k:int = 0; k < open.length; k++)
            {
                var ci:int = open[k], cxp:int = ci % pW, cyp:int = (ci - cxp) / pW;
                var f:Number = gCost[ci] + heuristic(cxp, cyp, tcx, tcy);
                if (f < bf) { bf = f; bi = k; }
            }
            var cur:int = open[bi];
            open.splice(bi, 1);
            if (cur == tidx) break;
            closed[cur] = true;
            var curX:int = cur % pW, curY:int = (cur - curX) / pW;
            for (var oy:int = -1; oy <= 1; oy++)
                for (var ox:int = -1; ox <= 1; ox++)
                {
                    if (ox == 0 && oy == 0) continue;
                    var nxp:int = curX + ox, nyp:int = curY + oy;
                    if (nxp < 0 || nyp < 0 || nxp >= pW || nyp >= pH) continue;
                    var nidx:int = nyp * pW + nxp;
                    if (closed[nidx]) continue;
                    if (!cellWalk(nxp, nyp)) continue;
                    if (ox != 0 && oy != 0 && (!cellWalk(curX + ox, curY) || !cellWalk(curX, curY + oy))) continue;
                    var ng:Number = gCost[cur] + ((ox != 0 && oy != 0) ? 1.414 : 1);
                    if (ng < gCost[nidx]) { gCost[nidx] = ng; came[nidx] = cur; if (open.indexOf(nidx) < 0) open.push(nidx); }
                }
        }
        var path:Array = [];
        var c:int = tidx;
        if (came[tidx] < 0 && tidx != sidx) { path.push(new Point(tx, ty)); return path; }
        var steps:int = 0;
        while (c != -1 && steps++ < n)
        {
            var pxp:int = c % pW, pyp:int = (c - pxp) / pW;
            path.push(new Point(pOx + pxp * pCell + pCell / 2, pOy + pyp * pCell + pCell / 2));
            if (c == sidx) break;
            c = came[c];
        }
        path.reverse();
        if (path.length > 0) path[path.length - 1] = new Point(tx, ty);
        return path;
    }
    private function cellX(wx:Number):int { var v:int = Math.floor((wx - pOx) / pCell); return v < 0 ? 0 : (v >= pW ? pW - 1 : v); }
    private function cellY(wy:Number):int { var v:int = Math.floor((wy - pOy) / pCell); return v < 0 ? 0 : (v >= pH ? pH - 1 : v); }
    private function heuristic(axc:int, ayc:int, bxc:int, byc:int):Number
    {
        var dx:int = axc - bxc; if (dx < 0) dx = -dx;
        var dy:int = ayc - byc; if (dy < 0) dy = -dy;
        return (dx > dy ? dx : dy) + 0.414 * (dx < dy ? dx : dy);
    }

    // ---- 交互 ----
    private function onGroundClick(e:MouseEvent):void
    {
        if (!ready) return;
        var p:Point = world.globalToLocal(new Point(stage.mouseX, stage.mouseY));
        log("地面点击 舞台(" + Math.round(stage.mouseX) + "," + Math.round(stage.mouseY) + ") → 世界(" + Math.round(p.x) + "," + Math.round(p.y) + ")");
        jsWalkTo(p.x, p.y);
    }

    private function jsWalkTo(wx:Number, wy:Number):void
    {
        if (!ready || fightOut) return;
        // ★M9：提线位 = 只上报点击世界坐标, 光口判定/走路执行/传送全交 JS (MapRunner 不再自走)
        if (puppet) { post({ type: "mapClickWant", x: wx, y: wy }); return; }
        enter = spotAt(wx, wy);
        callCb = null;
        if (!gridOn && !freeRoam) { enter = null; post({ type: "mapWalk", x: wx, y: wy, nodes: 0, skipped: "等待可走栅格" }); return; }
        var goal:Point = (enter != null) ? new Point(enter.x, enter.y) : new Point(wx, wy);
        goal = nearestWalkable(goal.x, goal.y);
        route = findPath(ax, ay, goal.x, goal.y);
        moving = route.length > 0;
        post({ type: "mapWalk", x: goal.x, y: goal.y, nodes: route.length, teleport: enter != null ? enter.target : "" });
    }

    // 点击落在传送点判定半径内 → 本次行走以「抵达后切图」为目的; 路过不触发
    private function spotAt(wx:Number, wy:Number):Object
    {
        var best:Object = null, bd:Number = HOT_R * HOT_R;
        for each (var s:Object in spots)
        {
            var ddx:Number = s.x - wx, ddy:Number = s.y - wy;
            var d:Number = ddx * ddx + ddy * ddy;
            if (d <= bd) { bd = d; best = s; }
        }
        return best;
    }

    private function arriveAtSpot():void
    {
        var s:Object = enter; enter = null;
        log("传送 -> " + s.target + " (" + s.label + ")");
        post({ type: "mapEnter", target: s.target, name: s.label, fromX: ax, fromY: ay });
    }

    // ---- 野怪要的宿主服务 (原版 SpawnedPet 通过 SceneManager/ActorManager/FightManager 拿这些) ----
    // 原版 generateWalkablePoint(rect): 在矩形里反复随机直到 mapModel.canWalk
    public function petPickPoint(r:Rectangle):Point
    {
        for (var i:int = 0; i < 40; i++)
        {
            var x:Number = r.x + Math.random() * r.width, y:Number = r.y + Math.random() * r.height;
            if (walkable(x, y)) return new Point(x, y);
        }
        return nearestWalkable(r.x + r.width / 2, r.y + r.height / 2);
    }

    public function petClipToMap(r:Rectangle):Rectangle
    {
        var x0:Number = clamp(r.x, mapX, mapX + mapW), y0:Number = clamp(r.y, mapY, mapY + mapH);
        var x1:Number = clamp(r.x + r.width, mapX, mapX + mapW), y1:Number = clamp(r.y + r.height, mapY, mapY + mapH);
        return new Rectangle(x0, y0, x1 - x0, y1 - y0);
    }

    // 原版 Actor.isArrivedPosition(point)
    public function petActorArrived(p:Point):Boolean
    {
        var dx:Number = ax - p.x, dy:Number = ay - p.y;
        return dx * dx + dy * dy <= 8 * 8;
    }

    // 原版 actor.runToLocation(...) + MoveEvent.FINISHED 回调
    public function petCallActor(p:Point, cb:Function):void
    {
        if (!ready) { cb(); return; }
        // ★M9：提线位 = 状态机留 AS3、腿交 JS —— 只上报"把角色叫到 (x,y)", JS 走到后调 walkReached() 触发 cb (startFight)
        if (puppet) {
            if (petActorArrived(p)) { cb(); return; }
            callCb = cb;
            post({ type: "mapWantWalk", x: p.x, y: p.y });
            return;
        }
        callCb = cb;
        enter = null;
        route = findPath(ax, ay, p.x, p.y);
        moving = route.length > 0;
        if (!moving) { callCb = null; cb(); }
    }

    // 原版 FightManager.startFightWithWild(positionIndex): 我方没有服务端, 交给宿主页面切到战斗场景
    public function petFight(w:WildPet):void
    {
        if (fightOut) return;
        fightOut = true;
        moving = false;
        route = [];
        for each (var p:WildPet in pets) p.frozen = true;
        log("开战: 槽位" + w.idx + " 精灵" + w.petId + " Lv" + w.level);
        post({ type: "mapWildFight", positionIndex: w.idx, petId: w.petId, level: w.level, name: w.petName });
    }

    private function tick(e:Event):void
    {
        for each (var wp:WildPet in pets) wp.update();
        // 标签字形画不到 SWF 里 (见 WildPet.as 头注), 由宿主 #lbl 画布层描; 野怪每帧都在闲走, 所以逐帧回报
        if (pets.length > 0) post({ type: "mapPets", camX: world.x, camY: world.y, p: jsPetPositions() });
        if (fightOut) return;
        if (++frameN % 6 == 0) post({ type: "mapState", x: ax, y: ay, camX: world.x, camY: world.y, moving: moving });
        // ★M9：提线位无条件跳过内部走路段 (route 恒空; JS 是唯一位置源, 经 jsSetPos 写 ax/ay)。mapState 仍回报, 供 JS 只做相机校准。
        if (!puppet && moving && route.length > 0)
        {
            var t:Point = Point(route[0]);
            var dx:Number = t.x - ax, dy:Number = t.y - ay;
            var dist:Number = Math.sqrt(dx * dx + dy * dy);
            if (dist <= SPEED)
            {
                ax = t.x; ay = t.y; route.shift();
                if (route.length == 0)
                {
                    moving = false;
                    post({ type: "mapArrive", x: ax, y: ay });
                    if (enter != null) arriveAtSpot();
                    if (callCb != null) { var cb:Function = callCb; callCb = null; cb(); }
                }
            }
            else { ax += dx / dist * SPEED; ay += dy / dist * SPEED; }
            if (dx != 0) actor.setFacing(dx < 0);
            // 上下两套美术由 y 方向决定并保持 (原版 DIR_VERTICAL_MASK 的选择逻辑在 Mobile 里)
            if (dy < -1) lookUp = true;
            else if (dy > 1) lookUp = false;
        }
        if (actor != null) { actor.setLabel((moving ? "run" : "stand") + (lookUp ? "Up" : "Down"), lookUp); actor.update(); }
        placeActor();
    }

    private function placeActor():void
    {
        if (actor != null) { actor.x = ax; actor.y = ay; }
        // 镜头: 地图大于舞台时跟随角色
        var sw:Number = stage.stageWidth, sh:Number = stage.stageHeight;
        // 镜头照上游 LayerManager：内容不超过舞台 ⇒ offset 0（按内容原位铺，绝不扣 mapX/mapY —— 扣了会把图挪歪、左边被裁，黄金之路即此）；宽/高溢出舞台才跟随角色滚动。
        world.scaleX = 1; world.scaleY = 1;
        world.x = mapW <= sw ? 0 : clamp(-(ax - sw / 2), -(mapX + mapW - sw), -mapX);
        world.y = mapH <= sh ? 0 : clamp(-(ay - sh / 2), -(mapY + mapH - sh), -mapY);
    }
    private function clamp(v:Number, lo:Number, hi:Number):Number { return v < lo ? lo : (v > hi ? hi : v); }

    // 宿主要野怪的实时位置 (世界坐标): "槽位|x|y|等级|名字", 用于覆盖层标注和自动化点击
    private function jsPetPositions():Array
    {
        var out:Array = [];
        for each (var p:WildPet in pets) out.push(p.idx + "|" + Math.round(p.x) + "|" + Math.round(p.y) + "|" + p.level + "|" + p.petName);
        return out;
    }

    // ---- HUD (原版 LobbyPanel.show() 的那串面板) ----
    // 背包记录 = "swfId|名字|等级|hp|hpMax", 由宿主从 game/data/pets.json 挑好后喂进来
    private function jsHudBag(items:Array):void
    {
        pendingBag = items == null ? [] : items;
        if (hud != null) hud.setBag(pendingBag);
    }

    private function jsHudProfile(name:String, level:String, coins:String, diamonds:String):void
    {
        pendingProfile = [name, level, coins, diamonds];
        if (hud != null) hud.setProfile(name, level, coins, diamonds);
    }

    private function jsHudTitle(name:String):void
    {
        pendingTitle = name;
        if (hud != null) hud.setMapTitle(name, 0);
    }

    private function jsHudToggle(panel:String):void
    {
        if (hud == null) return;
        if (panel == "actor") hud.toggleActor();
        else if (panel == "minor") hud.toggleMinor();
    }

    private function jsHudStatus():String { return hud == null ? "hud=none" : hud.status(); }

    // ---- 物品背包 (原版点 ToolBar 的 actorBag → ModuleManager.toggleModule(getAppModule("ItemBagPanel"))) ----
    // 模块是点开才载的 (原版 ModuleManager 也是按需 load), 所以首次打开会有一次下载等待
    private function jsBagOpen():void
    {
        if (bag == null)
        {
            ItemBagRunner.debug = function(m:String):void { log("bag " + m); };
            bag = new ItemBagRunner();
            bag.report = function(o:Object):void { post(o); };
            addChild(bag);
            bag.load(function(ok:Boolean):void
            {
                bagReady = ok;
                post({ type: "bagBind", ok: ok, info: bag.status() });
                if (ok)
                {
                    if (pendingItemBag.length > 0) bag.setItems(pendingItemBag);
                    if (pendingProfile.length == 4) bag.setMoney(pendingProfile[2], pendingProfile[3]);
                    bag.show();
                }
            });
            return;
        }
        bag.toggle();
    }

    private function jsBagItems(rows:Array):void
    {
        pendingItemBag = rows == null ? [] : rows;
        if (bag != null && bagReady) bag.setItems(pendingItemBag);
    }

    private function jsBagMoney(coins:String, diamonds:String):void
    {
        if (bag != null && bagReady) bag.setMoney(coins, diamonds);
    }

    private function jsBagStatus():String { return bag == null ? "bag=none" : bag.status(); }

    // ---- 精灵背包 (原版点 ToolBar 的 petBag → ModuleManager.toggleModule(getAppModule("PetBagPanel"))) ----
    private function jsPetBagOpen():void
    {
        if (petBag == null)
        {
            PetBagRunner.debug = function(m:String):void { log("petBag " + m); };
            petBag = new PetBagRunner();
            petBag.report = function(o:Object):void { post(o); };
            addChild(petBag);
            petBag.load(function(ok:Boolean):void
            {
                petBagReady = ok;
                post({ type: "petBagBind", ok: ok, info: petBag.status() });
                if (ok)
                {
                    if (pendingPetBag.length > 0) petBag.setPets(pendingPetBag);
                    if (pendingProfile.length == 4) petBag.setMoney(pendingProfile[3], pendingProfile[2], "0");
                    petBag.show();
                }
            });
            return;
        }
        petBag.toggle();
    }

    private function jsPetBagItems(rows:Array):void
    {
        pendingPetBag = rows == null ? [] : rows;
        if (petBag != null && petBagReady) petBag.setPets(pendingPetBag);
    }

    private function jsPetBagMoney(coins:String, diamonds:String):void
    {
        if (petBag != null && petBagReady) petBag.setMoney(diamonds, coins, "0");
    }

    private function jsPetBagStatus():String { return petBag == null ? "petBag=none" : petBag.status(); }

    private function jsGetStatus():String
    {
        return "ready=" + ready + " map=" + mapW + "x" + mapH + " @(" + mapX + "," + mapY + ")"
            + " grid=" + pW + "x" + pH + "@" + pOx + "," + pOy + "/c" + pCell + " on=" + gridOn
            + " free=" + freeRoam + " pos=(" + Math.round(ax) + "," + Math.round(ay) + ")"
            + " walk=" + walkable(ax, ay) + " moving=" + moving + " route=" + route.length
            + " actor=" + (actor == null ? "none" : actor.parent == world ? "on" : "detached")
            + " pets=" + pets.length + " fight=" + fightOut;
    }
}
}
