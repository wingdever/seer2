// 野怪地图表现层 = 原版 com.taomee.seer2.app.pet.SpawnedPet 的移植
//   (vendor/seer2-origin-as3/src/com/taomee/seer2/app/pet/SpawnedPet.as 逐段对照)
// 保留的原版语义:
//   · 帧包 = res/pet/normal/{swfId}.swf (扩展名是 .swf, 内容其实是帧序列包, 见 FrameSequence.as)
//     标签 standDown/standUp/walkDown/walkUp/personal; 定位 x=scaleX*(offsetX-anchorX), y=offsetY-anchorY
//   · 标签文本 = "Lv{等级} {名字}" (等级 0 → "Lv???"); Mobile._labelPosition 默认 UNDER_FEET
//     → 水平居中贴在脚下。字形改由 map.html 的 #lbl 画布层描出, 见下面「有意的偏离」。
//   · addShadow(): addChildAt(shadow, 0), scaleX=scaleY=width/40
//   · 空闲: MAX_IDEL_INTERVAL=250 帧; maxIdelTime = 125 + 125*random(); 超时 → personal 一次 → randomWalk
//   · 点击: stopAction() (站定 + 惊讶特效 y=-height+20) → actorMoveClose() (脚下 ±ACTOR_CLOSE_DISTANCE 取可走点,
//     角色 runTo, 抵达事件里 startFight) → closeInteraction()
//   · startFight(): positionIndex != -1 才开战 (0..9 = 原版 isSpawnedPosition 的战斗槽位)
// 四处有意的偏离, 都因为原版资源/运行时在这个镜像上取不到:
//   · 阴影 UI_PetShadow、惊讶特效 UI_FightSuprise → 404; 改用同仓库已抽出的 UI_ActorShadow / UI_SurpriseMark 帧包
//   · 出场特效 UI_PetSpawnEffect_{type} → 404; 原版 checkout 返回 null 时本就直接 showAnimation(), 行为一致
//   · randomWalk 的目标点限制在半径 ROAM_R 内 (原版在整个舞台矩形里随机, 野怪会一路走出镜头外)
//   · 标签字形画不到 SWF 里: Ruffle 的 _sans 设备字体没有中日韩字形 (墨点=0), 而 mxmlc [Embed] 出来的
//     DefineFont4 它整个忽略 (与 _sans 度量逐像素相同)。所以 LabelRenderer 的 5 遍描边改在
//     map.html 的 #lbl 画布层照搬, 文字内容/颜色/贴脚位置仍按原版。
package
{
import flash.display.*;
import flash.events.*;
import flash.net.URLLoader;
import flash.net.URLLoaderDataFormat;
import flash.net.URLRequest;
import flash.geom.Point;
import flash.geom.Rectangle;
import flash.geom.ColorTransform;
import flash.utils.ByteArray;

public class WildPet extends Sprite
{
    public static var debug:Function = function(m:String):void {};

    // 共享资源 (换图时不重复下载/解码)
    public static var shadowSeq:FrameSequence;
    public static var markSeq:FrameSequence;
    private static var cache:Object = {};
    private static var pending:Object = {};
    private static var dead:Object = {};

    public static const MAX_IDEL_INTERVAL:int = 250;
    public static const ACTOR_CLOSE_DISTANCE:int = 20;
    public static const STAND_DOWN:String = "standDown";
    public static const STAND_UP:String = "standUp";
    public static const WALK_DOWN:String = "walkDown";
    public static const WALK_UP:String = "walkUp";
    public static const PERSONAL:String = "personal";
    private static const WALK_SPEED:Number = 1.6;
    private static const ROAM_R:Number = 160;

    public var idx:int;                       // 原版 positionIndex: 0..9 战斗槽位
    public var petId:int;                     // 原版 _petInfo.resourceId
    public var level:int;
    public var petName:String;
    public var frozen:Boolean = false;        // 原版 closeInteraction()

    private var seq:FrameSequence;
    private var body:Bitmap;
    private var hot:Shape;                      // 矢量点热区: Ruffle 对纯 Bitmap 子对象的命中测试不可靠
    private var shadow:Bitmap;
    private var mark:Bitmap;
    private var markIdx:int = 0;
    private var markTop:Number = 0;
    private var host:MapRunner;

    private var startIdx:int = 1, endIdx:int = 1, curIdx:int = 1;
    private var actionName:String = STAND_DOWN;
    private var flip:Number = 1;
    private var lookUp:Boolean = false;
    private var walking:Boolean = false;
    private var target:Point;
    private var idleTime:int = 0, maxIdleTime:int = 0;
    private var personaling:Boolean = false;
    private var callPoint:Point;
    private var ready:Boolean = false;

    // 原版: FrameSequenceManager.getFrameSequence(URLUtil.getPetSwf(id)) —— 整包字节直接喂 setData
    public static function loadPack(swfId:int, done:Function):void
    {
        if (dead[swfId]) { done(null); return; }
        var s:FrameSequence = cache[swfId];
        if (s != null && s.ready) { done(s); return; }
        if (s != null) { pending[swfId].push(done); return; }
        cache[swfId] = new FrameSequence();
        pending[swfId] = [done];
        var r:URLLoader = new URLLoader();
        r.dataFormat = URLLoaderDataFormat.BINARY;
        r.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            try
            {
                cache[swfId].setData(r.data as ByteArray, function():void
                {
                    var list:Array = pending[swfId]; pending[swfId] = [];
                    for each (var f:Function in list) f(cache[swfId]);
                });
            }
            catch (err:*) { fail(swfId, err); }
        });
        r.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { fail(swfId, "io"); });
        try { r.load(new URLRequest("/swf/pet/normal/" + swfId + ".swf")); } catch (err:*) { fail(swfId, err); }
    }

    // 已就绪的包直接取 (HUD 图标和野怪共用同一份帧包, 不再重复请求)
    public static function packOf(swfId:int):FrameSequence
    {
        var s:FrameSequence = cache[swfId];
        return (s != null && s.ready) ? s : null;
    }
    private static function fail(swfId:int, why:*):void
    {
        dead[swfId] = true;
        debug("野怪包取不到 " + swfId + ": " + why);
        var list:Array = pending[swfId]; pending[swfId] = [];
        for each (var f:Function in list) f(null);
    }

    // 共享包 (阴影 / 惊讶标记) 一次性载入
    public static function loadShared(done:Function):void
    {
        var left:int = 2;
        var f:Function = function():void { if (--left <= 0) done(); };
        grab("/game/data/actor/UI_ActorShadow.bin", function(s:FrameSequence):void { shadowSeq = s; f(); });
        grab("/game/data/actor/UI_SurpriseMark.bin", function(s:FrameSequence):void { markSeq = s; f(); });
    }
    private static function grab(url:String, done:Function):void
    {
        var r:URLLoader = new URLLoader();
        r.dataFormat = URLLoaderDataFormat.BINARY;
        r.addEventListener(Event.COMPLETE, function(e:Event):void
        {
            var s:FrameSequence = new FrameSequence();
            s.setData(r.data as ByteArray, function():void { done(s); });
        });
        r.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { debug("共享包取不到 " + url); done(null); });
        try { r.load(new URLRequest(url)); } catch (e:*) { done(null); }
    }

    public function WildPet(positionIndex:int, swfId:int, lv:int, nm:String, pack:FrameSequence, owner:MapRunner)
    {
        super();
        idx = positionIndex;
        petId = swfId;
        level = lv;
        petName = nm;
        host = owner;
        seq = pack;
        // 原版 initialize(): setResource + showLabel + addClickEventListener + hideAimation
        buttonMode = true;
        mouseChildren = false;
        body = new Bitmap();
        body.visible = false;                    // 原版 hideAimation(): 出场特效放完才显示
        addChild(body);
        addEventListener(MouseEvent.CLICK, onClick);
        ready = true;                            // 原版由出场特效的 END_FRAME 触发 showAnimation()
        showAnimation();
    }

    private function showAnimation():void
    {
        body.visible = true;
        generateMaxIdelTime();
        addShadow();
        setAction(STAND_DOWN);
    }

    private function addShadow():void
    {
        if (shadowSeq == null || !shadowSeq.ready) return;
        shadow = new Bitmap();
        // 顶替素材是角色那圈金色光环 (原版 UI_PetShadow 404)。只借它的形状和帧动画, 颜色压成暗色:
        // RGB 乘 0 → 剪影, alpha 乘 0.45 → 半透明。角色自己脚下那圈光环不受影响。
        shadow.transform.colorTransform = new ColorTransform(0, 0, 0, 0.45);
        addChildAt(shadow, 0);
        // 原版 scaleX=scaleY=width/40; 这里 width 用包格宽 (seq.frameW) 而不是 DisplayObject.width,
        // 后者会把阴影自身算进包围盒, 每帧重算就自我放大
        shadow.scaleX = shadow.scaleY = (seq != null && seq.ready ? seq.frameW : 40) / 40;
        var fr:Object = shadowSeq.frame(1);
        if (fr != null)
        {
            shadow.bitmapData = fr.bmp;
            shadow.x = fr.ox - shadowSeq.anchorX;
            shadow.y = fr.oy - shadowSeq.anchorY;
        }
    }

    private function setAction(name:String):void
    {
        if (name == actionName && startIdx != endIdx) return;
        var r:Object = (seq != null && seq.ready) ? seq.labelRange(name) : null;
        if (r == null)
        {
            r = (seq != null && seq.ready) ? seq.labelRange(STAND_DOWN) : null;
            if (r == null) return;
            name = STAND_DOWN;
        }
        actionName = name;
        startIdx = r.start; endIdx = r.end; curIdx = startIdx;
        drawn = -1;
    }

    private function onClick(e:MouseEvent):void
    {
        debug("点击 槽位" + idx + " frozen=" + frozen + " 舞台=(" + Math.round(stage.mouseX) + "," + Math.round(stage.mouseY) + ")");
        if (frozen || !ready) { e.stopImmediatePropagation(); return; }
        frozen = true;                          // 原版 closeInteraction()
        stopAction();                           // 站定 + 惊讶特效
        actorMoveClose();
        e.stopImmediatePropagation();
    }

    public function stopAction():void
    {
        walking = false;
        personaling = false;
        setAction(lookUp ? STAND_UP : STAND_DOWN);
        playSurpriseEffect();
    }

    private function playSurpriseEffect():void
    {
        if (markSeq == null || !markSeq.ready) return;
        if (mark == null) { mark = new Bitmap(); addChild(mark); }
        markIdx = 1;
        markTop = -height + 20;                 // 原版 _supriseEffect.y = 0 - height + 20
        drawMark();
    }

    private function drawMark():void
    {
        var fr:Object = markSeq.frame(markIdx);
        if (fr == null) return;
        mark.bitmapData = fr.bmp;
        mark.x = fr.ox - markSeq.anchorX;
        mark.y = markTop + (fr.oy - markSeq.anchorY);
    }

    // 原版 onSuprisePlay: currentFrame == totalFrames → removeChild + 归还对象池
    private function recycleMark():void
    {
        markIdx = 0;
        if (mark != null && mark.parent != null) removeChild(mark);
    }

    // 原版 actorMoveClose(): 以野怪为 ±20px 方框取可走点, 角色跑过去, 抵达事件里 startFight
    private function actorMoveClose():void
    {
        callPoint = host.petPickPoint(new Rectangle(x - ACTOR_CLOSE_DISTANCE, y - ACTOR_CLOSE_DISTANCE,
                                                     ACTOR_CLOSE_DISTANCE * 2, ACTOR_CLOSE_DISTANCE * 2));
        if (host.petActorArrived(callPoint)) { startFight(); return; }
        host.petCallActor(callPoint, onActorReached);
    }

    // 原版 onActorReached: 抵达 → startFight(), 然后摘监听 + openInteraction()
    private function onActorReached():void
    {
        if (callPoint != null && host.petActorArrived(callPoint)) startFight();
        frozen = false;                         // 原版 openInteraction()
    }

    private function startFight():void
    {
        if (idx != -1) host.petFight(this);     // 原版 FightManager.startFightWithWild(positionIndex)
    }

    private function generateMaxIdelTime():void
    {
        maxIdleTime = (MAX_IDEL_INTERVAL >> 1) + (MAX_IDEL_INTERVAL >> 1) * Math.random();
        idleTime = 0;
    }

    public function update():void
    {
        checkIdleState();
        if (walking) stepWalk();
        if (mark != null && markIdx > 0)
        {
            if (++markIdx > markSeq.totalFrames) { recycleMark(); }
            else drawMark();
        }
        if (seq == null || !seq.ready) return;
        if (curIdx > endIdx)
        {
            if (personaling) { personaling = false; setAction(lookUp ? STAND_UP : STAND_DOWN); randomWalk(); }
            else curIdx = startIdx;
        }
        render(curIdx);
        if (personaling || curIdx < endIdx) curIdx++;
    }

    private function checkIdleState():void
    {
        if (frozen || maxIdleTime <= 0 || walking) return;
        ++idleTime;
        if (idleTime > MAX_IDEL_INTERVAL) { playIdelAnimation(); idleTime = 0; }
        else if (idleTime > maxIdleTime) randomWalk();
    }

    private function playIdelAnimation():void
    {
        personaling = true;
        setAction(PERSONAL);
    }

    private function randomWalk():void
    {
        var r:Rectangle = new Rectangle(x - ROAM_R, y - ROAM_R, ROAM_R * 2, ROAM_R * 2);
        r = host.petClipToMap(r);
        target = host.petPickPoint(r);
        walking = true;
        generateMaxIdelTime();
    }

    private function stepWalk():void
    {
        var dx:Number = target.x - x, dy:Number = target.y - y;
        var dist:Number = Math.sqrt(dx * dx + dy * dy);
        if (dist <= WALK_SPEED)
        {
            walking = false;
            setAction(lookUp ? STAND_UP : STAND_DOWN);
            generateMaxIdelTime();
            return;
        }
        x += dx / dist * WALK_SPEED;
        y += dy / dist * WALK_SPEED;
        if (dy < -1) lookUp = true;
        else if (dy > 1) lookUp = false;
        if (dx != 0) flip = dx < 0 ? -1 : 1;
        setAction(lookUp ? WALK_UP : WALK_DOWN);
    }

    private var drawn:int = -1;

    private function render(f:int):void
    {
        if (f == drawn) return;
        drawn = f;
        var info:Object = seq.frame(f);
        if (info == null) return;
        body.bitmapData = info.bmp;
        body.scaleX = flip;
        body.x = flip * (info.ox - seq.anchorX);
        body.y = info.oy - seq.anchorY;
        drawHot();
    }

    // 帧格本身 = 点热区 (锚点在脚底, 整格在原点上方)
    private function drawHot():void
    {
        if (hot == null) { hot = new Shape(); addChild(hot); }
        hot.scaleX = 1; hot.scaleY = 1; hot.x = 0; hot.y = 0;
        var g:Graphics = hot.graphics;
        g.clear();
        g.beginFill(0, 0);
        g.drawRect(-seq.anchorX, -seq.anchorY, seq.frameW, seq.frameH);
        g.endFill();
    }

    public function dispose():void
    {
        if (mark != null && mark.parent != null) mark.parent.removeChild(mark);
        mark = null;
        if (seq != null) seq = null;     // 包是共享缓存, 不 dispose
    }
}
}
