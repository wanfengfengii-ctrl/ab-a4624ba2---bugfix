#!/bin/sh
# 站点 HTTP 冒烟：健康端点、首页内容、首页引用的 JS 资源均须可访问
set -eu

BASE="${SMOKE_BASE_URL:-http://localhost}"
echo "冒烟目标：$BASE"

body="$(wget -q -O - "$BASE/healthz")"
case "$body" in
  *ok*) echo "  /healthz -> 200 ok" ;;
  *) echo "  /healthz 异常：$body" >&2; exit 1 ;;
esac

wget -q -O /tmp/index.html "$BASE/"
grep -q '<title>多载波卫星测控改频规划工作台</title>' /tmp/index.html
echo "  / 首页标题检查通过"

asset="$(sed -n 's/.*src="\(\/assets\/[^"]*\.js\)".*/\1/p' /tmp/index.html | head -n 1)"
if [ -z "$asset" ]; then
  echo "  未在首页找到 JS 资源引用" >&2
  exit 1
fi
wget -q -O /dev/null "$BASE$asset"
echo "  $asset 资源可访问（HTTP 200）"

echo "冒烟通过"
