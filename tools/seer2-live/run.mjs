// 拉起本地承载端：node tools/seer2-live/run.mjs [-- --flag=value ...]
// 环境变量透传给 Electron 主进程（SEER2_*）。
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensurePlugin } from './lib/extract-plugin.mjs';
import { ensureRuntime } from './lib/ensure-runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const appDir = join(here, 'app');

const sep = process.argv.indexOf('--');
const extraArgs = sep === -1 ? [] : process.argv.slice(sep + 1);

const plugin = await ensurePlugin(repoRoot);
const runtime = await ensureRuntime(repoRoot, appDir);

console.log('[run] flash plugin:', plugin.path, plugin.version, '(' + plugin.from + ')');
console.log('[run] electron   :', runtime.bin);
console.log('[run] app        :', appDir);

const child = spawn(runtime.bin, ['--no-sandbox', '--disable-gpu', ...extraArgs], {
  cwd: runtime.electronDir,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: runtime.electronDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''),
    SEER2_FLASH_PLUGIN: plugin.path,
    SEER2_FLASH_VERSION: plugin.version,
    SEER2_LIVE_ROOT: here,
    SEER2_REPO_ROOT: repoRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
  stdio: 'inherit',
});

child.on('exit', (code, sig) => {
  console.log('[run] exit code=' + code + ' signal=' + sig);
  process.exit(code === 0 ? 0 : 1);
});

// Electron 是 stdio:'inherit' 的独立子进程，不转发的话 SIGTERM 只会杀掉这层壳，留下窗口。
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
