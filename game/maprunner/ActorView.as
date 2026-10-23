// 裸装小赛尔: 原版 EquipPlayer.initFrameSequence 的默认部件表
//   + MultipleEquipPlayer 的分层(EquipSlotDepth)/帧同步(全部跟 BODY 的帧号)
//   + FramePlayer.drawFrame 的定位: x = scaleX*(offsetX - anchorX), y = offsetY - anchorY
// 部件 = game/data/actor/*.bin (tools/extract-actor-packs.mjs 从 swf/ui/UI.swf 抽出)
package
{
import flash.display.*;
import flash.events.*;
import flash.net.URLLoader;
import flash.net.URLLoaderDataFormat;
import flash.net.URLRequest;
import flash.utils.ByteArray;
import flash.utils.Timer;

public class ActorView extends Sprite
{
    public static var debug:Function = function(m:String):void {};

    // EquipSlotDepth 去掉裸装用不到的槽位 (DOGZ/BELT/WING) 后的顺序, 自底向上
    private static const UP_ORDER:Array   = ["EYE", "HAND_R", "FOOT_R", "FOOT_L", "BODY", "HAND_L", "HEAD"];
    private static const DOWN_ORDER:Array = ["HAND_R", "FOOT_R", "FOOT_L", "BODY", "EYE", "HEAD", "HAND_L"];

    private var seqs:Object = {};         // slot -> FrameSequence
    private var bmps:Object = {};         // slot -> Bitmap
    private var shadowSeq:FrameSequence;
    private var shadowBmp:Bitmap;

    private var labelName:String = "";
    private var startIdx:int = 1, endIdx:int = 1, curIdx:int = 1;
    private var flip:Number = 1;
    private var up:Boolean = false;

    public static function load(color:String, baseUrl:String, done:Function):void
    {
        var packs:Object = {
            HEAD: "UI_DEFAULT_HEAD", EYE: "UI_DEFAULT_EYE",
            BODY: "UI_" + color + "_BODY",
            HAND_R: "UI_" + color + "_RGIHT_HAND", HAND_L: "UI_" + color + "_LEFT_HAND",
            FOOT_R: "UI_" + color + "_RGIHT_FOOT", FOOT_L: "UI_" + color + "_LEFT_FOOT",
            SHADOW: "UI_ActorShadow"
        };
        var view:ActorView = new ActorView();
        var pending:int = 0;
        for each (var pp:String in packs) pending++;
        var total:int = pending;
        var finished:Boolean = false;
        var t:Timer;
        var finish:Function = function():void
        {
            if (finished) return;
            finished = true;
            t.stop();
            done(view);
        };
        t = new Timer(8000, 1);
        t.addEventListener(TimerEvent.TIMER_COMPLETE, function(e:Event):void { debug("超时未就绪 " + pending + "/" + total); finish(); });
        t.start();
        for (var slot:String in packs)
        {
            (function(slot:String, file:String):void
            {
                var r:URLLoader = new URLLoader();
                r.dataFormat = URLLoaderDataFormat.BINARY;
                r.addEventListener(Event.COMPLETE, function(e:Event):void
                {
                    try
                    {
                        var s:FrameSequence = new FrameSequence();
                        s.setData(r.data as ByteArray, function():void
                        {
                            if (slot == "SHADOW") view.shadowSeq = s; else view.seqs[slot] = s;
                            if (--pending == 0) finish();
                        });
                    }
                    catch (e2:*) { debug("pack 解析失败 " + slot + ": " + e2); if (--pending == 0) finish(); }
                });
                r.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { debug("pack 取不到 " + slot); if (--pending == 0) finish(); });
                r.addEventListener(SecurityErrorEvent.SECURITY_ERROR, function(e:Event):void { debug("pack sec " + slot); if (--pending == 0) finish(); });
                try { r.load(new URLRequest(baseUrl + file + ".bin")); }
                catch (e3:*) { debug("pack load threw " + slot + ": " + e3); if (--pending == 0) finish(); }
            })(slot, packs[slot]);
        }
    }

    public function hasBody():Boolean { return seqs.BODY != null && seqs.BODY.ready; }

    public function readyParts():int
    {
        var n:int = 0;
        for each (var f:FrameSequence in seqs) if (f != null && f.ready) n++;
        return n;
    }

    public function setLabel(name:String, isUp:Boolean):void
    {
        if (!hasBody() || labelName == name) return;
        var r:Object = seqs.BODY.labelRange(name);
        if (r == null) return;
        labelName = name;
        up = isUp;
        startIdx = r.start; endIdx = r.end; curIdx = startIdx;
    }

    public function setFacing(left:Boolean):void
    {
        var f:Number = left ? -1 : 1;
        if (flip == f) return;
        flip = f;
        drawn = -1;
        render(curIdx);
    }

    public function update():void
    {
        if (!hasBody()) return;
        if (curIdx > endIdx) curIdx = startIdx;
        render(curIdx);
        curIdx++;
    }

    private var drawn:int = -1;

    private function render(f:int):void
    {
        if (f == drawn) return;
        drawn = f;
        var order:Array = up ? UP_ORDER : DOWN_ORDER;
        var z:int = 0;
        if (shadowSeq != null && shadowSeq.ready)
        {
            if (shadowBmp == null) { shadowBmp = new Bitmap(); addChild(shadowBmp); }
            var sf:Object = shadowSeq.frame(((f - 1) % shadowSeq.totalFrames) + 1);
            if (sf != null)
            {
                shadowBmp.bitmapData = sf.bmp;
                shadowBmp.x = flip * (sf.ox - shadowSeq.anchorX);
                shadowBmp.y = sf.oy - shadowSeq.anchorY;
                shadowBmp.scaleX = flip;
                setChildIndex(shadowBmp, 0);
                z = 1;
            }
        }
        for each (var slot:String in order)
        {
            var s:FrameSequence = seqs[slot];
            if (s == null || !s.ready) continue;
            var info:Object = s.frame(f);
            if (info == null) continue;
            var b:Bitmap = bmps[slot];
            if (b == null) { b = new Bitmap(); bmps[slot] = b; addChild(b); }
            b.bitmapData = info.bmp;
            b.scaleX = flip;
            b.x = flip * (info.ox - s.anchorX);
            b.y = info.oy - s.anchorY;
            if (getChildIndex(b) != z) addChildAt(b, z);
            z++;
        }
    }
}
}
