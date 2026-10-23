// IClass/IKeyValuePair.cs 的移植 (S2 数值层)。这个类型在战斗里的实际权重比看起来大:
// `Skill.powerup / powerdown` 是 `Linear<Status>`, 而 PetBattleStatusController.GetCurrentPowerup
// 用它决定「加成的加成」(先乘 mult 再叠 add), 伤害与命中都从这条链下游取数。
//
// 实测事实 (省掉一轮猜测): `Linear<Status>.Parse` 在上游**从来没被调用过** ——
// 全仓库只有 `Linear<int>.Parse` 的两处调用 (Item.cs:61 道具表、PetUIInfo.cs:99 皮肤表)。
// 所以技能表的 powerup/powerdown 不走 CSV, 恒为默认值 `new Linear<Status>(Status.one, Status.zero)`,
// 之后由运行期效果改写。⇒ S1 数据管道不需要为此加列, 见 docs/engine/port-map.md。

import { trimParentheses } from '../strutil.ts'

// IKeyValuePair.cs:45-61 —— Linear<T> 就是 IKeyValuePair<T,T>, 只是把 key/value 改名叫 mult/add。
// 两个字段**同型** (T,T), 且 mult/add 是纯透传属性 (没有校验、没有懒算)。
export class Linear<T> {
  key: T
  value: T

  constructor(key: T, value: T) { this.key = key; this.value = value }

  get mult(): T { return this.key }
  set mult(v: T) { this.key = v }
  get add(): T { return this.value }
  set add(v: T) { this.value = v }
}

// IKeyValuePair.cs:26-42 Parse。三个必须照搬的形状:
//   1) 空串 (含 null) 直接给**空表**, 不是 null;
//   2) 只有出现 '[' 才会调 valueFunc —— 没有 '[' 的项, value 一律是 defaultValue,
//      parseFunc 对 value 那一段根本不进 (所以 key 解析失败会抛、value 缺省不会抛);
//   3) key 取的是 `[` **之前的原文**, 不 trim、不去空格; value 走 TrimParentheses,
//      那是默认 左'[' 右']' 的宽松版 (strutil.trimParentheses: 第一个 [ 到配平的 ])。
//
// parseFunc 由调用方注入 (上游是 Func<string,T>): Item.cs:61 给 `(int)GetNumIdentifier`、
// PetUIInfo.cs:99 给 `int.Parse`, 两者的失败语义完全不同, 所以这里不预设。
export function parseLinear<T>(text: string | null, parseFunc: (s: string) => T, defaultValue: T, delim = '/'): Linear<T>[] {
  const items: Linear<T>[] = []
  if (text === null || text === '') return items

  for (const itemExpr of text.split(delim)) {
    const index = itemExpr.indexOf('[')
    const key = parseFunc(index < 0 ? itemExpr : itemExpr.slice(0, index))
    const value = index < 0 ? defaultValue : parseFunc(trimParentheses(itemExpr))
    items.push(new Linear<T>(key, value))
  }
  return items
}
