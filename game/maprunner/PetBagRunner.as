// 精灵背包面板 (原版 seer2 module/app/PetBagPanel.swf 的复刻, MVP: 主面板 starPanel1)
//
// 路线与物品背包一致 (docs/legacy/petbag-handoff.md §1): Loader 载入后从**那个 SWF 自己的
// ApplicationDomain** getDefinition → new。两个和物品背包不一样的坑:
//   1. 导出名是混合清单 —— starPanel1/TabUI 是**裸名**, AppraisalPanelUI 才是全限定,
//      所以这里不拼 PKG 前缀, 名字逐字照 docs/legacy/petbag-symbols.txt 传。
//   2. 格子符号 id1256 **没被 SymbolClass 导出**, new 不出来 —— 只能摘面板时间轴上
//      现成的 bag0..11 / depot0..17 / pet0..4 实例, 内部 getChildAt(0)=底板 /(1)=图标托。
// 版面几何直接读自 PetBagPanel.swf 的 PlaceObject 矩阵 (见下 TAB_*/实测), 不是猜的。
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

public class PetBagRunner extends Sprite
{
    private static const MODULE_URL:String = "/swf/module/app/PetBagPanel.swf";

    // TabUI(id83) 不在 starPanel1 时间轴上, 要自己 new 挂 (原版模块代码没抓到, 位置先按
    // 页签绘制带贴面板顶, 截图校准)。tab 按钮注册点 tx: info 64.5 / magic 208.9 /
    // ability 353.3 / skill 497.6 / item 642.0 / introduce 818.5(0.73 缩放带)
    private static const TAB_X:Number = 20;
    private static const TAB_Y:Number = 6;
    // 左→右的页签顺序 (按上面 tx 排)
    private static const TAB_NAMES:Array = ["infoTabBtn", "magicTabBtn", "abilityTabBtn", "skillTabBtn", "itemTabBtn", "introduceBtn"];

    private static const BAG_N:int = 12;      // bag0..11: 背包 2 行 x6 (y=76.15/133.7, x=500.2 起步 60.45)
    private static const DEPOT_N:int = 18;    // depot0..17: 仓库 3 行 x6 (y=242.15/299.5/356.6)
    private static const TEAM_N:int = 5;      // pet0..4: 出战位, 版面是环绕造型

    public static var debug:Function = function(m:String):void {};
    public var report:Function = function(o:Object):void {};

    private var dom:ApplicationDomain;
    private var panel:MovieClip;
    private var tabUI:MovieClip;
    private var moneyTxt:TextField, coinTxt:TextField, starTxt:TextField;
    private var bagSlots:Array = [];          // 常驻的现成格子实例
    private var depotSlots:Array = [];
    private var teamSlots:Array = [];
    private var rows:Array = [];              // 宿主喂的精灵行 [{swfId,name,level,hp,hpMax,icon}]
    private var tab:int = 0;
    private var page:int = 0;                 // 只翻 背包+仓库 两个区
    private var ready:Boolean = false;
    private var pendingRows:Array = null;
    private var pendingMoney:Array = null;

    private var iconLoaders:Dictionary = new Dictionary();   // slot → Loader (常驻, 每格一个)
    private var iconIds:Dictionary = new Dictionary();       // Loader → 当前 swfId
    private var iconFail:Dictionary = new Dictionary();      // swfId → true

    public function PetBagRunner()
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
            if (src == null) { debug("PetBagPanel 根为空"); onDone(false); return; }
            dom = src.loaderInfo.applicationDomain;
            var ok:Boolean = false;
            try { ok = build(); }
            catch (err:*) { debug("精灵背包绑定异常: " + err); }
            onDone(ok);
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            debug("PetBagPanel 载入失败"); onDone(false);
        });
        l.load(new URLRequest(MODULE_URL));
    }

    private function def(name:String):Class
    {
        if (dom == null) return null;
        try { return dom.getDefinition(name) as Class; }        // 混合清单: 逐字传, 不拼前缀
        catch (e:*) { debug("没有定义 " + name + ": " + e); }
        return null;
    }

    private function build():Boolean
    {
        var cls:Class = def("starPanel1");
        if (cls == null) return false;
        panel = new cls() as MovieClip;
        addChild(panel);

        // 页签条: TabUI 没摆在 1377 时间轴上, new 一个挂上
        cls = def("TabUI");
        if (cls != null)
        {
            tabUI = new cls() as MovieClip;
            panel.addChild(tabUI);
            tabUI.x = TAB_X; tabUI.y = TAB_Y;
            for (var i:int = 0; i < TAB_NAMES.length; i++)
            {
                var t:DisplayObject = tabUI.getChildByName(TAB_NAMES[i]);
                if (t == null) { debug("页签缺 " + TAB_NAMES[i]); continue; }
                t.addEventListener(MouseEvent.CLICK, mkTab(i));
                pinHit(t);
            }
            selectTab(0);
            // TabUI 里常驻一个 937x506 的新手引导层 (newGuideMc), 时间轴上没有它、原版是按需显示,
            // 默认可见会把左边四个页签和它下面整块面板的鼠标事件全挡掉 (实测只有 itemTabBtn 能点中)
            var ng:DisplayObject = tabUI.getChildByName("newGuideMc");
            if (ng != null) ng.visible = false;
        }

        bagSlots = pick(bagSlots, "bag", BAG_N);
        depotSlots = pick(depotSlots, "depot", DEPOT_N);
        teamSlots = pick(teamSlots, "pet", TEAM_N);
        var allSlots:Array = bagSlots.concat(depotSlots).concat(teamSlots);
        for (var z:int = 0; z < allSlots.length; z++)
        {
            var s:MovieClip = allSlots[z] as MovieClip;
            if (s == null) continue;
            s.mouseEnabled = true; s.mouseChildren = false; s.buttonMode = true;
            pinHit(s);
            s.addEventListener(MouseEvent.ROLL_OVER, mkHover(s));
            s.addEventListener(MouseEvent.ROLL_OUT, mkOut());
            s.addEventListener(MouseEvent.CLICK, mkSelect(s));
        }

        var up:DisplayObject = panel.getChildByName("pageUp");
        var down:DisplayObject = panel.getChildByName("pageDown");
        var close:DisplayObject = panel.getChildByName("closeBtn");
        if (close != null) { pinHit(close); close.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { hide(); }); }

        // 未接的按钮先报一行, 别让人以为点坏了
        var todoBtns:Array = ["yiJianBtn", "getStarHun", "tuJianBtn", "depotBtn", "petBtn", "bagBtn"];
        for (var b:int = 0; b < todoBtns.length; b++)
        {
            var bd:DisplayObject = panel.getChildByName(todoBtns[b]);
            if (bd != null) { pinHit(bd); bd.addEventListener(MouseEvent.CLICK, mkTodo(todoBtns[b])); }
        }

        // 货币: smoney/money/starmoney 是 fl.text.TCMText (id142), 不是 TextField, 写不进字。
        // 在其注册点旁叠 ASCII TextField (数字有墨, 汉字没墨 → 数值单位走 DOM 提示)。
        moneyTxt = mkTxt(panel, 150, 25);
        coinTxt = mkTxt(panel, 379, 26);
        starTxt = mkTxt(panel, 820, 40);
        // 原版三个货币位是 TCMText, 里面设计期文本 ("9100/9000/89") 的字形有墨, 叠上去和我们的
        // 实时数字糊成一片。能按 TextField 摘到的就清空; 数值全走上面的 ASCII 覆盖层。
        var blanks:Array = ["smoney", "money", "starmoney"];
        for (var bi:int = 0; bi < blanks.length; bi++)
        {
            var bt:TextField = panel.getChildByName(blanks[bi]) as TextField;
            if (bt != null) bt.text = "";
        }

        // closeBtn 压在页签条美术下没问题, 但保险起见提到最顶。pageUp/pageDown 是 SimpleButton
        // 且 hitTest 帧是空的 (Ruffle 里永远点不中, pinHit 又只能钉在 Sprite 上) → 用透明代理层接点击。
        var raise:Array = ["closeBtn"];
        for (var ri:int = 0; ri < raise.length; ri++)
        {
            var rd:DisplayObject = panel.getChildByName(raise[ri]);
            if (rd != null) panel.setChildIndex(rd, panel.numChildren - 1);
        }
        proxyClick(up, function(e:MouseEvent):void { turn(-1); });
        proxyClick(down, function(e:MouseEvent):void { turn(1); });

        panel.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void { e.stopPropagation(); });

        // 时间轴上常驻的引导/确认弹窗默认是可见的 (截图实测: "注意!一键合成…" 糊在面板中间),
        // 原版是点了 一键合成 才弹 —— 建好就藏。
        var hideNames:Array = ["heChenMc", "zhezhuMc", "newShow1", "newShow3", "newShow4"];
        for (var h:int = 0; h < hideNames.length; h++)
        {
            var hd:DisplayObject = panel.getChildByName(hideNames[h]);
            if (hd != null) hd.visible = false;
        }

        // 层清单 dump: 后续定位全靠它 (名字:类@x,y wxh)
        var census:String = "";
        for (var c:int = 0; c < panel.numChildren; c++)
        {
            var d:DisplayObject = panel.getChildAt(c);
            var r:Rectangle = null;
            try { r = d.getBounds(d); } catch (e:*) { }
            census += "\n  层" + c + " " + (d.name == "" ? "?" : d.name) + ":" + getQualifiedClassName(d)
                + "@" + Math.round(d.x) + "," + Math.round(d.y)
                + (r == null ? "" : " " + Math.round(r.width) + "x" + Math.round(r.height));
        }
        debug("精灵背包层清单:" + census);

        // TabUI 自己那层的子清单 (页签点不中时先看它内部结构: 类名/帧数/绘制盒)
        if (tabUI != null)
        {
            var tc:String = "";
            for (var u:int = 0; u < tabUI.numChildren; u++)
            {
                var ud:DisplayObject = tabUI.getChildAt(u);
                var ur:Rectangle = null;
                try { ur = ud.getBounds(ud); } catch (e:*) { }
                tc += "\n  页签层" + u + " " + (ud.name == "" ? "?" : ud.name) + ":" + getQualifiedClassName(ud)
                    + "@" + Math.round(ud.x) + "," + Math.round(ud.y)
                    + (ur == null ? "" : " " + Math.round(ur.width) + "x" + Math.round(ur.height))
                    + (ud is MovieClip ? " 帧=" + MovieClip(ud).totalFrames : "");
            }
            debug("TabUI子清单:" + tc);
        }

        // 可点对象的**面板内**美术中心 (注册点 + 自身缩放后的绘制盒中心) —— 验证脚本按这个点, 不再猜
        var pts:String = "";
        if (tabUI != null)
            for (var ti:int = 0; ti < TAB_NAMES.length; ti++)
            {
                var td:DisplayObject = tabUI.getChildByName(TAB_NAMES[ti]);
                pts += " " + TAB_NAMES[ti] + "=" + ptOf(td, TAB_X, TAB_Y);
            }
        var ptNames:Array = ["closeBtn", "pageUp", "pageDown", "bag0", "depot0", "pet0"];
        for (var pi:int = 0; pi < ptNames.length; pi++)
        {
            var pd:DisplayObject = panel.getChildByName(ptNames[pi]);
            if (pd != null) pts += " " + ptNames[pi] + "=" + ptOf(pd, 0, 0);
        }
        debug("精灵背包点击点(面板内):" + pts);

        ready = true;
        if (pendingRows != null) setPets(pendingRows);
        if (pendingMoney != null) setMoney(pendingMoney[0], pendingMoney[1], pendingMoney[2]);
        debug("精灵背包建好: 背包 " + bagSlots.length + " 仓库 " + depotSlots.length + " 出战 " + teamSlots.length
            + " 页签 " + (tabUI != null));
        return bagSlots.length > 0;
    }

    private function ptOf(d:DisplayObject, ox:Number, oy:Number):String
    {
        var rb:Rectangle = null;
        try { rb = d.getBounds(d); } catch (e:*) { }
        if (rb == null) return "?";
        var cx:Number = d.x + (rb.x + rb.width / 2) * d.scaleX + ox;
        var cy:Number = d.y + (rb.y + rb.height / 2) * d.scaleY + oy;
        return Math.round(cx) + "," + Math.round(cy);
    }

    private function pick(arr:Array, prefix:String, n:int):Array
    {
        for (var i:int = 0; i < n; i++)
        {
            var s:MovieClip = panel.getChildByName(prefix + i) as MovieClip;   // id1256 时间轴实例是 Sprite, 只能摘不能 new
            if (s != null) arr.push(s);
            else debug("缺格子 " + prefix + i);
        }
        return arr;
    }

    // 注册点 ≠ 美术位置 (handoff §2.3): 量包围盒钉 hitArea
    private function pinHit(d:DisplayObject):void
    {
        var rb:Rectangle = null;
        try { rb = d.getBounds(d); } catch (e:*) { }
        if (rb != null && rb.width > 0 && rb.height > 0 && (d is Sprite))
        {
            var hs:Sprite = new Sprite();
            hs.graphics.beginFill(0); hs.graphics.drawRect(rb.x, rb.y, rb.width, rb.height); hs.graphics.endFill();
            Sprite(d).hitArea = hs;
        }
    }

    // 空 hitTest 的 SimpleButton 点不中 → 在原位盖一块透明 Sprite 收点击 (绘制盒 = 原对象包围盒)
    private function proxyClick(d:DisplayObject, fn:Function):void
    {
        if (d == null) return;
        var rb:Rectangle = null;
        try { rb = d.getBounds(d); } catch (e:*) { }
        if (rb == null || rb.width <= 0 || rb.height <= 0) return;
        var s:Sprite = new Sprite();
        s.x = d.x; s.y = d.y;
        s.graphics.beginFill(0); s.graphics.drawRect(rb.x, rb.y, rb.width, rb.height); s.graphics.endFill();
        s.addEventListener(MouseEvent.CLICK, fn);
        panel.addChild(s);
    }

    private function mkTxt(p:DisplayObjectContainer, dx:Number, dy:Number):TextField
    {
        var tf:TextField = new TextField();
        tf.selectable = false; tf.mouseEnabled = false;
        var fmt:TextFormat = new TextFormat();
        fmt.size = 13; fmt.color = 0xffffff; fmt.bold = true;
        tf.defaultTextFormat = fmt;
        tf.width = 90; tf.height = 18;
        tf.x = dx; tf.y = dy;
        p.addChild(tf);
        return tf;
    }

    // ---- 宿主数据 ----
    public function setPets(list:Array):void
    {
        pendingRows = list;
        if (!ready) return;
        rows = list || [];
        page = 0;
        refresh();
    }

    public function setMoney(seeds:String, coins:String, star:String):void
    {
        pendingMoney = [seeds, coins, star];
        if (!ready) return;
        if (moneyTxt != null) moneyTxt.text = seeds;
        if (coinTxt != null) coinTxt.text = coins;
        if (starTxt != null) starTxt.text = star;
    }

    private function mkTab(i:int):Function
    {
        return function(e:MouseEvent):void { selectTab(i); };
    }

    private function selectTab(i:int):void
    {
        tab = i;
        debug("页签切换 → " + TAB_NAMES[i]);
        for (var k:int = 0; k < TAB_NAMES.length; k++)
        {
            var t:MovieClip = tabUI == null ? null : tabUI.getChildByName(TAB_NAMES[k]) as MovieClip;
            if (t != null && t.currentFrame != 0) t.gotoAndStop(k == tab ? 2 : 1);   // 2 帧符号: 1 常态 / 2 选中
        }
        report({ type: "petBagInfo", tab: TAB_NAMES[tab], page: page + 1, pets: rows.length });
    }

    private function turn(d:int):void
    {
        var rest:int = rows.length > TEAM_N ? rows.length - TEAM_N : 0;
        var maxp:int = Math.floor((rest - 1) / BAG_N);
        if (maxp < 0) maxp = 0;
        var np:int = page + d;
        if (np < 0 || np > maxp) { debug("翻页到界外: " + np + "/" + maxp); return; }
        page = np;
        debug("翻页 → " + (page + 1));
        refresh();
    }

    // 原版语义: 出战 5 位 + 背包 12 (翻页) + 仓库 18 (跟随翻页)。本地模拟: 前 5 行出战,
    // 其后每 12 条一页进背包格, 再往后的 18 条铺仓库格。
    private function refresh():void
    {
        for (var i:int = 0; i < TEAM_N && i < teamSlots.length; i++) fillSlot(teamSlots[i], rowAt(i));
        var from:int = TEAM_N + page * BAG_N;
        for (var n:int = 0; n < bagSlots.length; n++) fillSlot(bagSlots[n], rowAt(from + n));
        var dfrom:int = from + BAG_N;
        for (var m:int = 0; m < depotSlots.length; m++) fillSlot(depotSlots[m], rowAt(dfrom + m));
        report({ type: "petBagInfo", tab: TAB_NAMES[tab], page: page + 1, pets: rows.length });
    }

    private function rowAt(idx:int):Object
    {
        if (idx < 0 || idx >= rows.length) return null;
        return rows[idx];
    }

    private function fillSlot(slot:MovieClip, r:Object):void
    {
        slot.data = r;
        var lvl:TextField = null;
        for (var i:int = slot.numChildren - 1; i >= 0; i--)
            if (slot.getChildAt(i).name == "lvl") { lvl = slot.getChildAt(i) as TextField; }
        showIcon(MovieClip(slot), r == null ? -1 : Number(r.swfId), r == null ? null : String(r.icon));
        if (r == null) { if (lvl != null) lvl.visible = false; return; }
        var fmt:TextFormat = new TextFormat();
        fmt.size = 11; fmt.color = 0xffff88; fmt.bold = true;
        if (lvl == null)
        {
            lvl = new TextField(); lvl.name = "lvl";
            lvl.selectable = false; lvl.mouseEnabled = false;
            lvl.defaultTextFormat = fmt; lvl.width = 40; lvl.height = 14;
            slot.addChild(lvl);
        }
        lvl.visible = true;
        lvl.text = "Lv" + int(r.level || 1);
        lvl.setTextFormat(fmt);
        var rb:Rectangle = null;
        try { rb = slot.getBounds(slot); } catch (e:*) { }
        lvl.x = (rb == null ? 0 : rb.x) + 4;
        lvl.y = (rb == null ? 46 : rb.y + rb.height) - 15;
    }

    // 图标: 每格常驻一个 Loader (不能把载入对象从 Loader 摘出来, Error #2069),
    // 换精灵就往同一个 Loader 重新 load。监听全挂 contentLoaderInfo, 不接 load() 返回值。
    private function showIcon(slot:MovieClip, swfId:Number, url:String):void
    {
        var ld:Loader = iconLoaders[slot] as Loader;
        if (swfId < 0 || url == null || url == "" || iconFail[swfId] != null)
        {
            if (ld != null) ld.visible = false;
            return;
        }
        if (ld == null) { ld = new Loader(); slot.addChild(ld); iconLoaders[slot] = ld; }
        else slot.setChildIndex(ld, slot.numChildren - 1);
        if (iconIds[ld] == swfId) { ld.visible = true; return; }
        iconIds[ld] = swfId;
        ld.visible = false;
        var info:LoaderInfo = ld.contentLoaderInfo;
        info.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            if (iconIds[ld] != swfId) return;
            ld.visible = true;
            if (ld is InteractiveObject) InteractiveObject(ld).mouseEnabled = false;
            fitIcon(ld, slot);
        });
        info.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void
        {
            iconFail[swfId] = true;
            debug("精灵图标载入失败 " + swfId + " " + url);
            if (iconIds[ld] == swfId) ld.visible = false;
        });
        ld.load(new URLRequest(url));
    }

    // 格子绘制盒 (id1256 内 底板id1254+托id1255) 量出来居中缩放, 最大边收 92%
    private function fitIcon(ld:Loader, slot:MovieClip):void
    {
        ld.scaleX = ld.scaleY = 1;
        var sb:Rectangle = null;
        try { sb = slot.getBounds(slot); } catch (e:*) { }
        var box:Number = sb == null ? 56 : Math.min(sb.width, sb.height) * 0.92;
        var b:Rectangle = null;
        try { b = ld.content.getBounds(ld.content); } catch (e2:*) { debug("图标量不到 " + e2); }
        var w:Number = b == null ? 60 : b.width, h:Number = b == null ? 60 : b.height;
        var k:Number = (w > 0 && h > 0) ? Math.min(box / w, box / h, 1) : 1;
        ld.scaleX = ld.scaleY = k;
        var cx:Number = b == null ? 30 : b.x + b.width / 2;
        var cy:Number = b == null ? 30 : b.y + b.height / 2;
        var ox:Number = sb == null ? 0 : sb.x + sb.width / 2;
        var oy:Number = sb == null ? 0 : sb.y + sb.height / 2;
        ld.x = ox - cx * k;
        ld.y = oy - cy * k;
    }

    private function mkHover(slot:MovieClip):Function
    {
        return function(e:MouseEvent):void
        {
            if (slot.data == null) return;
            debug("悬停 " + slot.name);
            var p:Point = slot.localToGlobal(new Point(0, 0));
            report({ type: "petBagTip", show: true, x: p.x, y: p.y, w: slot.getBounds(slot).width, h: slot.getBounds(slot).height, pet: slot.data });
        };
    }
    private function mkOut():Function
    {
        return function(e:MouseEvent):void { report({ type: "petBagTip", show: false }); };
    }
    private function mkSelect(slot:MovieClip):Function
    {
        return function(e:MouseEvent):void
        {
            if (slot.data == null) return;
            var zone:String = "bag";
            if (teamSlots.indexOf(slot) >= 0) zone = "team";
            else if (depotSlots.indexOf(slot) >= 0) zone = "depot";
            report({ type: "petBagSelect", zone: zone, swfId: Number(slot.data.swfId), name: String(slot.data.name), level: Number(slot.data.level) });
        };
    }
    private function mkTodo(nm:String):Function
    {
        return function(e:MouseEvent):void { report({ type: "petBagTodo", name: nm }); };
    }

    // ---- 开关 ----
    // 不能用 getBounds(panel) 居中: newShow*/引导特效等子对象的绘制盒撑到 ±100 万 px (实测
    // status 里 面板=… 1000786x512)。层清单量到的背景 Shape (层7 @0,0 910x482) 才是真版面。
    private var panelW:Number = 910;
    private var panelH:Number = 482;

    public function show():void
    {
        if (!ready) return;
        visible = true;
        mouseEnabled = true;
        panel.mouseEnabled = true; panel.mouseChildren = true;
        if (stage != null)
        {
            panel.x = (stage.stageWidth - panelW) / 2;
            panel.y = (stage.stageHeight - panelH) / 2;
        }
        refresh();
    }
    public function hide():void
    {
        visible = false;
        mouseEnabled = false;
        report({ type: "petBagTip", show: false });
    }
    public function toggle():void { if (visible) hide(); else show(); }

    public function status():String
    {
        return "ready=" + ready + " 可见=" + visible + " 页签=" + (ready ? TAB_NAMES[tab] : "-")
            + " 精灵=" + rows.length + " 页=" + (page + 1)
            + " 格=" + bagSlots.length + "/" + depotSlots.length + "/" + teamSlots.length
            + " 面板=" + (panel == null ? "无" : Math.round(panel.x) + "," + Math.round(panel.y) + " " + Math.round(panelW) + "x" + Math.round(panelH))
            + " 图标失败=" + failCount();
    }
    private function failCount():String
    {
        var n:int = 0;
        for (var k:* in iconFail) n++;
        return String(n);
    }
}
}
