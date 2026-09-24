"""
Make the Meshy "Sharing the Stage" model web-ready: decimate, feet on the floor, smaller textures,
Draco-compressed GLB with WebP textures.

blender -b <meshy.blend> --python figure_export.py -- out=<file.glb> [ratio=0.08] [tex=1536] [ntex=1024]
"""
import bpy, os, sys
from mathutils import Vector

args = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
OUT = args['out']
RATIO = float(args.get('ratio', 0.08))
TEX = int(args.get('tex', 1536))
NTEX = int(args.get('ntex', 1024))

ob = bpy.data.objects['Mesh_0']
bpy.context.view_layer.objects.active = ob
for o in bpy.context.scene.objects:
    o.select_set(o is ob)

m = ob.modifiers.new('Decimate', 'DECIMATE')
m.ratio = RATIO
m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=m.name)

# feet on the floor, centred on X/Y, ~1.8 units tall
bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
ob.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mat = ob.data.materials[0]
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
# people aren't metal: drop the metal/roughness map, use a soft constant roughness
# collect first: removing a link invalidates the others' pointers mid-iteration
drop = [l for l in nt.links if l.to_node == bsdf and l.to_socket.name in ('Metallic', 'Roughness')]
for link in drop:
    nt.links.remove(link)
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.62
seps = [n for n in nt.nodes if n.type == 'SEPARATE_COLOR']
srcs = {l.from_node.name for n in seps for l in n.inputs[0].links}
for n in seps:
    nt.nodes.remove(n)
for name in srcs:
    n = nt.nodes.get(name)
    if n and n.type == 'TEX_IMAGE' and not any(o.links for o in n.outputs):
        nt.nodes.remove(n)

base = bsdf.inputs['Base Color'].links[0].from_node.image
nrm_node = next((n for n in nt.nodes if n.type == 'NORMAL_MAP'), None)
nrm = nrm_node.inputs['Color'].links[0].from_node.image if nrm_node and nrm_node.inputs['Color'].links else None
base.scale(TEX, TEX)
if nrm:
    nrm.scale(NTEX, NTEX)

print('FACES', len(ob.data.polygons), 'DIMS', tuple(round(x, 3) for x in ob.dimensions), flush=True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_image_format='WEBP',
    export_image_quality=82,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_yup=True,
    export_apply=True,
)
print('EXPORTED', OUT, os.path.getsize(OUT), flush=True)
