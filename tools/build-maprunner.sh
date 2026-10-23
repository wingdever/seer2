#!/bin/bash
# 编译地图交互容器 mapRunner.swf (可走 + A* 寻路 + 镜头跟随):
#   mxmlc + playerglobal 11.1,playerglobal 仅作编译期 external API 定义,
#   运行时 flash.* 由 Ruffle 提供。
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk
PG=$PWD/tools/vendor/flex/frameworks/libs/player/11.1/playerglobal.swc
[ -f "$PG" ] || { echo "missing playerglobal.swc (11.1) at $PG"; exit 1; }

$JAVA_HOME/bin/java -Xmx512m -Dsun.io.useCanonCaches=false \
  -jar tools/vendor/flex/lib/mxmlc.jar +flexlib=tools/vendor/flex/frameworks \
  -load-config=game/maprunner/build-config.xml \
  -source-path+=game/maprunner \
  -external-library-path+="$PG" \
  -target-player=11.1.0 -swf-version=14 \
  -output=game/maprunner/mapRunner.swf \
  game/maprunner/MapRunner.as

ls -la game/maprunner/mapRunner.swf
