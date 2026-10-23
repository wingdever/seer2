// PetExpSystem.cs（System/ 下，public static class）—— D6 exp.ts 与 S5 gainExpPerPet 共用的**经验公式**。
// 纯函数、无表、无 coroutine（区别于 RM.LoadPetInfo 那个 StartCoroutine）⇒ 可进无头 oracle 逐值对拍。
//
// 必须照搬的上游形状（依据 PetExpSystem.cs 全文）：
//   · n3/n2/n1 是 Func<int,uint>：**整数**算术（C# int 整除向零截断；本式全正 ⇒ floor）。
//   · LevelExpBasic/TotalExpBasic 里 v.(x/y/z) 与 q.(x/y/z/w) 是 **float** ⇒ 每次算术过 f() 收窄（V3）。
//     ⚠ 常数 0.8 不是 float 精确值 ⇒ 先 f(0.8) 再参与运算（否则 double(0.8)*level 与 0.8f*level 差 1 ULP）。
//   · (uint) 强转：本式全正 ⇒ 截断 toward zero = Math.floor。
//   · expType：1 ⇒ Type B，其余（含 0）⇒ Type A（`_ =>` 默认臂）。
//   · GetLevelExp(level)=0 ? 0 : formula(level)；GetTotalExp(level)=0 ? 0 : totalFormula(level-1)。
//   · GetLevelByTotalExp：level=0 起，while GetTotalExp(level+1) <= totalExp 递增。
//
// headless：无 UnityEngine。f() 来自 ../mathf.ts。

import { f } from '../mathf.ts'

// C# (uint)float：全正 ⇒ 截断 toward zero = floor。等级域内不会溢出 uint。
const u = (x: number): number => Math.floor(x)

// Func<int,uint>：整数算术，整除向零截断（全正 ⇒ floor）。
const n3 = (n: number): number => Math.trunc((n * (n + 1) * (2 * n + 1)) / 6)
const n2 = (n: number): number => Math.trunc((n * (n + 1)) / 2)
const n1 = (n: number): number => Math.trunc(n)

// LevelExpBasic(level, v) = (uint)(v.x*level*level + v.y*level + v.z)。
// C# 左结合：((v.x*level)*level + v.y*level) + v.z，每次 float 过 f() 收窄。
const levelExpBasic = (level: number, vx: number, vy: number, vz: number): number => {
  const a = f(f(vx * level) * level)
  const b = f(vy * level)
  const s = f(a + b)
  const r = f(s + vz)
  return u(r)
}

// TotalExpBasic(level, q) = (uint)(q.x*n3 + q.y*n2 + q.z*n1 + q.w)。
// C# 左结合：(((q.x*n3 + q.y*n2) + q.z*n1) + q.w)，每次 float 过 f() 收窄。
const totalExpBasic = (level: number, qx: number, qy: number, qz: number, qw: number): number => {
  const t1 = f(qx * n3(level))
  const t2 = f(qy * n2(level))
  const t3 = f(qz * n1(level))
  const s1 = f(t1 + t2)
  const s2 = f(s1 + t3)
  const s3 = f(s2 + qw)
  return u(s3)
}

// Type A：Level v=(3.75,3.75,1) + (level%2>0?1:0)，level==1 再 +1；Total q=(3.75,3.75,1,1.5) + n1((level+1)/4)。
const levelExpTypeA = (level: number): number => {
  const exp = levelExpBasic(level, 3.75, 3.75, 1) + ((level % 2 > 0) ? 1 : 0)
  return level === 1 ? exp + 1 : exp
}
const totalExpTypeA = (level: number): number =>
  totalExpBasic(level, 3.75, 3.75, 1, 1.5) + n1(Math.trunc((level + 1) / 4))

// Type B：Level v=(2.5,2.5,0.8) + (level%5>0?1:0)；Total q=(2.5,2.5,0.8,1)。0.8 先 f() 收窄。
const levelExpTypeB = (level: number): number =>
  levelExpBasic(level, 2.5, 2.5, f(0.8)) + ((level % 5 > 0) ? 1 : 0)
const totalExpTypeB = (level: number): number =>
  totalExpBasic(level, 2.5, 2.5, f(0.8), 1)

/** PetExpSystem.GetLevelExp(level, expType=0)：升到 level 这一级所需的经验。 */
export function getLevelExp(level: number, expType = 0): number {
  if (level === 0) return 0
  return expType === 1 ? levelExpTypeB(level) : levelExpTypeA(level)
}

/** PetExpSystem.GetTotalExp(level, expType=0)：从 0 累计到 level 的总经验。 */
export function getTotalExp(level: number, expType = 0): number {
  if (level === 0) return 0
  return expType === 1 ? totalExpTypeB(level - 1) : totalExpTypeA(level - 1)
}

/** PetExpSystem.GetLevelByTotalExp(totalExp, expType=0)：总经验反推等级。 */
export function getLevelByTotalExp(totalExp: number, expType = 0): number {
  let level = 0
  while (getTotalExp(level + 1, expType) <= totalExp) level++
  return level
}
