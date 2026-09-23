#!/usr/bin/env bash
# 无头 Chrome 截图 / DOM 提取
#
#   shot.sh <url> <out.png> [WxH] [budget_ms]     截图
#   shot.sh --dom <url> [budget_ms]               导出渲染后的 DOM
#
# 例：
#   bash shot.sh http://127.0.0.1:5173/grassland.html /tmp/a.png 1400,900
#   bash shot.sh --dom http://127.0.0.1:5173/grassland.html | node -e '...'
#
# 环境变量：
#   SHOT_TIMEOUT   超时秒数（默认 60，卡住时不会无限等）
#   SHOT_CHROME    手动指定浏览器可执行文件
set -uo pipefail

CHROME="${SHOT_CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
    "/usr/bin/google-chrome" "/usr/bin/chromium" "/usr/bin/chromium-browser"; do
    if [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then
  echo "找不到 Chrome/Edge。请用 SHOT_CHROME=<路径> 指定。" >&2
  exit 1
fi

TIMEOUT="${SHOT_TIMEOUT:-60}"

# Chrome 是 Windows 程序，收到的必须是 Windows 形式路径（F:/x/y.png），
# 不能是 Git Bash 的 /f/x/y.png
winpath() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

# 通用参数：--disable-gpu 必须加，否则本机 GPU 进程会崩
COMMON=(--headless=new --no-sandbox --disable-gpu)

if [ "${1:-}" = "--dom" ]; then
  URL="${2:?用法: shot.sh --dom <url> [budget_ms]}"
  BUDGET="${3:-6000}"
  timeout "$TIMEOUT" "$CHROME" "${COMMON[@]}" \
    --dump-dom --virtual-time-budget="$BUDGET" "$URL" 2>/dev/null
  exit $?
fi

URL="${1:-}"
OUT="${2:-}"
[ -z "$URL" ] || [ -z "$OUT" ] && { echo "用法: shot.sh <url> <out.png> [WxH] [budget_ms]" >&2; exit 2; }
SIZE="${3:-1400,900}"
BUDGET="${4:-6000}"

rm -f "$OUT"
timeout "$TIMEOUT" "$CHROME" "${COMMON[@]}" \
  --hide-scrollbars --screenshot="$(winpath "$OUT")" \
  --window-size="$SIZE" --virtual-time-budget="$BUDGET" "$URL" >/dev/null 2>&1
code=$?

if [ -f "$OUT" ]; then
  echo "已保存 $OUT ($(wc -c <"$OUT") 字节)"
  exit 0
fi
if [ "$code" -eq 124 ]; then
  echo "截图超时（${TIMEOUT}s）。若页面是 WebGL，本机 GPU 进程会崩，属预期，见 SKILL.md。" >&2
else
  echo "截图失败 exit=$code。若页面是 WebGL，本机 GPU 进程会崩，属预期，见 SKILL.md。" >&2
fi
exit "$code"
