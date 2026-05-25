"""
Blender Python script — bake procedural materials to textures, export .glb.

Two-pass approach:
  1. Collect unique materials that need baking (no existing image textures)
  2. Bake each unique material ONCE (on the first object that uses it)
  3. Export .glb with Draco + embedded textures

Usage:
  Blender --background <blend-file> --python infra/scripts/bake_classroom.py
"""

import bpy
import os
import sys

RESOLUTION = 1024
TEXTURE_FORMAT = "WEBP"


def ensure_uv(obj):
    if obj.type != 'MESH':
        return
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="BakeUV")
    # Smart UV project if UV layer is empty
    uv = mesh.uv_layers[0]
    if uv and len(uv.data) == 0:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')


def needs_baking(mat):
    """Return True if the material is procedural (no image textures yet)."""
    if not mat or not mat.use_nodes:
        return False
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and getattr(n, 'image', None) is not None:
            return False  # already has textures
    return True


def bake_single_material(mat, obj, scene):
    """Bake DIFFUSE pass for one material onto one object. Returns baked image."""
    name = bpy.path.clean_name(mat.name)
    img = bpy.data.images.new(f"bkd_{name}", RESOLUTION, RESOLUTION, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    img.file_format = 'PNG'

    nodes = mat.node_tree.nodes
    # Find output
    out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not out_node:
        print(f"  SKIP {mat.name}: no output node")
        return None

    # Create temp tex node as bake target
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (out_node.location.x - 400, out_node.location.y)
    tex.select = True
    nodes.active = tex

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    print(f"  Baking {mat.name}...", end=" ", flush=True)
    try:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
        img.save_render(filepath=os.path.join(
            os.path.dirname(bpy.data.filepath or "."), "baked_textures", f"{name}.png"))
        print(f"OK ({RESOLUTION}px)")
    except Exception as e:
        print(f"FAILED: {e}")
        nodes.remove(tex)
        return None

    # Replace node tree: Principled BSDF + baked texture
    nodes.clear()
    new_tex = nodes.new('ShaderNodeTexImage')
    new_tex.image = img
    new_tex.location = (-600, 200)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (-200, 200)
    bsdf.inputs['Roughness'].default_value = 0.5
    new_out = nodes.new('ShaderNodeOutputMaterial')
    new_out.location = (100, 200)
    mat.node_tree.links.new(new_tex.outputs['Color'], bsdf.inputs['Base Color'])
    mat.node_tree.links.new(bsdf.outputs['BSDF'], new_out.inputs['Surface'])
    return img


def export_glb(scene):
    """Export all visible meshes as .glb with embedded textures."""
    blend = os.path.basename(bpy.data.filepath)
    is_night = 'night' in blend.lower()
    out_name = 'classroom-night' if is_night else 'classroom-day'

    # Output to StudioJavis/apps/web/public/assets/scenes/
    glb_dir = '/Users/zhangxuanning/Desktop/StudioJavis/apps/web/public/assets/scenes'
    os.makedirs(glb_dir, exist_ok=True)
    glb_path = os.path.join(glb_dir, f'{out_name}.glb')

    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and not obj.hide_render:
            obj.select_set(True)

    print(f"Exporting to {glb_path}...")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_apply=True,
        export_image_format=TEXTURE_FORMAT,
        export_draco_mesh_compression_enable=False,
        use_selection=True,
        export_animations=False,
    )
    size_kb = os.path.getsize(glb_path) / 1024
    print(f"Exported: {glb_path} ({size_kb:.0f} KB)")


def main():
    print(f"\n=== Bake Script v2 ({RESOLUTION}px DIFFUSE, {TEXTURE_FORMAT}) ===\n")

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.bake_samples = 64
    scene.render.bake_margin = 16
    scene.render.use_bake_clear = True

    # ── Pass 1: collect unique procedural materials ──
    to_bake = {}  # mat_name -> (material, first_object)
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.hide_render:
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat and mat.name not in to_bake and needs_baking(mat):
                ensure_uv(obj)
                to_bake[mat.name] = (mat, obj)

    if not to_bake:
        print("No procedural materials found — all already textured.\n")
    else:
        print(f"Found {len(to_bake)} materials to bake:\n")
        for i, (name, (mat, obj)) in enumerate(to_bake.items(), 1):
            print(f"  [{i}/{len(to_bake)}] {name} (on {obj.name})")

        # ── Pass 2: bake each unique material once ──
        ok = 0
        for name, (mat, obj) in to_bake.items():
            result = bake_single_material(mat, obj, scene)
            if result:
                ok += 1
        print(f"\nDone: {ok}/{len(to_bake)} baked successfully\n")

    # ── Pass 3: export ──
    export_glb(scene)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
