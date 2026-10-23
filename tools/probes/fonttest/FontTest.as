package {
import flash.display.Sprite;
import flash.events.Event;
import flash.external.ExternalInterface;
import flash.text.TextField;
import flash.text.TextFormat;
import flash.text.TextFieldAutoSize;
import flash.text.Font;
import flash.display.BitmapData;

// 诊断: Ruffle 里 TextField 到底能不能用上嵌入字体 / 中文字形。
// 判据不是宽度(缺字形也有默认前进宽度), 而是墨点数: 有字形 → 数百像素; 缺字形 → 0。
public class FontTest extends Sprite {
    // 复现: node tools/ttc-extract.mjs   (从系统 wqy-microhei.ttc 抽出单字面, 4.6MB, 不入库)
    [Embed(source="../maprunner/fonts/wqy.ttf", fontName="WqyTest", embedAsCFF="false",
           unicodeRange="U+0020-U+007E,U+53E4-U+53E4,U+65AF-U+65AF")]
    public static const WqyTest:Class;

    public static const FONTS:Array = ["_sans", "_serif", "_typewriter",
                                       "Noto Sans CJK SC", "WenQuanYi Micro Hei", "Noto Sans SC", "SimSun"];

    public function FontTest() {
        stage.frameRate = 24;
        addEventListener(Event.ENTER_FRAME, onFirst);
    }

    private function onFirst(e:Event):void {
        removeEventListener(Event.ENTER_FRAME, onFirst);
        ExternalInterface.addCallback("run", run);
        ExternalInterface.addCallback("runEmbed", runEmbed);
        ExternalInterface.call("fontTestReady");
    }

    private function ink(text:String, font:String, size:Number = 16):int {
        var tf:TextField = new TextField();
        tf.autoSize = TextFieldAutoSize.LEFT;
        tf.defaultTextFormat = new TextFormat(font, size, 0xffffff);
        tf.text = text;
        var bmp:BitmapData = new BitmapData(Math.ceil(tf.width) + 4, Math.ceil(tf.height) + 4, true, 0);
        bmp.draw(tf);
        var count:int = 0;
        for (var y:uint = 0; y < bmp.height; y++) {
            for (var x:uint = 0; x < bmp.width; x++) {
                if ((bmp.getPixel32(x, y) >>> 24) > 32) count++;
            }
        }
        return count;
    }

    private function wof(text:String, font:String, size:Number = 16):Number {
        var tf:TextField = new TextField();
        tf.autoSize = TextFieldAutoSize.LEFT;
        tf.defaultTextFormat = new TextFormat(font, size, 0xffffff);
        tf.text = text;
        return tf.width;
    }

    // 设备字体一栏: 原版靠 Flash 的系统字体回退渲染中文, Ruffle 里逐个字体名试
    public function run():Array {
        var out:Array = [];
        for (var i:int = 0; i < FONTS.length; i++) {
            var f:String = FONTS[i];
            out.push({ font: f, inkAscii: ink("Lv5", f), inkCjk: ink("古斯", f), width: wof("Lv5 古斯", f) });
        }
        return out;
    }

    // 嵌入字体一栏: 若 ink 仍为 0, 说明子集没带中文字形或 Ruffle 没用到这个字体
    public function runEmbed():Object {
        Font.registerFont(WqyTest);
        var names:Array = [];
        for each (var ft:Font in Font.enumerateFonts(true)) names.push(ft.fontName);
        var probe:Object = {};
        var tests:Array = ["Lv5", "古", "古斯", "WWWW"];
        var fonts:Array = ["WqyTest", "_sans"];
        for each (var fn:String in fonts) {
            var row:Object = { w: {}, ink: {} };
            for each (var t:String in tests) {
                row.w[t] = wof(t, fn);
                row.ink[t] = ink(t, fn, 32);
            }
            probe[fn] = row;
        }
        return { registered: names, probe: probe };
    }
}
}
