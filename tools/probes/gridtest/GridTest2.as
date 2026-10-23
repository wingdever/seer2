// 逐步复现 MapRunner 的调用环境, 定位卡点
package {
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.geom.Matrix;
import flash.net.URLRequest;
import flash.system.Security;

public class GridTest2 extends Sprite {
    private var stage0:Sprite;
    public function GridTest2() {
        Security.allowDomain("*");
        stage0 = new Sprite(); addChild(stage0);   // 模拟 world (在舞台上)
        var url:String = loaderInfo.parameters.mapUrl || "/swf/map/1.swf";
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void { go(e.target.content as MovieClip); });
        l.load(new URLRequest(url));
    }
    static function post(s:String):void { ExternalInterface.call("postMessage", {type:"gtLog", msg:s}, "*"); }
    private function go(res:MovieClip):void {
        var onStage:Boolean = String(loaderInfo.parameters.onStage) == "1";
        if (onStage) stage0.addChild(res); else { var off:Sprite = new Sprite(); off.addChild(res); }
        post("mode=" + (onStage ? "onStage" : "offStage"));
        var path:Sprite = res["path_mc"] as Sprite;
        post("path=" + (path == null ? "null" : "ok") + " parentOnStage=" + path.stage);
        var ox:Number = path.x, oy:Number = path.y;
        if (onStage) { path.parent.removeChild(path); var h:Sprite = new Sprite(); h.addChild(path); post("detached") }
        path.scaleX = path.scaleY = 0.1;
        var gw:int = path.width, gh:int = path.height;
        post("gw=" + gw + " gh=" + gh);
        var bmp:BitmapData = new BitmapData(gw, gh, true, 0x00FFFFFF);
        post("bmp ok");
        bmp.draw(path, new Matrix(0.1, 0, 0, 0.1));
        post("draw ok");
        var walk:int = 0;
        for (var j:int = 0; j < gh; j++) for (var i = 0; i < gw; i++) if (bmp.getPixel32(i, j) == 0) walk++;
        post("RESULT walkable=" + walk + "/" + (gw*gh));
    }
}
}
