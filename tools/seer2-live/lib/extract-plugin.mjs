// 从 projects/ 下的改服 Linux 客户端 deb 中取出 Linux 版 Flash PPAPI 插件，缓存到 ~/.cache/seer2-live/
// 插件本体不入库（19.5 MB，且属于 Adobe/第三方再分发），deb 是唯一来源。
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DEB_NAME = 'seer2-next-client-Linux-1.1.3-amd64.deb';
export const PLUGIN_ENTRY = './opt/seer2-next-client/resources/runtime/linux/x64/libpepflashplayer64_34_0_0_330.dll';
export const FLASH_VERSION = '34.0.0.330';

const CACHE_DIR = join(homedir(), '.cache', 'seer2-live', 'flash');
const PLUGIN_PATH = join(CACHE_DIR, PLUGIN_ENTRY.split('/').pop());

export function pluginPath() {
  return PLUGIN_PATH;
}

export function hasPlugin() {
  try {
    return statSync(PLUGIN_PATH).size > 1000 * 1000;
  } catch {
    return false;
  }
}

// 返回 { path, version, from: 'cache'|'deb' }
export async function ensurePlugin(repoRoot) {
  if (hasPlugin()) return { path: PLUGIN_PATH, version: FLASH_VERSION, from: 'cache' };

  const deb = join(repoRoot, 'projects', DEB_NAME);
  if (!existsSync(deb)) throw new Error(`deb 不存在: ${deb}`);

  mkdirSync(CACHE_DIR, { recursive: true });
  const work = join(CACHE_DIR, '.extract');
  mkdirSync(work, { recursive: true });

  // deb = ar 归档；数据在 data.tar.xz 里，Electron 运行时那层用 bsdtar 解单个文件
  await run('ar', ['x', deb], { cwd: work, maxBuffer: 1 << 26 });
  await run('bsdtar', ['-xf', join(work, 'data.tar.xz'), '--strip-components=7', PLUGIN_ENTRY], {
    cwd: CACHE_DIR,
    maxBuffer: 1 << 26,
  });

  if (!hasPlugin()) {
    throw new Error(`解包后未找到插件，期望 ${PLUGIN_PATH}（deb 结构可能已变）`);
  }
  return { path: PLUGIN_PATH, version: FLASH_VERSION, from: 'deb' };
}
