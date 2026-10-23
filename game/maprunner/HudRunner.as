// 主界面 HUD = 原版 LayerManager.uiLayer 上 LobbyPanel.show() 那一串面板的复刻。
// 叠序照抄 LobbyPanel.show(): ToolBar → PetAvatarPanel(内含 ActorAvatarPanel) → MinorToolBar
//   → MapTitlePanel → RightToolbarConter(_mcPanel 在构造时就挂上 uiLayer)。
//
// 面板素材来自 swf/ui/UI_hud.swf (由 tools/inject-ui-panels.mjs 生成): 原版用
// UIManager.getMovieClip("UI_Xxx") new 已注册到 ApplicationDomain 的导出类, Ruffle 里这条路是死的
// (Loader 载入的 SWF 其导出类不注册进任何域, 实测 #1065)。注入器把面板符号写成 UI.swf 根时间轴上的
// 命名放置对象, 于是 loader.content.getChildByName(名字) 就能拿到面板本体, 再摘过来挂进本层。
// 面板内部的命名子对象 (nameTxt/petBag/btnRetract…) 随符号一起带过来, 原版 getChildByName 的链路成立
// (逐层验证见 tools/probes/tmp-panel-path.mjs)。
//
// 摆位常量全部逐行抄自 vendor/seer2-origin-as3, 不做自作主张的"美化":
//   ToolBar.as          layIcons(): scaleX = stageWidth/1200; x=0; y = stageHeight - 342*scaleY
//   ActorAvatarPanel.as ctor x=_showXPos=0; 收起 _hideXPos=-207; allNum0..6/passWordTipMC 初始隐藏
//   PetAvatarPanel.as   ctor x=169 y=100; _petListSp(180,31); showPetBtn(-248,2); petListBg(-285,4) 隐藏;
//                       展开: 格 x=-182, y = 2 + (格高+2)*i + 37; bg.height = 5 + 57*数量
//   MinorToolBar.as     ctor y=8 x=_showXPos=611; 收起 _hideXPos=940; btnRetract.gotoAndStop(2)
//   MapTitlePanel.as    layOut(): x = stageWidth/2 - 41*(stageWidth/1200); y = stageHeight - height + 76
//                       文本链: UI_MapTitle → title → mapTitleTxt
//   RightToolbarConter.as _mcPanel(stageWidth,-30) 里放 rightToolbarBg(y=31, 索引0), 图标 x 为负
//
// 两处有意的偏离 (细节见 docs/legacy/web-client-notes.md「主界面 HUD」):
//   · 背包格图标原版挂在 petIcon.cell 里, 但 UI_hud 的 cell 被同时间轴的遮罩层裁没了 → 改挂 petIcon 本体。
//   · UI_hud 的 DefineFont2 是设计期子集, 换上去的中文没有墨 → flushTexts() 把舞台坐标报给宿主,
//     由 game/map.html 的 #hudtxt 画布层只补描含非 ASCII 的那几条。
package
{
import flash.display.*;
import flash.events.*;
import flash.geom.Point;
import flash.geom.Rectangle;
import flash.net.URLRequest;
import flash.text.TextField;

public class HudRunner extends Sprite
{
    private static const DESIGN_W:Number = 1200;    // 原版 ToolBar.layIcons 的缩放基准
    private static const TOOLBAR_H:Number = 342;    // 底部主栏在设计尺寸下占的高度
    private static const ACTOR_SHOW_X:int = 0;
    private static const ACTOR_HIDE_X:int = -207;
    private static const PET_X:int = 169;
    private static const PET_Y:int = 100;
    private static const MINOR_SHOW_X:int = 611;
    private static const MINOR_HIDE_X:int = 940;
    private static const MINOR_Y:int = 8;
    private static const MAP_TITLE_DX:int = 41;     // MapTitlePanel.layOut 里的 41*(stageWidth/1200)
    private static const MAP_TITLE_DY:int = 76;
    private static const RIGHT_PANEL_Y:Number = -30;
    private static const RIGHT_BG_Y:int = 31;

    public static var debug:Function = function(m:String):void {};

    // 宿主回调: MapRunner 注入 post(), HUD 的点击/文本都从这里上报
    public var report:Function = function(o:Object):void {};

    private var src:MovieClip;                      // UI_hud.swf 的根, 面板摘走后留空
    private var toolBar:MovieClip;
    private var actorPanel:MovieClip;
    private var petPanel:MovieClip;
    private var minorPanel:MovieClip;
    private var titlePanel:MovieClip;
    private var rightPanel:Sprite;
    private var rightBg:MovieClip;

    private var petListSp:Sprite;                   // 背包展开层 (原版 _petListSp)
    private var petListBg:DisplayObject;
    private var showPetBtn:DisplayObject;
    private var mainCell:DisplayObjectContainer;    // 常驻的那一格 (原版 _mainPetItem)
    private var cellPool:Array = [];                // 展开用的格, 平时不挂在显示列表上
    private var bag:Array = [];                     // 宿主给的背包: [{swfId,name,level,hp,hpMax}]

    private var titleTxt:TextField;
    private var nameTxt:TextField, levelTxt:TextField, coinTxt:TextField, diamondTxt:TextField;
    private var textRec:Array = [];                 // 供宿主核对/兜底描字 (见 hudTexts)

    private var actorRetract:Boolean = false;
    private var minorRetract:Boolean = false;
    private var bagOpen:Boolean = false;

    public function HudRunner()
    {
    }

    // ---- 载入 ----
    public function load(onDone:Function):void
    {
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            src = e.target.content as MovieClip;
            if (src == null) { debug("UI_hud 根为空"); onDone(false); return; }
            var ok:Boolean = false;
            try { ok = bind(); }
            catch (err:*) { debug("HUD 绑定异常: " + err); }
            onDone(ok);
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            debug("UI_hud 载入失败"); onDone(false);
        });
        l.load(new URLRequest("/swf/ui/UI_hud.swf"));
    }

    // 摘出顺序 = 原版 uiLayer 叠序; 后摘的后 addChild, 所以盖在先摘的上面
    private function bind():Boolean
    {
        toolBar = take("UI_ToolBarUI") as MovieClip;
        petPanel = take("UI_PetAvatar_Panel") as MovieClip;
        actorPanel = take("UI_ActorAvatar_Panel") as MovieClip;
        minorPanel = take("UI_Toolbar_Minor") as MovieClip;
        titlePanel = take("UI_MapTitle") as MovieClip;
        rightPanel = new Sprite();
        addChild(rightPanel);
        rightBg = takeBg("rightToolbarBg");
        if (rightBg != null) { rightPanel.addChild(rightBg); rightBg.y = RIGHT_BG_Y; }

        // 原版 ToolBar 的容器 mouseEnabled=false (点击只落在按钮上)
        if (toolBar != null) toolBar.mouseEnabled = false;

        if (petPanel != null) bindPetPanel();
        if (actorPanel != null) bindActorPanel();
        if (minorPanel != null) bindMinorPanel();
        if (titlePanel != null) bindTitlePanel();
        bindToolButtons();

        // MapRunner 是先把本层挂上舞台再 load 的, 但两种顺序都要能摆位
        if (stage != null) { stage.addEventListener(Event.RESIZE, onResize); layOut(); }
        else addEventListener(Event.ADDED_TO_STAGE, function(e:Event):void
        {
            stage.addEventListener(Event.RESIZE, onResize);
            layOut();
        });
        debug("HUD 绑定: toolBar=" + (toolBar != null) + " actor=" + (actorPanel != null)
            + " pet=" + (petPanel != null) + " minor=" + (minorPanel != null)
            + " title=" + (titlePanel != null) + " right=" + (rightBg != null)
            + " 背包格 " + (mainCell != null ? 1 : 0) + "+" + cellPool.length);
        return toolBar != null || petPanel != null || actorPanel != null;
    }

    private function take(name:String):DisplayObject
    {
        var d:DisplayObject = src.getChildByName(name);
        if (d == null) { debug("UI_hud 缺面板 " + name); return null; }
        src.removeChild(d);
        addChild(d);
        return d;
    }
    // 活动栏外壳进的是 rightPanel 而不是本层, 单独摘
    private function takeBg(name:String):MovieClip
    {
        var d:DisplayObject = src.getChildByName(name);
        if (d == null) { debug("UI_hud 缺面板 " + name); return null; }
        src.removeChild(d);
        return d as MovieClip;
    }

    // ---- 各面板内部接线 ----
    private function bindPetPanel():void
    {
        petListSp = new Sprite();
        petListSp.x = 180; petListSp.y = 31;
        petPanel.addChild(petListSp);

        showPetBtn = petPanel.getChildByName("showPetBtn");
        if (showPetBtn != null) { petPanel.removeChild(showPetBtn); petListSp.addChild(showPetBtn); showPetBtn.x = -248; showPetBtn.y = 2; }
        petListBg = petPanel.getChildByName("petListBg");
        if (petListBg != null) { petPanel.removeChild(petListBg); petListSp.addChild(petListBg); petListBg.x = -285; petListBg.y = 4; petListBg.visible = false; }
        petListSp.addEventListener(MouseEvent.ROLL_OVER, function(e:MouseEvent):void { openBag(); });
        petListSp.addEventListener(MouseEvent.ROLL_OUT, function(e:MouseEvent):void { closeBag(); });

        // 常驻格: 原版 new PetItem() 直接 addChild 到面板容器原点 (0,0)
        mainCell = takeCell("PetItem0");
        if (mainCell != null) { mainCell.x = 0; mainCell.y = 0; petPanel.addChild(mainCell); }
        for (var i:int = 1; i <= 20; i++)
        {
            var c:DisplayObjectContainer = takeCell("PetItem" + i);
            if (c == null) break;
            cellPool.push(c);
        }
    }

    private function takeCell(name:String):DisplayObjectContainer
    {
        var d:DisplayObject = src.getChildByName(name);
        if (d == null) return null;
        src.removeChild(d);
        return d as DisplayObjectContainer;
    }

    private function bindActorPanel():void
    {
        for (var i:int = 0; i < 7; i++)
        {
            var mc:DisplayObject = actorPanel.getChildByName("allNum" + i);
            if (mc != null) mc.visible = false;              // 原版 createChildren 里全部先藏
        }
        var pw:DisplayObjectContainer = cont(actorPanel, "passWordTipMC");
        if (pw != null) { pw.visible = false; pw.mouseEnabled = false; pw.mouseChildren = false; }
        nameTxt = field(actorPanel, "nameTxt");
        levelTxt = field(actorPanel, "levelTxt");
        coinTxt = field(actorPanel, "conisTxt");
        diamondTxt = field(actorPanel, "xingzuanTxt");
        var actorMc:DisplayObject = actorPanel.getChildByName("actor");
        if (actorMc != null) actorMc.visible = false;        // 角色本体由地图层渲染, 面板里那块是占位
        var mail:DisplayObject = actorPanel.getChildByName("mailMc");
        if (mail != null) mail.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { click("mailMc"); });
    }

    private function bindMinorPanel():void
    {
        var btn:DisplayObject = minorPanel.getChildByName("btnRetract");
        if (btn is MovieClip) MovieClip(btn).gotoAndStop(2); // 原版 ctor
        if (btn != null) btn.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { toggleMinor(); });
        for (var i:int = 0; i < TOOL_NAMES.length; i++)
        {
            var d:DisplayObject = minorPanel.getChildByName(TOOL_NAMES[i]);
            if (d != null) d.addEventListener(MouseEvent.CLICK, mkClick(TOOL_NAMES[i]));
        }
        var copy:DisplayObjectContainer = cont(minorPanel, "copyMC");
        if (copy != null) { copy.mouseEnabled = false; copy.mouseChildren = false; }
        var mon:DisplayObjectContainer = cont(minorPanel, "monsterMC");
        if (mon != null) { mon.mouseEnabled = false; mon.mouseChildren = false; }
    }

    private function bindTitlePanel():void
    {
        titlePanel.mouseEnabled = false;                     // 原版 MapTitlePanel ctor
        var t:DisplayObjectContainer = cont(titlePanel, "title");
        if (t != null) titleTxt = field(t, "mapTitleTxt");
        titlePanel.buttonMode = true;
        titlePanel.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { click("mapTitle"); });
    }

    // 原版 ToolBar.createWidget 注册的按钮名 (game/map.html 目前只对其中有行为的那几个响应)
    private static const TOOL_NAMES:Array = ["mapBtn", "dicPanel", "shootBtn", "buddyBtn", "homePanel",
        "teamBtn", "trainerBtn", "shipmapBtn", "systemPanel", "actorBag", "petBag", "shouyouBtn",
        "nonoPanel", "yueseNono", "userUp", "emotionBtn", "skyBtn", "sptBtn", "monsterBtn", "copyBtn",
        "fortressBtn", "questBtn"];

    private function bindToolButtons():void
    {
        if (toolBar == null) return;
        for (var i:int = 0; i < TOOL_NAMES.length; i++)
        {
            var d:DisplayObject = toolBar.getChildByName(TOOL_NAMES[i]);
            if (d != null) d.addEventListener(MouseEvent.CLICK, mkClick(TOOL_NAMES[i]));
        }
    }

    private function mkClick(what:String):Function
    {
        return function(e:MouseEvent):void { click(what); };
    }
    private function click(what:String):void { report({ type: "hudClick", what: what }); }

    private function field(mc:DisplayObjectContainer, name:String):TextField
    {
        var d:DisplayObject = mc.getChildByName(name);
        return d is TextField ? TextField(d) : null;
    }

    // 面板里的容器子对象 (要设 mouseEnabled/mouseChildren) 一律按容器取
    private function cont(mc:DisplayObjectContainer, name:String):DisplayObjectContainer
    {
        return mc == null ? null : mc.getChildByName(name) as DisplayObjectContainer;
    }

    // ---- 摆位 ----
    private function onResize(e:Event):void { layOut(); }

    public function layOut():void
    {
        if (stage == null) return;
        var sw:Number = stage.stageWidth, sh:Number = stage.stageHeight;
        var k:Number = sw / DESIGN_W;                        // ToolBar.layIcons 的 scaleX
        if (toolBar != null)
        {
            toolBar.scaleX = k; toolBar.scaleY = k;
            toolBar.x = 0; toolBar.y = sh - TOOLBAR_H * k;
        }
        if (actorPanel != null) { actorPanel.x = actorRetract ? ACTOR_HIDE_X : ACTOR_SHOW_X; actorPanel.y = 0; }
        if (petPanel != null) { petPanel.x = PET_X; petPanel.y = PET_Y; }
        if (minorPanel != null) { minorPanel.x = minorRetract ? MINOR_HIDE_X : MINOR_SHOW_X; minorPanel.y = MINOR_Y; }
        if (titlePanel != null) { titlePanel.x = sw / 2 - MAP_TITLE_DX * k; titlePanel.y = sh - titlePanel.height + MAP_TITLE_DY; }
        if (rightPanel != null) { rightPanel.x = sw; rightPanel.y = RIGHT_PANEL_Y; }
        flushTexts();
    }

    public function toggleActor():void
    {
        actorRetract = !actorRetract;
        layOut();
        report({ type: "hudRetract", panel: "actor", hidden: actorRetract });
    }
    public function toggleMinor():void
    {
        minorRetract = !minorRetract;
        layOut();
        report({ type: "hudRetract", panel: "minor", hidden: minorRetract });
    }

    // ---- 数据 ----
    // 原版 MapTitlePanel.update(): 非 debug 只显示地图名 (debug 才带 "(地图号)")
    public function setMapTitle(name:String, id:int):void
    {
        want("mapTitle", name);
        flushTexts();
    }

    public function setProfile(nm:String, lv:String, coins:String, diamonds:String):void
    {
        want("actorName", nm); want("actorLevel", lv); want("coins", coins); want("diamonds", diamonds);
        flushTexts();
    }

    // 原版每帧重算摆位前先记下期望值, UI_hud 载入后统一 flush
    private function want(key:String, s:String):void
    {
        for (var i:int = 0; i < textRec.length; i++) if (textRec[i].key == key) { textRec[i].text = s; return; }
        textRec.push({ key: key, text: s });
    }

    private function flushTexts():void
    {
        put(nameTxt, "actorName");
        put(levelTxt, "actorLevel");
        put(coinTxt, "coins");
        put(diamondTxt, "diamonds");
        put(titleTxt, "mapTitle");
        report({ type: "hudTexts", list: hudTexts() });
    }

    private function put(tf:TextField, key:String):void
    {
        if (tf == null) return;
        var rec:Object = null;
        for (var i:int = 0; i < textRec.length; i++) if (textRec[i].key == key) rec = textRec[i];
        if (rec == null) return;
        tf.mouseEnabled = false;                              // 原版对 nameTxt/mapTitleTxt 都这么处理
        tf.text = String(rec.text);
    }

    // 宿主用它判断中文字形有没有真的落墨, 没有就在 #hudtxt 画布层补描
    public function hudTexts():Array
    {
        if (stage == null) return [];
        var out:Array = [];
        rec(out, "actorName", nameTxt); rec(out, "actorLevel", levelTxt);
        rec(out, "coins", coinTxt); rec(out, "diamonds", diamondTxt); rec(out, "mapTitle", titleTxt);
        if (mainCell != null && mainCell.visible) recCell(out, "0", mainCell);
        for (var i:int = 0; i < cellPool.length; i++)
        {
            var c:DisplayObjectContainer = DisplayObjectContainer(cellPool[i]);
            if (c != null && c.parent == petListSp && c.visible) recCell(out, String(i + 1), c);
        }
        return out;
    }

    private function recCell(out:Array, tag:String, c:DisplayObjectContainer):void
    {
        rec(out, "petName" + tag, field(c, "petName"));
        rec(out, "petLv" + tag, field(c, "petLevel"));
        rec(out, "petHp" + tag, field(c, "hpTxt"));
    }

    private function rec(out:Array, key:String, tf:TextField):void
    {
        if (tf == null || tf.text == "") return;
        var p:Point = tf.localToGlobal(new Point(0, 0));       // 已经是舞台坐标 (align=left, noScale)
        out.push(key + "|" + Math.round(p.x) + "|" + Math.round(p.y)
            + "|" + Math.round(tf.width) + "x" + Math.round(tf.height) + "|" + tf.text);
    }

    // ---- 背包 ----
    // 记录 = "swfId|名字|等级|hp|hpMax" ; 宿主从 game/data/pets.json 里挑
    public function setBag(items:Array):void
    {
        bag = items || [];
        if (mainCell != null && bag.length > 0) fillCell(mainCell, bag[0]);
        else if (mainCell != null) mainCell.visible = false;
        if (bagOpen) openBag();
    }

    private function openBag():void
    {
        if (petListSp == null) return;
        closeBag();
        bagOpen = true;
        var n:int = bag.length < cellPool.length ? bag.length : cellPool.length;
        for (var i:int = 0; i < n; i++)
        {
            var c:DisplayObjectContainer = DisplayObjectContainer(cellPool[i]);
            c.y = 2 + (c.height + 2) * i + 37;               // 原版: 高度实测, 57 左右一格
            c.x = -182;
            c.visible = true;
            petListSp.addChild(c);
            fillCell(c, bag[i]);
        }
        if (petListBg != null)
        {
            petListBg.height = n == 0 ? 0 : 5 + 57 * n;
            petListBg.visible = n > 0;
        }
        flushTexts();                                 // 背包格文字变了, 通知宿主重描 (中文没有墨迹)
    }

    private function closeBag():void
    {
        bagOpen = false;
        for (var i:int = 0; i < cellPool.length; i++) if (cellPool[i].parent != null) cellPool[i].parent.removeChild(cellPool[i]);
        if (petListBg != null) petListBg.visible = false;
        flushTexts();
    }

    private function fillCell(c:DisplayObjectContainer, rec:Object):void
    {
        var parts:Array = String(rec).split("|");
        var swfId:int = int(parts[0]);
        var tf:TextField;
        tf = field(c, "petName"); if (tf != null) tf.text = parts.length > 1 ? parts[1] : "";
        tf = field(c, "petLevel"); if (tf != null) tf.text = parts.length > 2 ? parts[2] : "";
        var hp:Number = parts.length > 3 ? Number(parts[3]) : 0;
        var hpMax:Number = parts.length > 4 && Number(parts[4]) > 0 ? Number(parts[4]) : 1;
        tf = field(c, "hpTxt"); if (tf != null) tf.text = Math.round(hp) + "/" + Math.round(hpMax);
        var bar:DisplayObject = c.getChildByName("hpBar");
        if (bar != null) bar.scaleX = hp / hpMax > 1 ? 1 : (hp / hpMax < 0 ? 0 : hp / hpMax);
        setPetIcon(c, swfId);
    }

    // 原版 _petIcon = IconDisplayer 载入 res/pet/icon/{resourceId}.swf (scale .8, 挂在 petIcon.cell 里)。
    // 那个图标包本地没有镜像, 但整只精灵的动作帧包有 (/swf/pet/normal/{id}.swf, 与野怪同一份, 原版美术),
    // 所以取它的 standDown 首帧当图标: 只改显示比例, 不做任何再加工/合成。
    private function setPetIcon(c:DisplayObjectContainer, swfId:int):void
    {
        var holder:DisplayObjectContainer = cont(c, "petIcon");
        if (holder == null) { debug("背包格没有 petIcon"); return; }
        var cell:DisplayObjectContainer = cont(holder, "cell");
        if (cell == null) { debug("petIcon 里没有 cell"); return; }
        // 原版把 IconDisplayer addChild 进 cell (petIcon 时间轴 depth1)。但 UI_hud 里 petIcon 的
        // depth2 是一个遮罩层 (Flash 的图层遮罩只压它下面的层), Ruffle 把 cell 整层裁没了 → 图标全隐。
        // 改成挂到 petIcon 自己头上 (depth 最大, 画在最上), 位置用 cell 的原点换算, 版面与原版一致。
        for (var i:int = holder.numChildren - 1; i >= 0; i--)
            if (holder.getChildAt(i) is Bitmap) holder.removeChildAt(i);  // 只摘图标, 格子边框是符号自带的
        if (swfId <= 0) return;
        var put:Function = function(seq:FrameSequence):void
        {
            if (seq == null || !seq.ready) { debug("图标包没就绪 " + swfId); return; }
            var r:Object = seq.labelRange(WildPet.STAND_DOWN);
            var fr:Object = seq.frame(r != null ? r.start : 1);
            if (fr == null || fr.bmp == null) { debug("图标帧取不到 " + swfId + " range=" + r + " frame=" + fr); return; }
            var bm:Bitmap = new Bitmap(fr.bmp);
            // 帧包以脚为原点 (WildPet 里是 x = ox - anchorX), 图标要整张落在格子里
            var k:Number = Math.min(cell.width / fr.bmp.width, cell.height / fr.bmp.height, 1);
            bm.scaleX = bm.scaleY = k;
            bm.x = cell.x + (cell.width - bm.width) / 2 - (fr.ox - seq.anchorX) * k;
            bm.y = cell.y + cell.height - bm.height;
            holder.addChild(bm);
            debug("图标 " + swfId + " 格=" + Math.round(cell.width) + "x" + Math.round(cell.height)
                + " 帧=" + fr.bmp.width + "x" + fr.bmp.height + " k=" + k.toFixed(3)
                + " 落点=" + Math.round(bm.x) + "," + Math.round(bm.y)
                + " 格内子=" + cell.numChildren + " 遮罩=" + (cell.mask == null ? "无" : "有")
                + " petIcon遮罩=" + (holder.mask == null ? "无" : "有") + " petIcon子=" + holder.numChildren
                + " 帧序号=" + (r != null ? r.start : 1));
        };
        var cached:FrameSequence = WildPet.packOf(swfId);
        if (cached != null) put(cached);
        else WildPet.loadPack(swfId, put);
    }

    public function status():String
    {
        return "hud src=" + (src == null ? "none" : "ok")
            + " panels=" + [toolBar != null, actorPanel != null, petPanel != null, minorPanel != null, titlePanel != null, rightBg != null].join(",")
            + " cells=" + cellPool.length + " bag=" + bag.length
            + " retract=" + actorRetract + "," + minorRetract
            + " stage=" + (stage == null ? "?" : stage.stageWidth + "x" + stage.stageHeight)
            + " 摆位=" + box(toolBar, "底栏") + box(actorPanel, "角色") + box(petPanel, "精灵")
            + box(minorPanel, "活动") + box(titlePanel, "图名") + box(rightPanel, "右侧")
            + " 主格=" + (mainCell == null ? "none" : (mainCell.visible ? "见 " : "藏 ")
                + String(field(mainCell, "petName") == null ? "无名格" : field(mainCell, "petName").text));
    }

    // 舞台坐标下的位置 + 自身包围盒 (原点和包围盒顶不重合的那些面板, 摆位要按包围盒算)
    private function box(d:DisplayObject, tag:String):String
    {
        if (d == null) return "";
        var r:Rectangle = d.getBounds(d);
        return tag + "(" + Math.round(d.x) + "," + Math.round(d.y) + ") 尺寸"
            + Math.round(d.width) + "x" + Math.round(d.height)
            + " 本地盒" + Math.round(r.x) + "," + Math.round(r.y) + " ";
    }
}
}
