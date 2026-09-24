"""
NICNAC — "INFINITE THRONE"
A self-similar spiral of gold pyramid frames pouring out of a watching eye.

Every frame of the loop is a log-spiral transform of the previous: the whole
tunnel scales by 1/RATIO and twists by -TWIST about the vanishing point P over
LOOP frames, so level i+1 lands exactly where level i started -> a perfect,
infinite loop.

Run:  blender -b --factory-startup --python build_scene.py -- [out.blend]
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, 'nicnac_throne.blend')

# ---------------------------------------------------------------- params
FPS        = 24
LOOP       = 144            # frames per seamless loop (6s)
P_Y        = 44.0           # vanishing point (behind the eye)
EYE_Y      = 24.0           # eye centre
K          = 0.42           # cone slope: level circumradius / distance-to-P
RATIO      = 0.84           # scale step between levels
TWIST      = math.radians(14)
BAR        = 0.085          # bar width as a fraction of circumradius
DEPTH      = 0.07           # bar depth as a fraction of circumradius
N_LEVELS   = 26
EYE_R      = 2.05           # eyeball radius
LID_R      = 2.16           # lid shell radius
ALMOND_A   = 1.95           # almond half-width
ALMOND_B   = 0.92           # almond half-height
LENS       = 30.0
FOG_DENSITY = 0.0015
FOG_RADIUS  = 12.0
ECLIPSE_R   = 2.62
ECLIPSE_BACK = 3.0
ECLIPSE_STRENGTH = 6.0
HALO_W      = 80000
USE_VOLUME  = False         # True = real volumetric haze (≈3x slower)
GLOW_SIZE   = 34.0
GLOW_STRENGTH = 0.20

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'THRONE'


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def link_obj(obj, coll=None):
    (coll or scene.collection).objects.link(obj)
    return obj


# ---------------------------------------------------------------- materials
def make_gold():
    m = new_mat('Gold')
    nt = m.node_tree
    p = principled(m)
    p.inputs['Base Color'].default_value = (1.0, 0.72, 0.28, 1)
    p.inputs['Metallic'].default_value = 1.0
    p.inputs['Roughness'].default_value = 0.16
    p.inputs['Anisotropic'].default_value = 0.35
    p.inputs['Thin Film Thickness'].default_value = 0.0
    # subtle hammered variation in roughness + a whisper of thin-film at grazing angles
    tc = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 8.0
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value = 0.10
    ramp.inputs['To Max'].default_value = 0.26
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Value'])
    nt.links.new(ramp.outputs['Result'], p.inputs['Roughness'])
    fres = nt.nodes.new('ShaderNodeLayerWeight')
    fres.inputs['Blend'].default_value = 0.35
    film = nt.nodes.new('ShaderNodeMath')
    film.operation = 'MULTIPLY'
    film.inputs[1].default_value = 320.0
    nt.links.new(fres.outputs['Facing'], film.inputs[0])
    nt.links.new(film.outputs[0], p.inputs['Thin Film Thickness'])
    p.inputs['Thin Film IOR'].default_value = 1.45
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.04
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def make_eye():
    """Procedural iris on the eyeball sphere. Object -Y is the gaze axis."""
    m = new_mat('Eye')
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    p = principled(m)
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')

    tc = N.new('ShaderNodeTexCoord')
    nrm = N.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'
    L.new(tc.outputs['Object'], nrm.inputs[0])
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(nrm.outputs[0], sep.inputs[0])

    negy = N.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1
    L.new(sep.outputs['Y'], negy.inputs[0])
    ang = N.new('ShaderNodeMath'); ang.operation = 'ARCCOSINE'; L.new(negy.outputs[0], ang.inputs[0])
    IRIS = math.radians(40)
    rn = N.new('ShaderNodeMath'); rn.operation = 'DIVIDE'; rn.inputs[1].default_value = IRIS
    L.new(ang.outputs[0], rn.inputs[0])                                         # 0 centre .. 1 iris edge
    phi = N.new('ShaderNodeMath'); phi.operation = 'ARCTAN2'
    L.new(sep.outputs['X'], phi.inputs[0]); L.new(sep.outputs['Z'], phi.inputs[1])

    # polar coords -> streaky fibres
    comb = N.new('ShaderNodeCombineXYZ')
    phis = N.new('ShaderNodeMath'); phis.operation = 'MULTIPLY'; phis.inputs[1].default_value = 9.0
    L.new(phi.outputs[0], phis.inputs[0]); L.new(phis.outputs[0], comb.inputs['X'])
    rns = N.new('ShaderNodeMath'); rns.operation = 'MULTIPLY'; rns.inputs[1].default_value = 0.6
    L.new(rn.outputs[0], rns.inputs[0]); L.new(rns.outputs[0], comb.inputs['Y'])
    fib = N.new('ShaderNodeTexNoise'); fib.inputs['Scale'].default_value = 3.2
    fib.inputs['Detail'].default_value = 12; fib.inputs['Roughness'].default_value = 0.62
    fib.inputs['Distortion'].default_value = 0.4
    L.new(comb.outputs[0], fib.inputs['Vector'])

    iris_ramp = N.new('ShaderNodeValToRGB')
    cr = iris_ramp.color_ramp
    cr.elements[0].position = 0.25; cr.elements[0].color = (0.0, 0.012, 0.22, 1)
    cr.elements[1].position = 0.78; cr.elements[1].color = (0.05, 0.30, 1.0, 1)
    e = cr.elements.new(0.52); e.color = (0.006, 0.07, 0.75, 1)
    L.new(fib.outputs['Fac'], iris_ramp.inputs['Fac'])

    # radial structure: gold collarette near the pupil, dark limbal ring at the edge
    radial = N.new('ShaderNodeValToRGB')
    rr = radial.color_ramp
    rr.interpolation = 'EASE'
    rr.elements[0].position = 0.0;  rr.elements[0].color = (0, 0, 0, 1)        # pupil
    rr.elements[1].position = 1.0;  rr.elements[1].color = (0.004, 0.006, 0.03, 1)  # sclera
    for pos, col in [(0.30, (0, 0, 0, 1)), (0.335, (1.0, 0.62, 0.12, 1)), (0.43, (0.55, 0.40, 0.25, 1)),
                     (0.50, (1, 1, 1, 1)), (0.84, (1, 1, 1, 1)), (0.93, (0.05, 0.05, 0.12, 1)),
                     (0.985, (0.02, 0.03, 0.10, 1))]:
        el = rr.elements.new(pos); el.color = col
    L.new(rn.outputs[0], radial.inputs['Fac'])

    # multiply iris fibres into the white band of the radial ramp
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    L.new(radial.outputs['Color'], mix.inputs[6]); L.new(iris_ramp.outputs['Color'], mix.inputs[7])
    L.new(mix.outputs[2], p.inputs['Base Color'])

    # emission only inside the iris band
    band = N.new('ShaderNodeMapRange'); band.interpolation_type = 'SMOOTHSTEP'
    band.inputs['From Min'].default_value = 1.0; band.inputs['From Max'].default_value = 0.88
    L.new(rn.outputs[0], band.inputs['Value'])
    pup = N.new('ShaderNodeMapRange'); pup.interpolation_type = 'SMOOTHSTEP'
    pup.inputs['From Min'].default_value = 0.30; pup.inputs['From Max'].default_value = 0.36
    L.new(rn.outputs[0], pup.inputs['Value'])
    em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'
    L.new(band.outputs[0], em.inputs[0]); L.new(pup.outputs[0], em.inputs[1])
    ems = N.new('ShaderNodeMath'); ems.operation = 'MULTIPLY'; ems.inputs[1].default_value = 0.9
    L.new(em.outputs[0], ems.inputs[0])
    L.new(mix.outputs[2], p.inputs['Emission Color'])
    L.new(ems.outputs[0], p.inputs['Emission Strength'])

    p.inputs['Roughness'].default_value = 0.35
    p.inputs['Coat Weight'].default_value = 1.0
    p.inputs['Coat Roughness'].default_value = 0.015
    p.inputs['Coat IOR'].default_value = 1.376
    return m


def make_obsidian():
    m = new_mat('Obsidian')
    p = principled(m)
    p.inputs['Base Color'].default_value = (0.004, 0.004, 0.006, 1)
    p.inputs['Roughness'].default_value = 0.16
    p.inputs['Coat Weight'].default_value = 0.6
    p.inputs['Coat Roughness'].default_value = 0.02
    return m


GOLD = make_gold()
EYE_MAT = make_eye()

# ---------------------------------------------------------------- level mesh
def triangle_frame_mesh():
    """Unit-circumradius triangle ring in the XZ plane, apex up (+Z)."""
    me = bpy.data.meshes.new('TriFrame')
    bm = bmesh.new()
    angs = [math.radians(90 + 120 * i) for i in range(3)]
    ri = 1.0 - 2 * BAR
    outer = [bm.verts.new((math.cos(a), 0, math.sin(a))) for a in angs]
    inner = [bm.verts.new((ri * math.cos(a), 0, ri * math.sin(a))) for a in angs]
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return me


tri_mesh = triangle_frame_mesh()
tri_mesh.materials.append(GOLD)

proto = bpy.data.objects.new('TriProto', tri_mesh)
link_obj(proto)
sol = proto.modifiers.new('Solidify', 'SOLIDIFY'); sol.thickness = DEPTH; sol.offset = 0
bev = proto.modifiers.new('Bevel', 'BEVEL'); bev.width = 0.012; bev.segments = 4
bev.limit_method = 'ANGLE'; bev.harden_normals = False
# bake modifiers into the shared mesh so every level is a cheap linked duplicate
dg = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(proto.evaluated_get(dg))
baked.name = 'TriFrameBaked'
for poly in baked.polygons:
    poly.use_smooth = True
bpy.data.objects.remove(proto)

# ---------------------------------------------------------------- tunnel rig
P = bpy.data.objects.new('P_Spiral', None)
link_obj(P)
P.location = (0, P_Y, 0)
P.rotation_mode = 'XYZ'

tunnel = bpy.data.collections.new('Tunnel'); scene.collection.children.link(tunnel)
D0 = P_Y * 1.12
for i in range(N_LEVELS):
    d = D0 * RATIO ** i
    ob = bpy.data.objects.new(f'Level_{i:02d}', baked)
    link_obj(ob, tunnel)
    ob.parent = P
    ob.location = (0, -d, 0)
    ob.rotation_euler = (0, i * TWIST, 0)
    ob.scale = (K * d,) * 3

# exponential scale + linear twist keyed every frame -> steady log-spiral motion
scene.frame_start, scene.frame_end = 1, LOOP
scene.render.fps = FPS
for f in range(-3, LOOP + 5):   # keys past both ends so motion blur is identical at the seam
    t = (f - 1) / LOOP
    s = RATIO ** (-t)
    P.scale = (s, s, s)
    P.rotation_euler = (0, -TWIST * t, 0)
    P.keyframe_insert('scale', frame=f)
    P.keyframe_insert('rotation_euler', frame=f)
ad = P.animation_data.action
try:
    fcurves = ad.fcurves
except AttributeError:  # Blender 5 layered actions
    fcurves = [fc for layer in ad.layers for strip in layer.strips
               for bag in strip.channelbags for fc in bag.fcurves]
for fc in fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = 'LINEAR'

# ---------------------------------------------------------------- the eye
eye_coll = bpy.data.collections.new('Eye'); scene.collection.children.link(eye_coll)

bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=EYE_R, location=(0, EYE_Y, 0))
eyeball = bpy.context.active_object; eyeball.name = 'Eyeball'
bpy.ops.object.shade_smooth()
eyeball.data.materials.append(EYE_MAT)
for c in eyeball.users_collection: c.objects.unlink(eyeball)
eye_coll.objects.link(eyeball)
eyeball.rotation_mode = 'XYZ'

# almond (vesica) opening: two circles of radius rho centred at z = +-c
c_off = (ALMOND_A ** 2 - ALMOND_B ** 2) / (2 * ALMOND_B)
rho = c_off + ALMOND_B


def almond_pts(n=160, grow=0.0):
    pts = []
    half = math.asin(ALMOND_A / rho)
    for k in range(n):
        u = k / n
        if u < 0.5:   # upper arc (circle centred below), left -> right
            a = -half + (u / 0.5) * 2 * half
            x, z = (rho + grow) * math.sin(a), -c_off + (rho + grow) * math.cos(a)
        else:         # lower arc, right -> left
            a = half - ((u - 0.5) / 0.5) * 2 * half
            x, z = (rho + grow) * math.sin(a), c_off - (rho + grow) * math.cos(a)
        pts.append((x, z))
    return pts


# lid shell: front cap of a sphere, almond cut out
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=160, v_segments=96, radius=LID_R)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.radians(90), 3, 'X'))
# keep only the camera-facing half (y < 0.55)
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0.55, 0), plane_no=(0, 1, 0), clear_outer=True)
# remove faces whose projected (x,z) lies inside the almond
to_del = []
for f in bm.faces:
    cx = sum(v.co.x for v in f.verts) / len(f.verts)
    cz = sum(v.co.z for v in f.verts) / len(f.verts)
    inside = (cx ** 2 + (cz + c_off) ** 2 < rho ** 2) and (cx ** 2 + (cz - c_off) ** 2 < rho ** 2)
    if inside:
        to_del.append(f)
bmesh.ops.delete(bm, geom=to_del, context='FACES')
lid_me = bpy.data.meshes.new('Lids'); bm.to_mesh(lid_me); bm.free()
lids = bpy.data.objects.new('Lids', lid_me); link_obj(lids, eye_coll)
lids.location = (0, EYE_Y, 0)
lid_me.materials.append(make_obsidian())
m = lids.modifiers.new('Solidify', 'SOLIDIFY'); m.thickness = 0.07; m.offset = 1
m = lids.modifiers.new('Bevel', 'BEVEL'); m.width = 0.02; m.segments = 3; m.limit_method = 'ANGLE'
for poly in lid_me.polygons:
    poly.use_smooth = True

# gold rim tube tracing the opening on the lid surface (the logo's outline)
cu = bpy.data.curves.new('Rim', 'CURVE'); cu.dimensions = '3D'
cu.bevel_depth = 0.13; cu.bevel_resolution = 6
sp = cu.splines.new('POLY')
pts = almond_pts(220, grow=0.02)
sp.points.add(len(pts) - 1)
for k, (x, z) in enumerate(pts):
    r2 = max(LID_R ** 2 - x * x - z * z, 0.0)
    sp.points[k].co = (x, -math.sqrt(r2) - 0.02, z, 1)
sp.use_cyclic_u = True
rim = bpy.data.objects.new('Rim', cu); link_obj(rim, eye_coll)
rim.location = (0, EYE_Y, 0)
cu.materials.append(GOLD)

# ---------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new('Cam'); cam_data.lens = LENS
cam_data.clip_start = 0.05; cam_data.clip_end = 400
cam = bpy.data.objects.new('Cam', cam_data); link_obj(cam)
cam.location = (0, 0, 0); cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam

# ---------------------------------------------------------------- lighting
world = bpy.data.worlds.new('World'); scene.world = world
try:
    pass
except Exception:
    pass
wn, wl = world.node_tree.nodes, world.node_tree.links
for n in list(wn):
    wn.remove(n)
wout = wn.new('ShaderNodeOutputWorld')
env = wn.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(HERE, 'hdri', 'studio_small_09.hdr'))
mapping = wn.new('ShaderNodeMapping'); tcw = wn.new('ShaderNodeTexCoord')
mapping.inputs['Rotation'].default_value = (0, 0, math.radians(200))
wl.new(tcw.outputs['Generated'], mapping.inputs['Vector']); wl.new(mapping.outputs[0], env.inputs['Vector'])
bg = wn.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.9
wl.new(env.outputs['Color'], bg.inputs['Color'])
black = wn.new('ShaderNodeBackground'); black.inputs['Color'].default_value = (0, 0, 0, 1)
lp = wn.new('ShaderNodeLightPath')
mixw = wn.new('ShaderNodeMixShader')
hide = wn.new('ShaderNodeMath'); hide.operation = 'MAXIMUM'
wl.new(lp.outputs['Is Camera Ray'], hide.inputs[0]); wl.new(lp.outputs['Is Volume Scatter Ray'], hide.inputs[1])
wl.new(hide.outputs[0], mixw.inputs['Fac'])
wl.new(bg.outputs[0], mixw.inputs[1]); wl.new(black.outputs[0], mixw.inputs[2])
wl.new(mixw.outputs[0], wout.inputs['Surface'])

# volumetric haze box (scene-wide)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, P_Y * 0.5, 0))
fog = bpy.context.active_object; fog.name = 'Haze'
fog.scale = (120, P_Y * 1.6, 120)
fog_m = new_mat('Haze')
fn = fog_m.node_tree.nodes
for n in list(fn):
    if n.type == 'BSDF_PRINCIPLED':
        fn.remove(n)
fl = fog_m.node_tree.links
vol = fn.new('ShaderNodeVolumePrincipled')
vol.inputs['Anisotropy'].default_value = 0.85
vol.inputs['Color'].default_value = (0.8, 0.85, 1.0, 1)
# density hugs the tunnel axis so the frame edges fall to black
geo = fn.new('ShaderNodeNewGeometry')
sxyz = fn.new('ShaderNodeSeparateXYZ'); fl.new(geo.outputs['Position'], sxyz.inputs[0])
cxz = fn.new('ShaderNodeCombineXYZ')
fl.new(sxyz.outputs['X'], cxz.inputs['X']); fl.new(sxyz.outputs['Z'], cxz.inputs['Z'])
rad = fn.new('ShaderNodeVectorMath'); rad.operation = 'LENGTH'; fl.new(cxz.outputs[0], rad.inputs[0])
fall = fn.new('ShaderNodeMapRange'); fall.interpolation_type = 'SMOOTHERSTEP'
fall.inputs['From Min'].default_value = 0.0; fall.inputs['From Max'].default_value = FOG_RADIUS
fall.inputs['To Min'].default_value = FOG_DENSITY; fall.inputs['To Max'].default_value = 0.0
fl.new(rad.outputs['Value'], fall.inputs['Value'])
fl.new(fall.outputs['Result'], vol.inputs['Density'])
fl.new(vol.outputs[0], next(n for n in fn if n.type == 'OUTPUT_MATERIAL').inputs['Volume'])
fog.data.materials.append(fog_m)
fog.visible_shadow = False
if not USE_VOLUME:
    bpy.data.objects.remove(fog)

    # cheap stand-in for the haze: a soft blue glow card deep in the tunnel.
    # Levels in front of it silhouette against it exactly like backlit fog, at a fraction of the cost.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, P_Y - 3.0, 0), rotation=(math.radians(90), 0, 0))
    card = bpy.context.active_object; card.name = 'GlowCard'
    card.scale = (GLOW_SIZE, GLOW_SIZE, 1)
    gm = new_mat('GlowCard'); gn, gl = gm.node_tree.nodes, gm.node_tree.links
    for n in list(gn):
        if n.type == 'BSDF_PRINCIPLED':
            gn.remove(n)
    gtc = gn.new('ShaderNodeTexCoord')
    glen = gn.new('ShaderNodeVectorMath'); glen.operation = 'LENGTH'
    gl.new(gtc.outputs['Object'], glen.inputs[0])
    gfall = gn.new('ShaderNodeMapRange'); gfall.interpolation_type = 'SMOOTHERSTEP'
    gfall.inputs['From Min'].default_value = 0.0; gfall.inputs['From Max'].default_value = 0.5
    gfall.inputs['To Min'].default_value = 1.0; gfall.inputs['To Max'].default_value = 0.0
    gl.new(glen.outputs['Value'], gfall.inputs['Value'])
    gpow = gn.new('ShaderNodeMath'); gpow.operation = 'POWER'; gpow.inputs[1].default_value = 2.8
    gl.new(gfall.outputs['Result'], gpow.inputs[0])
    gstr = gn.new('ShaderNodeMath'); gstr.operation = 'MULTIPLY'; gstr.inputs[1].default_value = GLOW_STRENGTH
    gl.new(gpow.outputs[0], gstr.inputs[0])
    gem = gn.new('ShaderNodeEmission'); gem.inputs["Color"].default_value = (0.10, 0.20, 0.85, 1)
    gl.new(gstr.outputs[0], gem.inputs['Strength'])
    gl.new(gem.outputs[0], next(n for n in gn if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
    card.data.materials.append(gm)
    card.visible_shadow = False
    card.visible_glossy = False
    card.visible_diffuse = False

# the "sun" being eclipsed: an emitter just larger (in screen space) than the orb, sitting behind it
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=ECLIPSE_R, location=(0, EYE_Y + ECLIPSE_BACK, 0))
sun = bpy.context.active_object; sun.name = 'EclipseSun'
bpy.ops.object.shade_smooth()
sun_m = new_mat('EclipseSun')
sn = sun_m.node_tree.nodes
for n in list(sn):
    if n.type == 'BSDF_PRINCIPLED':
        sn.remove(n)
emis = sn.new('ShaderNodeEmission')
emis.inputs['Color'].default_value = (0.42, 0.62, 1.0, 1)
emis.inputs['Strength'].default_value = ECLIPSE_STRENGTH
sun_m.node_tree.links.new(emis.outputs[0], next(n for n in sn if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
sun.data.materials.append(sun_m)
sun.visible_shadow = False

# backlight at the vanishing point -> every frame in the spiral throws a shaft at camera
bl = bpy.data.lights.new('Halo', 'SPOT'); bl.energy = HALO_W; bl.color = (0.34, 0.54, 1.0)
bl.shadow_soft_size = 0.35; bl.spot_size = math.radians(75); bl.spot_blend = 0.6
halo = bpy.data.objects.new('Halo', bl); link_obj(halo); halo.location = (0, P_Y + 1.0, 0)
halo.rotation_euler = (math.radians(90), 0, 0)
halo.rotation_euler = (Vector((0, 0, 0)) - halo.location).to_track_quat('-Z', 'Y').to_euler()


# warm key from camera-left above for gold highlights
kd = bpy.data.lights.new('Key', 'AREA'); kd.energy = 9000; kd.size = 8; kd.color = (1.0, 0.82, 0.62)
key = bpy.data.objects.new('Key', kd); link_obj(key)
key.location = (-14, 6, 10)
kd.volume_factor = 0.0
key.rotation_euler = (Vector((0, EYE_Y, 0)) - key.location).to_track_quat('-Z', 'Y').to_euler()
# eye catchlight: tiny bright area high-right, gives the logo's white specular dot
cd = bpy.data.lights.new('Catch', 'AREA'); cd.energy = 400; cd.size = 0.6; cd.volume_factor = 0.0
catch = bpy.data.objects.new('Catch', cd); link_obj(catch)
catch.location = (2.4, EYE_Y - 7.0, 2.6)
catch.rotation_euler = (Vector((0, EYE_Y, 0)) - catch.location).to_track_quat('-Z', 'Y').to_euler()
catch.visible_camera = False

# ---------------------------------------------------------------- render settings
r = scene.render
r.engine = 'CYCLES'
r.resolution_x, r.resolution_y = 1920, 1080
r.resolution_percentage = 100
r.film_transparent = False
cy = scene.cycles
cy.device = 'GPU'
cy.samples = 64
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
cy.max_bounces = 8; cy.glossy_bounces = 6; cy.transmission_bounces = 4
cy.volume_bounces = 1; cy.transparent_max_bounces = 8
cy.volume_step_rate = 4.0
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 1.0
r.use_motion_blur = True
r.motion_blur_shutter = 0.45
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - High Contrast'
scene.view_settings.exposure = 0.0
r.image_settings.file_format = 'PNG'
r.image_settings.color_depth = '8'

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'METAL')

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT)
