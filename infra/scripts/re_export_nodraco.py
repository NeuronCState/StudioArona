"""Re-export .glb WITHOUT Draco — removes decoder dependency."""
import bpy, os

scene = bpy.context.scene
blend = os.path.basename(bpy.data.filepath)
is_night = 'night' in blend.lower()
out_name = 'classroom-night' if is_night else 'classroom-day'

repo_root = os.path.abspath(os.path.join(
    os.path.dirname(bpy.data.filepath or "."), '..', '..', '..'))
glb_dir = os.path.join(repo_root, 'apps', 'web', 'public', 'assets', 'scenes')
os.makedirs(glb_dir, exist_ok=True)
glb_path = os.path.join(glb_dir, f'{out_name}.glb')

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH' and not obj.hide_render:
        obj.select_set(True)

print(f"Exporting {out_name}.glb (no Draco)...")
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_apply=True,
    export_image_format='WEBP',
    export_draco_mesh_compression_enable=False,
    use_selection=True,
    export_animations=False,
)
size_kb = os.path.getsize(glb_path) / 1024
print(f"Done: {glb_path} ({size_kb:.0f} KB)")
