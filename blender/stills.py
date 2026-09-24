"""
Editorial stills from the same scene (frame 1): macro iris, gold detail, exterior of the spiral.
blender -b nicnac_throne.blend --python stills.py -- [only=name] [pct=100] [samples=160]
"""
import bpy, math, os, sys, time
from mathutils import Vector

args = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
scene = bpy.context.scene
HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, 'renders', 'stills')
os.makedirs(OUT, exist_ok=True)

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'METAL')
scene.cycles.device = 'GPU'
scene.cycles.samples = int(args.get('samples', 160))
scene.render.use_motion_blur = False
scene.render.resolution_percentage = int(args.get('pct', 100))
scene.frame_set(1)

EYE = Vector((0, 24, 0))
cam = scene.camera
levels = sorted([o for o in scene.objects if o.name.startswith('Level_')], key=lambda o: o.name)


def world_of(level_idx):
    o = levels[level_idx]
    return o.matrix_world


SHOTS = {
    # the eye, three-quarter, razor-thin focus on the iris
    'about-iris': dict(res=(1400, 1750), loc=EYE + Vector((2.6, -10.5, 1.1)), look=EYE + Vector((0.1, -1.2, 0.05)),
                       lens=85, fstop=1.8, focus=EYE + Vector((0, -2.05, 0)), hide=[0, 1, 2]),
    # Production: looking through the gold at the eye; foreground frames melt into bokeh
    'svc-1': dict(res=(1200, 1600), loc=Vector((3.4, 7.5, -2.2)), look=EYE + Vector((0.4, 0, 0.9)),
                  lens=42, fstop=2.0, focus=EYE + Vector((0, -2.1, 0)), hide=[0, 1]),
    # Mix & finish: the eye in profile, rim and orb
    'svc-2': dict(res=(1200, 1600), loc=EYE + Vector((-4.2, -7.5, 3.6)), look=EYE + Vector((0, -0.6, 0.2)),
                  lens=62, fstop=2.2, focus=EYE + Vector((-0.5, -1.9, 0.4)), hide=[0, 1, 2, 3, 4], hide_obj=['EclipseSun']),
    # Full song: outside the spiral, the whole structure rising into the eye like a golden tornado
    'svc-3': dict(res=(1200, 1600), loc=Vector((30, 16, 2.5)), look=Vector((0, 23.5, 0)), lens=38, fstop=8,
                  focus=Vector((0, 22, 0)), hide=[0, 1, 2, 3], up=Vector((0, 1, 0)), hide_obj=['EclipseSun']),
}

only = args.get('only')
for name, s in SHOTS.items():
    if only and name != only:
        continue
    t0 = time.time()
    for o in levels:
        o.hide_render = False
    for i in s.get('hide', []):
        levels[i].hide_render = True
    for o in scene.objects:
        if o.name in ('EclipseSun',):
            o.hide_render = o.name in s.get('hide_obj', [])

    if 'level' in s:
        # frame the lower-left corner of a level, looking back toward the eye
        m = world_of(s['level'])
        corner = m @ Vector((math.cos(math.radians(210)), 0, math.sin(math.radians(210)))) * 0.92
        loc = corner + Vector((1.4, -3.8, 1.1))
        look = corner.lerp(EYE, 0.12)
        focus = corner
    else:
        loc, look, focus = s['loc'], s['look'], s['focus']

    cam.location = loc
    d = (look - loc).normalized()
    if 'up' in s:   # custom roll: make this world direction point up in frame
        z = -d
        y = (s['up'] - s['up'].dot(d) * d).normalized()
        x = y.cross(z)
        from mathutils import Matrix
        cam.rotation_euler = Matrix((x, y, z)).transposed().to_euler()
    else:
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = s['lens']
    cam.data.sensor_fit = 'AUTO'
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (focus - loc).length
    cam.data.dof.aperture_fstop = s['fstop']
    scene.render.resolution_x, scene.render.resolution_y = s['res']
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print(f'STILL {name} {time.time() - t0:.1f}s', flush=True)
