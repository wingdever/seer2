using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;

namespace Oracle;

// S3 的保命绳：把《阿卡迪亚：重启》自己编出来的 Database 在**无 Unity 进程**里立起来，
// 让 Effect/Buff/Skill/BuffInfo 这些「原本要跑在 MonoBehaviour 生命周期里」的类变成可直调对象。
//
// 为什么必须立起来，而不是照源码再写一遍：
//   Effect.Parse / Buff.GetBuffDescriptionPreview / Identifier.GetBuffIdentifier 全部经
//   Database.instance 取表（Database.cs:125/156）。没有它，S3 就只能拿「我对源码的理解」当 golden，
//   而那正是差分 oracle 要排除的东西。
//
// 立起来的做法只有两步，且都不碰 Unity 原生层：
//   1) 表数据走**上游自己的**静态/实例解析函数（ResourceManager.GetCSV / GetEffectDict / GetBuffInfo / GetSkill），
//      我喂进去的是磁盘上的原始 CSV 文本，不预先做任何字段级理解；
//   2) Singleton<Database>.instance 的 setter 是 private（Singleton.cs:24），反射写进去。
//   MonoBehaviour 的构造在玩家进程外不一定安全，所以用 RuntimeHelpers.GetUninitializedObject 跳过 ctor。
internal static class Boot
{
    const string DATA = "/home/wing/Projects/Games/seer2/projects/Seer2-Restart-Lite-main/Assets/Resources/Data";

    public static Type Database, ResourceManager, Effect, Buff, BuffInfo, Skill, SkillType, EffectTiming;
    public static object Db, Rm;
    public static Dictionary<string, string> TableError = new();
    static bool booted;

    public static void Ensure()
    {
        if (booted) return;
        Load();
        Build();
        booted = true;
    }

    // 复用 Program 的 AssemblyLoadContext 装载（同一份 Game 程序集，类型标识才相等）
    static void Load()
    {
        foreach (var name in new[] { "Database", "ResourceManager", "Effect", "Buff", "BuffInfo", "Skill", "SkillType", "EffectTiming" })
        {
            var t = Program.TypeNamed(name) ?? throw new Exception($"Boot: 类型没找到 {name}");
            switch (name)
            {
                case "Database": Database = t; break;
                case "ResourceManager": ResourceManager = t; break;
                case "Effect": Effect = t; break;
                case "Buff": Buff = t; break;
                case "BuffInfo": BuffInfo = t; break;
                case "Skill": Skill = t; break;
                case "SkillType": SkillType = t; break;
                case "EffectTiming": EffectTiming = t; break;
            }
        }
    }

    static void Build()
    {
        Db = Uninit(Database);
        Rm = Uninit(ResourceManager);

        // 1) 预制效果表（Effects/effect.csv）。上游 LoadEffects 在 GetEffectDict 之后还有一段
        //    「0..10000 的每个 id 复制一份到 id+10000 并把 timing 抹成 None」（ResourceManager.cs:725-731）——
        //    这一步是 `10001{...}` 这类**引用带参**能解析的根因，必须一起立起来，否则 Effect.Parse 会查不到 id。
        var effectCsv = Csv("Effects/effect.csv");
        var dict = (System.Collections.IDictionary)Invoke(Rm, "GetEffectDict", new object[] { effectCsv })!;
        var lo = dict.Keys.Cast<int>().Where(k => k >= 0 && k <= 10000).ToList();
        foreach (var key in lo)
        {
            var copy = Activator.CreateInstance(Effect, dict[key])!;          // Effect(Effect rhs) 拷贝构造
            SetTiming(copy, 0);                                               // EffectTiming.None
            dict[key + 10000] = copy;
        }
        Field(Database, "effectDict").SetValue(Db, ToTyped(dict, Database, "effectDict"));

        // 2) 技能表 → 3) 印记表 → 4) 道具表。顺序与 Database.Init 的回调链一致
        //    （Database.cs:32-41：LoadEffects → LoadSkill → LoadBuffInfo → LoadItemInfo），
        //    因为 Skill/BuffInfo 在 SetEffects 里会回头查 effectDict。
        //    上游这几张表的装载都是「整表一个 try/catch + 弹窗」，弹窗在无 Unity 进程里必炸，
        //    所以这里把每张表的失败收下来继续跑：诊断模式需要「哪一行挂了」，而不是让第一张表把进程带走。
        // Singleton<T>.instance { get; private set; } —— 闭泛型 Singleton<Database> 上的静态属性。
        // **必须在这三张表之前写**：Skill/BuffInfo 的 SetEffects 会经 Effect.Parse 回头查
        // Database.instance.effectDict（Database.cs:125/156），instance 还是 null 时每一行都抛，
        // 而上游的 try/catch 把整表异常收进弹窗 ⇒ 表静默变成"未装载"，报错信息只有一个 SecurityException。
        // （这就是逐行诊断全绿、真函数却全灭的差因。）
        var singleton = Database.BaseType!;
        singleton.GetProperty("instance", BindingFlags.Public | BindingFlags.Static)
                .SetValue(null, Db);

        TableError = new();
        Put("skillDict", () => Invoke(Rm, "GetSkill", new object[] { Csv("Skills/info.csv"), Csv("Skills/effect.csv"), null }));
        Put("buffInfoDict", () => Invoke(Rm, "GetBuffInfo", new object[] { Csv("Buffs/info.csv"), Csv("Buffs/effect.csv") }));
        Put("itemInfoDict", () => Invoke(Rm, "GetItemInfo", new object[] { Csv("Items/info.csv"), Csv("Items/effect.csv") }));

        // 5) 其余没装载的字典字段一律补一个**空表**。Uninit() 跳过字段初始化器 ⇒ petInfoDict 之类是 null,
        //    而 Database.GetPetInfo 的 `petInfoDict.Get(id)` 会对 null 字典抛 NRE (实测栈顶在
        //    DictionaryHelper.TryGet)。真实游戏里这些表由 Addressables 协程填, 进程外填不动,
        //    所以 [x:pet] 那类文案在本 oracle 里取的是**兜底分支**("精灵信息错误"),
        //    而 [x:skill]/[x:buff] 因为有真表, 走的仍是正常分支 —— 对拍时两边的接缝要照这个口径注。
        foreach (var fd in Database.GetFields(BindingFlags.Public | BindingFlags.Instance))
        {
            var ft = fd.FieldType;
            if (!ft.IsGenericType || ft.GetGenericTypeDefinition() != typeof(Dictionary<,>)) continue;
            if (fd.GetValue(Db) is not null) continue;
            fd.SetValue(Db, Activator.CreateInstance(ft));
        }

        // 6) 宠表 (B1 —— 决议 a)：同步复刻 ResourceManager.GetPetInfo 的组装体。
        //    GetPetInfo 是 coroutine（StartCoroutine），进程外跑不动；但 6 张 *Info 的**解析器**都是普通实例方法，
        //    喂上游 GetCSV 拍平的 string[] 即可直调。于是这里：解析 6 张表 → 逐宠按 coroutine 本体组装 PetInfo → 写 petInfoDict。
        //    kizuna 走 SaveSystem.LoadXML（依赖 Application.persistentDataPath，离线没有）⇒ 全部留 default
        //    （5 张羁绊 XML 是边角，S5/S6 不读 pet.kizuna）。
        LoadPetTables();
    }

    // 同步复刻 GetPetInfo 的「逐宠组装」本体（ResourceManager.cs:864-875）。
    static void LoadPetTables()
    {
        var basic = (System.Collections.IList)Invoke(Rm, "GetPetBasicInfo", new object[] { Csv("Pets/basic.csv") })!;
        var feature = (System.Collections.IDictionary)Invoke(Rm, "GetPetFeatureInfo", new object[] { Csv("Pets/feature.csv") })!;
        var exp = (System.Collections.IDictionary)Invoke(Rm, "GetPetExpInfo", new object[] { Csv("Pets/exp.csv") })!;
        var skill = (System.Collections.IDictionary)Invoke(Rm, "GetPetSkillInfo", new object[] { Csv("Pets/skill.csv") })!;
        var card = (System.Collections.IDictionary)Invoke(Rm, "GetPetSkillInfo", new object[] { Csv("Pets/card.csv") })!;
        var ui = (System.Collections.IDictionary)Invoke(Rm, "GetPetUIInfo", new object[] { Csv("Pets/ui.csv") })!;

        var petInfoT = Program.TypeNamed("PetInfo");
        var petUIInfoT = Program.TypeNamed("PetUIInfo");
        var petTalentInfoT = Program.TypeNamed("PetTalentInfo");
        var petKizunaInfoT = Program.TypeNamed("PetKizunaInfo");
        var uiCtor2 = petUIInfoT.GetConstructors().First(c => c.GetParameters().Length == 2
            && c.GetParameters().All(p => p.ParameterType == typeof(int)));
        var bf = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
        var dict = (System.Collections.IDictionary)Field(Database, "petInfoDict").GetValue(Db);

        object? DictGet(System.Collections.IDictionary d, int key) => d.Contains(key) ? d[key] : null;

        foreach (var o in basic)
        {
            var basicInfo = o!;
            var basicT = basicInfo.GetType();
            var basicId = (int)basicT.GetField("id", bf)!.GetValue(basicInfo)!;
            var baseId = (int)basicT.GetField("baseId", bf)!.GetValue(basicInfo)!;

            var uiInfo = DictGet(ui, basicId) ?? Activator.CreateInstance(petUIInfoT, basicId, baseId)!;
            var uiT = uiInfo.GetType();
            var defaultFeatureId = (int)uiT.GetProperty("defaultFeatureId", bf)!.GetValue(uiInfo)!;

            var featureInfo = DictGet(feature, defaultFeatureId);
            var expInfo = DictGet(exp, basicId);
            var skillInfo = DictGet(skill, basicId);
            var cardInfo = DictGet(card, basicId) ?? skillInfo;
            var talentInfo = Activator.CreateInstance(petTalentInfoT)!;
            var kizunaInfo = Activator.CreateInstance(petKizunaInfoT)!;

            var info = Activator.CreateInstance(petInfoT, basicInfo, featureInfo, expInfo, talentInfo, skillInfo, uiInfo)!;
            petInfoT.GetField("cards", bf)!.SetValue(info, cardInfo);
            petInfoT.GetField("kizuna", bf)!.SetValue(info, kizunaInfo);

            var id = (int)petInfoT.GetProperty("id", bf)!.GetValue(info)!;   // => basic.id
            dict[id] = info;
            Program.InfoIds.Add(id);
        }
    }

    static void Put(string field, Func<object> loader)
    {
        // 只报消息不够 —— 行级诊断（TableDiag）已经证明每一行都建得起来，那异常一定在
        // 我没复现的那一步里。堆栈是唯一能说清"到底是哪一行、哪一句"的东西。
        try { Field(Database, field).SetValue(Db, ToTyped(loader()!, Database, field)); }
        catch (TargetInvocationException tie) when (tie.InnerException is not null)
        { TableError[field] = $"{tie.InnerException.GetType().Name}: {tie.InnerException.Message}\n{tie.InnerException.StackTrace}"; }
        catch (Exception e) { TableError[field] = $"{e.GetType().Name}: {e.Message}\n{e.StackTrace}"; }
    }

    static object ToTyped(object boxed, Type owner, string fieldName)    {
        var t = owner.GetField(fieldName).FieldType;
        if (t.IsInstanceOfType(boxed)) return boxed;
        var inst = Activator.CreateInstance(t)!;
        var add = t.GetMethod("Add");
        foreach (System.Collections.DictionaryEntry e in (System.Collections.IDictionary)boxed) add.Invoke(inst, new[] { e.Key, e.Value });
        return inst;
    }

    static object Uninit(Type t) => RuntimeHelpers.GetUninitializedObject(t);

    static void SetTiming(object effect, int timingId)
    {
        var m = Effect.GetMethod("SetTiming", new[] { EffectTiming });
        m.Invoke(effect, new[] { Enum.ToObject(EffectTiming, timingId) });
    }

    // 上游 GetCSV 是 `text.Split(new[]{',','\n'}, RemoveEmptyEntries)`（ResourceManager.cs:525-531）：
    // **空字段会消失**，整表拉平成一条定长 stride 数组。这一步交给真函数自己执行，
    // 我只负责把磁盘文本原样递进去 —— 不然「我以为的 CSV」和「上游读到的 CSV」就又是两套。
    static string[] Csv(string rel)
    {
        var text = File.ReadAllText(Path.Combine(DATA, rel));
        return (string[])CallStatic(ResourceManager, "GetCSV", new object[] { text })!;
    }

    public static object CallStatic(Type t, string name, object[] args)
        => Program.CallPublic(t, name, args);

    static object Invoke(object inst, string name, object[] args)
        => Program.CallInstance(inst, name, args);

    static FieldInfo Field(Type t, string name) => t.GetField(name, BindingFlags.Public | BindingFlags.Instance)
        ?? throw new MissingFieldException($"{t.Name}.{name}");

    // 上游 GetSkill / GetBuffInfo / GetItemInfo 的 try/catch 把 Hintbox 放在了**整个循环外面**
    // （ResourceManager.cs:755-758 / 1058-1061），一出错就弹窗（在无 Unity 进程里 = SecurityException）
    // 并放弃后续行，还把已经建好的半张表一起丢掉。要定位到底是哪一行，
    // 只能按上游的 stride 自己逐行调构造 + SetEffects，把异常原样收下来。
    public static string TableDiag(string which)
    {
        Ensure();
        var sb = new System.Text.StringBuilder();
        var (infoType, effType, setEffectsArgType) = which switch
        {
            "Skills" => (Skill, Effect, typeof(System.Collections.Generic.List<>).MakeGenericType(Effect)),
            "Buffs" => (BuffInfo, Effect, typeof(System.Collections.Generic.List<>).MakeGenericType(Effect)),
            _ => throw new ArgumentException("未知表: " + which),
        };
        var info = Csv($"{which}/info.csv");
        var effects = Csv($"{which}/effect.csv");
        var lists = (System.Collections.IList)Invoke(Rm, "GetEffectLists", new object[] { effects })!;
        // DATA_COL 是 `public const int` ⇒ 反射默认只找 instance 会拿到 null
        var dataCol = (int)infoType.GetField("DATA_COL", BindingFlags.Public | BindingFlags.Static).GetRawConstantValue();
        var dataRow = info.Length / dataCol;
        sb.AppendLine($"  {which}: DATA_COL={dataCol} info.Length={info.Length} dataRow={dataRow} effectLists={lists.Count}");
        var ctor = infoType.GetConstructors().First(c => c.GetParameters().Length == 2 && c.GetParameters()[1].ParameterType == typeof(int));
        var setEffects = infoType.GetMethod("SetEffects", new[] { setEffectsArgType });
        int ok = 0;
        var fails = new List<string>();
        var ids = new List<string>();
        // 上游 GetSkill 用的是 `skillDict.Add(...)`（撞重复键抛 ArgumentException），
        // GetBuffInfo/GetItemInfo 用的是 `.Set(...)`（覆盖）。这个差别只在 Skills 这边要命，
        // 所以这里照抄 Add 而不是 Set —— 否则我复现的就不是上游那条失败路径。
        var dictType = typeof(Dictionary<,>).MakeGenericType(typeof(int), infoType);
        var dict = Activator.CreateInstance(dictType);
        var add = which == "Skills" ? dictType.GetMethod("Add") : null;
        // Buffs/Items 走的是上游扩展方法 DictionaryHelper.Set ⇒ 反射里没有这个成员，
        // 它的语义就是索引器赋值，所以取 set_Item 才是同一个动作。
        var setM = dictType.GetProperty("Item").SetMethod;
        // 上游的 id 取值也是走真函数的属性，取名字是为了把"哪一行"报到人能看懂的粒度
        var idProp = infoType.GetProperty("id");
        var nameProp = infoType.GetProperty("name");
        for (int i = 1; i < dataRow; i++)
        {
            object row = null;
            try
            {
                row = ctor.Invoke(new object[] { info, dataCol * i });
                setEffects.Invoke(row, new object[] { lists[i - 1] });
                var rowId = idProp.GetValue(row);
                ids.Add($"{rowId}");
                if (add is not null) add.Invoke(dict, new[] { rowId, row }); else setM.Invoke(dict, new[] { rowId, row });
                ok++;
            }
            catch (TargetInvocationException tie) { fails.Add($"row{i} csvId={info[dataCol * i]} id={idProp?.GetValue(row) ?? "-"} name={nameProp?.GetValue(row) ?? "-"} {tie.InnerException.GetType().Name}: {Short(tie.InnerException.Message)}"); }
            catch (Exception e) { fails.Add($"row{i} csvId={info[dataCol * i]} {e.GetType().Name}: {Short(e.Message)}"); }
        }
        sb.AppendLine($"  成功 {ok} / {dataRow - 1} 行, 失败 {fails.Count} 行, 装载后条目 {((System.Collections.ICollection)dict).Count}");
        if (ids.Count > 0) sb.AppendLine($"  解析后 id 首末: {ids.First()} … {ids.Last()}");
        foreach (var f in fails.Take(15)) sb.AppendLine("    " + f);
        return sb.ToString();
    }

    static string Short(string s) => s.Length > 160 ? s.Substring(0, 160) + "…" : s;

    public static string Probe()
    {
        var sb = new System.Text.StringBuilder();
        try { ProbeInner(sb); }
        catch (Exception e) { sb.AppendLine($"  !! {e.GetType().Name}: {e.Message}"); }
        return sb.ToString();
    }

    static void ProbeInner(StringBuilder sb)
    {
        Ensure();
        foreach (var (n, f) in new[] { ("effectDict", "effectDict"), ("skillDict", "skillDict"), ("buffInfoDict", "buffInfoDict"), ("itemInfoDict", "itemInfoDict"), ("petInfoDict", "petInfoDict") })
        {
            var v = Field(Database, f).GetValue(Db);
            sb.AppendLine($"  {n} = {(v is null ? "未装载" : ((System.Collections.ICollection)v).Count.ToString())}" +
                (TableError.TryGetValue(n, out var err) ? $"  ← {err}" : ""));
        }

        // 三条真调用，验证立起来的 Database 确实喂得动 S3 的三条主链路
        var parsed = CallStatic(Effect, "Parse", new object[] { "(1002{buff=3&2=4&5=6})" });
        sb.AppendLine($"  Effect.Parse(1002) -> {(parsed is null ? "null" : ((System.Collections.ICollection)parsed).Count + " 条")}");
        if (parsed is not null)
            foreach (var e in (System.Collections.IEnumerable)parsed)
                sb.AppendLine($"    raw = {string.Join("|", (string[])Effect.GetMethod("GetRawEffectStringArray", Type.EmptyTypes).Invoke(e, null)!)}");

        // Buff(int, int, int?) —— 三参构造用显式 ctor.Invoke，避免 Activator 给 null 找重载时挑错
        var ctor3 = Buff.GetConstructors().First(c => c.GetParameters().Length == 3);
        var buff = ctor3.Invoke(new object[] { 1, -1, 3 });
        sb.AppendLine($"  Buff(id1,turn-1,value3).name = {Buff.GetProperty("name").GetValue(buff)}");
        Try(sb, "Buff(...).desc", () => Buff.GetProperty("description").GetValue(buff));
        sb.AppendLine($"  Buff(...).effectCount = {((System.Collections.ICollection)Field(Buff, "effects").GetValue(buff)!).Count}");
        sb.AppendLine($"  Buff(...).turn = {Field(Buff, "turn").GetValue(buff)}  (info.turn=-1 ⇒ 构造里 (_turn==-1)?info.turn:_turn 这一支的落点)");
        Try(sb, "preview", () => CallStatic(Buff, "GetBuffDescriptionPreview", new object[] { "物攻强化[value]級", buff }));
    }

    // 属性 getter 经反射必然把上游异常裹成 TargetInvocationException —— 真正的抛出点在 InnerException，
    // 裹一层就看不见是哪个接缝没注。所以这里连内部栈一起打。
    static void Try(StringBuilder sb, string what, Func<object?> f)
    {
        try { sb.AppendLine($"  {what} = {f()}"); }
        catch (TargetInvocationException tie) when (tie.InnerException is not null)
        {
            var ie = tie.InnerException;
            sb.AppendLine($"  {what} !! {ie.GetType().Name}: {Short(ie.Message)}");
            sb.AppendLine(string.Join("\n", (ie.StackTrace ?? "").Split('\n').Take(6).Select(x => "      " + x.Trim())));
        }
        catch (Exception e) { sb.AppendLine($"  {what} !! {e.GetType().Name}: {Short(e.Message)}"); }
    }
}
