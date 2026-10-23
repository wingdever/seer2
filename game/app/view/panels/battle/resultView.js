// 结算视图 —— 读 state.result（BattleResult）：胜负走 .isMyWin/.isOpWin，结束走 .isBattleEnd。
// 数字/判定全在内核 result 里，面板只把它映射成文案 + 一张 Fight 结算图。退出确认复用 U0 hintbox。
import { el, text, bg } from './_kit.js'
import { openHintbox } from '../hintbox.js'
import { BattleResultState } from '/game/core/battle/result.js'

const CN = {
  [BattleResultState.Win]: '胜利', [BattleResultState.Lose]: '失败',
  [BattleResultState.MyEscape]: '逃跑（我方）', [BattleResultState.OpEscape]: '对方逃跑',
  [BattleResultState.CaptureSuccess]: '捕捉成功', [BattleResultState.Timeout]: '超时',
  [BattleResultState.Error]: '异常结束',
}

export function showResult(container, driver, { onExit, meta } = {}) {
  const res = driver.outcome()
  const win = res.isMyWin && !res.isCapture
  const box = el('rbb-result')
  box.style.backgroundImage = bg(res.isCapture ? 'fight result capture.png' : (win ? 'fight result win.png' : 'fight result lose.png'))
  const label = text('rbb-result-label', CN[res.state] || `结束(${res.state})`)
  box.append(label)
  container.append(box)
  // 元游戏摘要（经验/升级/图鉴新见）—— 由 game/logic 结算产出，本视图只如实成文，不自算数。
  const lines = []
  let borrowedExp = false
  for (const e of meta || []) {
    if (e.type === 'exp.awarded') { lines.push(`获得经验 ${e.total} (每只 +${e.share})`); if (e.curve === 'borrowed-A/B-shape') borrowedExp = true }
    if (e.type === 'pet.levelup') lines.push(`升级 Lv${e.from} → Lv${e.to}`)
    if (e.type === 'evolve.done') lines.push(`进化 → ${e.name}`)
    if (e.type === 'team.healed') lines.push('队伍全愈送回')
  }
  if (borrowedExp) lines.push('经验曲线: 借用官方 A/B 形状（内核 exp 系数待 S6 真值）')
  openHintbox({
    title: '战斗结束',
    contentSize: 16,
    optionNum: 1,
    content: `${label.textContent}\n数据源：重启内核 result.state=${res.state}` + (lines.length ? `\n${lines.join('\n')}` : ''),
    onConfirm: () => { box.remove(); onExit?.() },
  })
}
