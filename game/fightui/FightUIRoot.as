// 战斗 UI 容器:复刻原版 FightUIManager + FightStatusPanel + FightControlPanel 装配
// 素材库 = swf/ui/UI_Arena.swf (原版 res/ui/UI_Arena.swf, 169 个 UI_* 矢量组件)
// 布局规则来源 (vendor/seer2-origin-as3):
//   FighterStatusBar.as:192-202  New-UI 子件坐标
//   PVEFighterStatusBar.as       右侧 scaleX=-1 镜像补偿坐标
//   PVEFightStatusPanel.as:27    右栏挂 (1200,0)
//   ArenaUIController.as:132-133 工具条 (246,570)
//   FightControlPanel.as:60-63   UI_FightBarBack + skillPanel.y=41
//   SkillPanel.as:71-94          必杀键(10,15) 技能键 x=81+i*175 y=16
//   HubButtonPanel.as:67-101     战斗(780,74) 道具(778,114) 精灵(778,41) 逃跑(871,114) 捕捉(871,41)
//   ShrinkBar.as:31-56           血条=逐帧回退影片 totalFrames - pct*(totalFrames-1)
package
{
import flash.display.*;
import flash.events.*;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.system.Security;
import flash.text.*;
import flash.utils.getQualifiedClassName;

public class FightUIRoot extends Sprite
{
    private var lib:ApplicationDomain;
    private var bars:Object = {};          // side -> {back,hpBar,shadowBar,angerBar,nameTxt,lvTxt,hpTxt,angerTxt}
    private var ctrl:Sprite;
    private var skillBtns:Array = [];
    private var superBtn:Sprite;
    private var superName:TextField;
    private var superPower:TextField;
    private var superAnger:TextField;
    private var superCat:TextField;
    private var activeFlag:Boolean = true;
    private var ready:Boolean = false;
    private var pendingSkills:Array = null;

    public function FightUIRoot()
    {
        Security.allowDomain("*");
        stage.align = "left";
        stage.scaleMode = "noScale";
        ExternalInterface.addCallback("setFighter", jsSetFighter);
        ExternalInterface.addCallback("setSkills", jsSetSkills);
        ExternalInterface.addCallback("setActive", jsSetActive);
        ExternalInterface.addCallback("getUIState", function():String { return ready ? "ready" : "loading"; });
        ExternalInterface.addCallback("debugDump", jsDebugDump);
        var l:Loader = new Loader();
        l.contentLoaderInfo.addEventListener(Event.COMPLETE, onLib);
        l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void { note("UI_Arena load failed"); });
        l.load(new URLRequest(loaderInfo.parameters.uiUrl || "/swf/ui/UI_Arena.swf"));
    }

    private function note(m:String):void
    {
        ExternalInterface.call("postMessage", { type: "uiLog", msg: m, instanceId: loaderInfo.parameters.instanceId || "" }, "*");
    }

    private function jsDebugDump():String
    {
        return dump(this, 0);
    }

    private function dump(c:DisplayObjectContainer, depth:int):String
    {
        var s:String = "";
        for (var i:int = 0; i < c.numChildren; i++)
        {
            var d:DisplayObject = c.getChildAt(i);
            var pad:String = depth > 0 ? "·" : "";
            s += pad + i + ":" + getQualifiedClassName(d) + " x=" + d.x + " y=" + d.y + " sx=" + d.scaleX + " vis=" + d.visible + " w=" + d.width + " h=" + d.height + " bx=" + d.getBounds(c).x + " by=" + d.getBounds(c).y + "\n";
            if (depth < 1 && d is DisplayObjectContainer) s += dump(DisplayObjectContainer(d), depth + 1);
        }
        return s;
    }

    private function onLib(e:Event):void
    {
        lib = e.target.applicationDomain;
        bars.left = makeBar(false);
        bars.right = makeBar(true);
        buildControl();
        ready = true;
        if (pendingSkills) jsSetSkills(pendingSkills);
        ExternalInterface.call("postMessage", { type: "fightUIReady", instanceId: loaderInfo.parameters.instanceId || "" }, "*");
    }

    private function def(name:String):Class { return lib.getDefinition(name) as Class; }
    private function inst(name:String):Object { var C:Class = def(name); return new C(); }
    private function spr(name:String):Sprite { return inst(name) as Sprite; }
    private function mcv(name:String):MovieClip { return inst(name) as MovieClip; }
    private function btn(name:String):SimpleButton { return inst(name) as SimpleButton; }

    private function txt(parent:DisplayObjectContainer, x:Number, y:Number, w:Number, size:Number, color:uint, bold:Boolean):TextField
    {
        var tf:TextField = new TextField();
        tf.x = x; tf.y = y; tf.width = w; tf.height = size + 6;
        tf.selectable = false; tf.mouseEnabled = false; tf.textColor = color;
        var f:TextFormat = new TextFormat("_sans", size, color, bold);
        tf.defaultTextFormat = f;
        tf.setTextFormat(f);
        parent.addChild(tf);
        return tf;
    }

    // FighterStatusBar(New-UI) + PVEFightStatusPanel 镜像规则
    private function makeBar(right:Boolean):Object
    {
        var o:Object = {};
        var c:Sprite = new Sprite();
        c.mouseEnabled = false; c.mouseChildren = false;
        o.back = spr("New_UI_FightStatusBarBack");
        c.addChild(o.back);
        o.shadowBar = new Bar(mcv("New_UI_FightHealthShadowBar")); o.shadowBar.setPos(90, 38); c.addChild(o.shadowBar.mc);
        o.hpBar = new Bar(mcv("New_UI_FightHealthBar"));            o.hpBar.setPos(93, 36);  c.addChild(o.hpBar.mc);
        o.angerBar = new Bar(mcv("New_UI_FightAngerBar"));          o.angerBar.setPos(88, 64); c.addChild(o.angerBar.mc);
        o.sign = spr("UI_FightStatusBarSign"); o.sign.x = 79; o.sign.y = 40; c.addChild(o.sign);
        o.levelSign = spr("UI_FighterLevelSign");
        var lv:Sprite = new Sprite(); lv.addChild(o.levelSign); lv.x = 170; lv.y = 15; c.addChild(lv);
        o.lvTxt = txt(lv, 30, 2, 40, 13, 0xFFFFFF, true);
        o.name = spr("UI_FighterName"); o.name.x = 95; o.name.y = 11; c.addChild(o.name);
        o.nameTxt = txt(o.name, 30, 4, 90, 13, 0xFFFFFF, true);
        o.hpTxt = txt(c, 190, 33, 80, 12, 0xFFFFFF, true);
        o.angerTxt = txt(c, 190, 60, 60, 11, 0xFFE08A, false);
        if (right)
        {
            c.scaleX = -1; c.x = 1200;
            o.sign.scaleX = -1; o.sign.x = 107;
            lv.scaleX = -1; lv.x = 227;
            o.name.scaleX = -1; o.name.x = 170;
            o.hpTxt.scaleX = -1; o.hpTxt.x = 260 - 80;
            o.angerTxt.scaleX = -1; o.angerTxt.x = 240 - 60;
        }
        addChild(c);
        o.root = c;
        return o;
    }

    // NewFightControlPanel: New_UI_FightBarBack + NewHubButtonPanel + NewSkillPanel, 挂 (246,570)
    private function buildControl():void
    {
        ctrl = new Sprite();
        ctrl.x = 246; ctrl.y = 570;
        ctrl.addChild(spr("New_UI_FightBarBack"));
        var ids:Array = ["fight", "item", "pet", "escape", "catch"];
        var pos:Array = [[855, -60], [768, 36], [855, 16], [917, -75], [789, -22]];
        var names:Array = ["New_UI_FightFight", "New_UI_FightItem", "New_UI_FightPet", "New_UI_FightEscape", "New_UI_FightCatch"];
        for (var i:int = 0; i < 5; i++)
        {
            var b:SimpleButton = btn(names[i]);
            b.x = pos[i][0]; b.y = pos[i][1];
            (function(id:String, bb:SimpleButton):void {
                bb.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void {
                    ExternalInterface.call("postMessage", { type: "hubClick", hub: id, instanceId: loaderInfo.parameters.instanceId || "" }, "*");
                });
            })(ids[i], b);
            ctrl.addChild(b);
        }
        var panel:Sprite = new Sprite();
        panel.y = 41;
        var title:MovieClip = mcv("New_UI_FightSkillTitleMC");
        title.x = 12; title.y = -22;
        panel.addChild(title);
        // NewSuperSkillButton: New_UI_FightSkillBtn2 + New_UI_FightSkillSuperBrief(28,27) @ (590,-60)
        superBtn = new Sprite();
        superBtn.x = 590; superBtn.y = -60;
        var supMc:MovieClip = mcv("New_UI_FightSkillBtn2");
        supMc.buttonMode = true; supMc.useHandCursor = true;
        superBtn.addChild(supMc);
        var supBrief:MovieClip = mcv("New_UI_FightSkillSuperBrief");
        supBrief.x = 28; supBrief.y = 27;
        supBrief.mouseChildren = false; supBrief.mouseEnabled = false;
        superBtn.addChild(supBrief);
        superName = TextField(supBrief["txtSkillName"]);
        superPower = TextField(supBrief["txtPowerValue"]);
        superAnger = TextField(supBrief["txtAngerValue"]);
        superCat = TextField(supBrief["txtSkillCategory"]);
        (function(sb:Sprite):void {
            sb.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void {
                if (!activeFlag) return;
                jsSetActive(false);
                ExternalInterface.call("postMessage", { type: "skillSelect", index: 4, instanceId: loaderInfo.parameters.instanceId || "" }, "*");
            });
        })(superBtn);
        superBtn.visible = false;
        panel.addChild(superBtn);
        for (i = 0; i < 4; i++)
        {
            var s:Sprite = new Sprite();
            s.x = 30 + i * 140; s.y = -60;
            var sb2:MovieClip = mcv("New_UI_FightSkillBtn");
            sb2.buttonMode = true; sb2.useHandCursor = true;
            s.addChild(sb2);
            var brief:MovieClip = mcv("New_UI_FightSkillBrief");
            brief.x = 16; brief.y = 27;
            brief.mouseChildren = false; brief.mouseEnabled = false;
            s.addChild(brief);
            var o:Object = {
                idx: i, root: s, btn: sb2, brief: brief,
                name: TextField(brief["txtSkillName"]),
                anger: TextField(brief["txtAngerValue"]),
                power: TextField(brief["txtPowerValue"]),
                cat: TextField(brief["txtSkillCategory"])
            };
            TextField(brief["txtAnger"]).text = "怒气";
            TextField(brief["txtPower"]).text = "威力";
            o.name.text = "技能" + (i + 1);
            (function(sk:Object):void {
                sk.btn.addEventListener(MouseEvent.CLICK, function(e:MouseEvent):void {
                    if (!activeFlag) return;
                    jsSetActive(false);
                    ExternalInterface.call("postMessage", { type: "skillSelect", index: sk.idx, instanceId: loaderInfo.parameters.instanceId || "" }, "*");
                });
            })(o);
            panel.addChild(s);
            skillBtns.push(o);
        }
        ctrl.addChild(panel);
        addChild(ctrl);
    }

    // ---- JS API ----
    private function jsSetFighter(side:String, name:String, level:int, hp:Number, maxHp:Number, anger:Number, maxAnger:Number):void
    {
        var o:Object = bars[side];
        if (!o) return;
        o.nameTxt.text = name;
        o.lvTxt.text = String(level);
        o.hpTxt.text = hp + "/" + maxHp;
        o.angerTxt.text = anger + "/" + maxAnger;
        o.hpBar.toPercent(maxHp > 0 ? hp / maxHp : 0);
        o.shadowBar.toPercent(maxHp > 0 ? hp / maxHp : 0);
        o.angerBar.toPercent(maxAnger > 0 ? anger / maxAnger : 0);
    }

    private function jsSetSkills(list:Array):void
    {
        if (!ready) { pendingSkills = list; return; }
        for (var i:int = 0; i < skillBtns.length; i++)
        {
            var o:Object = skillBtns[i];
            var en:Boolean = i < list.length;
            o.root.visible = en;
            if (!en) continue;
            var s:Object = list[i];
            o.name.text = s.name;
            o.anger.text = String(s.anger);
            o.power.text = String(s.power);
            o.cat.text = s.category;
            o.btn.enabled = s.enabled !== false;
            o.brief.alpha = o.btn.enabled ? 1 : 0.45;
        }
        if (list.length > 4)
        {
            var sup:Object = list[4];
            superBtn.visible = true;
            if (superName) superName.text = sup.name;
            if (superPower) superPower.text = String(sup.power);
            if (superAnger) superAnger.text = String(sup.anger);
            if (superCat) superCat.text = sup.category;
        }
        else superBtn.visible = false;
    }

    private function jsSetActive(v:Boolean):void
    {
        activeFlag = v;
        if (ctrl) ctrl.alpha = v ? 1 : 0.7;
    }
}
}
