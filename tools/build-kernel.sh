#!/bin/bash
# 构建单机对战内核 battle-kernel.js:
#   回合规则层来自 arcadia-eternity/packages/battle (TS, MPL-2.0)。
#   本脚本做:  浅稀疏克隆 → 安装 battle 依赖闭包 → 逐包构建 →
#              把 game/kernel/glue.ts 注入 packages/battle → rolldown 打成单文件 ESM →
#              输出 game/battle-kernel.js (自包含, 无外部 import, 供浏览器 <script type=module> 载入)。
# 仅个人学习用途, 不对外分发。可重复运行 (幂等)。
set -e
cd "$(dirname "$0")/.."
REPO=$PWD
ARC=${ARCADIA_DIR:-/tmp/arcadia}
GLUE=game/kernel/glue.ts

if [ ! -d "$ARC/packages/battle" ]; then
  echo "[1/4] 克隆 arcadia-eternity (sparse: battle + 依赖包 + packs) ..."
  git clone --depth 1 --filter=blob:none --sparse https://github.com/arcadia-eternity/arcadia-eternity "$ARC"
  git -C "$ARC" sparse-checkout set \
    packages/battle packages/engine packages/const packages/schema packages/interface \
    packages/engine-plugins packs
fi

if [ ! -d "$ARC/packages/battle/node_modules" ]; then
  echo "[2/4] 安装 battle 依赖闭包 ..."
  ( cd "$ARC" && pnpm install --filter "@arcadia-eternity/battle..." --ignore-scripts )
  echo "      逐包构建 (const/engine/schema/plugins/interface/battle) ..."
  ( cd "$ARC" && pnpm --filter "@arcadia-eternity/battle..." --sort run build )
fi

echo "[3/4] 注入胶水层并打包 ..."
cp "$GLUE" "$ARC/packages/battle/glue.ts"
( cd "$ARC/packages/battle" && pnpm exec rolldown glue.ts --format esm -o "$REPO/game/battle-kernel.js" )

echo "[4/4] 校验 ..."
test -s "$REPO/game/battle-kernel.js"
if grep -q "^import " "$REPO/game/battle-kernel.js"; then echo "警告: 产物仍有外部 import"; else echo "OK: 自包含 $(wc -c < "$REPO/game/battle-kernel.js") 字节 -> game/battle-kernel.js"; fi
