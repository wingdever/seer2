// 从同一个 deb 里准备可运行的 Electron 11.5.0 (Chromium 87) Linux 运行时，
// 并把我们的 app 目录挂成 resources/app（原 app.asar 改名，不改动 deb 与仓库文件）。
import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, chmodSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DEB_NAME = 'seer2-next-client-Linux-1.1.3-amd64.deb';
export const CACHE_ROOT = join(homedir(), '.cache', 'seer2-live');
const DEB_DIR = join(CACHE_ROOT, 'deb');
const RUNTIME_DIR = join(CACHE_ROOT, 'runtime');
const BIN_NAME = 'seer2-next-client';

function debRoot() {
  return join(DEB_DIR, 'opt', BIN_NAME);
}

async function extractDeb(repoRoot) {
  const deb = resolve(repoRoot, 'projects', DEB_NAME);
  if (!existsSync(deb)) throw new Error(`deb 不存在: ${deb}`);
  if (existsSync(join(debRoot(), BIN_NAME))) return debRoot();

  mkdirSync(DEB_DIR, { recursive: true });
  await run('ar', ['x', deb], { cwd: DEB_DIR, maxBuffer: 1 << 26 });
  await run('bsdtar', ['-xf', join(DEB_DIR, 'data.tar.xz')], { cwd: DEB_DIR, maxBuffer: 1 << 26 });
  return debRoot();
}

function link(absTarget, linkPath) {
  if (existsSync(linkPath) || safeReadlink(linkPath)) return;
  symlinkSync(absTarget, linkPath);
}

function safeReadlink(p) {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

// exe 必须是真实拷贝而不是符号链接：Electron 用 /proc/self/exe 定位 resources/，
// 链接会把路径解析回 deb 目录，从而启动官方客户端自己的 app.asar 而不是我们的 app。
function materializeExe(srcBin, dstBin) {
  if (existsSync(dstBin) && statSync(dstBin).size === statSync(srcBin).size) return;
  copyFileSync(srcBin, dstBin);
  chmodSync(dstBin, 0o755);
}

// 返回 { bin, resourcesDir, electronDir }
export async function ensureRuntime(repoRoot, appDir) {
  const src = await extractDeb(repoRoot);
  mkdirSync(RUNTIME_DIR, { recursive: true });

  const resourcesSrc = join(src, 'resources');
  for (const name of readdirSync(src)) {
    if (name === 'resources') continue;
    if (name === BIN_NAME) materializeExe(join(src, name), join(RUNTIME_DIR, name));
    else link(join(src, name), join(RUNTIME_DIR, name));
  }

  const resourcesDir = join(RUNTIME_DIR, 'resources');
  mkdirSync(resourcesDir, { recursive: true });
  for (const name of readdirSync(resourcesSrc)) {
    if (name === 'app.asar') continue; // 官方客户端自己的 asar 让位给我们的 app
    link(join(resourcesSrc, name), join(resourcesDir, name));
  }
  const appLink = join(resourcesDir, 'app');
  if (safeReadlink(appLink) && readlinkSync(appLink) !== resolve(appDir)) {
    rmSync(appLink);
  }
  link(resolve(appDir), appLink);

  const bin = join(RUNTIME_DIR, BIN_NAME);
  return { bin, resourcesDir, electronDir: RUNTIME_DIR, exeName: BIN_NAME };
}

export { RUNTIME_DIR, DEB_DIR };
