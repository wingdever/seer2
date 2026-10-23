// L1 · 小赛尔部件包（game/data/actor/*.bin）纯解析 + 帧动画数学 —— 供 A2 JS 回退图把"角色黄点"换成原版机器人。
// 血统 = AS3：解析规则照搬 game/maprunner/FrameSequence.as + 合成顺序/定位照搬 game/maprunner/ActorView.as；
//            帧推进/标签/方向照搬 core/animation/FramePlayer.as + core/entity/{PathMobile,Mobile,MoveStyle}.as。
// 分层（M-5）：本件**无 DOM / 无 fetch / 不 import app**；只用 ES 内置的 DataView/Uint8Array/TextDecoder。
// 交付给 L4 的是 {meta, png 字节}；createImageBitmap / drawImage（裁帧、合成、走位）全在 L4。
//
// ⚠️ FrameSequence.as:5 与 tools/extract-actor-packs.mjs:5 的注释写"内嵌位图 SWF"，**旧注释、不实**：
//    实测每个包 rest 段都是 `89 50 4e 47 …` 的 **PNG（带 alpha）**（as-built 登记差异，见 map-impl §7.3.8）。
// ⚠️ 字节序 = **大端**（AS3 ByteArray 默认，readShort/readBytes 皆大端；非小端）。

// —— 本件只负责**解析**（parsePack / pickFrame / frameRect / standFrame / labelStartFrame / localShadowFrame / vipShadowFrame）——
// 11 槽深度表与槽→部件映射**不在这里**：M8 起归 `actor-look.js`（`MDB8-b`）。

// AMF3 U29（大端 7-bit 组，高位=续接）：字符串长度藏在末字节的 bit0（1=内联，长度=值>>1）。
function readU29(u8, pos) {
  let val = 0, bytesRead = 0;
  for (let i = 0; i < 4; i++) {
    const b = u8[pos + i];
    val = (val << 7) | (b & 0x7f);
    bytesRead = i + 1;
    if ((b & 0x80) === 0) break;
  }
  return { value: val, size: bytesRead };
}

// 锚定切片取标签：不写整套 AMF3 对象解析，只找 `<0x03> <'i'|'l'> <0x06> <U29 len> <ascii>`。
// 控制字节 0x03/0x06 不会出现在可打印标签串里 ⇒ 锚点无歧义。缺 i/l 的包（UI_QuestionMark/SurpriseMark）
// ⇒ labels={}、**不抛**（解析路径与 8 件共用）。
function parseLabels(u8, start, end) {
  const td = new TextDecoder('utf-8');
  let iStr = null, lStr = null;
  for (let p = start; p + 2 < end; p++) {
    if (u8[p] !== 0x03 || u8[p + 2] !== 0x06) continue;
    const name = u8[p + 1];
    if (name !== 0x69 && name !== 0x6c) continue; // 'i'(0x69) / 'l'(0x6c)
    const { value, size } = readU29(u8, p + 3);
    const len = value >> 1;
    const s = p + 3 + size;
    if (s + len > end) continue;
    const str = td.decode(u8.subarray(s, s + len));
    if (name === 0x69) iStr = str; else lStr = str;
  }
  const labels = {};
  if (lStr == null || iStr == null) return labels;
  const names = lStr.split(',');
  const nums = iStr.split(',');
  for (let k = 0; k < names.length; k++) {
    labels[names[k]] = { start: parseInt(nums[k * 2], 10), end: parseInt(nums[k * 2 + 1], 10) };
  }
  return labels;
}

// 解析一个 .bin：head（帧尺寸/锚点/标签）+ info（每条裁帧记录）+ PNG 起始（IHDR 算 cols）。零拷贝交回 png。
export function parsePack(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const headLen = dv.getUint16(0);
  const head = 2;                                   // head 块起于字节 2
  const frameW = dv.getInt16(head);
  const frameH = dv.getInt16(head + 2);
  const totalFrames = dv.getInt16(head + 4);
  const anchorX = dv.getInt16(head + 6);
  const anchorY = dv.getInt16(head + 8);
  const labels = parseLabels(u8, head + 10, head + headLen); // AMF3 对象起于 head+10（5 个 short 之后）

  const infoLen = dv.getUint16(2 + headLen);
  const info = 4 + headLen;                          // info 块起于字节 4+headLen
  const unitW = dv.getInt16(info);
  const unitH = dv.getInt16(info + 2);
  const frameNum = dv.getInt16(info + 4);
  const infos = [];
  for (let i = 0; i < frameNum; i++) {
    const o = info + 6 + i * 12;                      // 每条 12 字节
    infos.push({
      key: dv.getInt16(o),
      ox: dv.getInt16(o + 2),
      oy: dv.getInt16(o + 4),
      w: dv.getInt16(o + 6),
      h: dv.getInt16(o + 8),
      si: dv.getInt16(o + 10)
    });
  }

  const restOff = 4 + headLen + infoLen;
  const sheetW = dv.getUint32(restOff + 16);          // PNG IHDR：宽高在大端 @rest+16/+20
  const sheetH = dv.getUint32(restOff + 20);
  const cols = unitW > 0 ? Math.floor(sheetW / unitW) : 1; // FrameSequence.as:70

  return {
    frameW, frameH, totalFrames, anchorX, anchorY, labels,
    unitW, unitH, frameNum, infos, sheetW, sheetH, cols,
    png: u8.subarray(restOff)                          // 零拷贝：整段 PNG
  };
}

// 第 f 帧取 key<=f 的**最后一条**，遇 key>f 即 break（FrameSequence.as:93 的原语义，infos 按 key 升序）。
// f<1 ⇒ null。⚠️ 1×1「隐藏」裁帧（EYE/HAND_R/FOOT_R 里有）**不在此跳过** —— 由 L4 绘制侧 `w<=1||h<=1` 略画。
export function pickFrame(pack, f) {
  if (f < 1) return null;
  let pick = null;
  const infos = pack.infos;
  for (let i = 0; i < infos.length; i++) {
    if (f >= infos[i].key) pick = infos[i];
    else break;
  }
  return pick;
}

// 由裁帧记录 + pack 元数据得 PNG spritesheet 的**源矩形**（纯数学；L4 拿去喂 9 参 drawImage）。
export function frameRect(pack, rec) {
  const col = rec.si % pack.cols;
  const row = Math.floor(rec.si / pack.cols);
  return { sx: col * pack.unitW, sy: row * pack.unitH, sw: rec.w, sh: rec.h };
}

// 站立帧号 = BODY.labels.standDown.start（实测=25，即 AS3 setLabel("standDown") 后首画帧）。
// 无标签 ⇒ 兜底常量 25；越界/非法 ⇒ 1。
export function standFrame(bodyPack) {
  const r = bodyPack.labels && bodyPack.labels.standDown;
  let start = r ? r.start : 25;
  if (!Number.isFinite(start) || start < 1 || start > bodyPack.totalFrames) start = 1;
  return start;
}

// 标签首帧（本层静姿，ALC13）：装备层的 stand 区间可能把“展示动作”编进去（如射手弓 `_1` 的
// standDown 25–97 是“举弓→拉弦→射箭→回位”），循环会无限射击 ⇒ 站立只画首帧。
export function labelStartFrame(pack, label) {
  const r = pack.labels && pack.labels[label];
  if (r && Number.isFinite(r.start) && r.start >= 1 && r.start <= pack.totalFrames) return r.start;
  return standFrame(pack);
}

// 本机玩家阴影 = `UI_ActorShadow` 的 `local` 静止帧（ALC14；ActorShadow.updateLabel：local 停 1 /
// remote 停 2 / vip 循环 3–39 的“光轮”）。⚠️ 不能拿 BODY 帧对 totalFrames 取模——那会在
// 普通阴影与 vip 光轮之间来回切，表现为脚下光轮闪烁出阴影。
export function localShadowFrame(shadowPack) {
  const r = shadowPack.labels && shadowPack.labels.local;
  if (r && Number.isFinite(r.start) && r.start >= 1 && r.start <= shadowPack.totalFrames) return r.start;
  return 1;
}

// 光轮帧号（VIP，MDB8-b3）：`UI_ActorShadow` 的 `vip` 标签（实测 3–39）按 tick 循环；
// 缺标签/越界 ⇒ 退回本机 `local` 帧。与 `cycleFrame` 分开是因为该包没有 `standDown`，
// `cycleFrame` 的兜底 `standFrame` 会落到一个不存在的语义帧。
export function vipShadowFrame(shadowPack, tick) {
  const r = shadowPack.labels && shadowPack.labels.vip;
  if (r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start) {
    const span = r.end - r.start + 1;
    const t = Number.isFinite(tick) ? Math.floor(tick) : 0;
    return r.start + ((t % span) + span) % span;
  }
  return localShadowFrame(shadowPack);
}

// 标签区间内循环取帧：FramePlayer.update 每 tick 先绘当前帧、再 +1，越过 end 回 start。
// 标签缺失/越界 ⇒ standFrame 兜底（裸装/装备各层共用，不抛）。
export function cycleFrame(pack, label, tick) {
  const r = pack.labels && pack.labels[label];
  if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end < r.start) return standFrame(pack);
  const span = r.end - r.start + 1;
  const t = Number.isFinite(tick) ? Math.floor(tick) : 0;
  return r.start + ((t % span) + span) % span;
}

// 动作标签 = MoveStyle.getStyleByDirection：run/stand + Up/Down（没有左右包，左右只靠 flip）。
export function labelOf(moving, up) {
  return (moving ? 'run' : 'stand') + (up ? 'Up' : 'Down');
}

// 方向位 = Mobile.direction（bit1=朝右、bit2=朝上）+ PathMobile.updateDirection：
// 纯水平段 dy=0 ⇒ Down；纯垂直段 dx=0 ⇒ 朝右；停止时不要调用（上游 stand 保留最后方向）。
export function stepDirection(dx, dy) {
  return { right: dx >= 0, up: dy < 0 };
}
