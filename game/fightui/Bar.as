package
{
import flash.display.MovieClip;
import flash.events.Event;

// ShrinkBar.as 语义:条形=多帧影片, pct -> frame = total - pct*(total-1), 每帧走 1 帧逼近
public class Bar
{
    public var mc:MovieClip;
    private var target:int = -1;

    public function Bar(mc:MovieClip)
    {
        this.mc = mc;
        mc.stop();
        toPercent(1);
    }

    public function setPos(x:Number, y:Number):void { mc.x = x; mc.y = y; }

    public function toPercent(p:Number):void
    {
        if (p < 0) p = 0; if (p > 1) p = 1;
        target = int(mc.totalFrames - p * (mc.totalFrames - 1));
        if (target >= mc.totalFrames) target = mc.totalFrames - 1;
        if (target < 1) target = 1;
        if (mc.currentFrame != target && !mc.hasEventListener(Event.ENTER_FRAME))
            mc.addEventListener(Event.ENTER_FRAME, step);
    }

    private function step(e:Event):void
    {
        var dir:int = target > mc.currentFrame ? 1 : -1;
        mc.gotoAndStop(mc.currentFrame + dir);
        if (mc.currentFrame == target) mc.removeEventListener(Event.ENTER_FRAME, step);
    }
}
}
