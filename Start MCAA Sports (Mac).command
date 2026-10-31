#!/bin/bash
# ------------------------------------------------------------
#  MCAA Sports — double-click this file to start the website.
#  (First run downloads Node.js automatically, one time only.)
# ------------------------------------------------------------
cd "$(dirname "$0")" || exit 1
NODE_VER=v22.12.0

pause_and_exit() { echo; read -n 1 -s -r -p "  Press any key to close this window..."; echo; exit "${1:-0}"; }

if command -v node >/dev/null 2>&1 && node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>/dev/null; then
  NODE_BIN=node
elif [ -x ".node/bin/node" ]; then
  NODE_BIN=".node/bin/node"
else
  echo
  echo "  First-time setup: downloading Node.js (about 45 MB — only happens once)..."
  echo
  case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) echo "  Sorry, this computer type isn't supported."; pause_and_exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  rm -rf .node node.tgz && mkdir -p .node
  if curl -fL --progress-bar "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-$OS-$ARCH.tar.gz" -o node.tgz \
     && tar -xzf node.tgz -C .node --strip-components=1 && [ -x .node/bin/node ]; then
    rm -f node.tgz
    NODE_BIN=".node/bin/node"
  else
    rm -rf .node node.tgz
    echo
    echo "  Couldn't download Node.js. Check your internet and try again,"
    echo "  or install Node.js from https://nodejs.org and double-click this file again."
    pause_and_exit 1
  fi
fi

OPEN_BROWSER=1 "$NODE_BIN" server.js
echo
echo "  MCAA Sports has stopped."
pause_and_exit 0
