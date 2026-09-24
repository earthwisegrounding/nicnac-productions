"""
Render helper.  blender -b nicnac_throne.blend --python render.py -- key=value ...
  frames=1            single frame, "1-144" range, or "1,37,73"
  out=renders/test_#### output pattern (#### = frame)
  pct=50 samples=64   quick test settings
  w=1920 h=1080       override resolution
  mode=loop|eye       'eye' renders gaze sprites (see eye_sprites.py)
"""
import bpy, sys, os

args = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
scene = bpy.context.scene
HERE = os.path.dirname(bpy.data.filepath)

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'METAL')
scene.cycles.device = 'GPU'

if args.get('orient') == 'portrait':
    # same focal length *in pixels* as the 1920-wide landscape render, so eye sprites line up in both
    scene.render.resolution_x, scene.render.resolution_y = 1080, 1920
    cam = scene.camera.data
    cam.sensor_fit = 'HORIZONTAL'
    cam.sensor_width = 36.0 * 1080 / 1920
if 'pct' in args: scene.render.resolution_percentage = int(args['pct'])
if 'samples' in args: scene.cycles.samples = int(args['samples'])
if 'w' in args: scene.render.resolution_x = int(args['w'])
if 'h' in args: scene.render.resolution_y = int(args['h'])
if 'lens' in args: scene.camera.data.lens = float(args['lens'])
if 'mb' in args: scene.render.use_motion_blur = args['mb'] == '1'
if 'fog' in args or 'fogr' in args:
    fm = bpy.data.materials['Haze'].node_tree
    mr = next(n for n in fm.nodes if n.type == 'MAP_RANGE')
    if 'fog' in args: mr.inputs['To Min'].default_value = float(args['fog'])
    if 'fogr' in args: mr.inputs['From Max'].default_value = float(args['fogr'])
if 'aniso' in args:
    v = next(n for n in bpy.data.materials['Haze'].node_tree.nodes if n.type == 'PRINCIPLED_VOLUME')
    v.inputs['Anisotropy'].default_value = float(args['aniso'])
if 'halo' in args: bpy.data.lights['Halo'].energy = float(args['halo'])
if 'sun' in args:
    e = next(n for n in bpy.data.materials['EclipseSun'].node_tree.nodes if n.type == 'EMISSION')
    e.inputs['Strength'].default_value = float(args['sun'])
if 'key' in args: bpy.data.lights['Key'].energy = float(args['key'])
if 'env' in args:
    bg = [n for n in bpy.data.worlds['World'].node_tree.nodes if n.type == 'BACKGROUND']
    bg[0].inputs['Strength'].default_value = float(args['env'])
if 'exp' in args: scene.view_settings.exposure = float(args['exp'])
if 'look' in args: scene.view_settings.look = args['look'].replace('_', ' ')
if 'exr' in args:
    scene.render.image_settings.file_format = 'OPEN_EXR'

out = os.path.join(HERE, args.get('out', 'renders/test_####'))
spec = args.get('frames', '1')
if '-' in spec:
    a, b = map(int, spec.split('-'))
    frames = range(a, b + 1)
else:
    frames = [int(x) for x in spec.split(',')]

import time
for f in frames:
    t0 = time.time()
    scene.frame_set(f)
    scene.render.filepath = out.replace('####', f'{f:04d}')
    bpy.ops.render.render(write_still=True)
    print(f'FRAME {f} {time.time() - t0:.1f}s -> {scene.render.filepath}', flush=True)
