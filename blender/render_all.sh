#!/bin/zsh
# Full production render queue. ~70 min on an M1 Max.
cd "$(dirname "$0")"
set -e
echo "== eye sprites $(date)"
blender -b nicnac_throne.blend --python eye_sprites.py -- yaw=26 pitch=16 cols=17 rows=11 2>&1 | grep -E "^(EYE|RECT)|Error"
echo "== landscape loop $(date)"
mkdir -p renders/loop_land renders/loop_port
blender -b nicnac_throne.blend --python render.py -- frames=1-144 samples=64 out=renders/loop_land/f_#### 2>&1 | grep -E "^FRAME|Error"
echo "== portrait loop $(date)"
blender -b nicnac_throne.blend --python render.py -- frames=1-144 samples=64 orient=portrait out=renders/loop_port/f_#### 2>&1 | grep -E "^FRAME|Error"
echo "== done $(date)"
