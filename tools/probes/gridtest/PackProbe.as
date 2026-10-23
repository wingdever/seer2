// 帧序列包解析探针: 按 FrameSequence.as / FrameSheet.as 的读法解 *.bin (ByteArray 默认大端)
package
{
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.net.URLLoader;
import flash.net.URLLoaderDataFormat;
import flash.net.URLRequest;
import flash.system.Security;
import flash.utils.ByteArray;
import flash.utils.getQualifiedClassName;

public class PackProbe extends Sprite
{
    public function PackProbe()
    {
        Security.allowDomain("*");
        var url:String = loaderInfo.parameters.packUrl || "/game/data/actor/UI_BLUE_BODY.bin";
        var r:URLLoader = new URLLoader();
        r.dataFormat = URLLoaderDataFormat.BINARY;
        r.addEventListener(Event.COMPLETE, function(e:Event):void { go(r.data as ByteArray, url); });
        r.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { post("IO_ERROR " + url); });
        r.load(new URLRequest(url));
    }

    private static function post(m:String):void { ExternalInterface.call("postMessage", { type: "gtLog", msg: m }, "*"); }

    private function go(b:ByteArray, url:String):void
    {
        post("size=" + b.length + " endian=" + b.endian);
        b.position = 0;
        var headLen:int = b.readShort();
        post("headLen=" + headLen);
        var head:ByteArray = new ByteArray();
        b.readBytes(head, 0, headLen);
        head.position = 0;
        post("frame " + head.readShort() + "x" + head.readShort() +
             " total=" + head.readShort() +
             " anchor=(" + head.readShort() + "," + head.readShort() + ")");
        try
        {
            var o:Object = head.readObject();
            post("l=" + String(o.l));
            post("i=" + String(o.i));
        }
        catch (e:*) { post("readObject 失败: " + e); }
        var infoLen:int = b.readShort();
        post("infoLen=" + infoLen);
        var info:ByteArray = new ByteArray();
        b.readBytes(info, 0, infoLen);
        info.position = 0;
        post("unit=" + info.readShort() + "x" + info.readShort() + " frameNum=" + info.readShort());
        for (var k:int = 0; k < 3 && info.bytesAvailable >= 12; k++)
            post("  f" + k + " key=" + info.readShort() + " off=(" + info.readShort() + "," + info.readShort() +
                 ") size=" + info.readShort() + "x" + info.readShort() + " sheetIdx=" + info.readShort());
        var rest:ByteArray = new ByteArray();
        b.readBytes(rest);
        rest.position = 0;
        post("rest=" + rest.length + "B sig=" + String.fromCharCode(rest[0], rest[1], rest[2]));
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(ev:Event):void {
            var c:DisplayObject = ev.target.content;
            var bmp:Bitmap = c as Bitmap;
            post("sheet content=" + (c == null ? "null" : String(getQualifiedClassName(c))) +
                 (bmp ? " " + bmp.bitmapData.width + "x" + bmp.bitmapData.height : ""));
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(ev:Event):void { post("sheet loadBytes 失败"); });
        try { l.loadBytes(rest); } catch (e2:*) { post("loadBytes threw " + e2); }
    }
}
}
