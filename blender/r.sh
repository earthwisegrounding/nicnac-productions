#!/bin/zsh
# usage: ./r.sh key=val ...   (renders from nicnac_throne.blend via render.py)
cd "$(dirname "$0")"
blender -b nicnac_throne.blend --python render.py -- "$@" 2>&1 | grep -E "^FRAME|Error|Traceback"
