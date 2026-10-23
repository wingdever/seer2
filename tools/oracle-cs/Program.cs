using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;

namespace Oracle;

// 直接跑《阿卡迪亚：重启》自己编出来的 Assembly-CSharp.dll，把真函数的返回值打成 JSONL。
// 输入: 一个 JSON 数组 (向量), 每条 {kind, ...}; 输出: 同长度的 JSON 数组, 每格 {v:值} 或 {err:"类型: 消息"}。
// 异常也是被观测对象 —— 移植体必须连"什么时候抛"一起对齐, 所以不能只取正常返回值。
internal static class Program
{
    const string MANAGED = "/home/wing/Software/Seer2/Seer2 Restart Lite 0827/Seer2 Restart Lite_Data/Managed";

    static Type Parser, Operator, Identifier, Mathf, Status, Personality, PetElementSystem, Element, PetExpSystem;
    static Assembly Core, Game;
    static readonly Dictionary<string, int> ThrowTally = new();

    static int Main(string[] argv)
    {
        if (argv.Length >= 1 && argv[0] == "probe") return Probe();
        if (argv.Length >= 1 && argv[0] == "dbprobe") { Load(); Console.WriteLine(Boot.Probe()); return 0; }
        if (argv.Length >= 1 && argv[0] == "tablediag") { Load(); Console.WriteLine(Boot.TableDiag(argv.Length >= 2 ? argv[1] : "Skills")); return 0; }
        if (argv.Length < 2) { Console.Error.WriteLine("用法: oracle <in.json> <out.json> | oracle probe | oracle dbprobe | oracle tablediag <Skills|Buffs>"); return 2; }

        Load();
        using var fs = File.OpenRead(argv[0]);
        var vectors = JsonSerializer.Deserialize<List<JsonElement>>(fs) ?? new();
        var results = vectors.Select(RunVector).ToList();
        File.WriteAllText(argv[1], JsonSerializer.Serialize(results));
        Console.Error.WriteLine($"oracle: {results.Count} 条, 抛错 {results.Count(r => r.ContainsKey("err"))} 条");
        return 0;
    }

    static void Load()
    {
        var ctx = new AssemblyLoadContext("unity", isCollectible: false);
        ctx.Resolving += (c, name) =>
        {
            var hit = Directory.GetFiles(MANAGED, name.Name + ".dll").FirstOrDefault();
            return hit is null ? null : c.LoadFromAssemblyPath(hit);
        };
        Core = ctx.LoadFromAssemblyPath(Path.Combine(MANAGED, "UnityEngine.CoreModule.dll"));
        Game = ctx.LoadFromAssemblyPath(Path.Combine(MANAGED, "Assembly-CSharp.dll"));
        Parser = TypeOf(Game, "Parser");
        Operator = TypeOf(Game, "Operator");
        Identifier = TypeOf(Game, "Identifier");
        Mathf = TypeOf(Core, "UnityEngine.Mathf");
        // S2 数值层: 能力值/性格/学习力/相克表全在 Status 与 PetElementSystem 这两个静态可调用体里,
        // 直调它们而不是"照源码在架子里再写一遍" —— 后者只能证明我没跑偏自己的理解。
        Status = TypeOf(Game, "Status");
        Personality = TypeOf(Game, "Personality");
        PetElementSystem = TypeOf(Game, "PetElementSystem");
        Element = TypeOf(Game, "Element");
        // D6 经验公式：纯静态、无 coroutine ⇒ 可逐值对拍（GetLevelExp/GetTotalExp/GetLevelByTotalExp）。
        PetExpSystem = TypeOf(Game, "PetExpSystem");
        if (Parser is null || Operator is null || Identifier is null || Mathf is null)
            throw new Exception($"类型没找到: Parser={Parser != null} Operator={Operator != null} Identifier={Identifier != null} Mathf={Mathf != null}");
        if (Status is null || PetElementSystem is null || Element is null)
            throw new Exception($"S2 类型没找到: Status={Status != null} PetElementSystem={PetElementSystem != null} Element={Element != null}");
    }

    // 上游命名空间可能是 global, 也可能带前缀 —— 两种都试, 找不到就把可见类型打出来。
    static Type TypeOf(Assembly a, string simpleOrFull)
    {
        foreach (var cand in new[] { simpleOrFull, "Ark." + simpleOrFull, "Seer2." + simpleOrFull })
        {
            var t = a.GetType(cand, throwOnError: false);
            if (t is not null) return t;
        }
        return a.GetTypes().FirstOrDefault(t => t.Name == simpleOrFull);
    }

    // ── Boot.cs (S3) 要的反射门面 ──
    // 参数一律走**显式 object[]**，不用 params：`Invoke(rm, "GetEffectDict", csv)` 里 csv 是 string[]，
    // params 会把它在编译期当成整个 args 数组（string[] 协变可赋给 object[]），于是上游方法收到
    // 60 个参数、报"候选=0" —— 这种假签名不匹配会把架子问题伪装成上游行为，正是对拍里最贵的一类噪声。
    public static Type TypeNamed(string name) => TypeOf(Game, name);
    public static object CallPublic(Type t, string name, object[] args) => Call(t, name, args);
    public static FieldInfo Field(Type t, string name) => t.GetField(name, BindingFlags.Public | BindingFlags.Instance)
        ?? throw new MissingFieldException($"{t.Name}.{name}");

    // 实例方法按「名字 + arity + 参数可容忍」选，和静态那套路数一致；
    // 上游有若干 (string[]) / (string[],string[]) / (string[],string[],string[]) 的同名重载，
    // 传 null 时 Fits 会放过（null 匹配任何引用参数），所以候选顺序就是声明顺序，取第一个。
    public static object CallInstance(object inst, string name, object[] args)
    {
        var t = inst.GetType();
        var cands = t.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                     .Where(x => x.Name == name && x.GetParameters().Length == args.Length && !x.IsSpecialName).ToList();
        var m = cands.FirstOrDefault(x => Fits(x.GetParameters(), args)) ?? cands.FirstOrDefault()
            ?? throw new MissingMethodException($"实例签名没对上: {t.Name}.{name}({string.Join(",", args.Select(a => a?.GetType().Name ?? "null"))}) 候选={cands.Count}");
        return m.Invoke(inst, args.Select((a, i) => Coerce(a, m.GetParameters()[i].ParameterType)).ToArray());
    }

    static object Call(Type t, string name, params object[] args)
    {
        // 只按参数个数选重载是不够的: Operator.Condition 有 (string,float,float) 和
        // (string,float,KeyValuePair) 两个 3 参重载, 挑错会抛 InvalidCastException 并伪装成"上游行为"。
        var cands = t.GetMethods(BindingFlags.Public | BindingFlags.Static)
                     .Where(x => x.Name == name && x.GetParameters().Length == args.Length).ToList();
        var m = cands.FirstOrDefault(x => Fits(x.GetParameters(), args)) ?? cands.FirstOrDefault();
        if (m is null) throw new MissingMethodException($"签名没对上: {t.Name}.{name}({string.Join(",", args.Select(a => a?.GetType().Name ?? "null"))}) 候选={cands.Count}");
        var ps = m.GetParameters();
        var pass = args.Select((a, i) => Coerce(a, ps[i].ParameterType)).ToArray();
        var ret = m.Invoke(null, pass);
        // out 参数回填进 pass, 调用方要的话得自己拿 —— SplitCondition 用专用封装
        return ret;
    }

    static bool Fits(ParameterInfo[] ps, object[] args)
    {
        for (var i = 0; i < ps.Length; i++)
        {
            if (args[i] is null) continue;
            var pt = ps[i].ParameterType;
            if (ps[i].IsOut) continue;
            // 枚举参数在向量里就是数字 id (Element/Personality), IsInstanceOfType 必然假;
            // 不算"能转换"的话重载选择会退化成"取第一个候选", 于是 GetElementRelation(int,Element)
            // 可能被 (Skill,BattlePet) 那个同名重载抢走 —— 报出来的 InvalidCast 是我架子的错, 不是上游行为。
            if (pt.IsEnum && (args[i] is int || args[i] is string)) continue;
            if (!pt.IsInstanceOfType(args[i])) return false;
        }
        return true;
    }

    // float 与 double: 探针里字面量是 C# double, 上游签名要 Single ⇒ 显式收窄, 不然 TargetParameterCount/InvalidCast
    static object Coerce(object a, Type pt)
    {
        if (a is double d && pt == typeof(float)) return (float)d;
        if (a is int n && pt == typeof(float)) return (float)n;
        if (a is float fl && pt == typeof(double)) return (double)fl;
        if (pt.IsInstanceOfType(a)) return a;
        // 枚举: 上游的 Element/Personality 都吃**数字 id**, 而 Enum.Parse 只认名字。
        // Enum.ToObject 允许未定义值 (-1、99), 这正是"未知元素走 ?? 1 兜底"那批向量要问的东西。
        if (pt.IsEnum) return a switch { int ei => Enum.ToObject(pt, ei), string es => Enum.Parse(pt, es, true), _ => a };
        return a;
    }

    // ── S2: Status / PetElementSystem 的反射封装 ─────────────────────────────
    // 6 个 float 造一个上游 Status 实例 (Status.cs:75-83 的六参构造)
    static object NewStatus(JsonElement arr)
    {
        // 用 f32 而不是 GetSingle: 向量里允许 "NaN"/"Inf"/"-Inf" 哨兵字符串 (JSON 写不出非有限数),
        // 而 GetSingle 遇到字符串会抛 —— 那会被记成"上游行为", 实际上是架子读向量读挂了。
        var xs = arr.EnumerateArray().Select(f32).ToArray();
        if (xs.Length != 6) throw new ArgumentException($"Status 向量要 6 列, 实际 {xs.Length}");
        return Activator.CreateInstance(Status, xs.Cast<object>().ToArray());
    }

    static List<object> StatusOf(object s) => s is null ? null
        : new List<object> { GetF(s, "atk"), GetF(s, "mat"), GetF(s, "def"), GetF(s, "mdf"), GetF(s, "spd"), GetF(s, "hp") };

    // 返回值是 Status 的向量统一在这里 Norm: 能力值/相克的算术路径会产出 NaN 与 ±Inf,
    // 它们是被观测的上游值, 不能因为 JSON 写不了就丢。
    static object StatusVec(object s) => StatusOf(s)?.Select(Norm).ToList();

    static float GetF(object inst, string prop) => Convert.ToSingle(inst.GetType().GetProperty(prop).GetValue(inst));

    // Status 的运算符重载: op_Addition 有 (Status,float)/(float,Status)/(Status,Status) 三个同 arity 重载,
    // Call() 的"Fits 再兜底"选法会挑错, 所以这里按**声明参数类型**精确取。
    static object StatusOp(string op, JsonElement v)
    {
        var name = op switch { "add" => "op_Addition", "sub" => "op_Subtraction", "mul" => "op_Multiply", "div" => "op_Division", "pow" => "op_ExclusiveOr", _ => throw new ArgumentException("未知 statusop: " + op) };
        var ms = Status.GetMethods(BindingFlags.Public | BindingFlags.Static).Where(m => m.Name == name).ToList();
        var rhsIsArr = v.TryGetProperty("rhsArr", out var rhsArr);
        var want2 = new[] { Status, rhsIsArr ? Status : typeof(float) };
        var m = ms.FirstOrDefault(x => x.GetParameters().Select(p => p.ParameterType).SequenceEqual(want2))
            ?? throw new MissingMethodException($"op 签名没对上: {name}({string.Join(",", ms.Select(Sig))})");
        object rhs = rhsIsArr ? NewStatus(rhsArr) : f32(v.GetProperty("rhs"));
        return m.Invoke(null, new[] { NewStatus(v.GetProperty("lhs")), rhs });
    }

    static object StatusCall(JsonElement v, string method, object[] args, Type[] sig, bool instResult = false)
    {
        var m = Status.GetMethod(method, BindingFlags.Public | BindingFlags.Instance, null, sig, null)
            ?? throw new MissingMethodException($"实例方法没对上: Status.{method}({string.Join(",", sig.Select(t => t.Name))}) 候选={string.Join(" | ", Status.GetMethods(BindingFlags.Public | BindingFlags.Instance).Where(x => x.Name == method).Select(Sig))}");
        var inst = NewStatus(v.GetProperty("s"));
        var ret = m.Invoke(inst, args);
        return instResult ? StatusVec(inst) : ret;
    }

    static object SplitOf(string data, string defaultOp)
    {
        var m = Operator.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .First(x => x.Name == "SplitCondition" && x.GetParameters().Length == 4);
        var args = new object[] { data, null, defaultOp, true };
        var kv = m.Invoke(null, args);
        var t = kv.GetType();
        return $"{t.GetProperty("Key").GetValue(kv)}|{t.GetProperty("Value").GetValue(kv)}|op={args[1]}";
    }

    static object UnityRandom(JsonElement v)
    {
        // UnityEngine.Random 是 native-backed, 在玩家进程外很可能直接炸 —— 先探, 炸了就把
        // random 相关向量从对拍里剔除并在报告里写明"不可比", 而不是拿一个装出来的值当 golden。
        var rnd = TypeOf(Core, "UnityEngine.Random");
        if (rnd is null) throw new Exception("UnityEngine.Random 类型没找到");
        var lo = v.GetProperty("lo").GetInt32(); var hi = v.GetProperty("hi").GetInt32();
        var m = rnd.GetMethods(BindingFlags.Public | BindingFlags.Static)
                   .First(x => x.Name == "Range" && x.GetParameters().Length == 2 && x.GetParameters()[0].ParameterType == typeof(int));
        return m.Invoke(null, new object[] { lo, hi });
    }

    static Dictionary<string, object> RunVector(JsonElement v)
    {
        var kind = v.GetProperty("kind").GetString();
        try
        {
            var value = kind switch
            {
                "operate" => Call(Operator, "Operate", v.GetProperty("op").GetString(),
                                  v.GetProperty("lhs").GetSingle(), v.GetProperty("rhs").GetSingle()),
                "parse" => Call(Parser, "ParseOperation", v.GetProperty("expr").GetString()),
                "datatype" => DataTypeOf(v.GetProperty("data").GetString()),
                "fraction" => FractionOf(v.GetProperty("expr").GetString()),
                "numid" => Call(Identifier, "GetNumIdentifier", v.GetProperty("id").GetString()),
                // Identifier.GetIdentifier (无上下文版) —— ParseOperation 实际用的就是它, 不是 GetNumIdentifier。
                // 分解查询靠它把"到底是哪一步分叉"定位到具体 token, 而不是对着最终值猜整体语义。
                "ident" => Call(Identifier, "GetIdentifier", v.GetProperty("id").GetString()),
                "options" => OptionsOf(v.GetProperty("data").GetString()),
                "roundi" => Call(Mathf, "RoundToInt", f32(v.GetProperty("x"))),
                "floori" => Call(Mathf, "FloorToInt", f32(v.GetProperty("x"))),
                "ceili" => Call(Mathf, "CeilToInt", f32(v.GetProperty("x"))),
                // Parser.Is* 与 Operator.Condition 也在契约里: 移植体里的算子表/条件表必须与上游同一集合,
                // 而"同一个集合"只能靠真二进制回答 —— 我的 TS 表和源码是我自己抄的, 抄错了也发现不了。
                "opknown" => Call(Parser, "IsOperator", v.GetProperty("op").GetString()),
                "condknown" => Call(Parser, "IsCondition", v.GetProperty("op").GetString()),
                "isfrac" => Call(Parser, "IsFraction", v.GetProperty("data").GetString()),
                "condition" => Call(Operator, "Condition", v.GetProperty("op").GetString(),
                                    v.GetProperty("lhs").GetSingle(), v.GetProperty("rhs").GetSingle()),
                "splitcond" => SplitOf(v.GetProperty("data").GetString(), v.GetProperty("defaultOp").GetString()),
                "halfcond" => Call(Operator, "ToHalfCondition", v.GetProperty("data").GetString()),
                // Unity 的 Random 是 native-backed, 在玩家进程外可能直接炸; 先探一下能不能用,
                // 不能用的话 random 相关向量就从对拍里排除 (difftest.mjs 里按前缀剔除), 而不是假装可比。
                "unityrandom" => UnityRandom(v),
                // ── S2 数值层 ──
                // 全部走真二进制的静态方法: 能力值公式、性格 buff、学习力/力量加成 buff、Status 运算符
                // (含那条 **乘倒数** 的 /)、Status.Get/Set 的字符串键、Status.Parse、相克表。
                "normalstatus" => StatusVec(Call(Status, "GetPetNormalStatus", v.GetProperty("level").GetInt32(),
                                        NewStatus(v.GetProperty("base")), v.GetProperty("iv").GetInt32(),
                                        NewStatus(v.GetProperty("ev")), v.GetProperty("p").GetInt32())),
                "pbuff" => StatusVec(Call(Status, "GetPersonalityBuff", v.GetProperty("p").GetInt32())),
                "pubuff" => StatusVec(Call(Status, "GetPowerUpBuff", NewStatus(v.GetProperty("s")))),
                "paddd" => Call(Status, "Add", v.GetProperty("lhs").GetInt32(), v.GetProperty("rhs").GetInt32()),
                "statusop" => StatusVec(StatusOp(v.GetProperty("op").GetString(), v)),
                "statusget" => StatusCall(v, "Get", new object[] { v.GetProperty("key").GetString() }, new[] { typeof(string) }),
                "statusset" => StatusCall(v, "Set", new object[] { v.GetProperty("key").GetString(), f32(v.GetProperty("value")) }, new[] { typeof(string), typeof(float) }, true),
                "statusparse" => StatusVec(Status.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, null,
                        new[] { typeof(string), Status, typeof(char), typeof(char) }, null)!
                        .Invoke(null, new object[] { v.GetProperty("str").GetString(), null, '(', ')' })),
                "elemrel" => Call(PetElementSystem, "GetElementRelation", v.GetProperty("atk").GetInt32(), v.GetProperty("def").GetInt32()),
                "elemrel2" => Call(PetElementSystem, "GetElementRelation", v.GetProperty("atk").GetInt32(),
                                   v.GetProperty("def").GetInt32(), v.GetProperty("sub").GetInt32()),
                "elemname" => Call(PetElementSystem, "GetElementName", v.GetProperty("e").GetInt32(), v.GetProperty("len").GetInt32()),
                // Mathf 标量族: sign(0)/sign(-0) 的符号、clamp 的参数顺序、pow 的定义域, 都只有 Unity 运行时能回答
                "msign" => Call(Mathf, "Sign", f32(v.GetProperty("x"))),
                "mabs" => Call(Mathf, "Abs", f32(v.GetProperty("x"))),
                "mpow" => Call(Mathf, "Pow", f32(v.GetProperty("a")), f32(v.GetProperty("b"))),
                "mclamp" => Call(Mathf, "Clamp", f32(v.GetProperty("x")), f32(v.GetProperty("lo")), f32(v.GetProperty("hi"))),
                // .NET LINQ 的 OrderBy/ThenBy 链 —— 先手顺序的**排序稳定性**由框架说了算,
                // 我的 TS 排序必须复现它。键值 (含"随机"那一档) 由向量给定, 所以这条不含不可比的 native Random。
                "orderby" => OrderByKeyVectors(v),
                // ── S3: 效果层 ──
                "effectparse" => EffectParseVectors(v),
                // ── S3: 印记层 (BuffInfo / Buff / 文案) ──
                "buffinfo" => BuffInfoVector(v),
                "buffid" => BuffIdVector(v),
                "buffdesc" => BuffDescVector(v),
                "refer" => ReferVector(v),
                // ── S3 快照层: 拷贝构造 + identifier 读回 ──
                // Unit/BattleState 的真构造里有 UnityEngine.Random (native, 进程外不可比), 所以这两类
                // 用 GetUninitializedObject + 手写赋值**拼**出对象, 只跑拷贝构造和读回 —— 这恰好也是
                // docs/engine/port-map.md 给这一层定的对拍口径。
                "statecopy" => StateCopyVector(v),
                "stateid" => StateIdVector(v),
                "stateset" => StateSetVector(v),
                "stateflag" => StateFlagVector(v),
                "giveturn" => GiveTurnVector(v),
                "gofirst" => GoFirstVector(v),
                "petbag" => PetBagVector(v),
                "skillsys" => SkillSysVector(v),
                "settings" => SettingsVector(v),
                "result" => ResultVector(v),
                "effectq" => EffectQVector(v),
                "phaseq" => PhaseQVector(v),
                "effectident" => EffectIdentVector(v),
                "target" => TargetVector(v),
                "effectcond" => EffectCondVector(v),
                "effectapply" => EffectApplyVector(v),
                "statusctrl" => StatusCtrlVector(v),
                // D6 经验公式（PetExpSystem：纯静态，无 coroutine）—— level/total/bytotal 三函数逐值对拍。
                "petexp" => PetExpVector(v),
                "petmut" => PetMutVector(v),
                // B5 (D6): getPetIdentifier 读侧逐键对拍 (23 个只读臂 + status.*/record/skill/buff 前缀)。
                "petid" => PetIdVector(v),
                // B5 (D6): 三只 Status 向量 (normal/extra/current) 与 oracle 同构比对。
                "petstat" => PetStatVector(v),
                "skilltable" => SkillTableVector(v),
                "phasedrive" => PhaseDriveVector(v),
                "statedrive" => DriveVector(v),
                _ => throw new ArgumentException("未知 kind: " + kind),
            };
            return new Dictionary<string, object> { ["v"] = Norm(value) };
        }
        catch (TargetInvocationException tie) when (tie.InnerException is not null)
        {
            // 反射会把被调方法自己的异常包一层, 剥掉才对得上"上游到底抛什么"
            return Fail(tie.InnerException);
        }
        catch (Exception e) { return Fail(e); }
    }

    // ±Infinity / NaN 不是合法 JSON 数字, 但**它们是被观测的上游返回值** (float 除零不抛异常)。
    // 用哨兵字符串过界, JS 侧映射同一组哨兵, 别让序列化失败把"上游返回 Inf"这条事实吞掉。
    static object Norm(object v) => v switch
    {
        float f => float.IsNaN(f) ? "NaN" : float.IsPositiveInfinity(f) ? "Inf" : float.IsNegativeInfinity(f) ? "-Inf" : (object)f,
        double d => double.IsNaN(d) ? "NaN" : double.IsPositiveInfinity(d) ? "Inf" : double.IsNegativeInfinity(d) ? "-Inf" : (object)d,
        _ => v,
    };

    // TryGet*(id, out num) 的两个结果出成**结构化 JSON**, 不拼字符串: Single.ToString 给的是
    // 最短可回写的 float 形式 ("-3.4028235E+38"), JS 的 String(Math.fround(x)) 给的是展宽 double 的
    // 最短形式 —— 那是文本表示差, 不是上游行为。出成数字就让 difftest 用 fround 比语义值。
    static object NumOut(object ok, object num)
        => new Dictionary<string, object> { ["ok"] = ok, ["num"] = Norm(num) };

    static Dictionary<string, object> Fail(Exception e)
    {
        ThrowTally[e.GetType().Name] = ThrowTally.GetValueOrDefault(e.GetType().Name) + 1;
        var d = new Dictionary<string, object> { ["errType"] = e.GetType().Name, ["err"] = $"{e.GetType().Name}: {e.Message}" };
        // MissingMemberException 是**我这套反射架子**搭错了 (MissingMethod/ MissingField —— 重载、
        // 签名或成员名没对上), 不是上游行为; 不带 where 就会把它当成"oracle 抛了"混进对拍,
        // 假绿或假红都有可能。
        if (e is MissingMemberException) d["infra"] = true;
        // ORACLE_STACK=1 时把栈带出来 —— 只用于我这边定位"哪一层拼装漏了字段";
        // 默认不带, 因为对拍向量数以万计, 栈文本会把输出撑爆。
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ORACLE_STACK"))) d["stack"] = e.ToString();
        return d;
    }

    // ParseDataType 返回 KeyValuePair<DataType,object> —— 反射回来是值类型, 用反射取两半。
    // 注意**不要**把 value 直接 JSON 化成字符串再比: C# 的 Single 走最短可回写十进制 ("0.3"),
    // JS 的 Math.fround 打印成 ("0.300000011920929"), 字符串比会假报警。所以数值单独走 double 通道,
    // 由 JS 侧两边都 fround 之后比。
    static object DataTypeOf(string data)
    {
        var kv = Call(Parser, "ParseDataType", data);
        var t = kv.GetType();
        var type = t.GetProperty("Key").GetValue(kv).ToString();
        var val = t.GetProperty("Value").GetValue(kv);
        return val switch
        {
            null => new Dictionary<string, object> { ["type"] = type, ["vk"] = "null" },
            string s => new Dictionary<string, object> { ["type"] = type, ["vk"] = "str", ["v"] = s },
            bool b => new Dictionary<string, object> { ["type"] = type, ["vk"] = "bool", ["v"] = b },
            // Fraction 分支返回 KeyValuePair<int,int>, 它不是 IConvertible ⇒ 原先 Convert.ToDouble 直接
            // InvalidCastException, 被对拍当成"oracle 抛了"混进分歧里。这是**我架子的错**, 必须显式展开。
            _ when IsPairOfInts(val) => new Dictionary<string, object>
            { ["type"] = type, ["vk"] = "frac", ["v"] = PairText(val) },
            // Condition/Operator 分支装箱的是 Func<float,float,bool|float> (Parser.cs:61,64) —— 
            // 同样不是 IConvertible。委托内部没法观测, 只能观测"它是个委托", 用 vk=func 表达; 
            // TS 侧对 Operator/Condition 也只报到 vk=func, 值不参与比较。
            _ when val is Delegate d => new Dictionary<string, object>
            { ["type"] = type, ["vk"] = "func", ["v"] = d.Method.Name },
            _ => new Dictionary<string, object> { ["type"] = type, ["vk"] = "num", ["v"] = Norm(Convert.ToDouble(val)) },
        };
    }

    static bool IsPairOfInts(object v) => v is not null && v.GetType().IsGenericType
        && v.GetType().GetGenericTypeDefinition() == typeof(KeyValuePair<,>)
        && v.GetType().GetGenericArguments().All(a => a == typeof(int));

    static object PairText(object val)
    {
        var t = val.GetType();
        return $"{t.GetProperty("Key").GetValue(val)}/{t.GetProperty("Value").GetValue(val)}";
    }

    static object FractionOf(string expr)
    {
        var kv = Call(Parser, "ParseFraction", expr);
        var t = kv.GetType();
        return $"{t.GetProperty("Key").GetValue(kv)}/{t.GetProperty("Value").GetValue(kv)}";
    }

    // ParseOptions 是 this 扩展: 传一个空 Dictionary, 回读它被填成什么样
    static object OptionsOf(string data)
    {
        var dict = new Dictionary<string, string>();
        Call(Parser, "ParseOptions", dict, data);
        return string.Join("&", dict.Select(p => p.Key + "=" + p.Value));
    }

    // DecidePriorityPhase.cs:40-54 的排序链, 但**键值全部由向量给定** (含最后那个"随机"档),
    // 这样这条对拍不含 native Random, 却仍然把 .NET LINQ OrderBy/ThenBy 的**稳定性与并列规则**
    // 变成可观测对象 —— 我的 TS 排序要是把它写成稳定归并而框架是不稳定内省排序, 只有这条能量出来。
    static object OrderByKeyVectors(JsonElement v)
    {
        var neg = v.GetProperty("neg").GetInt32();
        var rows = v.GetProperty("items").EnumerateArray().Select(x => new
        {
            k0 = x.GetProperty("hasSkill").GetInt32() == 0 ? -1 : 0,
            k1 = x.GetProperty("isAction").GetInt32(),
            k2 = x.GetProperty("vipriority").GetInt32(),
            k3 = x.GetProperty("priority").GetInt32(),
            k4 = f32(x.GetProperty("spd")) * neg,
            k5 = x.GetProperty("rnd").GetInt32(),
            o = (int)(Convert.ToSingle(Call(Mathf, "Sign", x.GetProperty("unitId").GetInt32())) * (x.GetProperty("cursor").GetInt32() + 1)),
        });
        return rows.OrderByDescending(x => x.k0).ThenByDescending(x => x.k1).ThenByDescending(x => x.k2)
                   .ThenByDescending(x => x.k3).ThenByDescending(x => x.k4).ThenBy(x => x.k5)
                   .Select(x => x.o).ToList();
    }

    // S3 效果层的等价判据: 走**真二进制**的 Effect.Parse (表由 Boot.cs 在无 Unity 进程里立起来),
    // 观测量取每条效果的 7 列 raw 串。这一条同时暴露: 词表正反查、Format 的 {i} 键值双替换、
    // GetEffect 的拷贝语义、以及引用不存在 id 时的抛点 —— 是这一层最便宜的差分。
    static object EffectParseVectors(JsonElement v)
    {
        Boot.Ensure();
        var el = v.GetProperty("expr");
        var expr = el.ValueKind == JsonValueKind.Null ? null : el.GetString();
        var list = Boot.CallStatic(Boot.Effect, "Parse", new object[] { expr! });
        if (list is null) return null;
        var getRaw = Boot.Effect.GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!;
        return ((System.Collections.IEnumerable)list).Cast<object>()
            .Select(e => string.Join("|", (string[])getRaw.Invoke(e, null)!)).ToList();
    }

    // ── S3: 印记层 ──
    // 三个可观测面共用同一条纪律: **一切都从真表里取**。
    // BuffInfo 的 CSV 构造走 `row` (直接把磁盘上那一行按 ',' 切完喂进去, 我不预解释任何字段);
    // 其余一律用 `id` 从 Database.buffInfoDict 拿上游已经装好的那一行 —— 后者顺带把
    // ResourceManager.GetBuffInfo 的装载语义 (SetEffects / options.Add 撞键 / 整表 try-catch) 一起拍了。
    static object BuffInfoOf(JsonElement v)
    {
        Boot.Ensure();
        if (v.TryGetProperty("row", out var r))
        {
            var row = r.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : x.GetString()).ToArray()!;
            var start = v.TryGetProperty("start", out var s) ? s.GetInt32() : 0;
            return Activator.CreateInstance(Boot.BuffInfo, new object[] { row, start })!;
        }
        var info = CallInstance(Boot.Db, "GetBuffInfo", new object[] { v.GetProperty("id").GetInt32() });
        return info ?? throw new NullReferenceException("GetBuffInfo ⇒ null");
    }

    // BuffInfo 的属性与字段是**混着**声明的 (minValue/maxValue/resId/itemId 是 public 字段,
    // keep/hide 是 private set 的属性), 所以取成员要两条路都试, 不然会把"架子没搭对"当成"上游没有这个值"。
    static object BuffMember(Type t, object inst, string name)
    {
        var p = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
        if (p is not null) return p.GetValue(inst)!;
        var f = t.GetField(name, BindingFlags.Public | BindingFlags.Instance);
        if (f is not null) return f.GetValue(inst)!;
        throw new MissingMemberException($"{t.Name} 没有成员 {name}");
    }

    static object BuffInfoVector(JsonElement v)
    {
        var info = BuffInfoOf(v);
        var op = v.GetProperty("op").GetString()!;
        if (op == "raw")
            return string.Join("|", (string[])Boot.BuffInfo.GetMethod("GetRawInfoStringArray", Type.EmptyTypes)!.Invoke(info, null)!);
        if (op == "effects")
            return ((System.Collections.IEnumerable)BuffMember(Boot.BuffInfo, info, "effects")!)
                .Cast<object>().Select(e => string.Join("|", (string[])Boot.Effect
                    .GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!.Invoke(e, null)!)).ToList();
        return BuffMember(Boot.BuffInfo, info, op);
    }

    // Buff(int, int, int?) —— 三参重载用显式 ctor 数组, 因为 Activator 给 null 找 int? 时容易挑到 (Buff) 拷贝构造。
    static object BuffOf(JsonElement v)
    {
        Boot.Ensure();
        // AddBuff(null) 是上游第一条分支, 所以向量的 buffs 里允许写 JSON null 把它拍出来。
        if (v.ValueKind == JsonValueKind.Null) return null;
        var id = v.GetProperty("id").GetInt32();
        var turn = v.TryGetProperty("turn", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetInt32() : -1;
        int? val = v.TryGetProperty("value", out var vv) && vv.ValueKind != JsonValueKind.Null ? vv.GetInt32() : null;
        var ctor = Boot.Buff.GetConstructors().First(c => c.GetParameters().Length == 3);
        var buff = ctor.Invoke(new object[] { id, turn, val })!;
        if (v.TryGetProperty("sets", out var sets))
            foreach (var s in sets.EnumerateObject())
                Boot.Buff.GetMethod("SetBuffIdentifier", new[] { typeof(string), typeof(float) })!
                    .Invoke(buff, new object[] { s.Name, f32(s.Value) });
        return buff;
    }

    static object BuffIdVector(JsonElement v)
    {
        var buff = BuffOf(v);
        var op = v.GetProperty("op").GetString()!;

        if (op.StartsWith("ident:"))
            return Boot.Buff.GetMethod("GetBuffIdentifier", new[] { typeof(string) })!
                .Invoke(buff, new object[] { op[6..] })!;

        if (op.StartsWith("type:"))
        {
            var raw = op[5..];
            var bt = TypeNamed("BuffType");
            var enumVal = int.TryParse(raw, out var ei) ? Enum.ToObject(bt, ei) : Enum.Parse(bt, raw, true);
            return Boot.Buff.GetMethod("IsType", new[] { bt })!.Invoke(buff, new object[] { enumVal })!;
        }

        if (op.StartsWith("set:"))
        {
            var body = op[4..];
            var n = body.IndexOf('=', StringComparison.Ordinal);
            var key = body[..n];
            Boot.Buff.GetMethod("SetBuffIdentifier", new[] { typeof(string), typeof(float) })!
                .Invoke(buff, new object[] { key, float.Parse(body[(n + 1)..]) });
            // 写完立刻用**同一把键**读回来 (GetBuffIdentifier 认得 option[...]/id/value/turn/round),
            // 这样观测的是「上游让不让写、写完之后自己读到什么」, 而不是我的反射有没有找对字段。
            return Boot.Buff.GetMethod("GetBuffIdentifier", new[] { typeof(string) })!.Invoke(buff, new object[] { key })!;
        }

        var method = op switch
        {
            "uneffectable" => "IsUneffectable", "copyable" => "IsCopyable", "power" => "IsPower",
            "powerup" => "IsPowerUp", "powerdown" => "IsPowerDown", "abnormal" => "IsAbnormal",
            "unhealthy" => "IsUnhealthy", "unmovable" => "IsUnmovable", "yite" => "IsYiTeMedicineItem",
            "desc" => "GetDescription",
            _ => null,
        };
        if (method is not null)
            return Boot.Buff.GetMethod(method, Type.EmptyTypes)!.Invoke(buff, null)!;

        if (op == "options")
            return string.Join("&", ((System.Collections.Generic.IDictionary<string, string>)
                BuffMember(Boot.Buff, buff, "options")!).Select(kv => $"{kv.Key}={kv.Value}"));
        if (op == "effects")
            return ((System.Collections.IEnumerable)BuffMember(Boot.Buff, buff, "effects")!)
                .Cast<object>().Select(e => string.Join("|", (string[])Boot.Effect
                    .GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!.Invoke(e, null)!)).ToList();

        return BuffMember(Boot.Buff, buff, op);
    }

    // 文案是这次移植里**最容易自我确认**的一块 (整串文本比对, 一处顺序错就整条不同),
    // 所以两种参考都拍: 带 id 时用调用方那只 Buff 当 referenceBuff, 不带时走上游的 ??= new Buff(-1,0,0)。
    static object BuffDescVector(JsonElement v)
    {
        var buff = v.TryGetProperty("id", out _) ? BuffOf(v) : null;
        if (v.TryGetProperty("raw", out var rawEl))
        {
            var m = Boot.Buff.GetMethods(BindingFlags.Public | BindingFlags.Static)
                       .First(x => x.Name == "GetBuffDescriptionPreview");
            return m.Invoke(null, new object[] { rawEl.GetString(), buff })!;
        }
        return Boot.Buff.GetProperty("description", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(buff)!;
    }

    // BuffReferData 是「印记引用」的紧凑写法 (技能/道具/天赋表都借用它)。它的**括号种类**决定
    // value/turn 取不取得到, 而这一层一旦读错就是整条引用静默变成「没写值」—— 所以直接问二进制。
    // 观测形状: id/turn/value(nullable)/options 插入序, 四条拼在一起。
    static object ReferVector(JsonElement v)
    {
        var t = TypeOf(Game, "BuffReferData");
        var str = v.TryGetProperty("str", out var s) ? s.GetString() : null;
        int? dflt = v.TryGetProperty("dflt", out var d) ? d.GetInt32() : null;
        var turn = v.TryGetProperty("dturn", out var tt) ? tt.GetInt32() : -1;

        if (v.TryGetProperty("dict", out _))
        {
            var m = t.GetMethod("ParseDict", new[] { typeof(string), typeof(int?), typeof(int) })!;
            var res = m.Invoke(null, new object[] { str, dflt, turn });
            if (res is null) return null;
            // Dictionary<K,V> 经非泛型 IEnumerable 枚举出来是 KeyValuePair —— 不是 DictionaryEntry
            // (只有走 IDictionaryEnumerator 才是), 反射取 Key/Value 才对得上插入序。
            return ((System.Collections.IEnumerable)res).Cast<object>()
                .Select(e => $"{e.GetType().GetProperty("Key")!.GetValue(e)}=>{FormatRefer(e.GetType().GetProperty("Value")!.GetValue(e)!)}")
                .ToList();
        }

        var pm = t.GetMethod("Parse", new[] { typeof(string), typeof(int?), typeof(int) })!;
        var one = pm.Invoke(null, new object[] { str, dflt, turn });
        return one is null ? null : FormatRefer(one);
    }

    static string FormatRefer(object data)
    {
        var t = data.GetType();
        string F(string name) => t.GetField(name)!.GetValue(data)?.ToString() ?? "null";
        var opt = string.Join("&", ((System.Collections.Generic.IDictionary<string, string>)
            t.GetField("options")!.GetValue(data)!).Select(kv => $"{kv.Key}={kv.Value}"));
        return $"{F("id")}|{F("turn")}|{F("value")}|{opt}";
    }

    // JSON 里写不了 NaN/Infinity, 但它们是**要被排序的键** —— 用哨兵字符串过界, 和 Norm 同一套约定
    static float f32(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.String => e.GetString() switch { "NaN" => float.NaN, "Inf" => float.PositiveInfinity, "-Inf" => float.NegativeInfinity, var s => float.Parse(s) },
        _ => e.GetSingle(),
    };

    // ══ S3 快照层: battle/state.ts 的「拷贝构造 + identifier 读回」══════════════
    // 判据是用户选的: 手搭 BattleState, 只调**四组拷贝构造**与**标识符读写**, 把整棵对象图的
    // 文本签名逐字节比。为什么不走真回合: Unit.cs:41 与 :68 的 UnityEngine.Random.Range 在玩家
    // 进程外必炸 (实测 SecurityException), 所以 OnTurnStart / RNG / BattleState.OnTurnStart 这条路
    // 在 oracle 里是**结构上不可达**的; SetSkill/TakeSkillCost 挂 Player.instance, Effect.Condition/Apply
    // 是另一条已登记的接缝 (setEffectJudgement), hud/card/PVP/ProcessResult 是围栏 —— 全部归 TS 单测。
    //
    // 搭对象的四条纪律:
    //   · Unit / BattleState 用 GetUninitializedObject (它们的构造要 native);
    //     UnitPetSystem / UnitSkillSystem / BattleSettings / BattleResult / 三个 controller / Buff 用**真构造**。
    //   · BattlePet 用 `new BattlePet((Pet)null)` —— 上游那句 `if (_pet == null) return;` 让构造体整段跳过,
    //     只留字段初始化器 (deadCondition 因此是**活的**), 然后手动挂三个 controller 与八件 Pet 组件:
    //     不挂的话 `new BattlePet(rhs)` 的拷贝构造会在 `new PetBasic(_copy.basic)` 上 NRE,
    //     那是我的架子没搭全, 不是上游行为。
    //   · petInfoDict 由 Addressables 协程填, 进程外填不动, 但 `PetExp.expSum` 的 getter 要 `info.expType`
    //     ⇒ 不塞一份**合成** PetInfo 就连拷贝都做不了。合成件只喂拷贝路径, 所以 level/normalStatus/name
    //     这类"表里读出来的值"**一律不进签名** —— 进了就是拿我的假数据当 golden。
    //   · 袋子里允许 null (上游 petBag 就是带洞的 BattlePet[6])。
    internal static Type UnitT, PetSysT, SkillSysT, StateT, SettingsT, ResultT, PetT, BattlePetT, StatusCtrlT,
                BuffCtrlT, SkillCtrlT, HudT, CardT, PetInfoT, EHT;
    static bool snapReady;
    internal static readonly HashSet<int> InfoIds = new();

    static void Snap()
    {
        Boot.Ensure();
        if (snapReady) return;
        UnitT = TypeNamed("Unit");
        PetSysT = TypeNamed("UnitPetSystem");
        SkillSysT = TypeNamed("UnitSkillSystem");
        StateT = TypeNamed("BattleState");
        SettingsT = TypeNamed("BattleSettings");
        ResultT = TypeNamed("BattleResult");
        PetT = TypeNamed("Pet");
        BattlePetT = TypeNamed("BattlePet");
        StatusCtrlT = TypeNamed("PetBattleStatusController");
        BuffCtrlT = TypeNamed("PetBattleBuffController");
        SkillCtrlT = TypeNamed("PetBattleSkillController");
        HudT = TypeNamed("UnitHudSystem");
        CardT = TypeNamed("UnitCardSystem");
        PetInfoT = TypeNamed("PetInfo");
        EHT = TypeNamed("EffectHandler");
        var missing = new[] { ("Unit", UnitT), ("UnitPetSystem", PetSysT), ("UnitSkillSystem", SkillSysT), ("BattleState", StateT),
                              ("BattleSettings", SettingsT), ("BattleResult", ResultT), ("Pet", PetT), ("BattlePet", BattlePetT),
                              ("PetBattleStatusController", StatusCtrlT), ("PetBattleBuffController", BuffCtrlT),
                              ("PetBattleSkillController", SkillCtrlT), ("UnitHudSystem", HudT), ("UnitCardSystem", CardT),
                              ("PetInfo", PetInfoT), ("EffectHandler", EHT) }. Where(x => x.Item2 is null).Select(x => x.Item1);
        if (missing.Any()) throw new MissingMemberException("快照层类型没找到: " + string.Join(",", missing));
        snapReady = true;
    }

    const BindingFlags BF = BindingFlags.Public | BindingFlags.Instance;

    static object Uninit(Type t) => RuntimeHelpers.GetUninitializedObject(t);

    // 成员读取: 上游这批类是**属性与字段混着**声明的 (Unit.id 是 protected set 的属性,
    // UnitPetSystem.petBag 是 public 字段, EffectHandler.queue 是 private 字段), 所以两条路都要试,
    // 并把 NonPublic 也扫上 —— 找不到就 MissingMemberException, 由 Fail 打成 infra。
    static object Get(object inst, string name)
    {
        var t = inst.GetType();
        if (t.GetField(name, BF | BindingFlags.NonPublic) is { } fd) return fd.GetValue(inst);
        if (t.GetProperty(name, BF | BindingFlags.NonPublic) is { } pr) return pr.GetValue(inst);
        throw new MissingMemberException($"读成员没对上: {t.Name}.{name}");
    }

    static void Set(object inst, string name, object val)
    {
        var t = inst.GetType();
        if (t.GetField(name, BF) is { } fd) { fd.SetValue(inst, Coerce(val, fd.FieldType)); return; }
        if (t.GetProperty(name, BF) is { } pr && (pr.GetSetMethod() ?? pr.GetSetMethod(true)) is { } sm)
        { sm.Invoke(inst, new[] { Coerce(val, pr.PropertyType) }); return; }
        if (t.GetField(name, BF | BindingFlags.NonPublic) is { } pd) { pd.SetValue(inst, Coerce(val, pd.FieldType)); return; }
        throw new MissingMemberException($"写成员没对上: {t.Name}.{name}");
    }

    // 实例方法同样按「名字 + arity + Fits」选, 与静态那套一致; out 参数被 Fits 放过 ⇒ 调用方自己回读 args。
    // 回读要求写回落到**调用方那个数组**: 早先 Select().ToArray() 换了个新数组递给 Invoke,
    // TryGet*(id, out num) 的 num 就永远停在传进去的 0 ⇒ 一整批 tryident golden 被拍成假的 "|0"。
    static object Inv(object inst, string name, object[] args)
    {
        var t = inst.GetType();
        var cands = t.GetMethods(BF).Where(x => x.Name == name && !x.IsSpecialName && x.GetParameters().Length == args.Length).ToList();
        var m = cands.FirstOrDefault(x => Fits(x.GetParameters(), args)) ?? cands.FirstOrDefault()
            ?? throw new MissingMethodException($"快照层方法没对上: {t.Name}.{name}({string.Join(",", args.Select(a => a?.GetType().Name ?? "null"))}) 候选={cands.Count}");
        var ps = m.GetParameters();
        for (var i = 0; i < args.Length; i++) args[i] = Coerce(args[i], ps[i].ParameterType);
        return m.Invoke(inst, args);
    }

    static object NewC(Type t, Type[] sig, object[] args)
    {
        var c = t.GetConstructors().FirstOrDefault(x => x.GetParameters().Select(p => p.ParameterType).SequenceEqual(sig))
            ?? throw new MissingMethodException($"构造签名没对上: new {t.Name}({string.Join(",", sig.Select(s => s.Name))}) 候选={t.GetConstructors().Length}");
        return c.Invoke(args);
    }

    // ── spec 读取 (缺省值一律取上游字段初始化器的那个数, 不是我觉得好看的数) ──
    static bool Has(JsonElement v, string name)
        => v.ValueKind == JsonValueKind.Object && v.TryGetProperty(name, out var e) && e.ValueKind != JsonValueKind.Null;
    static JsonElement Sub(JsonElement v, string name) => Has(v, name) ? v.GetProperty(name) : default;
    static int Iv(JsonElement v, string name, int dflt) => Has(v, name) ? v.GetProperty(name).GetInt32() : dflt;
    static bool Bv(JsonElement v, string name, bool dflt) => Has(v, name) ? v.GetProperty(name).GetBoolean() : dflt;
    static string Sv(JsonElement v, string name, string dflt = null) => Has(v, name) ? v.GetProperty(name).GetString() : dflt;
    static float Fv(JsonElement v, string name, float dflt) => Has(v, name) ? f32(v.GetProperty(name)) : dflt;

    static object TypedList(Type elem, IEnumerable<object> items)
    {
        var l = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(elem));
        foreach (var x in items) l.Add(x);
        return l;
    }
    static List<object> BuffsOf(JsonElement v, string name)
        => Has(v, name) ? v.GetProperty(name).EnumerateArray().Select(BuffOf).ToList() : new List<object>();
    static object DictSS(JsonElement v, string name)
    {
        var d = new Dictionary<string, string>();
        if (Has(v, name)) foreach (var p in v.GetProperty(name).EnumerateObject()) d[p.Name] = p.Value.GetString();
        return d;
    }
    static object DictSI(JsonElement v, string name)
    {
        var d = new Dictionary<string, int>();
        if (Has(v, name)) foreach (var p in v.GetProperty(name).EnumerateObject()) d[p.Name] = p.Value.GetInt32();
        return d;
    }
    static object QueueOf(JsonElement v, string name)
    {
        var q = Activator.CreateInstance(typeof(Queue<string>));
        if (Has(v, name))
        {
            var en = q.GetType().GetMethod("Enqueue");
            foreach (var s in v.GetProperty(name).EnumerateArray()) en.Invoke(q, new object[] { s.GetString() });
        }
        return q;
    }
    static List<int> IntsOf(JsonElement v, string name)
        => Has(v, name) ? v.GetProperty(name).EnumerateArray().Select(x => x.GetInt32()).ToList() : new List<int>();
    static object IntSetOf(IEnumerable<int> xs)
        => Activator.CreateInstance(typeof(HashSet<int>), new object[] { new List<int>(xs) });
    static object KvpOf(object key, object val)
        => Activator.CreateInstance(typeof(KeyValuePair<,>).MakeGenericType(key.GetType(), val.GetType()), key, val);

    static Array PetBagOf(JsonElement v, string name, int dfltLen)
    {
        var items = Has(v, name) ? v.GetProperty(name).EnumerateArray().ToList() : null;
        var arr = Array.CreateInstance(BattlePetT, items?.Count ?? dfltLen);
        if (items is null) return arr;
        for (var i = 0; i < items.Count; i++) arr.SetValue(items[i].ValueKind == JsonValueKind.Null ? null : BuildPet(items[i]), i);
        return arr;
    }

    // B1 之后 petInfoDict 已装真表；这里只当**兜底**：真表没有该 id 时才合成默认 PetInfo，避免 NRE。
    static void EnsurePetInfo(int id)
    {
        var dict = (System.Collections.IDictionary)Field(Boot.Database, "petInfoDict").GetValue(Boot.Db);
        if (dict.Contains(id)) return;   // 真表已有 ⇒ 跳过合成
        if (!InfoIds.Add(id)) return;
        var info = Activator.CreateInstance(PetInfoT);
        foreach (var n in new[] { "basic", "feature", "exp", "talent", "skills", "cards", "ui", "kizuna" })
        {
            var f = PetInfoT.GetField(n, BF);
            if (f is null) continue;
            // 各 *Info 都有无参构造 (字段留默认值), 唯一例外是 PetUIInfo(int petId, int petBaseId)。
            // 两个构造都对不上就把字段留 null —— 这一层不读皮肤/头像, 编一个假默认对象比空着更误导。
            var c = f.FieldType.GetConstructors().FirstOrDefault(x => x.GetParameters().Length == 0)
                 ?? f.FieldType.GetConstructors().FirstOrDefault(x => x.GetParameters().Length == 2
                         && x.GetParameters().All(p => p.ParameterType == typeof(int)));
            if (c is null) continue;
            f.SetValue(info, c.Invoke(c.GetParameters().Length == 0 ? new object[0] : new object[] { id, id }));
        }
        dict[id] = info;
    }

    static object BuildPet(JsonElement sp)
    {
        var id = Iv(sp, "id", 10001);
        EnsurePetInfo(id);
        // 三参里挑 (Pet) 那一支: BattlePet 另有 (BossInfo) / (BattlePet) 两个重载, Activator 传 null 会挑错。
        var pet = NewC(BattlePetT, new[] { PetT }, new object[] { null });
        Set(pet, "id", id);
        // Capture (:95) 读 `pet.basic.baseId` —— 它是 `PetBasic.info.baseId` 的转发, 即 petInfoDict[id].basic.baseId。
        // 默认那支 (EnsurePetInfo 走 PetBasicInfo 无参 ctor) 把 baseId 留 0; 规格给了 baseId 才覆盖, 让
        // baseId==10 短路那条 (以及普通 baseId≠10 支) 在 oracle 侧可被真值钉住。TS 镜像 FakePet.baseId 同一条接缝。
        if (Has(sp, "baseId"))
        {
            var dict = (System.Collections.IDictionary)Field(Boot.Database, "petInfoDict").GetValue(Boot.Db);
            if (dict.Contains(id))
            {
                var basicInfo = PetInfoT.GetField("basic", BF)!.GetValue(dict[id]);
                basicInfo!.GetType().GetField("baseId", BF)!.SetValue(basicInfo, Iv(sp, "baseId", 0));
            }
        }
        foreach (var n in new[] { "basic", "feature", "exp", "talent", "skills", "record", "ui", "resist" })
        {
            var f = PetT.GetField(n, BF) ?? throw new MissingFieldException($"Pet.{n}");
            var comp = Activator.CreateInstance(f.FieldType);
            // 每个组件都**自带** id 并靠它查表 (PetExp.info => GetPetInfo(id)?.exp), 所以只填 Pet.id
            // 不够 —— 组件的 id 留 0 时 GetPetInfo(0) 是 null, 拷贝构造读 expSum 会当场 NRE。
            if (f.FieldType.GetField("id", BF) is { } cid) cid.SetValue(comp, id);
            f.SetValue(pet, comp);
        }
        Set(pet, "currentStatus", Activator.CreateInstance(Status));

        var maxHp = Iv(sp, "maxHp", 100);
        var hp = Iv(sp, "hp", maxHp);
        var anger = Iv(sp, "anger", 20);
        // statusController 用**真构造**: _maxHp 取 normalStatus.hp, _hp 取 initHp, 于是 hp/maxHp/anger
        // 的夹紧 (Mathf.Clamp 的三个面) 全由上游代码完成, 我在签名里读回来的就是被夹过的值。
        var sc = NewC(StatusCtrlT, new[] { Status, typeof(float), typeof(int) },
            new object[] { Activator.CreateInstance(Status, new object[] { 0f, 0f, 0f, 0f, 0f, (float)maxHp }), (float)hp, anger });
        Set(sc, "parent", pet);
        Set(pet, "statusController", sc);
        // powerup 铺垫也走**公开方法** SetPowerUp(Status) (会过 ±6 的钳) —— 给 PowerUp 的 isSet 分支
        // 一个非零起点, 才能把「Set 直接覆盖」与「Add 累加再钳」这两支区分开。
        if (Has(sp, "powerup"))
            InvSig(sc, "SetPowerUp", new[] { Status }, new object[] { NewStatus(sp.GetProperty("powerup")) });

        // 印记走**真构造** (第五段·步骤0 起): PetBattleBuffController(element, subElement, buffs) 里的
        // AddRangeBuff(state=null) 是静默装载分支, block/copy 筛选因此由上游代码完成。
        // element/subElement 是 BattlePet.battleElement 的真身 (BattlePet.cs:18-21 就是这两个字段的转发),
        // 所以 `me.pet.element` / `defElementRelation[...]` 拍的是它。给 buffs 才装, 不给走上游的 null 分支。
        var bc = NewC(BuffCtrlT, new[] { Element, Element, typeof(List<>).MakeGenericType(Boot.Buff) },
            new object[] { Iv(sp, "el", 0), Iv(sp, "sel", 0),
                Has(sp, "buffs") ? TypedList(Boot.Buff, BuffsOf(sp, "buffs")) : null });
        Set(bc, "parent", pet);
        Set(pet, "buffController", bc);
        // blockIds 走**真方法** BlockBuff(List<int>) (:323-326 就是 AddRange), 且它在构造**之后**追加 ——
        // 已经装进袋子的印记不会被它滤掉, powerUp 的免疫检查读的是调用时的表。这个顺序本身就是语义。
        if (Has(sp, "blockIds"))
            InvSig(bc, "BlockBuff", new[] { typeof(List<int>) },
                new object[] { TypedList(typeof(int), sp.GetProperty("blockIds").EnumerateArray().Select(x => (object)x.GetInt32())) });
        // 第八段·批四: 另外四张表, 同样走**真方法** (与镜像逐条同序)。BuffType 走 TypeNamed,
        // 值用 Enum.ToObject 而不是 Enum.Parse —— 规格里给的是 raw int, 与镜像的 Math.trunc(x) 同口径。
        var btT = TypeNamed("BuffType");
        var btListT = typeof(List<>).MakeGenericType(btT);
        if (Has(sp, "blockTypes"))
            InvSig(bc, "BlockBuffWithType", new[] { btListT },
                new object[] { TypedList(btT, sp.GetProperty("blockTypes").EnumerateArray().Select(x => (object)Enum.ToObject(btT, x.GetInt32()))) });
        if (Has(sp, "sps"))
            foreach (var x in sp.GetProperty("sps").EnumerateArray())
                InvSig(bc, "BlockBuffWithString", new[] { typeof(string) }, new object[] { x.GetString()! });
        if (Has(sp, "copyIds"))
            InvSig(bc, "CopyBuff", new[] { typeof(List<int>) },
                new object[] { TypedList(typeof(int), sp.GetProperty("copyIds").EnumerateArray().Select(x => (object)x.GetInt32())) });
        if (Has(sp, "copyTypes"))
            InvSig(bc, "CopyBuffWithType", new[] { btListT },
                new object[] { TypedList(btT, sp.GetProperty("copyTypes").EnumerateArray().Select(x => (object)Enum.ToObject(btT, x.GetInt32()))) });

        // 四参 ctor 的**参数顺序**是 (loopSkills, headerSkills, superSkill, normalSkills) —— 抄错就是换皮错误。
        // 不给任何袋子时四个字段全 null (上游是无初值字段), allSkills 于是是空表; 这与步骤0 之前
        // 那个两参 (null, null) 构造的结果**逐字段相同**, 所以既有 petbag/skillsys 向量不会因此翻。
        // 袋子必须是 **List<Skill>** (反射按运行时类型检), List<object> 会 ArgumentException;
        // 洞 (JSON null) 直接进表 —— `x?.id ?? 0` 那条语义要吃得到它才成立。
        object Bag(string n) => Has(sp, n)
            ? TypedList(Boot.Skill, sp.GetProperty(n).EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Null ? null : BlankSkill(x)))
            : null;
        var sk = NewC(SkillCtrlT,
            new[] { typeof(List<>).MakeGenericType(Boot.Skill), typeof(List<>).MakeGenericType(Boot.Skill), Boot.Skill, typeof(List<>).MakeGenericType(Boot.Skill) },
            new object[] { Bag("loopSkills"), Bag("headerSkills"),
                Has(sp, "superSkill") ? BlankSkill(sp.GetProperty("superSkill")) : null, Bag("normalSkills") });
        Set(sk, "parent", pet);
        Set(pet, "skillController", sk);

        Set(pet, "stayTurn", Iv(sp, "stayTurn", 0));
        Set(pet, "chain", Iv(sp, "chain", 0));
        if (Has(sp, "anger")) Set(sc, "anger", anger);
        return pet;
    }

    static object BuildPetSystem(JsonElement sp)
    {
        var bag = PetBagOf(sp, "petBag", 0);
        var sys = NewC(PetSysT, new[] { BattlePetT.MakeArrayType() }, new object[] { bag });
        // 上游三只袋子**同长** (构造里一起 new, AddNewPet 一起扩容)。给它一个不同长的备用袋是
        // 真游戏里搭不出来的状态, AddNewPet 会 IndexOutOfRange —— 那种类内不变式不该进对拍集,
        // 所以这里按 petBag 的长度补齐/裁掉, 两边 (oracle 与 difftest 的 TS 镜像) 同一条规则。
        Array Fit(JsonElement v, string name)
        {
            var src = PetBagOf(v, name, bag.Length);
            if (src.Length == bag.Length) return src;
            var fit = Array.CreateInstance(BattlePetT, bag.Length);
            Array.Copy(src, fit, Math.Min(src.Length, bag.Length));
            return fit;
        }
        Set(sys, "backupPetBag", Fit(sp, "backupPetBag"));
        Set(sys, "tokenPetBag", Fit(sp, "tokenPetBag"));
        Set(sys, "cursor", Iv(sp, "cursor", 0));
        Set(sys, "specialChance", Iv(sp, "specialChance", 1));
        return sys;
    }

    // Skill.cs:84 `public Skill() { }` —— 空构造只剩字段初始化器 (数值全 0、串全 null、三个空容器)。
    // 规格给了才覆盖, 没给的保持上游默认 —— 与镜像的 blankSkill 逐条同。
    static object BlankSkill(JsonElement sp)
    {
        var s = Activator.CreateInstance(Boot.Skill);
        foreach (var n in new[] { "id", "elementId", "power", "anger", "pp", "maxPP", "accuracy", "combo", "chain", "priority", "vipriority" })
            if (Has(sp, n)) Set(s, n, Iv(sp, n, 0));
        if (Has(sp, "type")) Set(s, "type", Iv(sp, "type", 0));
        if (Has(sp, "critical")) Set(s, "critical", Fv(sp, "critical", 0f));
        if (Has(sp, "name")) Set(s, "name", Sv(sp, "name", null));
        if (Bv(sp, "isSecondSuper", false)) Set(s, "isSecondSuper", true);
        if (Bv(sp, "optionsNull", false)) Boot.Skill.GetField("options")!.SetValue(s, null);
        else
        {
            var opt = (System.Collections.Generic.Dictionary<string, string>)Get(s, "options");
            // options 的值在 C# 侧是 string, 但规格里写数字更顺手 ⇒ 按原始文本收 (镜像的 String(v) 同形)。
            string Raw(JsonElement x) => x.ValueKind == JsonValueKind.String ? x.GetString() : x.GetRawText();
            if (Has(sp, "sourceIndex")) opt["source_index"] = Raw(sp.GetProperty("sourceIndex"));
            if (Has(sp, "options")) foreach (var p in sp.GetProperty("options").EnumerateObject()) opt[p.Name] = Raw(p.Value);
        }
        return s;
    }

    static object BuildSkillSystem(JsonElement sp)
    {
        var k = Activator.CreateInstance(SkillSysT);   // 真构造 = OnTurnStart() 归零, 不碰 native
        if (Has(sp, "damageDict")) Set(k, "damageDict", DictSI(sp, "damageDict"));
        if (Has(sp, "healDict")) Set(k, "healDict", DictSI(sp, "healDict"));
        if (Has(sp, "combo"))
        {
            var comboT = SkillSysT.GetNestedType("ComboDamageInfo")!;
            Set(k, "comboDamageInfoList", TypedList(comboT, sp.GetProperty("combo").EnumerateArray()
                .Select(x => NewC(comboT, new[] { typeof(int), typeof(bool) },
                                  new object[] { x.GetProperty("damage").GetInt32(), x.GetProperty("critical").GetBoolean() }))));
        }
        foreach (var n in new[] { "level", "atk", "def", "weatherBuff", "sameElementBuff", "elementRelation" })
            if (Has(sp, n)) Set(k, n, Fv(sp, n, 0));
        foreach (var n in new[] { "isCounter", "isHit", "isCritical" })
            if (Has(sp, n)) Set(k, n, Bv(sp, n, false));
        foreach (var n in new[] { "skillDamage", "skillHeal", "skillOverHeal", "itemDamage", "itemHeal", "itemOverHeal", "buffDamage", "buffHeal" })
            if (Has(sp, n)) Set(k, n, Iv(sp, n, 0));
        // S3 段4 PPC: 技能 stub —— 直接走 BlankSkill (与镜像 buildSkillSystem 的 blankSkill 同一份字段集)。
        // 以前这里手抄了 3 个字段 (id/type/sourceIndex), 在 `sk=` 只打四列的年代够用; 批二的 `wsk:`
        // 要写 anger/pp/critical/option[...] 并读回, 字段集不一致就会拍出一眼看不出的"两边基线不同"。
        if (Has(sp, "skill"))
            Set(k, "skill", BlankSkill(sp.GetProperty("skill")));
        return k;
    }

    static object BuildUnit(JsonElement sp)
    {
        var u = Uninit(UnitT);
        Set(u, "id", Iv(sp, "id", 1));
        Set(u, "random", Iv(sp, "random", 0));
        Set(u, "parallelCount", Iv(sp, "parallelCount", 1));
        Set(u, "isDone", Bv(sp, "isDone", false));
        Set(u, "petSystem", BuildPetSystem(Sub(sp, "petSystem")));
        Set(u, "parallelSkillSystems", Has(sp, "skillSystems")
            ? TypedList(SkillSysT, sp.GetProperty("skillSystems").EnumerateArray().Select(BuildSkillSystem))
            : TypedList(SkillSysT, new List<object> { Activator.CreateInstance(SkillSysT) }));
        Set(u, "hudSystem", Activator.CreateInstance(HudT));
        var card = Uninit(CardT);
        Set(card, "options", new Dictionary<string, string>());
        Set(u, "cardSystem", card);
        Set(u, "unitBuffs", TypedList(Boot.Buff, BuffsOf(sp, "unitBuffs")));
        return u;
    }

    static object BuildState(JsonElement sp)
    {
        var s = Uninit(StateT);
        Set(s, "turn", Iv(sp, "turn", 0));
        Set(s, "parallelTurn", Iv(sp, "parallelTurn", 0));
        Set(s, "whosTurn", Iv(sp, "whosTurn", 0));
        Set(s, "phase", Iv(sp, "phase", 0));
        Set(s, "weather", Iv(sp, "weather", 0));
        Set(s, "options", DictSS(sp, "options"));
        Set(s, "reports", QueueOf(sp, "reports"));
        var kvp = typeof(KeyValuePair<,>).MakeGenericType(typeof(string), Boot.Buff);
        Set(s, "stateBuffs", Has(sp, "stateBuffs")
            ? TypedList(kvp, sp.GetProperty("stateBuffs").EnumerateArray().Select(x => KvpOf(x.GetProperty("key").GetString(), BuffOf(x.GetProperty("buff")))))
            : TypedList(kvp, new List<object>()));
        Set(s, "actionOrder", TypedList(typeof(int), IntsOf(sp, "actionOrder").Cast<object>()));
        Set(s, "actionCursor", Iv(sp, "actionCursor", -1));
        var settings = BuildSettings(Sub(sp, "settings"));
        Set(s, "settings", settings);
        Set(s, "result", BuildResult(Sub(sp, "result"), settings));
        Set(s, "masterUnit", BuildUnit(Sub(sp, "master")));
        Set(s, "clientUnit", BuildUnit(Sub(sp, "client")));
        Set(s, "lastTurnState", Has(sp, "last") ? BuildState(sp.GetProperty("last")) : null);
        return s;
    }

    static object BuildSettings(JsonElement sp)
    {
        var s = Activator.CreateInstance(SettingsT);
        // 缺省值取的是 BattleSettings.cs 字段初始化器那一列 (isEscapeOK/isItemOK 是 true, 其余 false/0)。
        Set(s, "seed", Iv(sp, "seed", 0));
        Set(s, "isMod", Bv(sp, "isMod", false));
        Set(s, "isSimulate", Bv(sp, "isSimulate", false));
        Set(s, "isEscapeOK", Bv(sp, "isEscapeOK", true));
        Set(s, "isCaptureOK", Bv(sp, "isCaptureOK", false));
        Set(s, "isItemOK", Bv(sp, "isItemOK", true));
        Set(s, "captureLevel", Iv(sp, "captureLevel", 1));
        Set(s, "petCount", Iv(sp, "petCount", 6));
        Set(s, "parallelCount", Iv(sp, "parallelCount", 1));
        Set(s, "starLimit", Iv(sp, "starLimit", 0));
        Set(s, "filterLimit", Sv(sp, "filterLimit"));
        Set(s, "filterLimitDesc", Sv(sp, "filterLimitDesc"));
        Set(s, "time", Iv(sp, "time", 10));
        Set(s, "bgm", Sv(sp, "bgm"));
        Set(s, "modeId", Iv(sp, "modeId", 0));
        Set(s, "ruleId", Iv(sp, "ruleId", 0));
        Set(s, "weather", Iv(sp, "weather", 0));
        Set(s, "initBuffExpr", Sv(sp, "initBuffExpr"));
        return s;
    }

    static object BuildResult(JsonElement sp, object settings)
    {
        var r = NewC(ResultT, new[] { SettingsT }, new object[] { settings });
        if (Has(sp, "state")) Set(r, "state", Iv(sp, "state", 0));
        if (Has(sp, "cursors")) Set(r, "fightPetCursors", IntSetOf(IntsOf(sp, "cursors")));
        return r;
    }

    // ── 签名 ──
    static string Str(object x) => x?.ToString() ?? "-";
    static float Ff(object boxed) => (float)boxed;                       // 反射回来的 float 就是 float, 不 Convert ( widen 会骗人)
    static float Ff(object inst, string name) => (float)Get(inst, name);
    static string Fs(float x) => ((double)x).ToString(System.Globalization.CultureInfo.InvariantCulture);
    static string Ei(object inst, string name) => Convert.ToInt32(Get(inst, name)).ToString();
    static int Nn(object coll) => ((System.Collections.ICollection)coll).Count;

    static string SigBuff(object buff)
    {
        if (buff is null) return "-";
        var opt = string.Join("&", ((System.Collections.Generic.IDictionary<string, string>)Get(buff, "options")).Select(kv => $"{kv.Key}={kv.Value}"));
        return $"b{Str(Get(buff, "id"))}:{Str(Get(buff, "turn"))}:{Str(Get(buff, "value"))}:{opt}";
    }

    // 宠的签名**只带我自己搭得起来的那几件** (stayTurn/chain 与 statusController 的读数,
    // 加上 isDead/isMovable/isToken 三个判定), 不带 level/name/normalStatus —— 它们要么来自合成
    // PetInfo, 要么来自没装载的宠表, 拍进去等于拿假数据当 golden (口径同 Boot.cs 第 5 步的 [x:pet])。
    // `#{id}` 是例外: id 是向量**自己喂进去**的身份号, 不查表, 它的价值是让换宠/上下场那批向量
    // 能看出"哪一只动到了哪个槽" —— 不然三只同 hp 的宠在签名里长得一模一样。
    //
    // 尾巴那六段 (init/add/mult/hid/pw/cur/bf) 是**算子本体的落点** —— add_buff/remove_buff/powerup 写
    // buffController.buffs 的内容, add_status 写 initStatus/addStatus/multStatus 与 hiddenStatus
    // (AddBattleStatus 的 type≥6 支落 hidden[type-6]), powerup 写 powerup。
    // 只有 `n=` 条数时, "加进去的印记 turn/value 对不对"、"乘的是哪一维"全都在签名外 ⇒ 拍不到。
    // `bf` 按 List **插入序**逐个 SigBuff (与 unitBuffs 那条 `~` 连的惯例同性质, 但这里用 `&` 不与
    // SigBuff 内部的 `:`/`&` 争位); 分隔与形状与镜像 sigPet 逐字符同。
    static string SigPet(object pet)
    {
        if (pet is null) return "_";
        var sc = Get(pet, "statusController");
        var bc = Get(pet, "buffController");
        var buffs = ((System.Collections.IEnumerable)Get(bc, "buffs")).Cast<object>().Select(SigBuff);
        // 第八段·批四: 把印记控制器的五个免疫/复制表也打进签名 —— 否则 BlockOrCopyBuff (:678) 的九个方法
        // 全是"改了但看不见"。Ints 走 Convert.ToInt32 而不是 ToString, 因为 BuffType 是枚举, 直接 Join
        // 会打**名字**("Weather") 而 JS 那边是数字。Sps 的顺序 = 插入序 (两端都是插入序字典, 同 damageDict 口径)。
        string Ints(string name) => string.Join("/", ((System.Collections.IEnumerable)Get(bc, name)).Cast<object>().Select(x => Convert.ToString(Convert.ToInt32(x))));
        string Sps() => string.Join("&", ((System.Collections.Generic.IDictionary<string, int>)Get(bc, "blockBuffSps")).Select(kv => $"{kv.Key}={kv.Value}"));
        return $"p{Get(pet, "stayTurn")}|{Get(pet, "chain")}|#{Get(pet, "id")}|hp{Get(sc, "hp")}/{Get(sc, "maxHp")}" +
               $"|ang{Get(sc, "anger")}({Get(sc, "minAnger")}~{Get(sc, "maxAnger")})" +
               $"|dead={Get(pet, "isDead")}|mov={Get(pet, "isMovable")}|token={Get(pet, "isToken")}|n={Nn(Get(bc, "buffs"))}" +
               $"|init={Ss(Get(sc, "initStatus"))}|add={Ss(Get(sc, "addStatus"))}|mult={Ss(Get(sc, "multStatus"))}" +
               $"|hid={Ss(Get(sc, "hiddenStatus"))}|pw={Ss(Get(sc, "powerup"))}|cur={Ss(Get(sc, "currentStatus"))}" +
               $"|bf[{string.Join("&", buffs)}]" +
               $"|B[{Ints("blockBuffIds")}]|BT[{Ints("blockBuffTypes")}]|C[{Ints("copyBuffIds")}]|CT[{Ints("copyBuffTypes")}]|S<{Sps()}>";
    }

    static string SigPetSys(object sys)
    {
        if (sys is null) return "Y-";
        string Bag(string name) => string.Join(",", ((Array)Get(sys, name)).Cast<object>().Select(SigPet));
        return $"Y|cur={Get(sys, "cursor")}|chance={Get(sys, "specialChance")}" +
               $"|bag[{Bag("petBag")}]|bak[{Bag("backupPetBag")}]|tok[{Bag("tokenPetBag")}]" +
               $"|num={Get(sys, "petNum")}|alive={Get(sys, "alivePetNum")}|dead={Get(sys, "deadPetNum")}";
    }

    static string SigSkillSys(object k)
    {
        if (k is null) return "K-";
        string D(string name) => string.Join("&", ((System.Collections.Generic.IDictionary<string, int>)Get(k, name)).Select(kv => $"{kv.Key}={kv.Value}"));
        return $"K|{Fs(Ff(k, "level"))}|{Fs(Ff(k, "atk"))}|{Fs(Ff(k, "def"))}|{Fs(Ff(k, "weatherBuff"))}" +
               $"|{Fs(Ff(k, "sameElementBuff"))}|{Fs(Ff(k, "elementRelation"))}" +
               $"|{Get(k, "isCounter")}/{Get(k, "isHit")}/{Get(k, "isCritical")}" +
               $"|d<{D("damageDict")}>|h<{D("healDict")}>" +
               $"|{Get(k, "skillDamage")}/{Get(k, "skillHeal")}/{Get(k, "skillOverHeal")}" +
               $"|{Get(k, "itemDamage")}/{Get(k, "itemHeal")}/{Get(k, "itemOverHeal")}" +
               $"|{Get(k, "buffDamage")}/{Get(k, "buffHeal")}|combo{Nn(Get(k, "comboDamageInfoList"))}" +
               // `sk=` 从"是不是有技能"扩成**四个被 ChainStart 回写的字段** (Skill.cs 的
               // `TestSkill = GetSkill(skill.id)` ⇒ critical/combo/accuracy/power 被表里那行覆盖)。
               // 真技能表接进镜像 (第五段·步骤3) 之后, 只打 X/- 就把"接缝没通"和"接缝通了但值一样"
               // 拍成同一件事 ⇒ 这四列就是那条接缝的证明。
               $"|sk={(Get(k, "skill") is null ? "-" : SkillFields(Get(k, "skill")))}|ct={(Get(k, "counterSkill") is null ? "-" : "X")}";
    }

    // 技能的写侧证据 (`wsk:` 一族与 `sk=` 的扩展) —— 不止 ChainStart 回写的那四列, 而是**整只技能**:
    // 名字/怒气/PP 夹紧/优先级/element/三个 ignore/效果条数与 source 回指/options 值。
    // 与镜像的 skillFields 逐字符同形, 所以这里的每一段都是**签名契约**的一部分, 别单独"顺手"改格式。
    //   · `pp{pp}/{PP}/{maxPP}` 三格同时打: 中间那格是**属性** (Mathf.Clamp(pp,0,maxPP)), 另两格是字段
    //     —— `set:pp=999` 在 maxPP=0 的技能上读回 0 而字段仍是 999, 只打一格就把"夹"与"存"拍成同一件事。
    //   · `ig` 后两格是**派生属性** (Skill.cs:47-56): 乘积 ==0, 不是"两格都为 0"。
    //   · `ef{count}/{srcSelf}`: 第二格数"source 指回**这只** skill"的条数 —— SetEffects 复数重载逐条回指,
    //     单数重载只回指一条且不跑常驻壳展开, 这两条差在这里才有读数。
    //   · options 的值两侧都**按 float 读回**再打 (OptValOut), 理由见那里。
    static string SkillFields(object s)
    {
        var effs = ((System.Collections.IEnumerable)Get(s, "effects")).Cast<object>().ToList();
        var srcSelf = effs.Count(x => x is not null && ReferenceEquals(Get(x, "source"), s));
        var opt = Get(s, "options");
        var opts = opt is null ? "-"
            : string.Join("&", ((System.Collections.Generic.IDictionary<string, string>)opt).Select(kv => $"{kv.Key}={OptValOut(kv.Value)}"));
        return $"#{Get(s, "id")}:{Convert.ToInt32(Get(s, "type"))}/{Fs(Ff(s, "critical"))}/{Get(s, "combo")}/{Get(s, "accuracy")}/{Get(s, "power")}" +
               $"|nm={Str(Get(s, "name"))}|rd={Str(Get(s, "rawDescription"))}" +
               $"|a{Get(s, "anger")}|pp{Get(s, "pp")}/{Get(s, "PP")}/{Get(s, "maxPP")}" +
               $"|pr{Get(s, "priority")}/{Get(s, "vipriority")}|el{Get(s, "elementId")}" +
               $"|ig{Get(s, "ignoreShield")}/{Get(s, "ignorePowerup")}/{Get(s, "ignorePowerdown")}" +
               $"|pu={Ls(Get(s, "powerup"))}|pd={Ls(Get(s, "powerdown"))}" +
               $"|ef{effs.Count}/{srcSelf}" +
               $"|o<{opts}>";
    }

    // Linear<Status> 的两格展开, 与镜像的 LIN 同形 (`mult`/`add` 是 IKeyValuePair 上的属性, 走 Get 的属性路)。
    // `wsk:powerup.*` 那一支**只有在这里**才看得见: 写进临时 Linear (split[0] 不是 pos/neg) 与写进
    // Status.zero() 临时对象 (split[1] 不是 mult/add) 都是静默丢弃, 不打印增幅表就拍不出"丢了"。
    static string Ls(object lin) => $"{Ss(Get(lin, "mult"))}+{Ss(Get(lin, "add"))}";

    // ⚠ 不能直接比 options 的**原始串**: 上游 SetSkillIdentifier 落的是 C# `float.ToString()`, 镜像落的是
    //   JS `String(Math.fround(v))` —— 同一个 32 位值可以有 "1E+07" 与 "10000000" 两种文本 (.NET 用
    //   E+07/E-07、JS 用 e+7/e-7, 且切换阈值不同)。比原始串会把一条**写入正确**的向量拍成红。
    //   所以这里用与上游**同一个**解析风格 (NumberStyles.Float | AllowThousands, InvariantCulture) 把文本
    //   读回 f32 再走 Fs; 读不回来 (表里写的 "abc") 就原样打 —— 两边同。
    static string OptValOut(string v)
        => float.TryParse(v, System.Globalization.NumberStyles.Float | System.Globalization.NumberStyles.AllowThousands,
                          System.Globalization.CultureInfo.InvariantCulture, out var x) ? Fs(x) : v;

    static string SigUnit(object u)
    {
        if (u is null) return "U-";
        return $"U|{Get(u, "id")}|{Get(u, "random")}|pc={Get(u, "parallelCount")}|done={Get(u, "isDone")}" +
               $"|{SigPetSys(Get(u, "petSystem"))}" +
               $"|K[{string.Join(",", ((System.Collections.IEnumerable)Get(u, "parallelSkillSystems")).Cast<object>().Select(SigSkillSys))}]" +
               $"|B[{string.Join("~", ((System.Collections.IEnumerable)Get(u, "unitBuffs")).Cast<object>().Select(SigBuff))}]";
    }

    static string SigSettings(object s)
        => $"T|{Get(s, "seed")}|{Get(s, "isMod")}|{Get(s, "isSimulate")}|{Get(s, "isEscapeOK")}|{Get(s, "isCaptureOK")}|{Get(s, "isItemOK")}" +
           $"|cap{Get(s, "captureLevel")}|pet{Get(s, "petCount")}|par{Get(s, "parallelCount")}|star{Get(s, "starLimit")}" +
           $"|f={Str(Get(s, "filterLimit"))}|fd={Str(Get(s, "filterLimitDesc"))}|t={Get(s, "time")}|bgm={Str(Get(s, "bgm"))}" +
           $"|mode={Get(s, "modeId")}|rule={Get(s, "ruleId")}|weather={Get(s, "weather")}|init={Str(Get(s, "initBuffExpr"))}";

    // fightPetCursors 是 HashSet<int> —— 枚举序由**框架的桶**决定, 不是插入序, 也不是排序序。
    // 这里照枚举原样打, 与 JS 的 Set (插入序) 对撞: 对得上就皆大欢喜, 对不上就把"能不能依赖它的序"
    // 变成一条被观测过的事实, 而不是我猜的。(移植体 result.ts 用的是 Set, 所以这条必须真拍。)
    static string SigResult(object r)
        => $"R|{Ei(r, "state")}|[{string.Join(",", ((System.Collections.IEnumerable)Get(r, "fightPetCursors")).Cast<object>())}]" +
           $"|cap={(Get(r, "capturePet") is null ? "-" : "X")}";

    static string SigState(object s)
    {
        if (s is null) return "S-";
        var sb = ((System.Collections.IEnumerable)Get(s, "stateBuffs")).Cast<object>()
            .Select(x => $"{x.GetType().GetProperty("Key")!.GetValue(x)}={SigBuff(x.GetType().GetProperty("Value")!.GetValue(x))}");
        return $"S|{Get(s, "turn")}|{Get(s, "parallelTurn")}|{Get(s, "whosTurn")}|{Ei(s, "phase")}|{Get(s, "weather")}" +
               $"|o<{string.Join("&", ((System.Collections.Generic.IDictionary<string, string>)Get(s, "options")).Select(kv => $"{kv.Key}={kv.Value}"))}>" +
               $"|B<{string.Join("~", sb)}>|r[{string.Join("~", ((System.Collections.IEnumerable)Get(s, "reports")).Cast<object>())}]" +
               $"|ord[{string.Join(",", ((System.Collections.IEnumerable)Get(s, "actionOrder")).Cast<object>())}]|ac={Get(s, "actionCursor")}" +
               $"|{SigSettings(Get(s, "settings"))}|{SigResult(Get(s, "result"))}" +
               $"|M{SigUnit(Get(s, "masterUnit"))}|C{SigUnit(Get(s, "clientUnit"))}|L{SigState(Get(s, "lastTurnState"))}";
    }

    static string SigHandler(object h)
    {
        var raw = Boot.Effect.GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!;
        var parts = new List<string>();
        foreach (var x in (System.Collections.IEnumerable)Get(h, "queue"))
        {
            var key = x.GetType().GetProperty("Key")!.GetValue(x);
            var eff = x.GetType().GetProperty("Value")!.GetValue(x);
            parts.Add($"{(key is null ? "-" : Str(Get(key, "id")))}={string.Join("|", (string[])raw.Invoke(eff, null)!)}");
        }
        return string.Join(";", parts);
    }

    // ── kinds ──
    static object StateCopyVector(JsonElement v)
    {
        Snap();
        var sp = v.GetProperty("spec");
        var st = BuildState(sp);
        switch (v.GetProperty("op").GetString())
        {
            case "sig": return SigState(st);
            case "copy": return new List<string> { SigState(st), SigState(NewC(StateT, new[] { StateT }, new object[] { st })) };
            // 拷贝完只改**副本**, 然后两边一起打: 原帧只要动过一个字, 就是某档深浅拷漏了。
            case "mutate":
            {
                var cp = NewC(StateT, new[] { StateT }, new object[] { st });
                Mutate(cp);
                return new List<string> { SigState(st), SigState(cp) };
            }
            // 真构造那条路 (BattleState.cs:36-56): 顺带拍 settings.initBuffs 的解析与 result 的初值。
            case "ctor":
                return SigState(NewC(StateT, new[] { SettingsT, UnitT, UnitT },
                    new object[] { BuildSettings(Sub(sp, "settings")), BuildUnit(Sub(sp, "master")), BuildUnit(Sub(sp, "client")) }));
            // 没有第三个"snapshot" op: 上游 BattleState **没有** Snapshot() 方法 (全项目 grep 无),
            // 移植体的 state.snapshot() 就是拷贝构造的别名, 与 "copy" 拍同一件事。
            default: throw new ArgumentException("未知 statecopy op: " + v.GetProperty("op").GetString());
        }
    }

    static void Mutate(object s)
    {
        Set(s, "turn", 9991); Set(s, "parallelTurn", 7); Set(s, "whosTurn", -1);
        Set(s, "phase", 1); Set(s, "weather", 3); Set(s, "actionCursor", 5);
        ((System.Collections.Generic.IDictionary<string, string>)Get(s, "options"))["mk"] = "1";
        ((System.Collections.IList)Get(s, "actionOrder")).Add(-2);
        Get(s, "reports")!.GetType().GetMethod("Enqueue")!.Invoke(Get(s, "reports"), new object[] { "RX" });
        var sb = (System.Collections.IList)Get(s, "stateBuffs");
        if (sb.Count > 0) Set(sb[0]!.GetType().GetProperty("Value")!.GetValue(sb[0]), "turn", 42);
        foreach (var name in new[] { "masterUnit", "clientUnit" })
        {
            if (Get(s, name) is not { } u) continue;
            Set(u, "random", 111); Set(u, "isDone", true);
            var ps = Get(u, "petSystem");
            Set(ps, "cursor", 2); Set(ps, "specialChance", 9);
            var bag = (Array)Get(ps, "petBag");
            if (bag.Length > 0 && bag.GetValue(0) is { } p)
            {
                Set(p, "stayTurn", 42); Set(p, "anger", 57);
                var buffs = (System.Collections.IList)Get(Get(p, "buffController"), "buffs");
                if (buffs.Count > 0) Set(buffs[0], "turn", 33);
                ((Array)Get(ps, "tokenPetBag")).SetValue(null, 0);
            }
            var sk = (System.Collections.IList)Get(u, "parallelSkillSystems");
            if (sk.Count > 0 && sk[0] is { } k)
            {
                Set(k, "level", 1.5f); Set(k, "skillDamage", 11); Set(k, "isHit", false);
                ((System.Collections.Generic.IDictionary<string, int>)Get(k, "damageDict"))["mkd"] = 7;
                ((System.Collections.IList)Get(k, "comboDamageInfoList")).Add(
                    NewC(SkillSysT.GetNestedType("ComboDamageInfo")!, new[] { typeof(int), typeof(bool) }, new object[] { 3, true }));
            }
            var ub = (System.Collections.IList)Get(u, "unitBuffs");
            if (ub.Count > 0) Set(ub[0], "turn", 66);
        }
        Set(Get(s, "settings"), "time", 99);
        Set(Get(s, "result"), "state", 1);
        // HashSet<int> 只实现 ICollection<T> (没有非泛型 IList), 所以加元素走泛型接口。
        ((System.Collections.Generic.ICollection<int>)Get(Get(s, "result"), "fightPetCursors")).Add(9);
    }

    static object StateIdVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        return v.GetProperty("ids").EnumerateArray()
            .Select(e => Norm(Ff(Inv(st, "GetStateIdentifier", new object[] { e.GetString() })))).ToList();
    }

    static object StateSetVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var log = new List<string>();
        foreach (var w in v.GetProperty("writes").EnumerateArray())
        {
            var p = w.EnumerateArray().ToList();
            Inv(st, "SetStateIdentifier", new object[] { p[0].GetString(), f32(p[1]) });
            log.Add(SigState(st));
        }
        return new List<object>
        {
            log,
            v.GetProperty("ids").EnumerateArray().Select(e => Norm(Ff(Inv(st, "GetStateIdentifier", new object[] { e.GetString() })))).ToList(),
            SigState(st),
        };
    }

    static string UnitId(object u) => u is null ? "-" : Str(Get(u, "id"));

    static object StateFlagVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var outp = new List<string>
        {
            $"done={Get(st, "isAllUnitDone")}", $"ready={Get(st, "isAllUnitReady")}",
            $"atk={UnitId(Get(st, "atkUnit"))}", $"def={UnitId(Get(st, "defUnit"))}",
            $"my={UnitId(Get(st, "myUnit"))}", $"op={UnitId(Get(st, "opUnit"))}",
            $"wb={SigBuff(Get(st, "weatherBuff"))}",
        };
        if (Has(v, "ids"))
            foreach (var id in v.GetProperty("ids").EnumerateArray())
                outp.Add($"g{id.GetInt32()}={UnitId(Inv(st, "GetUnitById", new object[] { id.GetInt32() }))}");
        if (Has(v, "rhs"))
            foreach (var id in v.GetProperty("rhs").EnumerateArray())
                outp.Add($"r{id.GetInt32()}={UnitId(Inv(st, "GetRhsUnitById", new object[] { id.GetInt32() }))}");
        foreach (var name in new[] { "masterUnit", "clientUnit" })
        {
            if (Get(st, name) is not { } u) continue;
            // 只拍 IsMasterUnit(): Unit.IsMyUnit 的三元**先**读 PhotonNetwork.IsConnected,
            // 而 PhotonNetwork 的静态构造在播放器进程外直接 TypeInitializationException ——
            // 这一位本来就归在 PVP/Photon 围栏里 (docs/engine/port-map.md), 移植体走的是注入的 NetFence。
            outp.Add($"{name}:master={Inv(u, "IsMasterUnit", new object[0])}" +
                     $"|ready={Get(u, "isReady")}|mov={Get(u, "isMovable")}|pet={SigPet(Get(u, "pet"))}|token={SigPet(Get(u, "token"))}" +
                     $"|sys={SigSkillSys(Get(u, "skillSystem"))}");
        }
        return outp;
    }

    static object GiveTurnVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var n = v.GetProperty("n").GetInt32();
        var outp = new List<string>();
        for (var i = 0; i < n; i++)
        {
            Inv(st, "GiveTurnToNextUnit", new object[0]);
            string C(string u) { var un = Get(st, u); return un is null ? "-" : $"{Get(Get(un, "petSystem"), "cursor")}:{Get(un, "isDone")}"; }
            outp.Add($"{Get(st, "whosTurn")}|{Get(st, "actionCursor")}|m{C("masterUnit")}|c{C("clientUnit")}");
        }
        outp.Add(SigState(st));
        return outp;
    }

    static object GoFirstVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var m = Get(st, "masterUnit"); var c = Get(st, "clientUnit");
        return new List<string>
        {
            $"mf={Inv(st, "IsGoFirst", new object[] { m })}", $"ml={Inv(st, "IsGoLast", new object[] { m })}",
            $"cf={Inv(st, "IsGoFirst", new object[] { c })}", $"cl={Inv(st, "IsGoLast", new object[] { c })}",
        };
    }

    static object PetBagVector(JsonElement v)
    {
        Snap();
        var op = v.GetProperty("op").GetString()!;
        var sp = v.GetProperty("spec");

        // Array.Copy 那一档: 袋子**数组**是新的 (把原袋置空不影响它), 里面的**宠是同一只** (改原袋的宠它跟着变)。
        if (op == "shallow")
        {
            var bag = PetBagOf(sp, "petBag", 0);
            var sys = NewC(PetSysT, new[] { BattlePetT.MakeArrayType() }, new object[] { bag });
            var inner = (Array)Get(sys, "petBag");
            if (bag.Length > 0 && bag.GetValue(0) is { } p0) Set(p0, "stayTurn", 42);
            var same0 = bag.Length > 0 && ReferenceEquals(bag.GetValue(0), inner.GetValue(0));
            var bakSame = ReferenceEquals(Get(sys, "backupPetBag"), bag);
            if (bag.Length > 0) bag.SetValue(null, 0);
            var after = inner.Length > 0 && inner.GetValue(0) is { } q ? Str(Get(q, "stayTurn")) : "-";
            return $"arrSame={ReferenceEquals(bag, inner)}|petSame={same0}|bakSame={bakSame}|afterNull={after}|len={inner.Length}|{SigPetSys(sys)}";
        }

        // 拷贝构造那一档: 三只袋子全部逐只 new BattlePet ⇒ 改副本不动原袋, 而且**夹紧规则**再走一遍
        // (副本的 anger 是从原宠被夹过的值再夹一次, 不是原始输入)。
        if (op == "deep")
        {
            var sys = BuildPetSystem(sp);
            var cp = NewC(PetSysT, new[] { PetSysT }, new object[] { sys });
            var ob = (Array)Get(sys, "petBag"); var cb = (Array)Get(cp, "petBag");
            if (ob.Length > 0 && ob.GetValue(0) is { } o) Set(o, "stayTurn", 5);
            if (cb.Length > 0 && cb.GetValue(0) is { } cc) Set(cc, "stayTurn", 42);
            return $"arrSame={ReferenceEquals(ob, cb)}|petSame={(ob.Length > 0 && ReferenceEquals(ob.GetValue(0), cb.GetValue(0)))}" +
                   $"|orig={SigPetSys(sys)}|copy={SigPetSys(cp)}";
        }

        var s = BuildPetSystem(sp);
        if (op.StartsWith("swapBackup:")) return $"{Inv(s, "SwapBackupPet", new object[] { int.Parse(op[11..]) })}|{SigPetSys(s)}";
        if (op.StartsWith("swapToken:")) return $"{Inv(s, "SwapTokenPet", new object[] { int.Parse(op[10..]) })}|{SigPetSys(s)}";
        // 上游 GetNextCursorCircular / SetSkillSystemIdentifier 的额外参数是**带默认值的**,
        // 反射按 arity 找重载时"省略"等于"不存在" —— 必须把默认值位置显式喂 null。
        if (op.StartsWith("nextCursor:")) return Str(Inv(s, "GetNextCursorCircular", new object[] { int.Parse(op[11..]), null, null }));
        if (op.StartsWith("parallel:"))
        {
            var n = int.Parse(op[9..]);
            var bag = (System.Collections.IEnumerable)Inv(s, "GetParallelPetBag", new object[] { n });
            var cur = (System.Collections.IEnumerable)Inv(s, "GetParallelPetBagCursor", new object[] { n });
            return $"{string.Join(",", bag.Cast<object>().Select(SigPet))}#{string.Join(",", cur.Cast<object>())}";
        }
        if (op.StartsWith("ident:")) return Norm(Ff(Inv(s, "GetPetSystemIdentifier", new object[] { op[6..] })));
        if (op.StartsWith("tryident:"))
        {
            var args = new object[] { op[9..], 0f };
            var ok = Inv(s, "TryGetPetSystemIdentifier", args);
            return NumOut(ok, args[1]);
        }
        if (op.StartsWith("cursor:")) { Set(s, "cursor", int.Parse(op[7..])); return SigPetSys(s); }
        if (op.StartsWith("setsc:")) { Set(s, "specialChance", int.Parse(op[6..])); return SigPetSys(s); }

        return op switch
        {
            "sig" => SigPetSys(s),
            "pet" => SigPet(Get(s, "pet")),
            "token" => SigPet(Get(s, "token")),
            "refresh" => (Inv(s, "RefreshStayTurn", new object[0]), SigPetSys(s)).Item2,
            "addNewPet" => (Inv(s, "AddNewPet", new object[] { BuildPet(v.GetProperty("pet")) }), SigPetSys(s)).Item2,
            _ => throw new ArgumentException("未知 petbag op: " + op),
        };
    }

    static object SkillSysVector(JsonElement v)
    {
        Snap();
        var op = v.GetProperty("op").GetString()!;
        var sp = v.GetProperty("spec");

        if (op == "copy")
        {
            var k = BuildSkillSystem(sp);
            var cp = NewC(SkillSysT, new[] { SkillSysT }, new object[] { k });
            ((System.Collections.Generic.IDictionary<string, int>)Get(cp, "damageDict"))["mkd"] = 7;
            ((System.Collections.IList)Get(cp, "comboDamageInfoList")).Clear();
            Set(cp, "skillDamage", 123);
            return $"{SigSkillSys(k)}||{SigSkillSys(cp)}";
        }

        var sys = BuildSkillSystem(sp);
        if (op.StartsWith("ident:")) return Norm(Ff(Inv(sys, "GetSkillSystemIdentifier", new object[] { op[6..] })));
        if (op.StartsWith("tryident:"))
        {
            var args = new object[] { op[9..], 0f };
            var ok = Inv(sys, "TryGetSkillSystemIdentifier", args);
            return NumOut(ok, args[1]);
        }
        if (op.StartsWith("set:"))
        {
            var body = op[4..]; var i = body.IndexOf('=');
            var key = body[..i];
            var val = body[(i + 1)..];
            var n = val.Contains(':') ? val.Split(':') : new[] { val, null };
            // 第三参 key 有默认值 ⇒ 反射必须显式给 (null 就是"沿用默认")。而 default 分支
            // `GetSkillByKey(key).SetSkillIdentifier(...)` 要碰技能表, 本轮袋里没有真技能 ⇒
            // 只测**直接写字段**的那几个分支。
            Inv(sys, "SetSkillSystemIdentifier", new object[] { key, float.Parse(n[0]), n[1] });
            return $"{Norm(Ff(Inv(sys, "GetSkillSystemIdentifier", new object[] { key })))}|{SigSkillSys(sys)}";
        }
        // 批二: Skill.SetSkillIdentifier 的**写侧**直接证据 (`set:` 打的是 UnitSkillSystem 那一层,
        // 落到 default 支以后就断在"有没有写进技能"这件事上)。这里绕开 sys 那层, 直接对着
        // spec.skill 这只技能写一把键、再从**读侧链**与**整只签名**两处取回 —— 写错字段/静默不写/
        // 夹紧与临时对象丢弃, 全都只在这两处露出来。
        // `v=` 是 `GetSkillIdentifier(key)` 的**同键回读** (不是 SetSkillIdentifier 的镜像读法):
        // 写侧与读侧是两套分支顺序 (option 括号要求就不同), 所以"写完读不回来"本身就是要拍的行为。
        if (op.StartsWith("wsk:"))
        {
            var body = op[4..]; var i = body.IndexOf('=');
            var key = body[..i];
            var val = float.Parse(body[(i + 1)..], System.Globalization.CultureInfo.InvariantCulture);
            var sk = Get(sys, "skill");
            if (sk is null) throw new MissingMemberException("wsk 向量必须给 spec.skill (技能位为空 ⇒ 没有写对象)");
            InvSig(sk, "SetSkillIdentifier", new[] { typeof(string), typeof(float) }, new object[] { key, val });
            // 出**结构化**两格, 不拼字符串: `v=` 可能是 float.MinValue (读侧 default 支), 而
            // Single.ToString 的 "-3.4028235E+38" 与 JS 的 "-3.4028234663852886e+38" 是同一 32 位值的
            // 两种文本 (口径同 NumOut) ⇒ 交给 difftest 用 fround 比语义值。
            return new Dictionary<string, object>
            {
                ["sig"] = SkillFields(sk),
                ["v"] = Norm(Ff(Inv(sk, "GetSkillIdentifier", new object[] { key }))),
            };
        }
        return op switch
        {
            "sig" => SigSkillSys(sys),
            "onTurnStart" => (Inv(sys, "OnTurnStart", new object[0]), SigSkillSys(sys)).Item2,
            "onChainStart" => (Inv(sys, "OnChainStart", new object[0]), SigSkillSys(sys)).Item2,
            "swap:true" => (Inv(sys, "SwapCounterSkill", new object[] { true }), SigSkillSys(sys)).Item2,
            "swap:false" => (Inv(sys, "SwapCounterSkill", new object[] { false }), SigSkillSys(sys)).Item2,
            "totals" => new List<object> { Get(sys, "totalSkillDamage"), Get(sys, "totalItemDamage"), Get(sys, "totalBuffDamage"),
                                           Get(sys, "totalSkillHeal"), Get(sys, "totalItemHeal"), Get(sys, "totalBuffHeal"),
                                           Get(sys, "damage"), Get(sys, "heal"),
                                           Get(sys, "SkillDamage"), Get(sys, "ItemDamage"), Get(sys, "BuffDamage") },
            "typeDamage" => new List<object> { Inv(sys, "GetTypeDamage", new object[] { (Func<string, bool>)(x => x.StartsWith("skill")) }),
                                              Inv(sys, "GetTypeHeal", new object[] { (Func<string, bool>)(x => x.StartsWith("item")) }) },
            _ => throw new ArgumentException("未知 skillsys op: " + op),
        };
    }

    static object SettingsVector(JsonElement v)
    {
        Snap();
        var op = v.GetProperty("op").GetString()!;
        var s = BuildSettings(v.GetProperty("spec"));

        if (op == "copy")
        {
            var cp = NewC(SettingsT, new[] { SettingsT }, new object[] { s });
            Set(cp, "time", 77);
            return $"{SigSettings(s)}||{SigSettings(cp)}";
        }
        if (op.StartsWith("ident:")) return Norm(Ff(Inv(s, "GetSettingsIdentifier", new object[] { op[6..] })));
        if (op.StartsWith("setmode:")) { Set(s, "modeId", int.Parse(op[8..])); return $"{SigSettings(s)}|{Get(s, "isPVP")}|{Get(s, "isAutoOK")}|{Get(s, "isLimited")}"; }
        if (op.StartsWith("setrule:")) { Set(s, "ruleId", int.Parse(op[8..])); return SigSettings(s); }
        if (op.StartsWith("setinit:"))
        {
            Set(s, "initBuffExpr", op[8..]);
            var list = (System.Collections.IEnumerable)Get(s, "initBuffs");
            return $"{string.Join("~", list.Cast<object>().Select(x => $"{x.GetType().GetProperty("Key")!.GetValue(x)}={SigBuff(x.GetType().GetProperty("Value")!.GetValue(x))}"))}|{SigSettings(s)}";
        }
        if (op.StartsWith("setweather:")) { Set(s, "weather", int.Parse(op[11..])); return SigSettings(s); }
        return op switch
        {
            "sig" => SigSettings(s),
            "flags" => $"{Get(s, "isPVP")}|{Get(s, "isAutoOK")}|{Get(s, "isLimited")}",
            "initBuffs" => string.Join("~", ((System.Collections.IEnumerable)Get(s, "initBuffs")).Cast<object>()
                .Select(x => $"{x.GetType().GetProperty("Key")!.GetValue(x)}={SigBuff(x.GetType().GetProperty("Value")!.GetValue(x))}")),
            _ => throw new ArgumentException("未知 settings op: " + op),
        };
    }

    static object ResultVector(JsonElement v)
    {
        Snap();
        var op = v.GetProperty("op").GetString()!;
        var settings = BuildSettings(Sub(v.GetProperty("spec"), "settings"));
        var r = BuildResult(v.GetProperty("spec"), settings);

        if (op == "copy")
        {
            var cp = NewC(ResultT, new[] { ResultT }, new object[] { r });
            ((System.Collections.Generic.ICollection<int>)Get(cp, "fightPetCursors")).Add(9);
            return $"{SigResult(r)}||{SigResult(cp)}";
        }
        if (op.StartsWith("ident:")) return Norm(Ff(Inv(r, "GetResultIdentifier", new object[] { op[6..] })));
        if (op.StartsWith("state:"))
        {
            var st = int.Parse(op[6..]);
            Inv(r, "SetState", new object[] { st });
            return $"{SigResult(r)}|end={Get(r, "isBattleEnd")}|ko={Get(r, "isKO")}|esc={Get(r, "isEscape")}|cap={Get(r, "isCapture")}|mywin={Get(r, "isMyWin")}|opwin={Get(r, "isOpWin")}";
        }
        if (op.StartsWith("addcursor:")) return $"{Str(Inv(r, "AddFightPetCursor", new object[] { int.Parse(op[10..]) }))}|{SigResult(r)}";
        return op switch
        {
            "sig" => SigResult(r),
            "flags" => $"{Get(r, "isBattleEnd")}|{Get(r, "isKO")}|{Get(r, "isEscape")}|{Get(r, "isCapture")}|{Get(r, "isMyWin")}|{Get(r, "isOpWin")}",
            _ => throw new ArgumentException("未知 result op: " + op),
        };
    }

    static object EffectQVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var op = v.GetProperty("op").GetString()!;
        // GetEffectHandler 是**带默认值的两参**方法 ⇒ 反射必须两个都给 (arity 1 的候选根本不存在)。
        object Handler(object unit) => Inv(st, "GetEffectHandler", new object[] { unit, Has(v, "addSkill") ? Bv(v, "addSkill", true) : true });
        return op switch
        {
            "all" => SigHandler(Inv(st, "GetEffectHandler", new object[] { null, true })),
            "allNoskill" => SigHandler(Inv(st, "GetEffectHandler", new object[] { null, false })),
            "master" => SigHandler(Handler(Get(st, "masterUnit"))),
            "client" => SigHandler(Handler(Get(st, "clientUnit"))),
            _ => throw new ArgumentException("未知 effectq op: " + op),
        };
    }

    // ── S3 第四段: BattlePhase 驱动序 ──
    // BattlePhase.battle => Player.instance.currentBattle (BattlePhase.cs:10) —— 整条链都从这两个单例长出来,
    // 所以先注 Singleton<Player>.instance / Manager<BattleManager>.instance (Boot.cs:91 同款写法),
    // 再把 Uninit Battle 的 currentState 指到本向量拼出来的 BattleState。
    // battle.settings 是算属性 (Battle.cs:13 currentState?.settings) ⇒ 不用注, 跟着 currentState 走。
    static Type PhaseT; static object PhasePlayer, PhaseBattle, PhaseBM; static bool phaseReady;
    static System.Reflection.FieldInfo battleMgrQueueField;
    static void Phase()
    {
        if (phaseReady) return;
        Snap();
        PhaseT = TypeNamed("BattlePhase");
        var playerT = TypeNamed("Player");
        var battleT = TypeNamed("Battle");
        var bmT = TypeNamed("BattleManager");
        var missing = new[] { ("BattlePhase", PhaseT), ("Player", playerT), ("Battle", battleT), ("BattleManager", bmT) }
            .Where(x => x.Item2 is null).Select(x => x.Item1);
        if (missing.Any()) throw new MissingMemberException("phase 层类型没找到: " + string.Join(",", missing));

        PhasePlayer = Uninit(playerT); PhaseBattle = Uninit(battleT); PhaseBM = Uninit(bmT);
        Set(PhasePlayer, "currentBattle", PhaseBattle);
        playerT.BaseType!.GetProperty("instance", BindingFlags.Public | BindingFlags.Static)!.SetValue(null, PhasePlayer);
        bmT.BaseType!.GetProperty("instance", BindingFlags.Public | BindingFlags.Static)!.SetValue(null, PhaseBM);
        // queue 是字段初始化器 (BattleManager.cs:26), Uninit 跳过了它 ⇒ 手工补一个空 Queue<BattleState>。
        battleMgrQueueField = bmT.GetField("queue", BindingFlags.NonPublic | BindingFlags.Instance)!;
        battleMgrQueueField.SetValue(PhaseBM, Activator.CreateInstance(typeof(System.Collections.Generic.Queue<>).MakeGenericType(StateT)));
        phaseReady = true;
    }

    static object PhaseQVector(JsonElement v)
    {
        Snap(); Phase();
        var op = v.GetProperty("op").GetString()!;
        // GetEffectHandler 是 protected ⇒ NonPublic; 编译后**没有**默认值重载, arity 恒为 2。
        var gh = PhaseT.GetMethod("GetEffectHandler", BindingFlags.NonPublic | BindingFlags.Instance)!;

        // 不带 state 的裸 base 实例: getter 兜 None、setter 静默 —— 这条不需要 battle.currentState。
        if (op is "getphN" or "setphN")
        {
            var q = Activator.CreateInstance(PhaseT)!;
            if (op == "setphN") Set(q, "phase", Iv(v, "n", 5));
            return Ei(q, "phase");
        }

        var st = BuildState(v.GetProperty("spec"));
        Set(PhaseBattle, "currentState", st);
        var p = Activator.CreateInstance(PhaseT)!;
        Set(p, "state", st);
        var addSkill = Has(v, "addSkill") ? Bv(v, "addSkill", true) : true;
        string Out(object h) => $"ph={Ei(p, "phase")}|{SigHandler(h)}|{SigState(st)}";
        return op switch
        {
            "all" => Out(gh.Invoke(p, new object?[] { null, addSkill })),
            "master" => Out(gh.Invoke(p, new object?[] { Get(st, "masterUnit"), addSkill })),
            "client" => Out(gh.Invoke(p, new object?[] { Get(st, "clientUnit"), addSkill })),
            "getph" => Ei(p, "phase"),
            "setph" => $"{SetN(p, "phase", Iv(v, "n", 0))}",
            _ => throw new ArgumentException("未知 phaseq op: " + op),
        };
    }

    // Set 完把两个读数一起打: phase 属性写的是 state.phase, 两边必须一起变才算数。
    static string SetN(object p, string name, int n)
    {
        Set(p, name, n);
        return $"{Ei(p, name)}#{Ei(Get(p, "state"), "phase")}";
    }

    // ── S3 第五段·步骤0: 带 effect 上下文的标识符链 ──
    // Identifier.GetIdentifier 的**六参**重载 (Identifier.cs:190) 与 Parser.ParseEffectOperation
    // (Parser.cs:85) 同形 —— 编译后默认值不存在, 六个实参全给。idSource 的 switch 由 effect.source 驱动,
    // 所以向量的 src 决定塞进 source 的对象: pet=BattlePet / unit=Unit(落 _ 支) / buff=Buff / skill=Skill / none=null。
    // src=裸 Pet 那一支本轮**不发** —— 它的 TryGetPetIdentifier 要读宠表, 而两边的宠表都是空的
    // (Boot.cs:99 的合成 PetInfo ⇒ 表读值恒默认, 拍出来只是"两边的空表一样空", 没有信息量)。
    // state. 支要 Player.instance.currentBattle.currentState ⇒ 复用 Phase() 注的三个单例。
    // random / random[..] 两支吃 native Random ⇒ 由生成阶段挡掉, 不进向量。
    static object IdentSource(object st, string name, JsonElement v) => name switch
    {
        "pet" => Get(Get(st, "masterUnit"), "pet"),
        "unit" => Get(st, "masterUnit"),
        "buff" => BuffOf(v.GetProperty("buff")),
        "skill" => BlankSkill(v.GetProperty("skill")),
        "none" => null,
        _ => throw new ArgumentException("未知 effectident src: " + name),
    };

    static object EffectIdentVector(JsonElement v)
    {
        Snap(); Phase();
        var st = BuildState(v.GetProperty("spec"));
        Set(PhaseBattle, "currentState", st);
        var lhs = Get(st, "masterUnit"); var rhs = Get(st, "clientUnit");
        var op = v.GetProperty("op").GetString()!;

        // 真表的 Effect 走真 Parse (与 effectparse 同一个入口), 再按 src 把 source 挂上。
        // 向量里的 DSL 串叫 dsl (不叫 expr) —— op=expr 那一支的输入列表已经占了 exprs 这个名字。
        object eff = Has(v, "dsl")
            ? ((System.Collections.IList)Boot.CallStatic(Boot.Effect, "Parse", new object[] { Sv(v, "dsl", "") }))[Iv(v, "ei", 0)]
            : null;
        var src = IdentSource(st, Sv(v, "src", "none")!, v);
        if (eff is not null)
        {
            Set(eff, "source", src);
            // me. 支的 otherSource 读 effect.sourcePet (CheckAndApply 的第 5 参), 与 source 是两个字段。
            if (Has(v, "sp")) Set(eff, "sourcePet", IdentSource(st, Sv(v, "sp", "none")!, v));
        }
        var osrc = Has(v, "osrc") ? IdentSource(st, Sv(v, "osrc", "none")!, v) : null;
        var useOther = Bv(v, "useOther", true);

        var sig = new[] { typeof(string), Boot.Effect, UnitT, UnitT, typeof(object), typeof(bool) };
        var m = (op == "expr" ? Parser : Identifier).GetMethod(op == "expr" ? "ParseEffectOperation" : "GetIdentifier", sig)
            ?? throw new MissingMethodException($"effectident 的方法签名没对上: {op}");
        return v.GetProperty(op == "expr" ? "exprs" : "ids").EnumerateArray()
            .Select(e => Norm(Ff(m.Invoke(null, new object[] { e.GetString(), eff, lhs, rhs, osrc, useOther })))).ToList();
    }

    // ── S3 第五段·步骤1: 目标宠解析 (Parser.GetBattlePetTargetList) ──
    // 真表里带 target_type 的 32 条效果全是**技能内联行**, 不是预制体 ⇒ Effect.Parse 拿不到它们,
    // 所以 Effect 用**上游的七参构造**拼 (Effect.cs:43-62, id 是字段不是参数)。
    // timing/target/condition/ability 四个枚举一律由**上游自己的词表** (EffectDatabase.cs 的 ToEffect*)
    // 从 raw 串翻出来 —— 拼错会被上游兜成 None, 而不是被我的表猜对; 镜像侧走它那份同源的词表,
    // 两边不一致就会在这里露出来。
    static object BuildEffect(JsonElement sp)
    {
        var edb = TypeNamed("EffectDatabase") ?? throw new MissingMemberException("EffectDatabase 类型没找到");
        object E(string m, string raw) => Call(edb, m, raw);
        var opts = new Dictionary<string, string>();
        if (Has(sp, "options"))
            foreach (var p in sp.GetProperty("options").EnumerateObject())
                opts[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString()! : p.Value.GetRawText();
        // condOptions 是**条件字典数组** (Effect.cs:44 的 List<Dictionary<string,string>>)。不传就给 null ⇒
        // 上游构造往 condOptionDictList 里**压一个空字典** (Effect.cs:49-52); 给了就整表换成传进来的那份。
        // 这两条分支是可观测的: Condition 的 checkTurn 会对每个字典跑 IsCorrectTurn, 空表 (数组长度 0) 与
        // 「一个空字典」在 FindAll 之后分别是「什么都不做 ⇒ Exists 恒 false」与「问一次 ⇒ 恒真」。
        object condOpts = null;
        if (Has(sp, "condOptions"))
        {
            var lst = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(typeof(Dictionary<string, string>)));
            foreach (var d in sp.GetProperty("condOptions").EnumerateArray())
            {
                var one = new Dictionary<string, string>();
                foreach (var p in d.EnumerateObject())
                    one[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString()! : p.Value.GetRawText();
                lst.Add(one);
            }
            condOpts = lst;
        }
        // Effect 有**两个**七参构造 (Effect.cs:31 的 CSV 行版全 string、:43 的枚举版),
        // 按 arity 挑会挑到前者并把"EffectTiming 转不成 String"伪装成上游行为 ⇒ 必须按**首参是不是枚举**筛。
        var ctor = Boot.Effect.GetConstructors().First(c => { var p = c.GetParameters(); return p.Length == 7 && p[0].ParameterType.IsEnum; });
        return ctor.Invoke(new object[] {
            E("ToEffectTiming", Sv(sp, "timing", "none")!), Iv(sp, "priority", -1),
            E("ToEffectTarget", Sv(sp, "target", "none")!), E("ToEffectCondition", Sv(sp, "condition", "none")!),
            condOpts, E("ToEffectAbility", Sv(sp, "ability", "none")!), opts,
        });
    }

    // 观测的是"选了谁": 每一项复用 SigPet (含 #id 与 hp/maxHp/dead), 所以洞里出来的 null 打成 "_"。
    // 长度必须进签名 —— `new List{defaultPet}` (含 null 的 1 项) 与空表是两个可观测的上游形状。
    static string SigPetList(object list)
    {
        var items = ((System.Collections.IEnumerable)list).Cast<object>().ToList();
        return $"n={items.Count}|[{string.Join(";", items.Select(SigPet))}]";
    }

    static object TargetVector(JsonElement v)
    {
        Snap();
        // 补回的 fromDefault 向量要经 handler.condition (Effect.cs:224) 判定队列里的天气印记效果; 那条链
        // 从 Player.instance.currentBattle.currentState 长出来 (`state.` 支走 ParseEffectOperation ⇒ Identifier),
        // 所以这里与 JudgeWorld 一样把三个单例注上、并把 currentState 指到本向量的 st。镜像侧 mineTarget 同样
        // setIdentifierBattle(()=>({currentState:st}))。非 fromDefault 的旧向量不进 condition, 注了也无副作用。
        Phase();
        var st = BuildState(v.GetProperty("spec"));
        Set(PhaseBattle, "currentState", st);
        var eff = BuildEffect(v.GetProperty("effect"));
        var isClient = Sv(v, "side", "master") == "client";
        var lhs = Get(st, isClient ? "clientUnit" : "masterUnit");
        var rhs = Get(st, isClient ? "masterUnit" : "clientUnit");
        // Parser.cs:155 读 (Unit)effect.invokeUnit.id 与 effect.sourcePet 两个字段, 默认 invoke=lhs。
        Set(eff, "invokeUnit", Sv(v, "ivk", "lhs") == "rhs" ? rhs : lhs);
        if (Has(v, "sp"))
        {
            var n = Sv(v, "sp", "none")!;
            object spet = n switch
            {
                "none" => null,
                "lhs" => Get(lhs, "pet"),
                "rhs" => Get(rhs, "pet"),
                _ => throw new ArgumentException("未知 target sp: " + n),
            };
            Set(eff, "sourcePet", spet);
        }
        return SigPetList(Call(Parser, "GetBattlePetTargetList", st, eff, lhs, rhs));
    }

    // ── S3 第五段·步骤4: 判定面 (Effect.cs:224 Condition / :295 Apply) ────────────
    // 每个向量只调**一个**入口, 签名带四样观测, 少一样就漏一条上游语义:
    //   · 布尔结果;
    //   · 整个 state 的 SigState (Apply 才会真改状态; Condition 侧改的是下面那一列);
    //   · **跑完之后**这条 Effect 自己的形状 —— Condition 的 on_fail 分支 (Effect.cs:274-290) 会**永久改写**
    //     共享预制体的 target/ability/abilityOptionDict, 并从每个条件字典里 Remove("on_fail") 再把结果
    //     翻成 true。不带回写这一列, "改写过"与"没改写"在签名里是同一条。
    //     (方法名是上游那个拼错的 GetRawCondtionOptionString, 不是我抄错。)
    //   · Player.instance.random —— RandomNumber 在 state==null 且 random_type=rng 时是**写**这个字段,
    //     而 UnityEngine.Random.Range 在这个进程里抛 (ECall), 所以本 kind 的 random 向量一律走
    //     random_type=other 的可比支, rng 那一条由单测锁形状。
    static string SigEffectShape(object eff)
    {
        var raw = Boot.Effect.GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!;
        var cond = Boot.Effect.GetMethod("GetRawCondtionOptionString", Type.EmptyTypes)!;
        return $"id{Get(eff, "id")}|{string.Join("|", (string[])raw.Invoke(eff, null)!)}|C={Str(cond.Invoke(eff, null))}";
    }

    // spec 缺省 ⇒ state=null (常驻判定路径); ivk="null" ⇒ invokeUnit=null。src/sp 与 effectident 同一套词汇。
    static (object st, object eff, object invoke) JudgeWorld(JsonElement v)
    {
        Phase();
        var st = Has(v, "spec") ? BuildState(v.GetProperty("spec")) : null;
        Set(PhaseBattle, "currentState", st);
        var eff = BuildEffect(v.GetProperty("effect"));
        object UnitOf(string n) => n switch
        {
            "lhs" => st is null ? null : Get(st, "masterUnit"),
            "rhs" => st is null ? null : Get(st, "clientUnit"),
            "null" => null,
            _ => throw new MissingMemberException("未知 judge ivk: " + n),
        };
        var invoke = UnitOf(Sv(v, "ivk", "lhs")!);
        // Condition 内部会 this.invokeUnit = invokeUnit, 但那一步在**相位预检之后** ⇒ 建世界时先写一次,
        // 让 checkPhase=false 直接落空的向量也与镜像同形 (镜像同样在建世界时就写 invokeUnit)。
        Set(eff, "invokeUnit", invoke);
        if (Has(v, "src")) Set(eff, "source", IdentSource(st, Sv(v, "src", "none")!, v));
        if (Has(v, "sp"))
        {
            var n = Sv(v, "sp", "lhs")!;
            Set(eff, "sourcePet", n == "none" ? null : Get(UnitOf(n)!, "pet"));
        }
        if (Has(v, "rnd")) Set(PhasePlayer, "random", Fv(v, "rnd", 0f));
        return (st, eff, invoke);
    }

    static object EffectCondVector(JsonElement v)
    {
        var (st, eff, invoke) = JudgeWorld(v);
        var ok = (bool)InvSig(eff, "Condition", new[] { typeof(object), StateT, typeof(bool), typeof(bool) },
            new object[] { invoke, st, Bv(v, "checkPhase", true), Bv(v, "checkTurn", true) });
        // 不签 rnd: Player.random 的 getter 解引用 petBag (Player.cs:32), 而 oracle 的 petBag 是空的 ⇒ 读它就 NRE。
        // RandomNumber 的**首行** `float random = Player.instance.random` (:92) 同理, 所以带 random_op/random_cmp
        // 的向量在 oracle 侧一律 NRE ⇒ 生成阶段全挡 (native 口径), 这些向量根本进不了可比集; 结果不依赖 rnd, 去掉无损。
        return $"cond={Str(ok)}|{SigState(st)}|E={SigEffectShape(eff)}";
    }

    // Apply 白名单 —— 必须与移植体 effect-judge.ts:applyAbility 的「已搬」集合**逐值同步**。
    // 越界形状在这里抛 MissingMemberException: difftest 把它归 infra (架子没对上), **绝不计为一致** ——
    // 这一条是防假绿的关键: 忘了同步的算子会红成 infra, 而不是「oracle 真跑、TS 抛」那种谁也说不清的绿。
    //   0=none(DefaultAbility) / 8=AddStatus / 14=SetDamage   (批一第一步)
    //   +10=AddBuff / +11=RemoveBuff                          (批一第三步)
    //   +5=Heal                                               (批一第五步)
    // 7=Powerup **故意不进**: 上游 `EffectAbilityHandler.Powerup` 的 IL 里**直接** `call UnityEngine.Random.Range`
    // (自定义 pdf 那一支, :561), 而在 dotnet 宿主下 Mono 在**方法入口**解析 native 签名 ⇒ 一进去就
    // `SecurityException: ECall methods must be packaged into a system module.`, 与走哪条分支无关
    // (`{}`、`{random:"maybe"}` 这种连第一句 TryParse 都返回 false 的形状同样抛)。
    // ⇒ 这个算子在 oracle 侧**永久不可比**, 放了只会把"误生成的向量"洗成"两边同抛"的假绿;
    // 不放则归 infra  loudly。镜像侧仍然照搬算子本体, 形状由 `node --test` 锁。
    // (对照: AddBuff/RemoveBuff/Rage 只碰**托管**的 `ListHelper.Random`, 它在 `count > values.length`
    //  时掷骰前短路 ⇒ 那几家照样可比; Heal/AddStatus/SetDamage/DefaultAbility 的 IL 里没有任何 Random。)
    // 3=Capture **进白名单** (第七段·批三): 不像 Powerup 在方法入口直接 call native Range, Capture 的
    //  native 掷点在**一帧托管调用之下** (`Unit.RNG()`), 且 :95 `(baseId==10) || (value >= RNG())` 的
    //  `||` 左侧可短路 ⇒ state==null / prob 解析失败 / baseId==10 三支**不碰 native** ⇒ 可比。
    //  baseId≠10 的掷点支 :95 右侧会取 `Unit.RNG()`→native ⇒ 生成阶段不发 (与 powerup 同族口径)。
    // pet_change (4): :122/:126 两支守卫 (random 无备选 / 负下标) 与 :110 state==null 全在取随机源
    //  与 ApplyBuffs **之前** return false ⇒ 可比; :125 的 `target=="random"` 掷点支走 native ⇒ 不发。
    // 15=SetSkill **进白名单** (批二, 与 ops-skill.ts): native 点全在**具体分支**里, 不是方法入口
    //  (对照 Powerup :561 的入口 call), 所以按分支放量:
    //   · 不发 value=="random" (GetRandomSkill 的 while(true)+Range)、"random[available]"
    //     (GetAvailableSkills 之后 `.Random()`)、type=="parallelTargetIndex" 且 value=="random"
    //     (:1377 的 FindAllIndex(...).Random()) 这三支;
    //   · type=="effect" 的 `skillIdList.Random(count, repeat)` 有两条**掷点之前**的托管短路 ⇒ 发:
    //     repeat=false 且 count>列表长度 (整表拷贝) 与 count=0 (空表 ⇒ 穿透到通用支);
    //     repeat=true 一律不发 (while 进第一轮就 Range, 没有短路)。
    //   · `bool.Parse(random_repeat)` 在掷点**之前**求值 ⇒ 写错文本的抛点两侧同 (FormatException)。
    //  剩下"两边同抛"的形状 (state==null 的 NRE、!isSetAnger 且 lhsUnit.skill==null、
    //  reset_param 且 whosTurn==0) 照常发 —— 分类器把两边同抛算一致, 它拍的是"炸在同一处"。
    // 17=SetWeather / 9=BlockOrCopyBuff **进白名单** (第八段·批四): 两支一次 native 都不碰
    //  (SetWeather 全托管, BlockOrCopyBuff 纯 List<int>/List<BuffType> 运算) ⇒ 整支可比。
    //  1=Win / 2=Escape **也进白名单, 但是"半可比"** —— 两支的**结果面**都要过 `Unit.IsMyUnit()`,
    //  它读 `PhotonNetwork.IsConnected`, 而 `PhotonNetwork` 的**静态构造**在本宿主里必抛:
    //     TypeInitializationException → SecurityException: ECall methods must be packaged into a system module
    //       (at Photon.Pun.PhotonNetwork.StaticReset() / .cctor())
    //  —— 与 Powerup 的 `Random.Range` **同根因** (都是 ECall, 不是"缺程序集": 缺程序集是加载期
    //  FileNotFoundException)。⇒ 按 oracle-playbook §6 的**单向闸门**(oracle 抛、移植体不该抛),
    //  那些形状**根本不生成**。生成的只有: `state==null ⇒ false` (:41/:57) 与 Escape 在 :60 的
    //  `atkUnit==null` NRE (在进 IsMyUnit **之前**抛, 两端同抛)。两支的结果面 (phase/result.state/
    //  两个 isDone/actionCursor) 只由 `node --test` 用真 Unit 锁, 不进 golden。
    static readonly HashSet<int> PortedAbilities = new() { 0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9, 13, 12, 6, 19, 20 };

    static object EffectApplyVector(JsonElement v)
    {
        var (st, eff, invoke) = JudgeWorld(v);
        var ab = Convert.ToInt32(Get(eff, "ability"));
        if (!PortedAbilities.Contains(ab))
            throw new MissingMemberException($"effectapply 越界形状: ability={ab} 的算子还没搬, 生成阶段就该挡住 (PortedAbilities 没同步)");
        var ok = (bool)InvSig(eff, "Apply", new[] { typeof(object), StateT }, new object[] { invoke, st });
        return $"apply={Str(ok)}|{SigState(st)}|E={SigEffectShape(eff)}";
    }

    // ── 第五段·步骤2: 突变器 ──────────────────────────────────────────────
    // Inv 按「名字 + arity + Fits」挑方法, 而这一层**同名的不同 arity / 同 arity 的不同类型**成对出现
    // (AddInitStatus(Status) 与 AddInitStatus(int,int)、SetPowerUp(Status) 与 SetPowerUp(int,int)、
    //  RemoveRangeBuff(IEnumerable) 与 RemoveRangeBuff(Predicate, int)), Fits 的兜底会挑错那一支
    // ⇒ 这里凡是要打给重载组的调用都走 InvSig 显式签名。同 Effect 构造那条教训。
    static object InvSig(object inst, string name, Type[] sig, object[] args)
    {
        var t = inst.GetType();
        var m = t.GetMethods(BF).FirstOrDefault(x => !x.IsSpecialName && x.Name == name
                    && x.GetParameters().Select(p => p.ParameterType).SequenceEqual(sig))
            ?? throw new MissingMethodException($"突变器签名没对上: {t.Name}.{name}({string.Join(",", sig.Select(s => s.Name))})"
                + $" 候选={string.Join(" | ", t.GetMethods(BF).Where(x => x.Name == name).Select(Sig))}");
        return m.Invoke(inst, args);
    }

    // Status 的六个 float 按 Fs 展开成一行 —— 与镜像的 SS() 逐字同形。
    static string Ss(object status) => string.Join(",", StatusOf(status).Select(x => Fs(Ff(x))));

    static object SigStatusCtrl(object sc)
        => $"SC|init={Ss(Get(sc, "initStatus"))}|add={Ss(Get(sc, "addStatus"))}|mult={Ss(Get(sc, "multStatus"))}" +
           $"|hid={Ss(Get(sc, "hiddenStatus"))}|pw={Ss(Get(sc, "powerup"))}|min={Ss(Get(sc, "minPowerUp"))}" +
           $"|max={Ss(Get(sc, "maxPowerUp"))}|cur={Ss(Get(sc, "currentStatus"))}" +
           $"|hp{Get(sc, "hp")}/{Get(sc, "maxHp")}|ang{Get(sc, "anger")}({Get(sc, "minAnger")}~{Get(sc, "maxAnger")})";

    // PetBattleStatusController.cs:177-249 的八个写入口 + 两个读回。
    // `parent` 留 null ⇒ GetStatusIdentifier("base…") 恒 0, 这与镜像的 baseStatus 缺省同一条口径。
    // D6 经验公式（PetExpSystem：纯静态、无 coroutine）—— GetLevelExp/GetTotalExp(int,int)、GetLevelByTotalExp(uint,int)。
    static object PetExpVector(JsonElement v)
    {
        var op = Sv(v, "op", "level")!;
        var expType = Iv(v, "expType", 0);
        switch (op)
        {
            case "level": return Call(PetExpSystem, "GetLevelExp", Iv(v, "level", 0), expType);
            case "total": return Call(PetExpSystem, "GetTotalExp", Iv(v, "level", 0), expType);
            // GetLevelByTotalExp 首参是 uint ⇒ 显式转（Coerce 不认 int→uint）。
            case "bytotal": return Call(PetExpSystem, "GetLevelByTotalExp", (uint)Iv(v, "total", 0), expType);
            default: throw new ArgumentException("未知 petexp op: " + op);
        }
    }

    static object StatusCtrlVector(JsonElement v)
    {
        Snap();
        var sc = NewC(StatusCtrlT, new[] { Status, typeof(float), typeof(int) },
            new object[] { NewStatus(v.GetProperty("init")), Fv(v, "hp", 0f), Iv(v, "anger", 20) });
        var op = Sv(v, "op", "noop")!;
        var ty = Iv(v, "type", 0);
        var amt = Iv(v, "amount", 0);
        var val = Fv(v, "value", 0f);
        // minPu/maxPu 是**铺垫**, 用公开方法装而不是直写私有字段 —— 真调用方也是这么改 ±6 的;
        // 直写字段等于把「SetMinPowerUp 不钳不截」这条本来要拍的语义自己喂给自己。
        if (Has(v, "minPu")) InvSig(sc, "SetMinPowerUp", new[] { Status }, new object[] { NewStatus(v.GetProperty("minPu")) });
        if (Has(v, "maxPu")) InvSig(sc, "SetMaxPowerUp", new[] { Status }, new object[] { NewStatus(v.GetProperty("maxPu")) });
        object St() => NewStatus(v.GetProperty("status"));
        string ret = "-";
        switch (op)
        {
            case "noop": break;
            case "multInit": InvSig(sc, "MultInitStatus", new[] { typeof(int), typeof(float) }, new object[] { ty, val }); break;
            case "multCurrent": InvSig(sc, "MultCurrentStatus", new[] { typeof(int), typeof(float) }, new object[] { ty, val }); break;
            case "addInit": InvSig(sc, "AddInitStatus", new[] { Status }, new object[] { St() }); break;
            case "addInitType": InvSig(sc, "AddInitStatus", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "addCurrent": InvSig(sc, "AddCurrentStatus", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "addHidden": InvSig(sc, "AddHiddenStatus", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "addBattle": InvSig(sc, "AddBattleStatus", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "setPowerUp": InvSig(sc, "SetPowerUp", new[] { Status }, new object[] { St() }); break;
            case "setPowerUpType": InvSig(sc, "SetPowerUp", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "setMin": InvSig(sc, "SetMinPowerUp", new[] { Status }, new object[] { St() }); break;
            case "setMinType": InvSig(sc, "SetMinPowerUp", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "setMax": InvSig(sc, "SetMaxPowerUp", new[] { Status }, new object[] { St() }); break;
            case "setMaxType": InvSig(sc, "SetMaxPowerUp", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "addPowerUp": InvSig(sc, "AddPowerUp", new[] { typeof(int), typeof(int) }, new object[] { ty, amt }); break;
            case "getPowerUp": ret = Str(InvSig(sc, "GetPowerUp", new[] { typeof(int) }, new object[] { ty })); break;
            case "ident": ret = Fs((float)InvSig(sc, "GetStatusIdentifier", new[] { typeof(string) }, new object[] { Sv(v, "id", "")! })); break;
            // 四条名字表是 **静态属性** (每次访问 new 一份), 计划里 Status.powerupNames 那条就拍在这里。
            // BF 只有 Public|Instance, 静态成员要显式换 flags。
            case "names":
            {
                const BindingFlags SF = BindingFlags.Public | BindingFlags.Static;
                string Names(string p) => string.Join(",", (string[])Status.GetProperty(p, SF).GetValue(null)!);
                return $"{Names("typeNames")}|{Names("typeNamesChinese")}|{Names("powerupNames")}|{Names("powerupNamesChinese")}";
            }
            default: throw new ArgumentException("未知 statusctrl op: " + op);
        }
        return $"{SigStatusCtrl(sc)}|ret={ret}";
    }

    // SigPet 现在自带 init/pw/cur/bf 四段 ⇒ 这里不再重复追加 (petmut 的签名因此与 SigPet 同形,
    // 函数保留是给这一族一个明确的语义入口: 拍的是**宠级突变器**之后的状态)。
    static string SigPetMut(object pet) => SigPet(pet);

    // BattlePet.PowerUp (BattlePet.cs:333-354) 与 PetBattleSkillController.GetAvailableSkills (:69-79)。
    // state / lhsUnit 全给 null: PowerUp 里两处 AddBuff/RemoveBuff 的 state 参数只是往下传, null 走
    // 「静默装载/摘除」分支 (OnAddBuff 与 OnRemoveBuff 都不触发), 规则本身照样拍得动。
    static object PetMutVector(JsonElement v)
    {
        Snap();
        var pet = BuildPet(v.GetProperty("pet"));
        var op = Sv(v, "op", "powerUp")!;
        var bc = Get(pet, "buffController");
        var sk = Get(pet, "skillController");
        switch (op)
        {
            case "powerUp":
                InvSig(pet, "PowerUp", new[] { Status, UnitT, StateT, typeof(bool) },
                    new object[] { NewStatus(v.GetProperty("status")), null, null, Bv(v, "isSet", false) });
                return SigPetMut(pet);
            case "addBuff":
            {
                // triggerCopy 默认 true; buffUnit 与 invokeUnit 都给 null (state 为 null 时那两处解引用都不执行)。
                // `buff` 必须**绕开 Sub**: Has/Sub 把"显式 JSON null"和"没这个键"看成同一件事 (都给 default),
                // 而 BuffOf 认的是 JsonValueKind.Null —— 拿 Undefined 进去就是我自己架子抛的 InvalidOperationException。
                var bEl = v.TryGetProperty("buff", out var be) && be.ValueKind == JsonValueKind.Object ? be : default;
                var ok = InvSig(bc, "AddBuff", new[] { Boot.Buff, UnitT, UnitT, StateT, typeof(bool) },
                    new object[] { bEl.ValueKind == JsonValueKind.Object ? BuffOf(bEl) : null, null, null, null, Bv(v, "trig", true) });
                return $"{SigPetMut(pet)}|ret={ok}";
            }
            // B5 写侧: 把 SetPetIdentifier 的 23+1 个臂逐一打一遍, 写完直接回读同一把 key (标量臂) 或整只签名。
            // 标量臂 (gender/personality/level/exp/iv/height/weight/emblem/featureId/emblemId/evStorage/skinId/resistLock)
            // 回读同 key 即得写入值; 非标量臂 (skill±/buff±/record/trait/featureType/emblemType/maxLevel) 回读不到原值,
            // 退化为整只 SigPet 签名 —— 写错字段/静默不写/夹紧丢弃只在这两处露出来。
            case "setid":
            {
                var ident = Sv(v, "ident", "gender");
                var num = Fv(v, "num", 0);
                Inv(pet, "SetPetIdentifier", new object[] { ident, num });
                var scalar = new[] { "gender", "personality", "level", "exp", "iv", "height", "weight",
                    "emblem", "featureId", "emblemId", "evStorage", "skinId", "resistLock", "trait" };
                if (System.Array.IndexOf(scalar, ident) >= 0)
                    return Norm(Ff(Inv(pet, "GetPetIdentifier", new object[] { ident })));
                return SigPet(pet);
            }
            case "available":
            {
                var list = (System.Collections.IEnumerable)InvSig(sk, "GetAvailableSkills",
                    new[] { typeof(int), typeof(bool) }, new object[] { Iv(v, "anger", 20), Bv(v, "withSuper", true) });
                // type 出成**数字**而不是枚举名: 两边各自的语言都会把枚举 ToString 成中文标识符,
                // 那层一致性是运气, 数字才是这张表真正的形状。
                return string.Join(",", list.Cast<object>()
                    .Select(x => x is null ? "null" : $"#{Get(x, "id")}:{Convert.ToInt32(Get(x, "type"))}"));
            }
            default: throw new ArgumentException("未知 petmut op: " + op);
        }
    }

    // B5 (D6): getPetIdentifier 读侧逐键对拍。BuildPet 走与 petmut/petbag 完全相同的造宠路径。
    static object PetIdVector(JsonElement v)
    {
        Snap();
        var pet = BuildPet(v.GetProperty("pet"));
        var ident = Sv(v, "ident", "");
        return Norm(Ff(Inv(pet, "GetPetIdentifier", new object[] { ident })));
    }

    // B5 (D6): 三只 Status 向量 (normal/extra/current), 逐列比。
    static object PetStatVector(JsonElement v)
    {
        Snap();
        var pet = BuildPet(v.GetProperty("pet"));
        var which = Sv(v, "which", "normal");
        object st = which switch
        {
            "extra" => Get(pet, "extraStatus"),
            "current" => Get(pet, "currentStatus"),
            _ => Get(pet, "normalStatus"),
        };
        return StatusOf(st).Select(Norm).ToList();
    }

    // ── skilltable: **只读**比对上游真技能表与 game/data/unity/skills.json ──
    // 取表走上游自己的路 (`Skill.GetSkill(id, false)` ⇒ `Database.GetSkill`, 其中 `id == 0` 直接 null),
    // 而不是我去摸 skillDict —— 否则"表接对了"和"访问路径接对了"这两件事会被混成一件。
    // 打印**逐列**而不是整行: 这一族的目的就是把"哪一列在 JSON 里没落"指名道姓地量出来
    // (`pp/combo/chain/powerup/powerdown` 正是这类), 拼成一串 raw 就看不出是谁掉了。
    static object SkillTableVector(JsonElement v)
    {
        Snap();
        var id = v.GetProperty("id").GetInt32();
        var sk = Call(Boot.Skill, "GetSkill", id, false);
        if (sk is null) return $"MISS#{id}";
        var raw = (string[])Boot.Skill.GetMethod("GetRawInfoStringArray", Type.EmptyTypes)!.Invoke(sk, null)!;
        var effRaw = Boot.Effect.GetMethod("GetRawEffectStringArray", Type.EmptyTypes)!;
        var effs = ((System.Collections.IEnumerable)Get(sk, "effects")).Cast<object>()
            .Select(e => string.Join("|", (string[])effRaw.Invoke(e, null)!)).ToList();
        // `Dictionary<string,string>` 枚举出来是 KeyValuePair<string,string>, **不是** DictionaryEntry
        // (只有非泛型 IDictionary 才是) —— 按后者 cast 会 InvalidCastException, 又是架子的错。
        var opts = ((System.Collections.IEnumerable)Get(sk, "options")).Cast<object>()
            .Select(x => $"{x.GetType().GetProperty("Key")!.GetValue(x)}={x.GetType().GetProperty("Value")!.GetValue(x)}").ToList();
        var rb = Get(sk, "referBuffList") as System.Collections.IEnumerable;
        // powerup/powerdown 是 `Linear<Status>` (字段, 初值 (Status.one, Status.zero)) —— 四列出全,
        // 少一列就会把"没装载"和"装载成默认值"拍成同一个签名。
        string Lin(string name)
        {
            var l = Get(sk, name);
            return $"{Ss(Get(l, "mult"))}+{Ss(Get(l, "add"))}";
        }
        return $"#{id}"
             + $"|nm={Str(Get(sk, "name"))}|el={Str(Get(sk, "elementId"))}|ty={Convert.ToInt32(Get(sk, "type"))}"
             + $"|pw={Str(Get(sk, "power"))}|cost={Str(Get(sk, "rawCostString"))}"
             + $"|ang={Str(Get(sk, "anger"))}|pp={Str(Get(sk, "pp"))}|PP={Str(Get(sk, "PP"))}|mpp={Str(Get(sk, "maxPP"))}"
             + $"|acc={Str(Get(sk, "accuracy"))}|pri={Str(Get(sk, "priority"))}|vpri={Str(Get(sk, "vipriority"))}"
             + $"|crit={Fs(Ff(Get(sk, "critical")))}|cmb={Str(Get(sk, "combo"))}|chn={Str(Get(sk, "chain"))}"
             + $"|2sp={Str(Get(sk, "isSecondSuper"))}|igS={Str(Get(sk, "ignoreShield"))}"
             + $"|igU={Str(Get(sk, "ignorePowerup"))}|igD={Str(Get(sk, "ignorePowerdown"))}"
             + $"|rb={(rb is null ? "-" : string.Join("/", rb.Cast<object>()))}"
             + $"|pum={Lin("powerup")}|pdm={Lin("powerdown")}"
             + $"|opt[{string.Join("&", opts)}]|ef[{string.Join(";", effs)}]"
             + $"|row={string.Join("~", raw.Select(x => x is null ? "-" : x))}";
    }

    // ── phasedrive: 子类的构造/推进/DoWork 轨迹 ──
    // 每个向量都**重置** battle 三字段与 BattleManager.queue (SetState 只写队列, ProcessQuery 消费它),
    // 否则队列会跨向量串味 —— 同 Snap 之于表的意义。
    static System.Collections.Generic.List<int> IntList(JsonElement arr)
    {
        var l = new System.Collections.Generic.List<int>();
        foreach (var e in arr.EnumerateArray()) l.Add(e.GetInt32());
        return l;
    }

    static object PhaseDriveVector(JsonElement v)
    {
        Snap(); Phase();
        var op = v.GetProperty("op").GetString()!;
        var cut = op.IndexOf(':');
        if (cut < 0) throw new ArgumentException("phasedrive op 需要 类名 后缀: " + op);
        var verb = op[..cut];
        var clsName = op[(cut + 1)..];
        // drive 允许 "N" = 起步 currentPhase 为 null (主循环不进)。
        var isDrive = verb == "drive" && clsName == "N";
        var cls = isDrive ? null : TypeNamed(clsName);
        if (!isDrive && cls is null) throw new MissingMemberException("phase 类没找到: " + clsName);

        var battleT = PhaseBattle.GetType();
        battleT.GetField("lastState")!.SetValue(PhaseBattle, null);
        battleT.GetField("autoSkillOrder")!.SetValue(PhaseBattle,
            Has(v, "autoOrder") ? IntList(v.GetProperty("autoOrder")) : null);
        var queue = Activator.CreateInstance(typeof(System.Collections.Generic.Queue<>).MakeGenericType(StateT))!;
        battleMgrQueueField!.SetValue(PhaseBM, queue);
        battleT.GetField("currentState")!.SetValue(PhaseBattle, Has(v, "spec") ? BuildState(v.GetProperty("spec")) : null);

        string Cur() => SigState(Get(PhaseBattle, "currentState"));
        string Last() => SigState(Get(PhaseBattle, "lastState"));
        // recordState/UIState 只有 PassivePetChangePhase 有 —— 其余类打 '-' (字段不存在, 不是 null)。
        string RecUi(object ph)
        {
            var r = ph.GetType().GetField("recordState");
            var u = ph.GetType().GetField("UIState");
            return $"|rec={(r is null ? "-" : SigState(r.GetValue(ph)))}|ui={(u is null ? "-" : SigState(u.GetValue(ph)))}";
        }
        string Qs(object stNow)
        {
            var curNow = Get(PhaseBattle, "currentState");
            return string.Join(",", ((System.Collections.IEnumerable)queue).Cast<object?>()
                .Select(e => e is null ? "N" : ReferenceEquals(e, stNow) ? "p" : ReferenceEquals(e, curNow) ? "c" : "o"));
        }

        // ── drive: Battle.NextPhase() 真循环 (Battle.cs:249-277) ──
        if (verb == "drive")
        {
            battleT.GetField("currentPhase")!.SetValue(PhaseBattle, isDrive ? null : Activator.CreateInstance(cls)!);
            Inv(PhaseBattle, "NextPhase", new object[0]);
            var fin = Get(PhaseBattle, "currentPhase");
            return $"ph={(fin is null ? "N" : fin.GetType().Name)}|last={Last()}|cur={Cur()}";
        }

        var p = Activator.CreateInstance(cls)!;
        string Ps(object ph) => SigState(Get(ph, "state"));
        if (verb == "ctor")
            return $"ph={Ei(p, "phase")}|pstate={Ps(p)}|cur={Cur()}{RecUi(p)}";
        if (verb == "next")
        {
            var n = Inv(p, "GetNextPhase", new object[0]);
            var tail = $"|last={Last()}|cur={Cur()}|Q=[{Qs(Get(p, "state"))}]{RecUi(p)}";
            return n is null ? $"ph0={Ei(p, "phase")}|pstate0={Ps(p)}|n=N{tail}"
                             : $"ph0={Ei(p, "phase")}|pstate0={Ps(p)}|n={n.GetType().Name}|ph={Ei(n, "phase")}|pstate={Ps(n)}{tail}";
        }
        if (verb == "dowork")
        {
            Inv(p, "DoWork", new object[0]);
            // 队列条目按**引用身份**打标记: p=向 phase 自己的 state, c=向 battle.currentState, o=别处的快照。
            return $"ph={Ei(p, "phase")}|pstate={Ps(p)}|Q=[{Qs(Get(p, "state"))}]|cur={Cur()}{RecUi(p)}";
        }
        throw new ArgumentException("未知 phasedrive verb: " + verb);
    }

    // 状态推进的四个"没有 native 也能拍"的动作: 宠系统回合首 / 印记倒数 / 加印记的六个
    // copyHandle 分支 / 连击归零。全部只读 settings 与袋子, 不碰 Random、不碰 Player.instance。
    static object DriveVector(JsonElement v)
    {
        Snap();
        var st = BuildState(v.GetProperty("spec"));
        var op = v.GetProperty("op").GetString()!;
        var n = Iv(v, "n", 1);
        var outp = new List<string>();

        if (op == "petturn")
        {
            for (var i = 0; i < n; i++)
            {
                // 上游 Unit.OnTurnStart 的次序: isDone 归零 → roll (native, 跳过) → petSystem.OnTurnStart
                foreach (var name in new[] { "masterUnit", "clientUnit" })
                    Inv(Get(Get(st, name), "petSystem"), "OnTurnStart", new[] { Get(st, name), st });
                Set(st, "turn", (int)Get(st, "turn") + 1);      // BattleState.OnTurnStart 里 turn++ 那一笔
                outp.Add($"t{Get(st, "turn")}|m{SigPetSys(Get(Get(st, "masterUnit"), "petSystem"))}" +
                         $"|c{SigPetSys(Get(Get(st, "clientUnit"), "petSystem"))}");
            }
            return outp;
        }

        if (op == "unitturn")
        {
            for (var i = 0; i < n; i++)
            {
                foreach (var name in new[] { "masterUnit", "clientUnit" })
                    Inv(Get(st, name), "ReduceBuffTurn", new object[] { Sv(v, "identifier", "turn") });
                outp.Add($"m[{BuffsSig(Get(st, "masterUnit"))}]|c[{BuffsSig(Get(st, "clientUnit"))}]");
            }
            return outp;
        }

        if (op == "addbuff")
        {
            foreach (var b in v.GetProperty("buffs").EnumerateArray())
            {
                var buff = BuffOf(b);
                var r = Inv(Get(st, "masterUnit"), "AddBuff", new object[] { buff });
                outp.Add($"add={r}|{BuffsSig(Get(st, "masterUnit"))}");
            }
            return outp;
        }

        if (op == "chainstart")
        {
            for (var i = 0; i < n; i++)
            {
                Inv(Get(st, "masterUnit"), "OnChainStart", new object[0]);
                outp.Add(SigSkillSys(Get(Get(st, "masterUnit"), "skillSystem")));
            }
            return outp;
        }

        throw new ArgumentException("未知 statedrive op: " + op);
    }

    static string BuffsSig(object unit)
        => string.Join("~", ((System.Collections.IEnumerable)Get(unit, "unitBuffs")).Cast<object>().Select(SigBuff));

    static int Probe()
    {
        Load();
        var sb = new StringBuilder();
        sb.AppendLine("probe: 类型加载成功");
        foreach (var (t, names) in new[]
                 {
                     (Parser, new[] { "ParseOperation", "ParseDataType", "ParseFraction", "ParseOptions", "ParseMultipleOptions", "ParseConditionFilter", "IsOperator", "IsFraction", "IsCondition" }),
                     (Operator, new[] { "Operate" }),
                     (Identifier, new[] { "GetNumIdentifier", "GetIdentifier" }),
                     (Mathf, new[] { "RoundToInt", "FloorToInt", "CeilToInt", "Min", "Max", "Abs", "Pow", "Clamp" }),
                 })
        {
            sb.AppendLine($"  {t.FullName}");
            foreach (var n in names)
            {
                var ms = t.GetMethods(BindingFlags.Public | BindingFlags.Static).Where(m => m.Name == n).ToList();
                sb.AppendLine(ms.Count == 0 ? $"    ✗ {n}" : $"    ✓ {n}({string.Join(" | ", ms.Select(Sig))})");
            }
        }
        // Mathf.RoundToInt 的半值方向: 这是 core/mathf.ts 里唯一"待坐实"的分歧点, 用真 Unity 定它
        sb.AppendLine("  RoundToInt 半值扫描:");
        foreach (var x in new[] { 0.5f, 1.5f, 2.5f, 3.5f, -0.5f, -1.5f, -2.5f, 4.5f, 5.5f })
            sb.AppendLine($"    {x.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)} -> {Call(Mathf, "RoundToInt", x)}");
        sb.AppendLine("  Operate 表探针:");
        foreach (var op in new[] { "+", "-", "*", "/", "%", "[MIN]", "[MAX]", "[NEG]", "[ABS]", "[FLR]", "[CEL]", "[RND]", "^" })
        {
            try { sb.AppendLine($"    {op} 5,2 -> {Call(Operator, "Operate", op, 5f, 2f)}"); }
            catch (Exception e) { sb.AppendLine($"    {op} 抛 {e.InnerException?.GetType().Name ?? e.GetType().Name}"); }
        }
        Console.WriteLine(sb.ToString());
        return 0;
    }

    static string Sig(MethodInfo m) => string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name));
}
