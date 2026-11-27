"""blender -b -P tools/blender.py -- input.glb output.glb (use 'pillar' for a new asset)."""
import sys
import bpy
from pathlib import Path

source, output = sys.argv[sys.argv.index("--") + 1:]
if Path(output).exists():
    raise SystemExit("Choose a fresh output path")
bpy.ops.wm.read_factory_settings(use_empty=True)
if source == "pillar":
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.5, depth=2)
    material = bpy.data.materials.new("Oxide")
    material.diffuse_color = (.66, .26, .12, 1)
    bpy.context.object.data.materials.append(material)
else:
    bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
for mesh in bpy.data.meshes:
    mesh.validate()
    mesh.update()
bpy.ops.export_scene.gltf(filepath=str(Path(output).resolve()), export_format="GLB")
