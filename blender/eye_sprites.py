"""
Gaze sprites: the eyeball rendered alone (everything else held out) on a yaw/pitch grid,
cropped to the almond opening. The site composites the sprite nearest the visitor's cursor
over the loop video, so the eye follows you.

blender -b nicnac_throne.blend --python eye_sprites.py -- [pct=150] [samples=96] [cols=17] [rows=11]
Writes renders/eye/eye_RR_CC.png + renders/eye/eye.json
"""
import bpy, json, math, os, sys, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
PCT = int(args.get('pct', 150))
SAMPLES = int(args.get('samples', 96))
COLS = int(args.get('cols', 17))       # yaw steps
ROWS = int(args.get('rows', 11))       # pitch steps
YAW = math.radians(float(args.get('yaw', 32)))
PITCH = math.radians(float(args.get('pitch', 20)))
ONLY = args.get('only')                # e.g. "5,8" to render a single cell

scene = bpy.context.scene
HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, 'renders', 'eye')
os.makedirs(OUT, exist_ok=True)

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'METAL')
scene.cycles.device = 'GPU'

r = scene.render
r.resolution_x, r.resolution_y, r.resolution_percentage = 1920, 1080, PCT
r.film_transparent = True
r.use_motion_blur = False
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
scene.cycles.samples = SAMPLES
scene.frame_set(1)

eye = bpy.data.objects['Eyeball']
for ob in scene.objects:
    if ob.type in {'MESH', 'CURVE'} and ob is not eye:
        ob.is_holdout = True

# crop to the almond opening (projected rim points) + a small margin
cam = scene.camera
rim = bpy.data.objects['Rim']
dg = bpy.context.evaluated_depsgraph_get()
rim_eval = rim.evaluated_get(dg)
me = rim_eval.to_mesh()
pts = [rim_eval.matrix_world @ v.co for v in me.vertices]
rim_eval.to_mesh_clear()
uv = [world_to_camera_view(scene, cam, p) for p in pts]
u0, u1 = min(p.x for p in uv), max(p.x for p in uv)
v0, v1 = min(p.y for p in uv), max(p.y for p in uv)
mx, my = 4 / 1920, 4 / 1080
u0, u1, v0, v1 = max(u0 - mx, 0), min(u1 + mx, 1), max(v0 - my, 0), min(v1 + my, 1)
r.use_border = True
r.use_crop_to_border = True
r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = u0, u1, v0, v1

meta = {
    'frame': [1920, 1080],
    'scale': PCT / 100,
    # rect of the sprite inside the 1920x1080 frame, pixels, top-left origin
    'rect': [u0 * 1920, (1 - v1) * 1080, (u1 - u0) * 1920, (v1 - v0) * 1080],
    'cols': COLS, 'rows': ROWS,
    'yaw': math.degrees(YAW), 'pitch': math.degrees(PITCH),
    'file': 'eye_{r:02d}_{c:02d}.webp',
}
with open(os.path.join(OUT, 'eye.json'), 'w') as f:
    json.dump(meta, f)
print('RECT', meta['rect'], flush=True)

eye.rotation_mode = 'XYZ'
cells = [(ri, ci) for ri in range(ROWS) for ci in range(COLS)]
if ONLY:
    a, b = map(int, ONLY.split(','))
    cells = [(a, b)]
for ri, ci in cells:
    t0 = time.time()
    pitch_up = PITCH * (1 - 2 * ri / (ROWS - 1))     # row 0 = looking up
    yaw = YAW * (-1 + 2 * ci / (COLS - 1))           # col 0 = looking left
    eye.rotation_euler = (-pitch_up, 0, yaw)
    r.filepath = os.path.join(OUT, f'eye_{ri:02d}_{ci:02d}.png')
    bpy.ops.render.render(write_still=True)
    print(f'EYE {ri},{ci} {time.time() - t0:.1f}s', flush=True)
