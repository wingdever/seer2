// S2 数值层的 golden —— 每个期望值都是**上游二进制自己给的答案** (tools/oracle-cs 直调
// Assembly-CSharp.dll + UnityEngine.CoreModule.dll), 不是我照 C# 源码再推一遍的结果。
// 对拍 (tools/difftest.mjs) 管"随机向量永不分叉", 这份 golden 管"已经实测坐实过的语义
// 不会被下一次改动静默退回去"。两者不可互相替代: 前者跑不到 dotnet 就整批哑掉,
// 后者只覆盖写下来的这几条。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { f, floorToInt, ceilToInt, clamp, abs, pow, sign } from '../mathf.ts'
import { Status, getPersonalityBuff, getPowerUpBuff, addPersonality, getPetNormalStatus } from './status.ts'
import { getElementRelation, getElementRelationSub, getElementName } from './element.ts'
import { sortActionOrder } from '../battle/damage.ts'

// 逐元素比 float32: oracle 打印的是最短可回写十进制 (0.6666667), 解析成 double 后只有再 fround
// 才还原成那个 32 位值的精确表示 —— 直接字符串比会假报警, 不比又会漏掉 1 ULP。
const feq = (a: number[], b: (number | string)[], msg = '') => {
  assert.equal(a.length, b.length, msg + ' 长度')
  for (let i = 0; i < b.length; i++) {
    const want = b[i] === 'Inf' ? Infinity : b[i] === '-Inf' ? -Infinity : Number(b[i])
    assert.ok(Object.is(f(a[i]), f(want)), `${msg} [${i}] 得 ${a[i]} 期望 ${b[i]}`)
  }
}
const num = (x: number | string): number => x === 'Inf' ? Infinity : x === '-Inf' ? -Infinity : Number(x)
const feq1 = (a: number, want: number | string, msg: string) =>
  assert.ok(Object.is(f(a), f(num(want))), `${msg}: 得 ${a} 期望 ${want}`)

// ── 能力值 (Status.cs:387-388 GetPetNormalStatus) ──
// 列序是 atk/mat/def/mdf/spd/hp, **hp 在末位**; 体力那一走的不是 +5 而是 +10+level。
// pet1 = 迪兰 base 116/125/114/121/115/85 —— 与 arcadia species.yaml 的 hp:85 对齐, 这是当初
// 定「重启与共用数字 id」的两条判据之一, 现在它也是公式的锚点。
test('能力值: L20 满IV 无学习力', () => {
  feq(getPetNormalStatus(20, Status.of6(116, 125, 114, 121, 115, 85), 31, Status.zero(), 0).toArray(),
    [57, 61, 56, 59, 57, 70], 'normalstatus L20')
})

test('能力值: L50 + 252 学习力 + 性格 25 (双攻三减一)', () => {
  feq(getPetNormalStatus(50, Status.of6(116, 125, 114, 121, 115, 85), 31,
    Status.of6(252, 0, 0, 252, 0, 0), 25).toArray(),
    [184, 160, 134, 155, 121, 160], 'normalstatus L50')
})

// ── 性格 buff (Status.cs:325-361) ──
// IsInRange(0,55) 是**半开**区间 ⇒ 55 不在范围内, 直接得到全 1 的兜底, 而不是"越界抛"。
test('性格 buff 的三段与边界', () => {
  feq(getPersonalityBuff(1).toArray(), [1.1, 0.9, 1, 1, 1, 1], 'pbuff 1')
  feq(getPersonalityBuff(25).toArray(), [1.1, 1.1, 1, 0.9, 0.9, 1], 'pbuff 25')
  feq(getPersonalityBuff(54).toArray(), [0.9, 0.9, 1, 1.1, 1.1, 1], 'pbuff 54')
  feq(getPersonalityBuff(55).toArray(), [1, 1, 1, 1, 1, 1], 'pbuff 55 兜底')
})

// ── 力量加成 buff (Status.cs:379-383): (1 + 0.5f*|p|) ^ sign(p) ──
// 负的那一维走**倒数**而不是分支, 所以 -1 → 1/1.5 = 0.6666667; 0 那一维 sign 给 +1 ⇒ 仍得 1。
test('力量加成: 正/零/负三形状', () => {
  feq(getPowerUpBuff(Status.of6(2, 0, -1, 0, 0, 0)).toArray(), [2, 1, 0.6666667, 1, 1, 1], 'pubuff')
})

// ── 性格合成 (Status.cs:303-323) ──
// 冲突(同一维同时 +0.1)时**取 lhs 并丢弃 rhs**, 不报错也不折中; 不冲突才回查 0..54。
// 查不到就落 Personality.实干 —— 这里 paddd(25,26) 的答案仍是 25, 因为 26 的三减一与 25 撞车。
test('性格合成: 冲突取 lhs、兼容回查', () => {
  assert.equal(addPersonality(1, 2), 1, 'paddd 1+2 冲突')
  assert.equal(addPersonality(0, 25), 25, 'paddd 0+25')
  assert.equal(addPersonality(25, 26), 25, 'paddd 25+26')
})

// ── Status 运算符 ──
// `/` 是**乘倒数** (Status.cs:287): rhs=0 ⇒ 1/0 = Inf ⇒ 每一维都是 +Inf, 且**不抛**。
// C# 的 float 除零不抛是 JS 直觉的第一号陷阱; 只有 int 除法才 DivideByZeroException。
test('Status / 0 给 Inf (不抛)', () => {
  const s = new Status([1, 2, 3, 4, 5, 6])
  feq(s.divF(0).toArray(), ['Inf', 'Inf', 'Inf', 'Inf', 'Inf', 'Inf'], 'statusop div 0')
})

// `^` 走 Mathf.Pow: 1^Inf 与 (-1)^Inf 都归 **1** (JS 的 Math.pow 给 NaN), 而 |x|>1 时给 Inf。
test('Status ^ Inf: 1 与 -1 归 1, 其余发散', () => {
  const s = Status.of6(1, -1, 2, 4, 9, 16)
  feq(s.powToF(Infinity).toArray(), [1, 1, 'Inf', 'Inf', 'Inf', 'Inf'], 'statusop pow Inf')
})

// ── Get(string) 的键空间 (Status.cs:148-171) ──
// switch 判的是**原始**键名, 只有兜底的索引查表才 ToLower ⇒ "HIT" 查不到 (表里是 hp/atk/...),
// 返回 0 而不是命中维。这是 buff/效果表里大小写混写时的真实行为。
test('Status.Get 的键: all / max(except:hp) / accuracyBuff / 大写 HIT', () => {
  const s = Status.of6(1, 2, 3, 4, 5, 6)
  feq1(s.get('all'), 3.5, 'all = Average (double 累加)')
  feq1(s.get('max(except:hp)'), 5, 'max(except:hp) = Take(5)')
  feq1(Status.of6(1, 2, 3, 4, 5, -2).get('accuracyBuff'), -30, 'accuracyBuff: hp*10 + Clamp(hp,-3,3)*5')
  feq1(s.get('HIT'), 0, '大写 HIT 不在 switch 里 → 索引兜底 → 0')
})

// Set("all") 是**铺满**每一维, 包括 hp; 值先过 f() (字段是 float[])。
test('Status.Set("all") 铺满六维', () => {
  const s = Status.of6(1, 2, 3, 4, 5, 6)
  s.setByName('all', 0.5)
  feq(s.toArray(), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 'statusset all')
})

// ── Parse ──
// 三种形状各有归宿: 斜串 "1/2/3/4/5/6" 恰好 6 段 → 整表覆写; "atk:5" 这种**没有外层括号**的
// 会在 trimParentheses 处得到 null, 而上游的死分支判的是 str 而非 typeList → 直接 NRE (实测);
// "(atk:5)(hp:10)" 才是 buff 表里真正用的形态 → 按维累加。
test('Status.Parse 的三种形状', () => {
  feq(Status.Parse('1/2/3/4/5/6')!.toArray(), [1, 2, 3, 4, 5, 6], 'parse 斜串')
  feq(Status.Parse('(atk:5)(hp:10)')!.toArray(), [5, 0, 0, 0, 0, 10], 'parse 括号键值')
  assert.throws(() => Status.Parse('atk:5'), TypeError, '无外层括号 → 上游 NRE')
})

// ── 相克与元素名 ──
// 矩阵按 [def][atk] 索引, 越界/未知一律 `?? 1`; 副属性为「普通」时整条子关系被跳过。
// 名字那一路: id<0 显示「全部」, 且用**全角空格** U+3000 补齐到 len —— 不是半角空格。
test('相克表与元素名补齐', () => {
  feq1(getElementRelation(3, 1), 2, 'elemrel 火→?')
  feq1(getElementRelationSub(3, 1, 0), 2, 'elemrel2 副属性普通 → 跳过子关系')
  assert.equal(getElementName(-1, 3), '　全部', 'elemname 负 id 走「全部」+ 全角空格补齐')
  assert.equal(getElementName(-1, 3).charCodeAt(0), 0x3000, '补齐用的是 U+3000')
})

// ── Mathf 标量的三个反直觉点 ──
test('Mathf: sign(-0) / clamp 倒挂区间 / pow 1^Inf', () => {
  feq1(sign(-0), 1, 'Sign 的实现是 value>=0 ⇒ -0 也给 +1')
  feq1(clamp(5, 10, 1), 10, 'Clamp 是三段严格比较, 不是 max(min(x,hi),lo)')
  feq1(pow(1, Infinity), 1, 'Mathf.Pow(1, Inf) = 1 (Math.pow 给 NaN)')
})

// ── 先手排序的稳定性 (DecidePriorityPhase.cs:40-57) ──
// 六键全并列时 LINQ 的稳定排序保住**输入顺序**, 于是第一行拿到 +1、第二行拿到 -3
// (符号=阵营, 绝对值=背包游标+1), 而 null 技能那条 -1 的防御键是死代码 —— 它下一键就 NRE。
test('先手排序: 并列保序 + 输出带阵营符号', () => {
  const out = sortActionOrder([
    { hasSkill: 1, isAction: 1, vipriority: 0, priority: 0, spd: 100, neg: 1, rnd: 5, unitId: 1, cursor: 0 },
    { hasSkill: 1, isAction: 1, vipriority: 0, priority: 0, spd: 100, neg: 1, rnd: 5, unitId: -1, cursor: 2 },
    { hasSkill: 0, isAction: 0, vipriority: 0, priority: 0, spd: 50, neg: 1, rnd: 0, unitId: 1, cursor: 1 },
  ])
  assert.deepEqual(out, [1, -3, 2], 'orderby')
})

// 取整族也各自有边界: FloorToInt/CeilToInt 对 ±Inf **饱和**到 int 极值而不是抛。
test('FloorToInt / CeilToInt 的饱和与 NaN', () => {
  assert.equal(floorToInt(Infinity), 2147483647)
  assert.equal(floorToInt(-Infinity), -2147483648)
  assert.equal(ceilToInt(NaN), 0)
  assert.equal(abs(-7.5), 7.5)
})
