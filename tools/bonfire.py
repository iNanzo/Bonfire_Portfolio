# Procedural bonfire scene for the portfolio hero.
#
# Run through tools/build-model.mjs (or directly):
#   blender --background --factory-startup --python tools/bonfire.py -- <project root>
#
# Outputs:
#   assets/source/bonfire.blend        editable source scene
#   assets/source/bonfire-preview.png  solid-shaded preview render
#   public/models/bonfire.glb          Draco-compressed model for Three.js
#
# Geometry only: flat-shaded low-poly meshes with solid colors. The pixel-art
# look (palette, dithering, outlines) is applied by the Three.js renderer.
# Object names matter — the site looks up "Weapon_*", "CandleFlame_*" and
# "Glow_*" to animate them. The fire itself is a particle system in Three.js.

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weapons  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(argv[0] if argv else os.getcwd())
SEED = 11
random.seed(SEED)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# --- Materials ---------------------------------------------------------------

def hex_to_linear(h):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def material(name, hex_color, emissive=False):
    m = bpy.data.materials.new(name)
    rgb = hex_to_linear(hex_color)
    m.diffuse_color = (*rgb, 1.0)  # viewport / workbench color
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = m.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = next(n for n in m.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
        m.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


# Albedo colors are chosen so that, once lit by the fire and quantized, they
# land on the intended palette entries (stone, wood, ember...).
M = {
    "ground": material("Ground", "#221d2a"),
    "flagstone": material("Flagstone", "#57536b"),
    "stone": material("Stone", "#6a6680"),
    "pillar": material("Pillar", "#5d5a73"),
    "wood": material("Wood", "#8a6547"),
    "char": material("Charred", "#3a2c28"),
    "ash": material("Ash", "#716d7c"),
    "ash_dark": material("AshDark", "#5e5a68"),
    "iron": material("Iron", "#9a97b0"),
    # Weapons: dark, worn metal and leather, shaded in a few flat tones.
    "w_edge": material("W_Edge", "#a6a3b6"),
    "w_steel": material("W_Steel", "#66637a"),
    "w_dark": material("W_Dark", "#383645"),
    "w_iron": material("W_Iron", "#3b3945"),
    "w_leather": material("W_Leather", "#3d2b23"),
    "w_wrap": material("W_Wrap", "#262029"),
    "w_wood": material("W_Wood", "#4a3629"),
    "w_brass": material("W_Brass", "#6f5a2e"),
    "w_cloth": material("W_Cloth", "#5a1e24"),
    "dark": material("DarkIron", "#4d4a5e"),
    "brass": material("Brass", "#b08a3a"),
    "leather": material("Leather", "#5a3a2a"),
    "wrap": material("Wrap", "#35283a"),
    "grip": material("Grip", "#6b2330"),
    "wax": material("Wax", "#e9e3d2"),
    "mortar": material("Mortar", "#2a2633"),
    "ember": material("Ember", "#e0582a", emissive=True),
    "flame_core": material("FlameCore", "#ffc76a", emissive=True),
}


# --- Helpers -----------------------------------------------------------------

def to_object(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    return ob


def jitter(bm, amount, keep_bottom=False):
    for v in bm.verts:
        if keep_bottom and v.co.z < -0.49:
            continue
        v.co += Vector((random.uniform(-amount, amount),
                        random.uniform(-amount, amount),
                        random.uniform(-amount, amount)))


def rock(name, mat, loc, size, rough=0.2, rot_z=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    jitter(bm, rough)
    # flatten the underside so rocks sit on the ground
    for v in bm.verts:
        v.co.z = max(v.co.z, -0.55)
    rz = random.uniform(0, math.tau) if rot_z is None else rot_z
    return to_object(name, bm, mat, loc, (0, 0, rz), size)


def box(bm, cx, cy, cz, sx, sy, sz):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    for v in geom["verts"]:
        v.co.x = v.co.x * sx + cx
        v.co.y = v.co.y * sy + cy
        v.co.z = v.co.z * sz + cz
    return geom["verts"]


def cylinder_between(name, mat, a, b, radius, segments=7, taper=0.9):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius * taper, depth=d.length)
    jitter(bm, radius * 0.12)
    ob = to_object(name, bm, mat, (a + b) / 2)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("Z", "Y")
    return ob


def lathe(name, mat, profile, segments=6, twist=0.0, wobble=0.0, loc=(0, 0, 0)):
    """Revolve (radius, height) pairs into a closed low-poly shape."""
    bm = bmesh.new()
    rings = []
    for i, (r, z) in enumerate(profile):
        ring = []
        for s in range(segments):
            ang = s / segments * math.tau + twist * i
            rr = r * (1 + random.uniform(-wobble, wobble)) if r > 0 else 0
            ring.append(bm.verts.new((math.cos(ang) * rr, math.sin(ang) * rr, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segments):
            n = (s + 1) % segments
            bm.faces.new((rings[i][s], rings[i][n], rings[i + 1][n], rings[i + 1][s]))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object(name, bm, mat, loc)


# --- Ground ------------------------------------------------------------------

bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=28, radius=7.0)
to_object("Ground", bm, M["ground"], (0, 0, -0.005))

# Flagstones: a broken floor ring around the fire, sparser toward the edge.
placed = []
for i in range(80):
    ang = random.uniform(0, math.tau)
    dist = random.uniform(1.0, 3.4)
    x, y = math.cos(ang) * dist, math.sin(ang) * dist
    if any((x - px) ** 2 + (y - py) ** 2 < 0.36 for px, py in placed):
        continue
    if random.random() < dist / 5.5:  # missing / broken slabs further out
        continue
    placed.append((x, y))
    bm = bmesh.new()
    box(bm, 0, 0, 0, random.uniform(0.34, 0.5), random.uniform(0.3, 0.44), 0.05)
    for v in bm.verts:
        v.co.x += random.uniform(-0.04, 0.04)
        v.co.y += random.uniform(-0.04, 0.04)
    to_object(f"Flagstone_{len(placed):02d}", bm, M["flagstone"], (x, y, 0.02),
              (random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), random.uniform(0, math.tau)))

# --- Fire pit ----------------------------------------------------------------

# Ash pile: a pale mound under the logs, studded with charcoal and glowing coals
# ("Glow_*" objects pulse in the flame's colors on the site), with ash spilling
# out between the ring stones.
ASH_R, ASH_H = 0.56, 0.17

def ash_height(x, y):
    d = min(1.0, math.hypot(x / ASH_R, y / (ASH_R * 0.96)))
    return ASH_H * math.sqrt(max(0.0, 1 - d * d))

bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
for v in bm.verts:
    v.co.z = max(v.co.z, 0.0)
    v.co.x += random.uniform(-0.04, 0.04)
    v.co.y += random.uniform(-0.04, 0.04)
    v.co.z *= random.uniform(0.85, 1.15)
to_object("Ash_Pile", bm, M["ash"], (0, 0, -0.005), (0, 0, 0), (ASH_R, ASH_R * 0.96, ASH_H))

for i in range(12):
    ang = random.uniform(0, math.tau)
    r = random.uniform(0.08, 0.46)
    x, y = math.cos(ang) * r, math.sin(ang) * r
    s = random.uniform(0.03, 0.055)
    rock(f"Charcoal_{i:02d}", M["char"], (x, y, ash_height(x, y) + s * 0.2), (s * 1.4, s, s * 0.7), 0.25)

for i in range(9):
    ang = random.uniform(0, math.tau)
    r = random.uniform(0.05, 0.38)
    x, y = math.cos(ang) * r, math.sin(ang) * r
    s = random.uniform(0.022, 0.04)
    rock(f"Glow_Coal_{i:02d}", M["ember"], (x, y, ash_height(x, y) + s * 0.15), (s * 1.3, s, s * 0.6), 0.2)

for i in range(16):
    ang = random.uniform(0, math.tau)
    r = random.uniform(0.6, 1.0)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=6, radius=1.0)
    jitter(bm, 0.25)
    s = random.uniform(0.06, 0.14)
    to_object(f"Ash_Spill_{i:02d}", bm, M["ash_dark"] if i % 3 else M["ash"],
              (math.cos(ang) * r, math.sin(ang) * r, 0.012), (0, 0, random.uniform(0, math.tau)), (s * 1.5, s, 0.02))

STONES = 11
for i in range(STONES):
    ang = i / STONES * math.tau + random.uniform(-0.12, 0.12)
    r = 0.66 + random.uniform(-0.03, 0.05)
    s = random.uniform(0.11, 0.15)
    rock(f"RingStone_{i:02d}", M["stone"], (math.cos(ang) * r, math.sin(ang) * r, s * 0.35),
         (s * random.uniform(1.1, 1.4), s, s * random.uniform(0.6, 0.8)), 0.1)

# Leaning logs (teepee) around a shared apex.
apex = Vector((0.0, 0.0, 0.62))
LOGS = 6
for i in range(LOGS):
    ang = i / LOGS * math.tau + 0.3 + random.uniform(-0.15, 0.15)
    foot = Vector((math.cos(ang) * 0.4, math.sin(ang) * 0.4, 0.04))
    top = apex + Vector((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 0))
    top = foot + (top - foot) * random.uniform(0.95, 1.1)
    cylinder_between(f"Log_{i:02d}", M["wood"] if i % 3 else M["char"], foot, top,
                     random.uniform(0.045, 0.06))

# Two logs lying across the base, and one burnt log left beside the ring.
cylinder_between("Log_Base_A", M["char"], (-0.46, -0.12, 0.06), (0.44, 0.16, 0.08), 0.06)
cylinder_between("Log_Base_B", M["wood"], (-0.16, 0.44, 0.07), (0.1, -0.46, 0.06), 0.055)
cylinder_between("Log_Spare", M["wood"], (0.9, 0.55, 0.06), (1.35, 0.1, 0.07), 0.07, taper=0.85)
cylinder_between("Log_Spare_B", M["char"], (0.95, 0.72, 0.16), (1.42, 0.38, 0.12), 0.055, taper=0.8)

# --- Weapons ---------------------------------------------------------------------
# All ten stand at the fire's center; the site shows one at a time.

def join_objects(objs, name):
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]

# A single firefly (the site clones it): dark body and wings, and a lantern
# abdomen that glows in the flame's colors. Forward is -Y (+Z on the site).
M["fly_body"] = material("FlyBody", "#2b2430")
M["fly_wing"] = material("FlyWing", "#5e5870")

def firefly():
    root = bpy.data.objects.new("Firefly", None)
    scene.collection.objects.link(root)
    root.location = (3.0, -3.5, 1.4)
    body = bmesh.new()
    for r, c, sq in ((0.007, (0, -0.024, 0.001), (1, 1, 1)), (0.01, (0, -0.011, 0.003), (1, 1.15, 0.85))):
        g = bmesh.ops.create_icosphere(body, subdivisions=1, radius=r)
        for v in g["verts"]:
            v.co = Vector((v.co.x * sq[0] + c[0], v.co.y * sq[1] + c[1], v.co.z * sq[2] + c[2]))
    for sx in (1, -1):  # antennae
        a = body.verts.new((0.002 * sx, -0.029, 0.004))
        b2 = body.verts.new((0.009 * sx, -0.04, 0.012))
        c2 = body.verts.new((0.008 * sx, -0.039, 0.009))
        body.faces.new((a, b2, c2))
    parts = [to_object("Firefly_Body", body, M["fly_body"])]
    wings = bmesh.new()
    for sx in (1, -1):
        vs = [wings.verts.new((x * sx, y, 0.009)) for x, y in ((0.002, -0.014), (0.032, -0.002), (0.034, 0.014), (0.004, 0.006))]
        wings.faces.new(vs if sx > 0 else list(reversed(vs)))
    parts.append(to_object("Firefly_Wings", wings, M["fly_wing"]))
    lantern = bmesh.new()
    bmesh.ops.create_icosphere(lantern, subdivisions=1, radius=1.0)
    parts.append(to_object("Firefly_Lantern", lantern, M["flame_core"], (0, 0.014, 0.0), (0, 0, 0), (0.01, 0.021, 0.009)))
    for o in parts:
        o.parent = root
    return root

firefly()

FIRE_CENTER = (0.04, -0.03, 0.0)
WEAPONS = weapons.build_all(M, join_objects)
for w in WEAPONS.values():
    w.location = FIRE_CENTER
    w.rotation_euler = (math.radians(5), math.radians(-3), math.radians(10))

# --- Gothic ruins ------------------------------------------------------------

# Broken column on a plinth, back left.
PX, PY = -1.45, 1.35
bm = bmesh.new()
box(bm, 0, 0, 0.11, 0.78, 0.78, 0.22)
box(bm, 0, 0, 0.26, 0.62, 0.62, 0.1)
to_object("Pillar_Plinth", bm, M["pillar"], (PX, PY, 0))

bm = bmesh.new()
res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.24, radius2=0.22, depth=1.7)
for v in res["verts"]:
    if v.co.z > 0.8:  # jagged, broken top
        v.co.z += random.uniform(-0.35, 0.05)
to_object("Pillar_Shaft", bm, M["pillar"], (PX, PY, 0.31 + 0.85))

bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.2, radius2=0.2, depth=0.42)
jitter(bm, 0.02)
to_object("Pillar_Fallen", bm, M["pillar"], (PX + 0.7, PY - 0.4, 0.19),
          (math.radians(90), 0, math.radians(35)))

# Candles on the plinth.
for i, (dx, dy, h) in enumerate(((0.2, -0.22, 0.2), (0.28, -0.08, 0.13), (0.12, -0.28, 0.09))):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.035, radius2=0.032, depth=h)
    to_object(f"Candle_{i}", bm, M["wax"], (PX + dx, PY + dy, 0.31 + h / 2))
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    to_object(f"CandleFlame_{i}", bm, M["flame_core"], (PX + dx, PY + dy, 0.31 + h + 0.04),
              (0, 0, 0), (0.02, 0.02, 0.045))

# Ruined wall fragment, back right: running-bond blocks with a stepped break.
WX, WY, WR = 1.9, 1.5, math.radians(-28)
bm = bmesh.new()
core = bmesh.new()
BW, BH, BD = 0.46, 0.26, 0.34
ROWS, COLS = 6, 5
for row in range(ROWS):
    offset = (BW / 2) if row % 2 else 0
    for col in range(COLS):
        # stepped broken silhouette: higher rows lose more blocks on the left
        if row > 1 and col < row - 1:
            continue
        if row == ROWS - 1 and col % 2:
            continue
        cx = col * BW + offset - COLS * BW / 2
        box(bm, cx + random.uniform(-0.008, 0.008), random.uniform(-0.015, 0.015), row * BH + BH / 2,
            BW - 0.018, BD, BH - 0.014)
        # Recessed mortar behind each block fills the joints, so nothing shows
        # through the wall (each core overlaps its neighbours).
        box(core, cx, 0, row * BH + BH / 2, BW + 0.01, BD - 0.07, BH + 0.004)
to_object("Wall_Fragment", bm, M["pillar"], (WX, WY, 0), (0, 0, WR))
to_object("Wall_Mortar", core, M["mortar"], (WX, WY, 0), (0, 0, WR))

# Rubble.
for i in range(14):
    ang = random.uniform(0, math.tau)
    d = random.uniform(1.0, 3.0)
    s = random.uniform(0.05, 0.11)
    rock(f"Rubble_{i:02d}", M["stone"], (math.cos(ang) * d, math.sin(ang) * d, s * 0.4), (s, s * 0.9, s * 0.7), 0.25)
for i in range(6):
    s = random.uniform(0.07, 0.14)
    rock(f"Rubble_Wall_{i}", M["pillar"], (WX + random.uniform(-1.1, 0.6), WY - random.uniform(0.3, 0.8), s * 0.4),
         (s * 1.3, s, s * 0.8), 0.2)

# --- Preview camera + render ---------------------------------------------------

cam_data = bpy.data.cameras.new("PreviewCam")
cam_data.lens = 50
cam = bpy.data.objects.new("PreviewCam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0.0, -5.4, 2.2)
cam.rotation_euler = (math.radians(71), 0, 0)
scene.camera = cam

os.makedirs(os.path.join(ROOT, "assets", "source"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "public", "models"), exist_ok=True)

scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_cavity = True
scene.display.shading.show_object_outline = True
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("World") if scene.world is None else scene.world
scene.world.color = (0.002, 0.002, 0.004)
scene.render.filepath = os.path.join(ROOT, "assets", "source", "bonfire-preview.png")
for key, w in WEAPONS.items():
    w.hide_render = key != "longsword"
bpy.ops.render.render(write_still=True)

# Weapon lineup render (for review).
scene_objs = [o for o in scene.objects if o.type == "MESH" and not o.name.startswith("Weapon_")]
for o in scene_objs:
    o.hide_render = True
for i, key in enumerate(weapons.WEAPON_KEYS):
    w = WEAPONS[key]
    w.hide_render = False
    w.location = ((i - 7.5) * 0.52, -3.5, 0.3)  # in front of the scene in the .blend
    w.rotation_euler = (0, 0, 0)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 9.4
cam.location = (0, -9.5, 1.2)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.world.color = (0.02, 0.02, 0.03)
scene.render.resolution_x = 2400
scene.render.resolution_y = 620
scene.render.filepath = os.path.join(ROOT, "assets", "source", "weapons-lineup.png")
bpy.ops.render.render(write_still=True)
for o in scene_objs:
    o.hide_render = False
for w in WEAPONS.values():
    w.hide_render = False

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "assets", "source", "bonfire.blend"))

# Merge static meshes by material for the web export (fewer draw calls, and
# Draco compresses one large mesh far better than many tiny ones). The .blend
# above keeps every object separate for editing.
ANIMATED = ("Weapon_", "CandleFlame_", "Glow_", "Firefly")
groups = {}
for ob in list(scene.objects):
    if ob.type == "MESH" and not ob.name.startswith(ANIMATED):
        groups.setdefault(ob.data.materials[0].name, []).append(ob)
for mat_name, obs in groups.items():
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=obs[0], selected_objects=obs, selected_editable_objects=obs):
            bpy.ops.object.join()
    obs[0].name = f"Static_{mat_name}"

bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, "public", "models", "bonfire.glb"),
    export_format="GLB",
    export_cameras=False,
    export_lights=False,
    export_apply=True,
    export_normals=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)

tris = sum(len(o.data.polygons) for o in scene.objects if o.type == "MESH")
print(f"[bonfire] objects={len(scene.objects)} faces={tris} -> {ROOT}")
