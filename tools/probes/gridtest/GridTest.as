// 逐行照抄 MapAssetExtractor.extractPath() 的语义,验证它在 Ruffle 里能否工作
package {
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.geom.Matrix;
import flash.net.URLRequest;
import flash.system.Security;

public class GridTest extends Sprite {
    public static const GRID_SIZE:uint = 10;
    public function GridTest() {
        Security.allowDomain("*");
        ExternalInterface.addCallback("run", run);
        var url:String = loaderInfo.parameters.mapUrl || "/swf/map/1.swf";
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void {
            var res:MovieClip = e.target.content as MovieClip;
            ExternalInterface.call("postMessage", {type:"gtLoaded", hasPath: res["path_mc"] != null}, "*");
            try { run(res); } catch (err:*) { post("THREW " + err); }
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { post("IO_ERROR"); });
        l.load(new URLRequest(url));
    }
    private static function post(s:String):void { ExternalInterface.call("postMessage", {type:"gtLog", msg:s}, "*"); }

    private function run(resource:MovieClip):void {
        var path:Sprite = resource["path_mc"];
        if (path == null) { post("no path_mc"); return; }
        var ratio:Number = 1 / GRID_SIZE;
        path.scaleX = path.scaleY = ratio;
        var hgn:int = path.width, vgn:int = path.height;
        post("gridNums " + hgn + "x" + vgn);
        var bmp:BitmapData;
        try { bmp = new BitmapData(path.width, path.height, true, 16777215); }
        catch (e1:*) { post("new BitmapData THREW " + e1); return; }
        try { bmp.draw(path, new Matrix(ratio, 0, 0, ratio)); post("draw ok"); }
        catch (e2:*) { post("BitmapData.draw THREW " + e2); return; }
        var walkable:int = 0, blocked:int = 0, other:int = 0;
        for (var i:int = 0; i < hgn; i++)
            for (var j:int = 0; j < vgn; j++) {
                var p:uint = bmp.getPixel32(i, j);
                if (p == 0) walkable++; else if (p == 0x00FFFFFF) blocked++; else other++;
            }
        post("RESULT walkable(==0)=" + walkable + " filled=" + blocked + " other=" + other + " total=" + (hgn*vgn));
    }
}
}
