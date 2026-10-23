package {
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.system.LoaderContext;
import flash.utils.getDefinitionByName;

// 可行性: Ruffle 里能不能像原版 UIManager 那样, 把 UI.swf 载进一个 ApplicationDomain,
// 再按导出类名 getDefinition 实例化符号。
// 原版做法 = UILoader.load(URLUtil.getUISwf("UI"), LoadType.DOMAIN) + UIManager.setup(content)
//            → getDefinitionByName(名字)  (MainEntry.as:310 / UIManager.as)
// 两条取法各用一次独立加载: A 共享当前域 (原版那条), B 新建子域。加载完成后才准 probe。
public class UITest extends Sprite
{
    private static const TARGETS:Array = [
        "UI_ActorAvatar_Panel", "UI_ToolBarUI", "UI_PetAvatar_Panel",
        "UI_MapTitle", "UI_Toolbar_Minor", "PetAvstarPetItem", "UI_PetShadow", "UI_FightSuprise"
    ];

    private var childDomain:ApplicationDomain;
    private var sharedInfo:LoaderInfo;
    private var childInfo:LoaderInfo;

    public function UITest()
    {
        childDomain = new ApplicationDomain(null);
        spawn(new LoaderContext(false, ApplicationDomain.currentDomain), function(li:LoaderInfo):void { sharedInfo = li; });
        spawn(new LoaderContext(false, childDomain), function(li:LoaderInfo):void { childInfo = li; });
        addEventListener(Event.ENTER_FRAME, function(e:Event):void {
            removeEventListener(Event.ENTER_FRAME, arguments.callee);
            ExternalInterface.addCallback("probe", probe);
            ExternalInterface.addCallback("state", function():String {
                return "shared=" + stateOf(sharedInfo) + " child=" + stateOf(childInfo);
            });
            ExternalInterface.call("uiTestReady");
        });
    }

    private function stateOf(li:LoaderInfo):String
    {
        if (li == null) return "loading";
        return li.content != null ? "loaded" : "empty";
    }

    private function spawn(ctx:LoaderContext, done:Function):void
    {
        var ldr:Loader = new Loader();
        ldr.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void { done(ldr.contentLoaderInfo); });
        ldr.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:IOErrorEvent):void { done(null); });
        ldr.load(new URLRequest("/swf/ui/UI.swf"), ctx);
    }

    private function probe():Object
    {
        var out:Object = { shared: sweep(null), child: sweep(childDomain) };
        if (childInfo != null) out.childInfoDomain = sweep(LoaderInfo(childInfo.content.loaderInfo).applicationDomain);
        return out;
    }

    private function sweep(dom:ApplicationDomain):Object
    {
        if (dom == null && sharedInfo == null) return "pending";
        if (dom != null && childInfo == null) return "pending";
        var hits:Object = {};
        for each (var n:String in TARGETS)
        {
            try
            {
                var C:Class = Class(dom == null ? getDefinitionByName(n) : dom.getDefinition(n));
                var inst:* = new C();
                var d:DisplayObject = DisplayObject(inst);
                addChild(d);
                hits[n] = "ok " + Math.round(d.width) + "x" + Math.round(d.height);
                removeChild(d);
            }
            catch (e:Error) { hits[n] = "ERR" + e.errorID; }
        }
        return hits;
    }
}
}
