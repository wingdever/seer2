// strutil.ts 的解析边界 —— 只锁「对拍刚炸出来的那一类」: 数字**语法**对了但**范围**不对。
// C# 的 TryParse 把越界算 false, Parse 把越界算 OverflowException; JS 的 Number 两者都不区分,
// 于是 25k 条对拍向量里唯一那条分歧 (BuffInfo.csv 一行 id=99999999999) 就是从这里来的。

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIntOrThrow, tryParseFloat, tryParseInt, boolParse, csBool, replaceSpecialWhitespace, replaceColorAndNewline } from './strutil.ts'
import { isInRange, isWithin } from './numutil.ts'

test('int 解析的 Int32 边界: 越界 TryParse=false / Parse=Overflow', () => {
  assert.equal(tryParseInt('2147483647'), 2147483647)
  assert.equal(tryParseInt('-2147483648'), -2147483648)
  assert.equal(tryParseInt('2147483648'), null)
  assert.equal(tryParseInt('99999999999'), null)
  assert.throws(() => parseIntOrThrow('99999999999'), /OverflowException/)
  assert.throws(() => parseIntOrThrow('1.5'), /FormatException/)
  assert.throws(() => parseIntOrThrow(''), /FormatException/)
})

test('float 解析的溢出不是失败: .NET Core 3.0 起 1e40 得到 +∞ 而不是 false/抛', () => {
  // 判据来自对拍向量 {kind:'datatype', data:'1e40'} —— 上游 ParseDataType 给 Float/+∞。
  // 这条单独锁住, 是因为「越界 ⇒ 解析失败」是 JS 直觉里最容易顺手加的判据, 一加就把合法字面量
  // 降级成标识符分支, 而 25k 条向量里只会以一条 datatype 分歧的形式露头。
  assert.equal(tryParseFloat('1e40'), Infinity)
  assert.equal(tryParseFloat('-1e40'), -Infinity)
  // Single 的上界是 3.4028234663852886e38, 所以 1e39 已经是 +∞ 而不是"有限但很大"; 要验"范围内仍是有限"得用 1e38。
  assert.ok(Number.isFinite(tryParseFloat('1e38')!))
  assert.equal(tryParseFloat('0x10'), null)
})

test('bool.Parse 只认 true/false, bool.ToString 首字母大写', () => {
  assert.equal(boolParse(' TRUE '), true)
  assert.equal(boolParse('false'), false)
  assert.throws(() => boolParse('yes'), /FormatException/)
  assert.equal(csBool(true), 'True')
  assert.equal(csBool(false), 'False')
})

test('特殊空白清洗与文案色板替换的形状', () => {
  assert.equal(replaceSpecialWhitespace('a\tb\nc\rd\x00', ''), 'abcd\x00')
  assert.equal(replaceColorAndNewline('[FF0000]x[ENDL]y[-]'), '<color=#FF0000>x\ny</color>')
})

test('IsInRange 上界不含 / IsWithin 上界含, 且倒挂区间两边都换', () => {
  assert.equal(isInRange(10, 1, 10), false)
  assert.equal(isWithin(10, 1, 10), true)
  assert.equal(isInRange(10, 10, 1), false)   // 倒挂 ⇒ 先换成 (1,10) 再判, 上界仍不含 ⇒ 10 不在
  assert.equal(isWithin(10, 10, 1), true)     // 同一个区间换完是闭的, 10 在
})
