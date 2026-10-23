// 原版 com.taomee.seer2.core.animation.frame.FrameSequence + FrameSheet 的合并移植
// 帧序列包格式 (UI.swf 里的 DefineBinaryData, 由 tools/extract-actor-packs.mjs 落盘):
//   u16 headLen | head: u16 frameW, frameH, totalFrames, anchorX, anchorY, AMF 对象 {l:标签名, i:起止帧}
//   u16 infoLen | info: u16 unitW, unitH, frameNum, frameNum x (key, offsetX, offsetY, w, h, sheetIndex)
//   其余        | 一个内嵌位图 SWF (spritesheet)
// 关键帧压缩: 第 f 帧取 key <= f 的最后一条 (FrameSheet.findFrameInfoIndex)
package
{
import flash.display.Bitmap;
import flash.display.BitmapData;
import flash.display.Loader;
import flash.events.Event;
import flash.events.IOErrorEvent;
import flash.geom.Point;
import flash.geom.Rectangle;
import flash.utils.ByteArray;

public class FrameSequence
{
    public static var debug:Function = function(m:String):void {};

    public var frameW:int;
    public var frameH:int;
    public var totalFrames:int;
    public var anchorX:int;
    public var anchorY:int;
    public var ready:Boolean = false;
    public var labels:Object = {};        // name -> {start, end}

    private var unitW:int, unitH:int, cols:int;
    private var infos:Array = [];
    private var sheet:BitmapData;

    public function setData(b:ByteArray, onReady:Function = null):void
    {
        b.position = 0;
        var headLen:int = b.readShort();
        var head:ByteArray = new ByteArray();
        b.readBytes(head, 0, headLen);
        head.position = 0;
        frameW = head.readShort();
        frameH = head.readShort();
        totalFrames = head.readShort();
        anchorX = head.readShort();
        anchorY = head.readShort();
        var o:Object = head.readObject();
        parseLabels(String(o.l), String(o.i));

        var infoLen:int = b.readShort();
        var info:ByteArray = new ByteArray();
        b.readBytes(info, 0, infoLen);
        info.position = 0;
        unitW = info.readShort();
        unitH = info.readShort();
        var n:int = info.readShort();
        infos = [];
        for (var i:int = 0; i < n; i++)
        {
            infos.push({ key: info.readShort(), ox: info.readShort(), oy: info.readShort(),
                         w: info.readShort(), h: info.readShort(), si: info.readShort(), bmp: null });
        }

        var rest:ByteArray = new ByteArray();
        b.readBytes(rest);
        rest.position = 0;
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            sheet = Bitmap(e.target.content).bitmapData;
            cols = int(sheet.width / unitW);
            ready = true;
            if (onReady != null) onReady();
        });
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { debug("spritesheet 载入失败"); ready = false; });
        l.loadBytes(rest);
    }

    private function parseLabels(l:String, i:String):void
    {
        var names:Array = l.split(",");
        var nums:Array = i.split(",");
        for (var k:int = 0; k < names.length; k++)
            labels[names[k]] = { start: int(nums[k * 2]), end: int(nums[k * 2 + 1]) };
    }

    public function labelRange(name:String):Object { return labels[name]; }

    // 返回 {bmp, ox, oy}; 位图按需从 sheet 里裁出来并缓存
    public function frame(f:int):Object
    {
        if (!ready) return null;
        var pick:Object = null;
        for each (var e:Object in infos) { if (f >= e.key) pick = e; else break; }
        if (pick == null) return null;
        if (pick.bmp == null)
        {
            var col:int = pick.si % cols, row:int = int(pick.si / cols);
            pick.bmp = new BitmapData(pick.w, pick.h, true, 0);
            pick.bmp.copyPixels(sheet, new Rectangle(col * unitW, row * unitH, pick.w, pick.h), new Point(0, 0));
        }
        return { bmp: pick.bmp, ox: pick.ox, oy: pick.oy };
    }

    public function dispose():void
    {
        for each (var e:Object in infos) if (e.bmp != null) { e.bmp.dispose(); e.bmp = null; }
        infos = [];
        if (sheet != null) { sheet.dispose(); sheet = null; }
        ready = false;
    }
}
}
