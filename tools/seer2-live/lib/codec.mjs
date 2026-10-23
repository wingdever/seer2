// 赛尔号2 在线服协议的 JS 转写，逐行照抄 vendor/seer2-origin-as3：
//   seer2/next/fcc/CLibInit.as        KEY + XOR/移位（不是原生库，反编译源就在仓库里）
//   seer2/next/fcc/MEncrypt.as        ┐ 两个薄封装
//   seer2/next/fcc/MDecrypt.as        ┘
//   core/net/message/MessageEncrypt.as  头部 6 字节不加密 + 回填总长
//   core/net/message/RequestPacker.as   packHead 与校验和
//   core/net/message/Message.as         HEAD_LENGTH = 18
//   core/net/TcpSocket.as               4 字节 LE 长度分帧
//
// AS3 的 ByteArray 下标是「读无符号字节、写截断到 8 位」，JS 这边用 Uint8Array
// 天然满足；但位运算一律发生在 int 上，所以每次写回都要 & 0xFF，否则移位溢出。
//
// 自测：node tools/seer2-live/lib/codec.mjs

export const HEAD_LENGTH = 18;
const NO_ENCRYPT_LEN = 6;
const KEY = [116, 97, 111, 109, 101, 101, 95, 115, 101, 101, 114, 50, 95, 107, 95, 126, 35, 116];
const KEY_RAW = 'taomee_seer2_k_~#t';

const bytes = (...chunks) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};
const u32 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);
const u16 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
const readU32 = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const readU16 = (b, at) => (b[at] | (b[at + 1] << 8)) >>> 0;
export const hex = (b) => Buffer.from(b).toString('hex');

// CLibInit.Desc —— 序列号是协议号/长度/上一号的函数，纯 AS3，无原生依赖。
export function desc(cid, len, lastSeq) {
  const t = Math.trunc(lastSeq / 7);
  return (cid % 13 + len % 21 + lastSeq + 147 - t) | 0;
}

// CLibInit.encrypt
function fccEncrypt(src) {
  const out = new Uint8Array(src.length + 1); // 尾部多一字节，decrypt 靠它读 j+1
  const len = src.length;
  let i = NO_ENCRYPT_LEN;
  for (let j = NO_ENCRYPT_LEN; j < len; j++) {
    if (i === KEY.length) i = 0;
    out[j] = KEY[i] ^ src[j];
    i++;
  }
  for (let j = out.length - 1; j > NO_ENCRYPT_LEN; j--) {
    out[j] = (out[j] | (out[j - 1] >> 3)) & 0xFF;
    out[j - 1] = (out[j - 1] << 5) & 0xFF;
  }
  out[NO_ENCRYPT_LEN] = (out[NO_ENCRYPT_LEN] | 3) & 0xFF;
  return out;
}

// CLibInit.decrypt —— 移位回滚：低 3 位来自本字节的 >>5，高 5 位来自下一字节的 <<3。
function fccDecrypt(src) {
  const out = new Uint8Array(src.length - 1);
  const len = out.length;
  let i = NO_ENCRYPT_LEN;
  for (let j = NO_ENCRYPT_LEN; j < len; j++) {
    if (i === KEY.length) i = 0;
    out[j] = ((src[j] >> 5) | (src[j + 1] << 3)) & 0xFF;
    out[j] = (out[j] ^ KEY[i]) & 0xFF;
    i++;
  }
  return out;
}

// MDecrypt 先把 wire[6..] 搬进一个「前 6 字节为 0」的缓冲区，再解密。
function mDecrypt(wire, payloadLen) {
  const buf = new Uint8Array(6 + payloadLen);
  buf.set(wire.subarray(6, 6 + payloadLen), 6);
  return fccDecrypt(buf);
}

// MessageEncrypt.encrypt：入参是明文 head+body（head[0..3] 已写着总长）。
export function encrypt(headBody) {
  const payloadLen = readU32(headBody, 0) - NO_ENCRYPT_LEN;
  const proto = readU16(headBody, 4);
  const enc = fccEncrypt(headBody);
  const out = bytes(u32(0), u16(proto), enc.subarray(6));
  out.set(u32(out.length), 0); // 回填总长（含尾部那一个多出来的字节）
  out.set(u16(proto), 4);
  return out;
}

// MessageEncrypt.decrypt：入参是一个完整 wire 帧。
export function decrypt(wire) {
  const payloadLen = readU32(wire, 0) - NO_ENCRYPT_LEN;
  const proto = readU16(wire, 4);
  const plain = mDecrypt(wire, payloadLen);
  const out = bytes(u32(0), plain.subarray(4));
  out.set(u16(proto), 4);
  out.set(u32(out.length), 0);
  return out;
}

// RequestPacker.packHead —— 顺序照抄：先写 4+2+4+4（Desc 推进静态序列号并写回），
// 再累加已写的前 14 字节与整个 body 求校验和，最后补上第 14..17 字节。
export function packHead(sessionId, proto, body) {
  const totalLen = HEAD_LENGTH + body.length;
  const head = new Uint8Array(HEAD_LENGTH);
  head.set(u32(totalLen), 0);
  head.set(u16(proto), 4);
  head.set(u32(sessionId), 6);
  head.set(u32((packHead.sequence = desc(proto, totalLen, packHead.sequence)) | 0), 10);
  let sum = 0;
  for (let k = 0; k < 14; k++) sum += head[k];
  for (let k = 0; k < body.length; k++) sum += body[k];
  head.set(u32(sum % 100000), 14);
  return head;
}
packHead.sequence = 0;

function serialize(fields) {
  const chunks = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'string') chunks.push(Buffer.from(v, 'utf8')); // writeUTFBytes
    else if (v instanceof Uint8Array) chunks.push(v); // writeBytes
    else chunks.push(u32(v >>> 0)); // writeUnsignedInt
  };
  walk(fields);
  return bytes(...chunks);
}

// RequestPacker.pack —— 一帧请求的明文组包 + 加密，可直接写进 socket。
export function pack(sessionId, proto, fields) {
  const body = serialize(fields);
  return encrypt(bytes(packHead(sessionId, proto, body), body));
}

// Message.parseHead
export function parseHead(plain) {
  return {
    length: readU32(plain, 0),
    commandId: readU16(plain, 4),
    userId: readU32(plain, 6),
    sequenceIndex: readU32(plain, 10),
    statusCode: readU32(plain, 14),
    body: plain.subarray(HEAD_LENGTH, readU32(plain, 0)),
  };
}

// TcpSocket.onSocketData —— MSG_FIRST_TOKEN_LEN = 4，且要求 available > 4 才尝试取长度。
export function makeFramer(onMessage) {
  let temp = new Uint8Array(0);
  return {
    push(chunk) {
      const buf = bytes(temp, chunk);
      temp = new Uint8Array(0);
      let pos = 0;
      while (buf.length - pos > 0) {
        const avail = buf.length - pos;
        if (avail <= 4) { temp = buf.subarray(pos); return; }
        const total = readU32(buf, pos);
        const payloadLen = total - 4;
        if (payloadLen > avail - 4) { temp = buf.subarray(pos); return; }
        onMessage(buf.subarray(pos, pos + 4 + payloadLen));
        pos += 4 + payloadLen;
      }
    },
    get pending() { return temp.length; },
  };
}

// —— 已知命令（vendor + dll/Seer2CoreDLL.swf 反编译一致）——
export const CMD = { DEPUTIZE_SEND_999: 999, ONLINE_LOGIN_1001: 1001 };

// org/taomee/utils/StringUtil.ipToBytes：点分十进制逐段 writeByte。
export function ipToBytes(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || +p > 255)) throw new Error('bad ip: ' + ip);
  return new Uint8Array(parts.map((p) => +p));
}

// MainEntry.getTopLeftTmcid：LittleEndianByteArray.length = 64，写 tab；tab 空/none 时写 "0"。
export function tab64(tab) {
  const s = tab == null || tab === '' || tab === 'none' ? '0' : String(tab);
  const out = new Uint8Array(64); // ByteArray 定长后补 0
  out.set(Buffer.from(s, 'utf8').subarray(0, 64));
  return out;
}

// Connection.send(ONLINE_LOGIN_1001, fromGame, session, tab64)
// session 是 ByteArray → serializeBinary 走 writeBytes 原样拷，不带长度前缀。
export function build1001(uid, fromGame, session, tab) {
  return pack(uid, CMD.ONLINE_LOGIN_1001, [fromGame >>> 0, bytes(session), tab64(tab)]);
}

// Connection.send(DEPUTIZE_SEND_999, ipToBytes(onlineIP), ByteArray.writeShort(onlinePort))
export function build999(uid, ip, port) {
  return pack(uid, CMD.DEPUTIZE_SEND_999, [ipToBytes(ip), u16(port)]);
}

// —— 自测 ——
const results = [];
const ok = (cond, name, extra = '') => { results.push([!!cond, name, extra]); return !!cond; };

function selfTest() {
  // 1) 字节级往返：encrypt → decrypt 必须拿回原明文（长度字段回填后一致）
  const samples = [];
  for (let n = 0; n <= 40; n++) {
    const body = new Uint8Array(n);
    for (let k = 0; k < n; k++) body[k] = (k * 37 + 11) & 0xFF;
    const head = new Uint8Array(HEAD_LENGTH);
    head.set(u32(HEAD_LENGTH + n), 0);
    head.set(u16(1001 + n), 4);
    head.set(u32(20261013), 6);
    head.set(u32(desc(1001 + n, HEAD_LENGTH + n, n)), 10);
    head.set(u32(98765), 14);
    samples.push(bytes(head, body));
  }
  let bad = null;
  for (const plain of samples) {
    const wire = encrypt(plain);
    const back = decrypt(wire);
    if (back.length !== plain.length) { bad = { plain, back, why: 'length' }; break; }
    for (let k = 0; k < plain.length; k++) if (back[k] !== plain[k]) { bad = { plain, back, why: 'byte ' + k }; break; }
    if (bad) break;
  }
  ok(!bad, 'roundtrip encrypt→decrypt 逐字节相等', bad ? bad.why + ' ' + hex(bad.plain) + ' vs ' + hex(bad.back) : samples.length + ' 个样本（body 0..40 字节）');

  // 2) 帧长自洽：wire 长度 = 明文长度(18+body) + 1 个尾部补齐字节
  const head = packHead(7, 1001, new Uint8Array(4));
  const wire = encrypt(bytes(head, new Uint8Array(4)));
  ok(readU32(wire, 0) === wire.length, 'wire 头部长度字段与实际字节数自洽', readU32(wire, 0) + ' == ' + wire.length);

  // 3) 前 6 字节明文可读：长度 + 协议号不经加密
  const frame = pack(12345, 1001, [1, 2, 'abc']);
  ok(readU16(frame, 4) === 1001, '帧头 6 字节不加密（协议号直接可读）', 'proto=' + readU16(frame, 4) + ' len=' + readU32(frame, 0));

  // 4) Desc 与序列号递推：跟 AS3 的整数除法（向零截断）一致，含负数
  ok(desc(1001, 22, 0) === 1001 % 13 + 22 % 21 + 0 + 147 - 0, 'Desc 首值', String(desc(1001, 22, 0)));
  ok(desc(13, 21, -8) === 0 + 0 + -8 + 147 - Math.trunc(-8 / 7), 'Desc 负序列号走截断除法而非 floor', String(desc(13, 21, -8)));
  let seq = 0;
  const seqs = [];
  for (let k = 0; k < 6; k++) { seq = desc(1001, 30, seq); seqs.push(seq); }
  ok(seqs.every((v, i) => i === 0 || v > 0), '序列号连续推进不塌缩', seqs.join(' → '));

  // 5) 校验和取模
  const h = packHead(1, 999, new Uint8Array(600).fill(255));
  ok(readU32(h, 14) < 100000, '校验和 %= 100000', String(readU32(h, 14)));

  // 6) 分帧器：把一帧拆成任意切片喂进去，重组结果必须与原帧一致
  const got = [];
  const fr = makeFramer((m) => got.push(m));
  const a = pack(1, 1001, ['x']), b = pack(2, 1033, [7, 8]);
  const stream = bytes(a, b);
  for (let at = 0; at < stream.length; at += 7) fr.push(stream.subarray(at, Math.min(at + 7, stream.length)));
  ok(got.length === 2 && hex(got[0]) === hex(a) && hex(got[1]) === hex(b), '分帧器跨包重组', '2 帧 / 待凑 ' + fr.pending + ' 字节');

  // 7) parseHead 往返：解出的字段要能对上发出去的值
  const m = parseHead(decrypt(pack(961073968, 1001, ['hello'])));
  ok(m.commandId === 1001 && m.userId === 961073968, 'parseHead 解出 commandId/userId',
    'cmd=' + m.commandId + ' uid=' + m.userId + ' seq=' + m.sequenceIndex + ' sum=' + m.statusCode);

  // 8) 1001 字段布局：body = 4 字节 fromGame + session 原样 + 64 字节 tab
  const session = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01]);
  const p1001 = parseHead(decrypt(build1001(961073968, 10, session, 'abc')));
  const b1001 = p1001.body;
  ok(b1001.length === 4 + session.length + 64, '1001 body = fromGame(4) + session(N) + tab(64)', b1001.length + 'B');
  ok(readU32(b1001, 0) === 10 && hex(b1001.subarray(4, 4 + session.length)) === hex(session),
    '1001 前两段字段对位', 'fromGame=' + readU32(b1001, 0) + ' session=' + hex(b1001.subarray(4, 4 + session.length)));
  ok(Buffer.from(b1001.subarray(4 + session.length, 4 + session.length + 3)).toString() === 'abc'
    && b1001.subarray(4 + session.length + 3).every((v) => v === 0), '1001 tab 定长 64 且尾部补 0');
  const emptyTab = parseHead(decrypt(build1001(1, 10, new Uint8Array(1), 'none'))).body;
  ok(emptyTab[emptyTab.length - 64] === 0x30, 'tab 为 "none" 时写 "0"', String.fromCharCode(emptyTab[emptyTab.length - 64]));

  // 9) 999 代理帧：body = 4 字节 IP + 2 字节端口（LE short）
  const b999 = parseHead(decrypt(build999(0, '118.89.149.189', 1205))).body;
  ok(b999.length === 6 && [...b999.subarray(0, 4)].join('.') === '118.89.149.189' && readU16(b999, 4) === 1205,
    '999 body = ipToBytes(4) + writeShort(port)', [...b999.subarray(0, 4)].join('.') + ':' + readU16(b999, 4));
  let rejected = false;
  try { ipToBytes('118.89.149'); } catch { rejected = true; }
  ok(rejected, 'ipToBytes 拒绝非 4 段地址');
}

if (import.meta.url === 'file://' + new URL(import.meta.url).pathname) {
  selfTest();
  for (const [pass, name, extra] of results) console.log((pass ? '✔ ' : '✘ ') + name + (extra ? '  ' + extra : ''));
  const failed = results.filter(([p]) => !p).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' 通过；KEY_RAW=' + KEY_RAW);
  process.exit(failed ? 1 : 0);
}
