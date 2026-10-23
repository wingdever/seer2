// R6 技能卡行（docs/view/scene/battle/view-scene-battle-impl.md §6.5）。上游 BattlePetSkillView：4 固定槽、空槽 SetActive(false)。
// 权威 pitch = ShowNormalSkillInfo 那条 `80 + 175 * index`（:164/:173 的 infoPrompt 定位就是卡心 x），
// 卡盒 155×82 垂直居中于 Content（Content 中心 487.5 ⇒ 卡顶 447 ⇒ 绝对 x 从 80 起）。
// 本模块挂在 .rbb-content(71.5,437.5,700,100) 里，所以画之前把权威绝对盒换算成 content 局部；两处数值同源，别各写一份。
import { el, text, sprite, elementIcon } from './_kit.js'
import { skillPP } from '/game/core/battle/views.js'
import { BattleRule } from '/game/core/battle/settings.js'
import { SkillType } from '/game/core/pet/skill.js'

const CARD = [80, 447, 155, 82]     // 绝对设计盒（权威）
const PITCH = 175
const ORIGIN = [71.5, 437.5]       // .rbb-content 的左上角，绝对盒 − 它 = content 局部

const typeName = (t) => Object.keys(SkillType).find((k) => SkillType[k] === Number(t)) ?? String(t)

// 一条技能的右下消耗：口径分流读 driver.rule()（Anger/PP），数值读内核 skill 本身，面板不判买不买得起。
function costFor(skill, rule) {
  if (rule === BattleRule.PP) return `PP: ${skillPP(skill)}/${skill.maxPP}`
  return `怒气: ${skill.anger}`
}

// create(container, { onSelect }) → update(driver)
export function create(container, { onSelect }) {
  const row = el('rbb-skills')
  container.append(row)

  return function update(driver) {
    row.textContent = ''
    const rule = driver.rule()
    // 可用性只读内核：driver.skillList() 的 usable 来自 getAvailableSkills（怒气/PP 判在那边）。
    for (const [i, item] of driver.skillList().normals.entries()) {
      if (!item) continue                     // 空槽不建节点（上游 SetActive(false)，不占位不画灰框）
      const s = item.skill
      const passive = Number(s.type) === SkillType.被动   // SelectNormalSkill 对被动技直接 return
      const card = el('rbb-skill' + (item.usable ? '' : ' rbb-skill--off'))
      card.dataset.skillId = String(s.id)
      card.style.left = `${CARD[0] + PITCH * i - ORIGIN[0]}px`
      card.style.top = `${CARD[1] - ORIGIN[1]}px`
      card.style.width = `${CARD[2]}px`
      card.style.height = `${CARD[3]}px`
      card.style.backgroundImage = `url("${sprite('Skill normal.png')}")`

      const badge = el('rbb-skill-elem')
      badge.style.backgroundImage = `url("${elementIcon(s.elementId)}")`
      card.append(badge)

      const name = text('rbb-skill-name', s.name ?? '')
      // BattlePetSkillView 的字号自适应：20 − max(字数, 6)（6 字→14、8 字→12…）。
      name.style.fontSize = `${20 - Math.max(String(s.name ?? '').length, 6)}px`
      card.append(name,
        text('rbb-skill-power', `威力: ${s.power ?? 0}`),
        text('rbb-skill-cat', typeName(s.type)),
        text('rbb-skill-cost', costFor(s, rule)))

      if (passive) card.dataset.passive = '1'
      else if (item.usable && onSelect) card.addEventListener('click', () => onSelect(s.id))
      row.append(card)
    }
  }
}
