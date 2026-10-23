// 背包符号几何探针: 载入注入后的 ItemBagPanel_ui.swf, 把每个命名子对象的实际尺寸/包围盒报给宿主。
// 用途 = 定网格版面 (原版这套摆放写在模块的 DoABC 里, vendor 没有对应 .as, 只能从符号几何反推)。
package
{
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.geom.Rectangle;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.system.Security;
import flash.utils.getQualifiedClassName;

public class BagProbe extends Sprite
{
    public function BagProbe()
    {
        Security.allowDomain("*");
        var url:String = loaderInfo.parameters.bagUrl || "/swf/module/app/ItemBagPanel_ui.swf";
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            var src:MovieClip = e.target.content as MovieClip;
            if (src == null) { post("根不是 MovieClip"); return; }
            post("根子对象=" + src.numChildren);
            var want:Array = ["ItemBagPanelUI", "ItemBagTabUI", "ItemBagPageUI", "ItemBagNickUI", "Cell0", "Cell1"];
            for each (var nm:String in want)
            {
                var d:DisplayObject = src.getChildByName(nm);
                if (d == null) { post(nm + " 没有"); continue; }
                var r:Rectangle = d.getBounds(d);
                post(nm + " " + getQualifiedClassName(d) + " 宽=" + f(d.width) + " 高=" + f(d.height)
                    + " 本地盒=" + f(r.x) + "," + f(r.y) + "," + f(r.width) + "x" + f(r.height)
                    + " 子=" + (d is DisplayObjectContainer ? DisplayObjectContainer(d).numChildren : 0));
                if (d is DisplayObjectContainer) dumpKids(DisplayObjectContainer(d), nm);
            }
            post("done");
            // 顺带回答一个悬着的问题: 载入的 SWF 其 SymbolClass 导出类到底注册在哪个域。
            // (HUD 那阵子只验过 ApplicationDomain.currentDomain.hasDefinition → #1065, 没验过
            //  MovieClip.loaderInfo.applicationDomain 这条路; 能走通的话新面板就不必注入符号了)
            var dom:ApplicationDomain = src.loaderInfo.applicationDomain;
            post("域=" + (dom == ApplicationDomain.currentDomain ? "currentDomain" : "独立域"));
            for each (var cn:String in ["com.taomee.seer2.module.app.itemBag::ItemBagCellUI",
                                        "com.taomee.seer2.module.app.itemBag.ItemBagCellUI"])
            {
                try { post("hasDefinition(" + cn + ")=" + dom.hasDefinition(cn)); }
                catch (err:*) { post("hasDefinition(" + cn + ") 抛 " + err); }
            }
            try {
                var cls:Class = dom.getDefinition("com.taomee.seer2.module.app.itemBag.ItemBagCellUI") as Class;
                var mc:* = new cls();
                post("new ItemBagCellUI → " + getQualifiedClassName(mc) + " 宽=" + f(mc.width) + " 高=" + f(mc.height)
                    + " 子=" + DisplayObjectContainer(mc).numChildren + " 首子名=" + DisplayObjectContainer(mc).getChildAt(0).name);
            } catch (err2:*) { post("getDefinition/new 抛 " + err2); }
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { post("IO_ERROR"); });
        l.load(new URLRequest(url));
    }

    private function dumpKids(c:DisplayObjectContainer, tag:String):void
    {
        var n:int = c.numChildren < 14 ? c.numChildren : 14;
        for (var i:int = 0; i < n; i++)
        {
            var d:DisplayObject = c.getChildAt(i);
            var r:Rectangle = d.getBounds(d);
            post("  " + tag + "[" + i + "] " + (d.name == null ? "-" : d.name) + " @" + f(d.x) + "," + f(d.y)
                + " 宽=" + f(d.width) + " 高=" + f(d.height) + " 盒=" + f(r.x) + "," + f(r.y) + "," + f(r.width) + "x" + f(r.height));
        }
    }
    private static function f(v:Number):String { return Math.round(v * 10) / 10 + ""; }
    private static function post(s:String):void { ExternalInterface.call("postMessage", { type: "bagProbe", msg: s }, "*"); }
}
}
