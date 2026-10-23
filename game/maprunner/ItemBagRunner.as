// 物品背包面板 (原版 module/app/ItemBagPanel.swf 的复刻)
//
// 素材路线和 HUD 那条不一样: 这次不用注入符号了。tools/probes/bagtest/BagProbe.as 实测 ——
// Loader 载入的 SWF 其 SymbolClass 导出类确实注册了, 只是注册在**那个 SWF 自己的 ApplicationDomain**
// 里 (HUD 当年只验过 ApplicationDomain.currentDomain.hasDefinition → 全 false, 于是走了注入这条路)。
// 所以这里直接用 src.loaderInfo.applicationDomain.getDefinition(类名) 拿 Class 再 new,
// 与原版 UIManager.getMovieClip() + new UI_Xxx() 的语义一致, 而且格子想点几个点几个 (不必预放)。
//
// 版面常量全部来自 BagProbe 在 Ruffle 里的实测包围盒 (原版这层摆放写在模块自己的 DoABC 里,
// vendor/seer2-origin-as3 没有 ItemBagPanel.as), 属于"按符号几何反推", 反推过程记在 docs/legacy/web-client-notes.md:
//   ItemBagPanelUI  793.3x526;  左箱 (29.7,45.4) 301x377 = 纸娃娃+货币条 (zuanTxt 73.4,390.1 / conisTxt 185.3,390)
//                              右箱 (339.7,45.4) 420x376 = 页签条 + 物品网格;  closeBtn (745.7,24) 21x21
//                              dragMC (22,19) 258x29 = 标题条 (可拖)
//   ItemBagTabUI    382x63 (自身绘制从 y=-10 起), 六个页签: equip/petRelate/collection/vip/element/petSpirtTrain
//   ItemBagPageUI   78x19: previous(0) / next(61.8) / page(18.2,0.8)
//   ItemBagCellUI   61.5x61.5, 自身绘制盒 (2.2,2.4) 起 (bg 放在 62.9,63.2 而它的包围盒在 -60.7 → 净偏移 2.2)
//   网格 6 列 x 5 行, 间距取格子画布宽 63: 6*63=378 落在 420 宽的右箱里 (左右各余 21), 5*63=315 + 页签 53 ≈ 376 正好
package
{
import flash.display.*;
import flash.events.*;
import flash.geom.Point;
import flash.geom.Rectangle;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.text.*;
import flash.utils.Dictionary;
import flash.utils.getQualifiedClassName;

public class ItemBagRunner extends Sprite
{
    private static const MODULE_URL:String = "/swf/module/app/ItemBagPanel.swf";
    private static const PKG:String = "com.taomee.seer2.module.app.itemBag.";

    private static const PANEL_W:Number = 793.3;
    private static const PANEL_H:Number = 526;
    private static const TAB_X:int = 330;               // 页签条: 右箱左沿 339.7 减去它自身的 11.6 偏移
    private static const TAB_Y:int = 53;
    private static const GRID_X:int = 360;              // 339.7 + (420-6*63)/2
    private static const GRID_Y:int = 106;              // 页签绘制底 (≈106) 起, 5 行到 421.7 ≈ 右箱底 421.4
    private static const COLS:int = 6;
    private static const ROWS:int = 5;
    private static const PITCH:int = 63;                // 格子画布宽
    private static const PAGE_X:int = 665;
    private static const PAGE_Y:int = 430;
    private static const ICON_BOX:Number = 58;          // 图标在格子里的最大边 (格子绘制盒 61.5, 图标自带 60x60)

    // 页签 → ItemCategory (vendor/app/inventory/constant/ItemCategory.as)。
    // 页签与分类的对应是推断: 符号里的实例名 equip/petRelate/collection/petSpirtTrain 与常量同名,
    // 剩下的 vip/element 按 ID 段就近归到 MEDAL(勋章奖励,Max=1 且 VIP 专属居多) 与 EMBLEM(纹章=属性)。
    private static const TAB_KEYS:Array = ["equip", "petRelate", "collection", "vip", "element", "petSpirtTrain"];
    private static const TAB_CATS:Array = [1, 2, 4, 5, 3, 8];

    public static var debug:Function = function(m:String):void {};
    public var report:Function = function(o:Object):void {};

    private var dom:ApplicationDomain;
    private var panel:MovieClip;
    private var tabUI:MovieClip;
    private var pageUI:MovieClip;
    private var pageTxt:TextField;
    private var zuanTxt:TextField, coinTxt:TextField;
    private var cells:Array = [];                       // MovieClip, 常驻, 按分页填内容
    private var items:Array = [];                       // 宿主给的背包: [{id,cat,name,count,tip,price,sell,icon}]
    private var shown:Array = [];                       // 当前页签过滤后的条目 (分页取这一段)
    private var tab:int = 1;                            // 默认开在"精灵道具"
    private var page:int = 0;
    private var ready:Boolean = false;
    private var pending:Array = null;                   // load 没完成时宿主先喂的数据
    private var pendingMoney:Array = null;

    public function ItemBagRunner()
    {
        visible = false;
        mouseEnabled = false;
    }

    // ---- 载入 ----
    public function load(onDone:Function):void
    {
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            var src:MovieClip = e.target.content as MovieClip;
            if (src == null) { debug("ItemBagPanel 根为空"); onDone(false); return; }
            dom = src.loaderInfo.applicationDomain;
            var ok:Boolean = false;
            try { ok = build(); }
            catch (err:*) { debug("背包绑定异常: " + err); }
            onDone(ok);
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            debug("ItemBagPanel 载入失败"); onDone(false);
        });
        l.load(new URLRequest(MODULE_URL));
    }

    private function def(name:String):Class
    {
        if (dom == null) return null;
        try { return dom.getDefinition(PKG + name) as Class; }
        catch (e:*) { debug("没有定义 " + name + ": " + e); }
        return null;
    }

    private function build():Boolean
    {
        var cls:Class = def("ItemBagPanelUI");
        if (cls == null) return false;
        panel = new cls() as MovieClip;
        addChild(panel);

        cls = def("ItemBagTabUI");
        if (cls != null)
        {
            tabUI = new cls() as MovieClip;
            panel.addChild(tabUI);
            tabUI.x = TAB_X; tabUI.y = TAB_Y;
            for (var i:int = 0; i < TAB_KEYS.length; i++)
            {
                var t:DisplayObject = tabUI.getChildByName(TAB_KEYS[i]);
                if (t != null)
                {
                    t.addEventListener(MouseEvent.CLICK, mkTab(i));
                    // 页签符号的绘制并不落在自己的注册框里 (equip 在 y=37、element 在 y=6 …),
                    // 光靠美术命中会点空。按实测包围盒钉一块 hitArea。
                    var tb:Rectangle = null;
                    try { tb = t.getBounds(t); } catch (e:*) { }
                    if (tb != null && tb.width > 0 && tb.height > 0 && (t is Sprite))
                    {
                        var th:Sprite = new Sprite();
                        th.graphics.beginFill(0); th.graphics.drawRect(tb.x, tb.y, tb.width, tb.height); th.graphics.endFill();
                        Sprite(t).hitArea = th;         // playerglobal 里 hitArea 声明在 Sprite 上
                    }
                }
                var bg:DisplayObject = kid(tabUI, TAB_KEYS[i] + "Background", TAB_KEYS[i] + "Ground");
                if (bg != null) bg.visible = (i == tab);   // 选中态: 原版是 gotoAndStop, 这里直接显隐底条
            }
        }

        cls = def("ItemBagPageUI");
        if (cls != null)
        {
            pageUI = new cls() as MovieClip;
            panel.addChild(pageUI);
            pageUI.x = PAGE_X; pageUI.y = PAGE_Y;
            pageTxt = pageUI.getChildByName("page") as TextField;
            var prev:DisplayObject = pageUI.getChildByName("previous");
            var next:DisplayObject = pageUI.getChildByName("next");
            if (prev != null) prev.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { turn(-1); });
            if (next != null) next.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { turn(1); });
        }

        cls = def("ItemBagCellUI");
        if (cls == null) return false;
        cells = [];
        for (var n:int = 0; n < COLS * ROWS; n++)
        {
            var cell:MovieClip = new cls() as MovieClip;
            cell.x = GRID_X + (n % COLS) * PITCH;
            cell.y = GRID_Y + int(n / COLS) * PITCH;
            cell.mouseEnabled = true;
            cell.buttonMode = true;
            // 格子符号自带的 bg 是个有自己子层级的 MovieClip, 会吃掉 ROLL_OVER; 直接给格子钉一个绘制盒当命中区
            var hs:Sprite = new Sprite();
            hs.graphics.beginFill(0); hs.graphics.drawRect(2.2, 2.4, 61.5, 61.5); hs.graphics.endFill();
            cell.hitArea = hs;                          // 2.2/2.4/61.5 = BagProbe 量的绘制盒 (hitArea 不入显示列表)
            var vf:DisplayObject = cell.getChildByName("vipFlag");
            if (vf != null) vf.visible = false;         // 符号自带 VIP 角标默认为显, 只有 VipOnly 物品才该有
            cell.addEventListener(MouseEvent.ROLL_OVER, mkHover(cell));
            cell.addEventListener(MouseEvent.ROLL_OUT, mkOut());
            cell.addEventListener(MouseEvent.CLICK, mkUse(cell));
            panel.addChild(cell);
            cells.push(cell);
        }

        // 标题条拖动 (原版 ToolBar 系面板都带 dragMC)
        var drag:DisplayObject = panel.getChildByName("dragMC");
        if (drag != null)
        {
            drag.addEventListener(MouseEvent.MOUSE_DOWN, function(e:MouseEvent):void
            {
                var r:Rectangle = new Rectangle(-40, -20, (stage ? stage.stageWidth : 1200) - PANEL_W + 80,
                    (stage ? stage.stageHeight : 660) - PANEL_H + 40);
                panel.startDrag(false, r);
            });
            drag.addEventListener(MouseEvent.MOUSE_UP, function(e:MouseEvent):void { panel.stopDrag(); });
        }
        var close:DisplayObject = panel.getChildByName("closeBtn");
        if (close != null) close.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { hide(); });

        zuanTxt = panel.getChildByName("zuanTxt") as TextField;
        coinTxt = panel.getChildByName("conisTxt") as TextField;

        // 面板吃掉自己的点击, 别让地图跟着走
        panel.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { e.stopPropagation(); });

        ready = true;
        if (pending != null) setItems(pending);
        if (pendingMoney != null) setMoney(pendingMoney[0], pendingMoney[1]);
        debug("背包建好: 格子 " + cells.length + " 页签 " + (tabUI != null) + " 翻页 " + (pageUI != null));
        return cells.length > 0;
    }

    // ---- 宿主数据 ----
    public function setItems(list:Array):void
    {
        pending = list;
        if (!ready) return;
        items = list || [];
        page = 0;
        refresh();
    }

    public function setMoney(coins:String, diamonds:String):void
    {
        pendingMoney = [coins, diamonds];
        if (!ready) return;
        if (coinTxt != null) coinTxt.text = coins;
        if (zuanTxt != null) zuanTxt.text = diamonds;
    }

    private function mkTab(i:int):Function
    {
        return function(e:MouseEvent):void
        {
            tab = i; page = 0;
            for (var k:int = 0; k < TAB_KEYS.length; k++)
            {
                if (tabUI == null) break;
                var bg:DisplayObject = kid(tabUI, TAB_KEYS[k] + "Background", TAB_KEYS[k] + "Ground");
                if (bg != null) bg.visible = (k == tab);
            }
            refresh();
        };
    }

    private function turn(d:int):void
    {
        var maxp:int = Math.floor((shown.length - 1) / (COLS * ROWS));
        if (maxp < 0) maxp = 0;
        var np:int = page + d;
        if (np < 0 || np > maxp) return;
        page = np;
        refresh();
    }

    // 原版 ItemBagPanel.refresh: 按当前页签过滤 → 按 ID 排 → 分页切一段填格子
    private function refresh():void
    {
        var want:int = TAB_CATS[tab];
        shown = [];
        for (var i:int = 0; i < items.length; i++)
            if (catOf(Number(items[i].id)) == want) shown.push(items[i]);
        shown.sortOn("id", Array.NUMERIC);

        var per:int = COLS * ROWS;
        var from:int = page * per;
        for (var n:int = 0; n < cells.length; n++)
        {
            try { fillCell(cells[n], n + from < shown.length ? shown[n + from] : null); }
            catch (err:*) { debug("填格异常 #" + n + ": " + err); }
        }
        if (pageTxt != null) pageTxt.text = String(page + 1);
        if (pageUI != null)
        {
            var prev:DisplayObject = pageUI.getChildByName("previous");
            var next:DisplayObject = pageUI.getChildByName("next");
            if (prev != null) prev.alpha = page > 0 ? 1 : 0.35;
            if (next != null) next.alpha = (page + 1) * per < shown.length ? 1 : 0.35;
        }
        report({ type: "bagInfo", tab: TAB_KEYS[tab], shown: shown.length, page: page + 1 });
    }

    // ID 段 → 分类, 逐条抄 app/inventory/utils/ItemCategoryUtil.as + constant/ItemIdRange.as
    private static function catOf(id:Number):int
    {
        if (id >= 1 && id <= 100000) return 0;
        if (id >= 100001 && id <= 199999) return 1;
        if (id >= 200001 && id <= 299999) return 2;
        if (id >= 300001 && id <= 399999) return 3;
        if (id >= 400001 && id <= 499999) return 4;
        if (id >= 500001 && id <= 500500) return 5;
        if (id >= 500501 && id <= 610000) return 101;
        if (id >= 800001 && id <= 805999) return 8;
        return 4;                                       // 原版的 default 分支
    }

    private function fillCell(cell:MovieClip, it:Object):void
    {
        cell.data = it;
        // VIP 角标: ItemBagCellUI 自带 vipFlag 默认是显出来的, 原版只在 VipOnly 物品上显示
        var flag:DisplayObject = cell.getChildByName("vipFlag");
        if (flag != null) flag.visible = (it != null && Number(it.vip) == 1);

        showIcon(cell, it == null ? -1 : Number(it.id), it == null ? null : String(it.icon));

        for (var i:int = cell.numChildren - 1; i >= 0; i--)
            if (cell.getChildAt(i).name == "num") cell.removeChildAt(i);
        var cnt:int = it == null ? 1 : int(it.count || 1);
        if (it != null && cnt > 1)
        {
            var tf:TextField = new TextField();
            tf.name = "num";
            tf.selectable = false; tf.mouseEnabled = false;
            var fmt:TextFormat = new TextFormat();
            fmt.size = 12; fmt.color = 0xffffff; fmt.bold = true;
            tf.defaultTextFormat = fmt;
            tf.text = String(cnt);
            tf.width = 46; tf.height = 16;
            tf.x = 20; tf.y = 44;
            tf.setTextFormat(fmt);
            cell.addChild(tf);
        }
    }

    // ---- 图标 ----
    // 原版格子里嵌的就是一个 IconDisplayer (内部就是一个 Loader)。这里照抄: 每格常驻一个 Loader,
    // 换物品就往同一个 Loader 里 load 新 URL。不能把载入的显示对象从 Loader 里摘出来 ——
    // Ruffle/AVM2 会抛 Error #2069 "The Loader class does not implement this method"
    // (Loader 不是普通容器, removeChild 被禁), 所以缓存的对象只能在 Loader 里待着。
    private var cellIcons:Dictionary = new Dictionary();   // cell → Loader
    private var iconIds:Dictionary = new Dictionary();     // Loader → 当前显示的 itemId
    private var iconFail:Dictionary = new Dictionary();    // itemId → true, 失败过就别反复请求

    private function showIcon(cell:MovieClip, id:Number, url:String):void
    {
        var ld:Loader = cellIcons[cell] as Loader;
        if (id < 0 || url == null || url == "" || iconFail[id] != null)
        {
            if (ld != null) ld.visible = false;
            return;
        }
        if (ld == null)
        {
            ld = new Loader();
            ld.name = "icon";
            cell.addChild(ld);
            cellIcons[cell] = ld;
        }
        else cell.setChildIndex(ld, cell.numChildren - 1);   // 压在 bg 上、数量字下方重排
        if (iconIds[ld] == id) { ld.visible = true; return; }
        iconIds[ld] = id;
        ld.visible = false;
        loadIconInto(ld, id, url);
    }

    // 事件挂在 contentLoaderInfo 上 (Loader 自身不派发), 也不接 load() 的返回值 ——
    // Ruffle 里 load() 的返回可能是 null, 之前那句 var info:* = ld.load(...) 就是这么把整个刷新打挂的。
    private function loadIconInto(ld:Loader, id:Number, url:String):void
    {
        var info:LoaderInfo = ld.contentLoaderInfo;
        info.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            if (iconIds[ld] != id) return;                            // 翻页翻走了就别再动这格
            ld.visible = true;
            if (ld is InteractiveObject) InteractiveObject(ld).mouseEnabled = false;
            fitIcon(ld);
        });
        info.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            iconFail[id] = true;
            debug("图标载入失败 " + id + " " + url);
            if (iconIds[ld] == id) ld.visible = false;
        });
        ld.load(new URLRequest(url));
    }

    // 图标盒子 60x60、格子绘制盒 (2.2,2.4) 起 61.5 见方 → 中心 33,33, 最大边收到 ICON_BOX
    private function fitIcon(ld:Loader):void
    {
        ld.scaleX = ld.scaleY = 1;
        var b:Rectangle = null;
        try { b = ld.content.getBounds(ld.content); }
        catch (e:*) { debug("图标量不到 " + e); }
        var w:Number = b == null ? 60 : b.width, h:Number = b == null ? 60 : b.height;
        var k:Number = (w > 0 && h > 0) ? Math.min(ICON_BOX / w, ICON_BOX / h, 1) : 1;
        ld.scaleX = ld.scaleY = k;
        var cx:Number = b == null ? 30 : b.x + b.width / 2;
        var cy:Number = b == null ? 30 : b.y + b.height / 2;
        ld.x = 33 - cx * k;
        ld.y = 33 - cy * k;
    }

    private function mkHover(cell:MovieClip):Function
    {
        return function(e:MouseEvent):void
        {
            if (cell.data == null) return;
            var p:Point = cell.localToGlobal(new Point(0, 0));
            report({ type: "bagTip", show: true, x: p.x, y: p.y, w: cell.width, h: cell.height, item: cell.data });
        };
    }
    private function mkOut():Function
    {
        return function(e:MouseEvent):void { report({ type: "bagTip", show: false }); };
    }
    private function mkUse(cell:MovieClip):Function
    {
        return function(e:MouseEvent):void
        {
            if (cell.data != null) report({ type: "bagUse", id: Number(cell.data.id), name: String(cell.data.name) });
        };
    }

    private function kid(c:DisplayObjectContainer, a:String, b:String):DisplayObject
    {
        var d:DisplayObject = c.getChildByName(a);
        return d != null ? d : c.getChildByName(b);
    }

    // ---- 开关 ----
    public function show():void
    {
        if (!ready) return;
        visible = true;
        mouseEnabled = true;
        panel.mouseEnabled = true; panel.mouseChildren = true;
        if (stage != null)
        {
            panel.x = (stage.stageWidth - PANEL_W) / 2;
            panel.y = (stage.stageHeight - PANEL_H) / 2;
        }
        refresh();
    }
    public function hide():void
    {
        visible = false;
        mouseEnabled = false;
        if (panel != null) panel.stopDrag();
        report({ type: "bagTip", show: false });
    }
    public function toggle():void { if (visible) hide(); else show(); }
    public function isOpen():Boolean { return visible; }

    public function status():String
    {
        var bad:String = "";
        for (var n:int = 0; n < cells.length; n++)
        {
            var c:MovieClip = cells[n] as MovieClip;
            for (var z:int = 0; z < c.numChildren; z++)
            {
                var d:DisplayObject = c.getChildAt(z);
                if (d.visible && d.alpha > 0 && c.data == null && d.name != "bg")
                    bad += "#" + n + "(空):" + (d.name == null || d.name == "" ? getQualifiedClassName(d) : d.name)
                        + "@" + Math.round(d.x) + "," + Math.round(d.y) + " ";
            }
        }
        return "ready=" + ready + " 可见=" + visible + " 页签=" + (ready ? TAB_KEYS[tab] : "-")
            + " 条目=" + shown.length + " 页=" + (page + 1) + " 格子=" + cells.length
            + " 面板=" + (panel == null ? "无" : Math.round(panel.x) + "," + Math.round(panel.y))
            + (bad == "" ? "" : " 空格残留 " + bad);
    }
}
}
