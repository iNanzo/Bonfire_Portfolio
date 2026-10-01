# The knight who rests at the bonfire: a low-poly figure in Vilhelm's plate, all steel (the
# site draws it gunmetal; no gilt, no mantle, no weapon, no shield), with three helmets.
#
# Run through tools/build-model.mjs (or directly):
#   npm run model -- knight
#   blender --background --factory-startup --python tools/knight.py -- <project root> [--quick] [--look] [--judge <dir>]
#
# Outputs:
#   public/models/knight.glb            Draco-compressed rig for Three.js
#   assets/source/knight.blend          editable source (rest pose)
#   assets/source/knight-preview.png    front three-quarter, side and back
#   assets/source/knight-helmets.png    the three helmets, front and three-quarter
#   assets/source/knight-poses.png      the site's own poses (knightPose.js, run by node) on
#                                       the model, to check the plates for clipping
#   --quick skips the renders; --look only renders (no .blend, no export); --judge <dir>
#   adds fire-lit and sprite-size review renders there; --look --poses renders only the
#   poses sheet (to --judge's dir if given).
#
# The rig is rigid: every piece of armor belongs to one joint, and each joint is an
# empty at its anatomical pivot (hip sockets, knee at the poleyn's center, ankle,
# shoulder socket inside the pauldron, elbow at the couter, wrist, knuckles, neck base,
# skull base). The pauldron's two hanging lames ride on their own empty, K_Pauldron_*, at
# the shoulder socket under K_Shoulder_* (the dome stays on the shoulder, the third lame on
# the upper arm), so the site can swing them part of the way with the arm. A joint's
# pieces are one mesh, "<joint>_Mesh", parented to the empty with
# no offset and modeled in the joint's own coordinates. The rest pose stands facing
# -Y (Three.js +Z) with zero rotations everywhere, the arms hanging 12 degrees out with
# the palms to the thighs; the site poses him by rotating the empties. "_L" is the
# knight's left, +X. The helmets hang under K_Head as K_Helm_Great, K_Helm_Armet and
# K_Helm_Bascinet; the site shows one.
#
# Materials are roles, not colors: the site swaps each for its armor shader by name
# (K_Plate, K_Edge, K_Trim, K_Mail, K_Leather, K_Cloth, K_Void). K_Trim marks the raised
# bands and ribs that were gilt in round 8: the Black & Gold knight style draws them as dark
# gilt (the first build's as glowing trim); every other style draws them as raised steel,
# like K_Edge (src/bonfire/knightStyles.js). The colors below are only for the previews and
# any viewer that keeps them.
#
# Pixel rules (the scenery rules in src/bonfire/scenery.js): flat faces in a few big
# facets, nothing under ~2.5 cm (trim bands, slits), flutes as real facets at least 3 cm
# wide, closed solids, parts overlapping by about a centimetre instead of touching, and
# dark cores behind the joints so a gap shows a dark line instead of the background.
# Raised bands (K_Edge) only on the lines that read at ~90 texels (docs/knight.md).

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else os.getcwd())
QUICK = "--quick" in argv
LOOK = "--look" in argv  # renders only: no .blend, no export
JUDGE = os.path.abspath(argv[argv.index("--judge") + 1]) if "--judge" in argv else None
POSES_ONLY = "--poses" in argv  # with --look: only the poses sheet (to --judge's dir if given)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0  # no knight.blend1 next to the source
scene = bpy.context.scene
TAU = math.tau
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# --- Materials -----------------------------------------------------------------------

def hex_to_linear(h):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def material(name, hex_color):
    """A flat color through the Principled BSDF (the glTF exporter reads the BSDF;
    setting only diffuse_color exports gray)."""
    m = bpy.data.materials.new(name)
    rgb = hex_to_linear(hex_color)
    m.diffuse_color = (*rgb, 1.0)
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
    return m


ROLE_COLORS = {
    "K_Plate": "#4a4e57",    # gunmetal steel, a cool mid gray
    "K_Edge": "#6d717c",     # raised ridges, bands, bevels and rims, a step lighter
    "K_Trim": "#6d717c",     # the old gilt bands and ribs (raised steel here; gilt in one style)
    "K_Mail": "#34333b",     # mail at the joints, dark and matte
    "K_Leather": "#3f2b21",  # belt and straps
    "K_Cloth": "#2a2127",    # padding seen in the gaps
    "K_Void": "#050507",     # inside eye slits and breaths
}
MAT = {name: material(name, hexc) for name, hexc in ROLE_COLORS.items()}


# --- Geometry --------------------------------------------------------------------------

def frame(d, hint=X):
    """Two unit vectors across the axis d: u as close to `hint` as possible, v = u x d
    (for an axis pointing down, u = +X and v = +Y, so angle 270 degrees is the front)."""
    d = d.normalized()
    u = hint - d * hint.dot(d)
    if u.length < 1e-6:
        u = Y - d * Y.dot(d)
    u.normalize()
    return u, u.cross(d)


def front_phase(n):
    """Start angle that puts a vertex exactly at the front (270 degrees)."""
    step = TAU / n
    return (1.5 * math.pi) % step


class Piece:
    """One joint's mesh, built in world (rest pose) coordinates; faces carry roles."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.roles = []

    def idx(self, role):
        if role not in self.roles:
            self.roles.append(role)
        return self.roles.index(role)

    def loft(self, rings, role, caps=(True, True), cap_role=None):
        """Skin closed loops (lists of points) in order; a single point is an apex.
        `role` is a role name or fn(row, segment) -> role name; `cap_role` a role name
        or a (first, last) pair for the end caps."""
        bm = self.bm
        vs = [[bm.verts.new(p) for p in (r if isinstance(r, list) else [r])] for r in rings]
        for i in range(len(vs) - 1):
            a, b = vs[i], vs[i + 1]
            if len(a) == 1 or len(b) == 1:
                ring, apex = (b, a[0]) if len(a) == 1 else (a, b[0])
                n = len(ring)
                for k in range(n):
                    f = bm.faces.new((ring[k], ring[(k + 1) % n], apex))
                    f.material_index = self.idx(role(i, k) if callable(role) else role)
                continue
            n = len(a)
            for k in range(n):
                k2 = (k + 1) % n
                f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
                f.material_index = self.idx(role(i, k) if callable(role) else role)
        crole = cap_role or (role if isinstance(role, str) else role(0, 0))
        c0, c1 = crole if isinstance(crole, tuple) else (crole, crole)
        if caps[0] and len(vs[0]) > 2:
            bm.faces.new(list(reversed(vs[0]))).material_index = self.idx(c0)
        if caps[1] and len(vs[-1]) > 2:
            bm.faces.new(vs[-1]).material_index = self.idx(c1)
        return vs

    def obox(self, role, c, axes, half):
        """A box centered on c with its edges along three unit axes."""
        a0, a1, a2 = axes
        h0, h1, h2 = half
        rings = []
        for sz in (-1, 1):
            rings.append([c + a0 * (sx * h0) + a1 * (sy * h1) + a2 * (sz * h2)
                          for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        return self.loft(rings, role)

    def box(self, role, c, size):
        return self.obox(role, Vector(c), (X, Y, Z), [s / 2 for s in size])

    def tube(self, role, stations, n=8, hint=X, phase=0.0, cap_role=None):
        """Loft rings round a path. station = (center, rx, ry) or (center, rx, ry, fn),
        where fn(k, angle) scales the radius of vertex k (flutes, keels)."""
        rings = []
        m = len(stations)
        for i, st in enumerate(stations):
            c, rx, ry = Vector(st[0]), st[1], st[2]
            mod = st[3] if len(st) > 3 else None
            if rx == 0 and ry == 0:
                rings.append(c)
                continue
            prev = Vector(stations[max(i - 1, 0)][0])
            nxt = Vector(stations[min(i + 1, m - 1)][0])
            u, v = frame(nxt - prev, hint)
            ring = []
            for k in range(n):
                a = phase + k / n * TAU
                s = mod(k, a) if mod else 1.0
                ring.append(c + u * (math.cos(a) * rx * s) + v * (math.sin(a) * ry * s))
            rings.append(ring)
        return self.loft(rings, role, cap_role=cap_role)

    def ball(self, role, c, r, n=8, rows=4, squash=(1, 1, 1)):
        """A faceted ellipsoid (a dark core behind a joint)."""
        c = Vector(c)
        rings = [c + Vector((0, 0, -r * squash[2]))]
        for i in range(1, rows):
            el = -math.pi / 2 + i / rows * math.pi
            rr, zz = math.cos(el) * r, math.sin(el) * r
            rings.append([c + Vector((math.cos(k / n * TAU) * rr * squash[0],
                                      math.sin(k / n * TAU) * rr * squash[1], zz * squash[2])) for k in range(n)])
        rings.append(c + Vector((0, 0, r * squash[2])))
        return self.loft(rings, role)

    def arc_plate(self, role, origin, d, angles, stations, thick=0.02, hint=X, flute=0.0):
        """A curved plate wrapped part-way round the axis d (a lame, a tasset): an arc
        over `angles` (degrees; 0 = the hint side, -90 = the front for a downward axis)
        at each station (t along d, radius), `thick` deep, closed at both ends; `flute`
        pushes every other angle's edge out (a fraction of the radius)."""
        u, v = frame(d, hint)
        dirs = [u * math.cos(math.radians(a)) + v * math.sin(math.radians(a)) for a in angles]
        rings = []
        for t, r in stations:
            c = origin + d * t
            rings.append([c + w * (r * (1 + flute) if j % 2 else r) for j, w in enumerate(dirs)]
                         + [c + w * (r - thick) for w in reversed(dirs)])
        return self.loft(rings, role)

    def plate_yz(self, role, x, t, pts):
        """A flat plate in the YZ plane (a side fan), `t` thick, centered on x."""
        rings = [[Vector((x - t / 2, y, z)) for y, z in pts], [Vector((x + t / 2, y, z)) for y, z in pts]]
        return self.loft(rings, role)

    def decal(self, role, c, normal, up, w, h, depth=0.012, proud=0.004):
        """A dark slit or a small raised plate on a surface: a thin box whose outer face
        stands `proud` off the surface at c (so it never shares a plane with it)."""
        n = Vector(normal).normalized()
        up = Vector(up)
        up = (up - n * up.dot(n)).normalized()
        side = up.cross(n)
        return self.obox(role, Vector(c) + n * (proud - depth / 2), (side, up, n), (w / 2, h / 2, depth / 2))

    def strip(self, role, pts, normals, w, proud=0.005, depth=0.012):
        """A raised rib along a line of surface points (a chest rib, a comb's crest): a
        thin four-sided bar, `w` wide, standing `proud` off the surface."""
        rings = []
        for i, (p, n) in enumerate(zip(pts, normals)):
            t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            side = t.cross(n).normalized() * (w / 2)
            rings.append([p + n * proud + side, p + n * proud - side, p - n * depth - side, p - n * depth + side])
        return self.loft(rings, role)

    def mirrored(self, name):
        p = Piece(name)
        p.bm = self.bm.copy()
        for v in p.bm.verts:
            v.co.x = -v.co.x
        p.roles = list(self.roles)
        return p


def ridge(deg, n, lo=200, hi=340):
    """Whether the vertex at angle `deg` of an n-sided loop (270 = the front) is a flute's
    ridge: every other vertex counted from the front, inside the arc lo..hi (degrees)."""
    deg %= 360
    if not lo <= deg <= hi:
        return False
    return round((deg - 270) / (360 / n)) % 2 == 0


def fluted(n, depth, lo=200, hi=340, base=None):
    """A tube() radius modifier: flutes, every other vertex pushed out by `depth` (a
    fraction of the radius) over the arc lo..hi, on top of `base` (e.g. a keel). Flat
    shading turns them into stripes of light, so keep them at least 3 cm apart."""
    def mod(k, a):
        s = base(k, a) if base else 1.0
        return s * (1 + depth) if ridge(math.degrees(a), n, lo, hi) else s
    return mod


def oval(z, hw, fr, bk, n, keel=0.0, bkeel=0.0, cy=0.0, flute=0.0, arc=(200, 340), lift=0.0):
    """A horizontal loop of n points with a vertex at the front: half-width hw, front
    depth fr (toward -Y), back depth bk, optional ridges (keels) at the front and back
    center, centered on y = cy; `flute` pushes every other vertex over the arc out (a
    fraction), `lift` raises the front (an arch over the thighs)."""
    ph = front_phase(n)
    pts = []
    for k in range(n):
        a = ph + k / n * TAU
        c, s = math.cos(a), math.sin(a)
        x, y = c * hw, s * (bk if s > 0 else fr)
        if flute and ridge(math.degrees(a), n, *arc):
            x *= 1 + flute
            y *= 1 + flute
        if abs(a - 1.5 * math.pi) < 1e-4:
            y -= keel
        if abs(a - 0.5 * math.pi) < 1e-4:
            y += bkeel
        pts.append(Vector((x, cy + y, z + lift * max(0.0, -s) ** 2)))
    return pts


def facet(z, hw, fr, bk, n, k, keel=0.0):
    """Center and outward normal of face k of an oval() loop at height z."""
    loop = oval(z, hw, fr, bk, n, keel)
    a, b = loop[k], loop[(k + 1) % n]
    mid = (a + b) / 2
    edge = b - a
    nrm = Vector((edge.y, -edge.x, 0)).normalized()
    if nrm.dot(Vector((mid.x, mid.y, 0))) < 0:
        nrm = -nrm
    return mid, nrm


def on_front(loop, x):
    """The point at `x` on the front (-Y) side of a horizontal loop of points, and the
    outward normal of the face it lies on."""
    n = len(loop)
    for k in range(n):
        a, b = loop[k], loop[(k + 1) % n]
        if a.y < 0 and b.y < 0 and min(a.x, b.x) <= x <= max(a.x, b.x) and a.x != b.x:
            t = (x - a.x) / (b.x - a.x)
            nrm = Vector((b.y - a.y, -(b.x - a.x), 0)).normalized()
            return a.lerp(b, t), (nrm if nrm.y < 0 else -nrm)
    raise ValueError(f"x={x} is off the loop's front")


def angle_of(k, n):
    """Mid-angle of face k of an oval() loop (degrees, 270 = front, 90 = back)."""
    return math.degrees(front_phase(n) + (k + 0.5) / n * TAU) % 360


def front(k, n, lo=200, hi=340):
    """Whether face k of an oval() loop faces the front, between angles lo and hi."""
    return lo <= angle_of(k, n) <= hi


# --- The skeleton (Blender world coordinates, rest pose) --------------------------------

ARM_OUT = math.radians(12)
ARM_DIR = Vector((math.sin(ARM_OUT), 0, -math.cos(ARM_OUT)))  # the left arm hangs along this
SOCKET = Vector((0.195, 0.01, 1.325))
ELBOW = SOCKET + ARM_DIR * 0.28
WRIST = ELBOW + ARM_DIR * 0.25
KNUCKLE = WRIST + ARM_DIR * 0.095
HIP = Vector((0.10, 0.0, 0.885))
KNEE = Vector((0.105, -0.012, 0.49))
ANKLE = Vector((0.105, 0.012, 0.095))
HEAD = Vector((0, 0.0, 1.465))
# The tassets hinge on the hip's own flexion axis (level with the socket, just outside
# it), so a tasset turning with the thigh rides on it; the plates hang in front.
TASSET_HINGE = Vector((0.112, 0.0, 0.885))
TASSET_FOLLOW = 0.85  # how much of the thigh's swing the tassets take (a hint for the site)

JOINTS = [  # (name, parent, world position of the pivot)
    ("K_Hips", None, Vector((0, 0, 0.935))),
    ("K_Spine", "K_Hips", Vector((0, 0.005, 1.01))),
    ("K_Chest", "K_Spine", Vector((0, 0.01, 1.17))),
    ("K_Neck", "K_Chest", Vector((0, 0.012, 1.385))),
    ("K_Head", "K_Neck", HEAD),
]
for side, sx in (("L", 1), ("R", -1)):
    m = Vector((sx, 1, 1))
    JOINTS += [
        (f"K_Shoulder_{side}", "K_Chest", SOCKET * m),
        (f"K_Pauldron_{side}", f"K_Shoulder_{side}", SOCKET * m),
        (f"K_UpperArm_{side}", f"K_Shoulder_{side}", SOCKET * m),
        (f"K_Forearm_{side}", f"K_UpperArm_{side}", ELBOW * m),
        (f"K_Hand_{side}", f"K_Forearm_{side}", WRIST * m),
        (f"K_Fingers_{side}", f"K_Hand_{side}", KNUCKLE * m),
        (f"K_Tasset_{side}", "K_Hips", TASSET_HINGE * m),
        (f"K_Thigh_{side}", "K_Hips", HIP * m),
        (f"K_Shin_{side}", f"K_Thigh_{side}", KNEE * m),
        (f"K_Foot_{side}", f"K_Shin_{side}", ANKLE * m),
    ]
HELMS = ["K_Helm_Great", "K_Helm_Armet", "K_Helm_Bascinet"]
HELM_WIDEN = 1.1    # the helmets a little oversized, like the references' big helmets...
HELM_TALLER = 1.03  # ...and a touch taller, from their bottom rim (at 1.39) up
JOINT_POS = {name: pos for name, _, pos in JOINTS}
for h in HELMS:
    JOINT_POS[h] = HEAD

P = {}  # joint (or helmet) name -> Piece


def piece(name):
    if name not in P:
        P[name] = Piece(f"{name}_Mesh")
    return P[name]


# --- Torso -------------------------------------------------------------------------------

def build_torso():
    n = 16
    # Breastplate and backplate: a globose shell with a centre ridge (the keel) over a
    # narrow waist, a raised hem, a raised neckline band and two raised ribs rising from
    # the waist in a V (Vilhelm's bands, in steel).
    chest = piece("K_Chest")
    st = [  # z, half-width, front, back, keel
        (1.100, 0.146, 0.122, 0.104, 0.012),
        (1.128, 0.153, 0.134, 0.106, 0.017),
        (1.195, 0.183, 0.165, 0.113, 0.028),
        (1.262, 0.198, 0.175, 0.119, 0.03),
        (1.316, 0.193, 0.16, 0.12, 0.021),
        (1.352, 0.168, 0.133, 0.11, 0.011),
        (1.376, 0.148, 0.114, 0.1, 0.005),
        (1.396, 0.118, 0.092, 0.09, 0.0),
    ]

    def chest_role(i, k):
        if i == 0:
            return "K_Edge"
        if i == 5 and front(k, n, 212, 328):
            return "K_Trim"
        return "K_Plate"

    rings = chest.loft([oval(z, hw, fr, bk, n, keel, cy=0.008) for z, hw, fr, bk, keel in st], chest_role,
                       cap_role="K_Plate")
    for sx in (1, -1):
        line, normals = [], []
        for i, x in ((1, 0.044), (2, 0.072), (3, 0.1), (4, 0.12)):
            p, nrm = on_front([v.co for v in rings[i]], x * sx)
            line.append(p)
            normals.append(nrm)
        chest.strip("K_Trim", line, normals, 0.028)
    # Mail at the armpits, behind the pauldrons.
    for sx in (1, -1):
        chest.ball("K_Mail", (0.158 * sx, 0.012, 1.268), 0.074, n=8, rows=4, squash=(1, 1.1, 1.2))

    # Plackart (the lower breastplate) on the spine, tucked under the breastplate's hem,
    # round a dark waist core: the narrowest point of the figure.
    spine = piece("K_Spine")
    st = [(0.962, 0.13, 0.1, 0.092, 0.008), (1.03, 0.134, 0.108, 0.094, 0.013), (1.142, 0.15, 0.128, 0.103, 0.015)]
    spine.loft([oval(z, hw, fr, bk, n, keel, cy=0.006) for z, hw, fr, bk, keel in st], "K_Plate")
    spine.tube("K_Cloth", [((0, 0.005, 0.94), 0.112, 0.086), ((0, 0.005, 1.2), 0.112, 0.086)], n=8)

    # Hips: a belt and buckle, a fauld of three flared, fluted hoops (each with a raised
    # rim, arching up in front over the thighs), a short mail skirt, a dark core.
    hips = piece("K_Hips")
    hips.loft([oval(0.95, 0.139, 0.109, 0.099, n, 0.006), oval(0.999, 0.138, 0.108, 0.098, n, 0.006)], "K_Leather")
    hips.box("K_Trim", (0, -0.124, 0.975), (0.066, 0.022, 0.046))
    nf = 24
    for z0, z1, hw0, hw1 in ((0.97, 0.908, 0.143, 0.164), (0.932, 0.866, 0.158, 0.181), (0.892, 0.824, 0.174, 0.198)):
        def ring(z, hw, lift):
            return oval(z, hw, hw * 0.8, hw * 0.72, nf, 0.008, flute=0.05, lift=lift)
        hips.loft([ring(z0, hw0, 0.0), ring(z1 + 0.018, hw1 - 0.005, 0.03), ring(z1, hw1, 0.03)],
                  lambda r, k: "K_Edge" if r == 1 else "K_Plate", cap_role=("K_Plate", "K_Cloth"))
    hips.loft([oval(0.915, 0.14, 0.11, 0.1, n), oval(0.8, 0.158, 0.12, 0.126, n)], "K_Mail")
    hips.box("K_Cloth", (0, 0.0, 0.865), (0.2, 0.15, 0.15))

    # Gorget: three lames stepping in toward the helmet, round a mail neck.
    neck = piece("K_Neck")
    for z0, z1, r0, r1 in ((1.345, 1.395, 0.138, 0.118), (1.385, 1.425, 0.12, 0.105), (1.415, 1.455, 0.105, 0.094)):
        neck.loft([oval(z0 - 0.014, r0 + 0.004, r0 - 0.004, r0 - 0.012, 12, cy=0.012),
                   oval(z0, r0 + 0.004, r0 - 0.004, r0 - 0.012, 12, cy=0.012),
                   oval(z1, r1, r1 - 0.006, r1 - 0.012, 12, cy=0.012)],
                  lambda row, k: "K_Edge" if row == 0 else "K_Plate")
    neck.tube("K_Mail", [((0, 0.01, 1.4), 0.075, 0.075), ((0, 0.01, 1.53), 0.075, 0.075)], n=8)

    # The head itself is only an arming cap; the helmets go over it.
    piece("K_Head").ball("K_Cloth", (0, -0.005, 1.56), 0.085, n=8, rows=4, squash=(1, 1.1, 1.15))


# --- Arms --------------------------------------------------------------------------------

def build_arm():
    """The left arm (+X); the right is its mirror image."""
    d = ARM_DIR
    u, v = frame(d)
    # Pauldron: a big fluted dome over the shoulder (on K_Shoulder), tipped outward so its
    # raised hem runs low over the arm and high by the neck, over two fluted lames wrapping
    # the outside of the arm, each with a raised rim (on K_Pauldron, at the same socket, so
    # the site can swing them part of the way with the arm). A third lame rides on the
    # upper arm.
    sh = piece("K_Shoulder_L")
    tilt = math.radians(22)
    axis = Vector((math.sin(tilt), 0, math.cos(tilt)))
    cap = SOCKET + Vector((0.022, 0, 0.024))
    fl = fluted(16, 0.05, 0, 360)
    dome = [(-0.038, 0.142), (-0.012, 0.14), (0.04, 0.124), (0.08, 0.082), (0.103, 0.032), (0.108, 0.0)]
    sh.tube(lambda i, k: "K_Trim" if i == 0 else "K_Plate",
            [(cap + axis * h, r, r * 0.94, fl) for h, r in dome], n=16, hint=X, phase=0.0)
    arc = (-120, -80, -40, 0, 40, 80, 120)

    def lame(i, k):
        return "K_Edge" if i == 1 and k < len(arc) - 1 else "K_Plate"

    lames = piece("K_Pauldron_L")
    for t0, t1, r in ((0.05, 0.132, 0.114), (0.106, 0.186, 0.106)):
        lames.arc_plate(lame, SOCKET + u * 0.014, d, arc,
                     [(t0, r), (t1 - 0.024, r + 0.008), (t1, r + 0.016)], thick=0.022, flute=0.06)

    # Upper arm: mail at the armpit, the last lame, the rerebrace, and the couter with its
    # side fan.
    ua = piece("K_UpperArm_L")
    ua.tube("K_Mail", [(SOCKET + d * 0.0, 0.066, 0.066), (SOCKET + d * 0.12, 0.062, 0.062)], n=8)
    ua.arc_plate(lame, SOCKET + u * 0.01, d, arc, [(0.16, 0.096), (0.2 - 0.022, 0.102), (0.2, 0.108)], thick=0.02, flute=0.06)
    ua.tube(lambda i, k: "K_Edge" if i == 1 else "K_Plate",
            [(SOCKET + d * 0.1, 0.064, 0.064), (SOCKET + d * 0.228, 0.06, 0.06), (SOCKET + d * 0.244, 0.065, 0.065)],
            n=8, phase=math.pi / 8)
    ua.tube(lambda i, k: "K_Edge" if i == 0 else "K_Plate",
            [(ELBOW + Y * 0.0, 0.078, 0.078), (ELBOW + Y * 0.036, 0.068, 0.068), (ELBOW + Y * 0.064, 0.04, 0.04),
             (ELBOW + Y * 0.076, 0, 0)], n=8, hint=X)
    ua.plate_yz("K_Edge", ELBOW.x + 0.062, 0.024,
                [(ELBOW.y + a * 1.2, ELBOW.z + b * 1.2) for a, b in ((0.0, 0.055), (-0.05, 0.03), (-0.06, -0.01), (-0.035, -0.045),
                                                                   (0.02, -0.03), (0.04, 0.015))])

    # Forearm: a dark elbow core and a fluted vambrace with a raised band at the top.
    fa = piece("K_Forearm_L")
    fa.ball("K_Mail", ELBOW, 0.06, n=8, rows=4)
    fl = fluted(12, 0.07, 0, 360)
    fa.tube(lambda i, k: "K_Edge" if i == 0 else "K_Plate",
            [(ELBOW + d * 0.02, 0.062, 0.062, fl), (ELBOW + d * 0.05, 0.062, 0.062, fl),
             (ELBOW + d * 0.14, 0.058, 0.058, fl), (WRIST - d * 0.005, 0.05, 0.05, fl)], n=12, phase=front_phase(12))

    # Hand: a gauntlet with a wide flared cuff (a raised lip), a broad back of the hand, a
    # knuckle ridge and the thumb.
    hd = piece("K_Hand_L")
    hd.tube(lambda i, k: "K_Trim" if i == 2 else "K_Plate",
            [(WRIST + d * 0.03, 0.056, 0.056), (WRIST - d * 0.035, 0.076, 0.074), (WRIST - d * 0.058, 0.088, 0.086),
             (WRIST - d * 0.084, 0.097, 0.095)], n=10, phase=math.pi / 10, cap_role=("K_Plate", "K_Cloth"))
    hd.obox("K_Plate", WRIST + d * 0.052 + u * 0.004, (u, v, d), (0.033, 0.068, 0.058))
    hd.obox("K_Edge", KNUCKLE - d * 0.012 + u * 0.01, (u, v, d), (0.031, 0.07, 0.017))
    tdir = (d - v * 0.55 - u * 0.35).normalized()
    tu, tv = frame(tdir, u)
    hd.obox("K_Plate", WRIST + d * 0.05 - v * 0.058 - u * 0.014 + tdir * 0.032, (tu, tv, tdir), (0.02, 0.02, 0.05))

    # Fingers: one block that curls toward the palm in two steps, with a lame on the back.
    fg = piece("K_Fingers_L")
    fg.obox("K_Plate", KNUCKLE + d * 0.024, (u, v, d), (0.026, 0.064, 0.032))
    d2 = (d * math.cos(math.radians(35)) - u * math.sin(math.radians(35))).normalized()
    u2, _ = frame(d2, u)
    tip0 = KNUCKLE + d * 0.05
    fg.obox("K_Plate", tip0 + d2 * 0.022 - u * 0.004, (u2, v, d2), (0.023, 0.062, 0.03))
    fg.obox("K_Edge", KNUCKLE + d * 0.034 + u * 0.018, (u, v, d), (0.012, 0.066, 0.013))


# --- Legs --------------------------------------------------------------------------------

def build_leg():
    """The left leg (+X) and its tasset; the right is the mirror image."""
    # Tasset: two flared, fluted lames hanging from under the fauld over the thigh, each
    # with a raised rim; they turn on TASSET_HINGE, the hip's own axis.
    ts = piece("K_Tasset_L")
    arc = (-140, -112, -84, -56, -28, 0)
    for z0, z1, r in ((0.94, 0.826, 0.138), (0.848, 0.726, 0.146)):
        ts.arc_plate(lambda i, k: "K_Edge" if i == 1 and k < len(arc) - 1 else "K_Plate",
                     Vector((HIP.x, 0, z0)), -Z, arc,
                     [(0.0, r), (z0 - z1 - 0.024, r + 0.016), (z0 - z1, r + 0.026)], flute=0.06)

    # Thigh: a thick, fluted cuisse with a keel over the front and outside, mail behind,
    # a raised rim over the knee.
    th = piece("K_Thigh_L")
    n = 16

    def keel(k, a):
        return 1.08 if abs(math.degrees(a) % 360 - 270) < 1 else 1.0

    fl = fluted(n, 0.055, 200, 340, keel)
    th.tube(lambda i, k: ("K_Mail" if 45 < angle_of(k, n) < 135 else ("K_Edge" if i == 3 else "K_Plate")),
            [(Vector((HIP.x, 0.0, 0.96)), 0.1, 0.106, fl), (Vector((HIP.x, 0.0, 0.82)), 0.104, 0.112, fl),
             (Vector((0.103, -0.006, 0.67)), 0.094, 0.1, fl), (Vector((0.105, -0.01, 0.578)), 0.078, 0.082, fl),
             (Vector((0.105, -0.01, 0.552)), 0.085, 0.089, fl)], n=n, phase=front_phase(n))

    # Shin: the poleyn (a pointed cap with a wide side fan) over a mail knee, then a keeled
    # greave that swells over the calf, with a raised band at the ankle.
    sn = piece("K_Shin_L")
    sn.ball("K_Mail", KNEE, 0.07, n=8, rows=4)
    sn.tube(lambda i, k: "K_Edge" if i == 0 else "K_Plate",
            [(KNEE - Y * 0.022, 0.09, 0.096), (KNEE - Y * 0.058, 0.082, 0.088), (KNEE - Y * 0.086, 0.046, 0.05),
             (KNEE - Y * 0.098, 0, 0)], n=8, hint=X)
    sn.plate_yz("K_Edge", KNEE.x + 0.08, 0.026,
                [(KNEE.y + a * 1.25, KNEE.z + b * 1.25) for a, b in ((0.03, 0.06), (-0.045, 0.058), (-0.085, 0.0), (-0.045, -0.062),
                                                                   (0.03, -0.048), (0.05, 0.005))])

    def shin_keel(k, a):
        return 1.15 if abs(math.degrees(a) % 360 - 270) < 1 else 1.0

    sn.tube(lambda i, k: {0: "K_Edge", 5: "K_Trim"}.get(i, "K_Plate"),
            [(Vector((0.105, -0.006, 0.48)), 0.07, 0.072, shin_keel), (Vector((0.105, 0.0, 0.445)), 0.074, 0.08, shin_keel),
             (Vector((0.105, 0.014, 0.33)), 0.08, 0.094, shin_keel), (Vector((0.105, 0.014, 0.22)), 0.068, 0.076, shin_keel),
             (Vector((0.105, 0.012, 0.162)), 0.06, 0.063, shin_keel), (Vector((0.105, 0.012, 0.142)), 0.064, 0.067, shin_keel),
             (Vector((0.105, 0.012, 0.112)), 0.066, 0.069, shin_keel)],
            n=12, phase=front_phase(12))

    # Foot: a big, pointed, laminated sabaton on a leather sole, round a mail ankle.
    ft = piece("K_Foot_L")
    ft.ball("K_Mail", ANKLE, 0.056, n=8, rows=4)
    cx = ANKLE.x

    def prof(y, hw, top, bot=0.014, grow=0.0):
        hw += grow
        top += grow
        return [Vector((cx + x, y, z)) for x, z in (
            (-hw, bot), (hw, bot), (hw, bot + (top - bot) * 0.55), (hw * 0.55, top - (top - bot) * 0.1),
            (0.0, top), (-hw * 0.55, top - (top - bot) * 0.1), (-hw, bot + (top - bot) * 0.55))]

    st = [(0.098, 0.054, 0.092), (0.05, 0.07, 0.138), (-0.02, 0.076, 0.13), (-0.09, 0.074, 0.1),
          (-0.16, 0.062, 0.072), (-0.222, 0.042, 0.05)]
    ft.loft([prof(*s) for s in st] + [Vector((cx, -0.292, 0.024))], "K_Plate")
    for y, hw, top in ((-0.02, 0.076, 0.13), (-0.088, 0.074, 0.101), (-0.154, 0.064, 0.074)):
        ft.loft([prof(y + 0.015, hw, top, 0.03, 0.008), prof(y - 0.015, hw * 0.97, top * 0.94, 0.03, 0.008)], "K_Edge")
    sole = [(0.102, 0.058), (0.0, 0.08), (-0.14, 0.066), (-0.24, 0.038)]
    ft.loft([[Vector((cx + x, y, z)) for x, z in ((-hw, 0.0), (hw, 0.0), (hw, 0.02), (-hw, 0.02))] for y, hw in sole]
            + [Vector((cx, -0.294, 0.01))], "K_Leather")


# --- Helmets -------------------------------------------------------------------------------

def build_great_helm():
    """A flat-topped, slightly tapered bucket with a keeled face: a raised cross of bands,
    the eye slit either side of the upright, breaths below, raised rims."""
    h = piece("K_Helm_Great")
    n = 12
    # z, half-width, front, back, keel ("step" rows are 1 mm ledges up or down onto a band)
    st = [
        (1.392, 0.13, 0.133, 0.13, 0.018), (1.418, 0.13, 0.133, 0.13, 0.018),      # 0-1 bottom rim
        (1.419, 0.123, 0.126, 0.123, 0.016), (1.512, 0.125, 0.128, 0.125, 0.018),  # 2-3 plate
        (1.513, 0.132, 0.136, 0.131, 0.02), (1.538, 0.132, 0.136, 0.131, 0.02),    # 4-5 lower band
        (1.539, 0.125, 0.128, 0.125, 0.018), (1.568, 0.125, 0.128, 0.125, 0.018),  # 6-7 eye slit row
        (1.569, 0.133, 0.137, 0.132, 0.02), (1.602, 0.133, 0.137, 0.132, 0.02),    # 8-9 brow band
        (1.603, 0.125, 0.128, 0.125, 0.017), (1.688, 0.117, 0.12, 0.117, 0.013),   # 10-11 upper plate
        (1.689, 0.124, 0.127, 0.123, 0.015), (1.718, 0.124, 0.127, 0.123, 0.015),  # 12-13 top rim
    ]
    rows = {0: "K_Edge", 1: "K_Edge", 3: "K_Edge", 4: "K_Edge", 5: "K_Edge", 7: "K_Trim", 8: "K_Trim",
            9: "K_Trim", 11: "K_Trim", 12: "K_Trim"}

    def role(i, k):
        if i == 6 and front(k, n, 205, 335):
            return "K_Void"
        return rows.get(i, "K_Plate")

    # (the bottom cap is the helmet's dark inside)
    h.loft([oval(z, hw, fr, bk, n, keel) for z, hw, fr, bk, keel in st], role, cap_role=("K_Cloth", "K_Plate"))
    # The upright of the cross, over the keel: a raised strip splitting the eye slit.
    band = []
    for z in (1.43, 1.51, 1.6, 1.68):
        band.append([Vector((-0.019, -0.141, z)), Vector((0.0, -0.17, z)), Vector((0.019, -0.141, z)), Vector((0.0, -0.13, z))])
    h.loft(band, "K_Trim")
    # Breaths: two rows of slots on each cheek.
    for k in (7, 10):
        for z in (1.455, 1.487):
            c, nrm = facet(z, 0.124, 0.127, 0.124, n, k, 0.017)
            h.decal("K_Void", c, nrm, Z, 0.042, 0.02)


def build_armet():
    """A rounded skull with a raised comb, a projecting visor (a raised rib down its point)
    with the eye slit between visor and brow, cheek plates to the chin, and a rondel at the
    back of the neck."""
    h = piece("K_Helm_Armet")
    n = 12
    st = [
        (1.398, 0.12, 0.128, 0.13), (1.422, 0.12, 0.128, 0.13),      # 0-1 rim
        (1.423, 0.113, 0.121, 0.124), (1.5, 0.124, 0.13, 0.14),      # 2-3 cheeks
        (1.556, 0.127, 0.132, 0.145), (1.557, 0.121, 0.124, 0.145),  # 4 lower slit ledge
        (1.582, 0.121, 0.124, 0.145), (1.583, 0.129, 0.135, 0.146),  # 5 slit row, 6 ledge
        (1.61, 0.129, 0.135, 0.146), (1.652, 0.113, 0.119, 0.13),    # 7 brow band, 8 crown
        (1.688, 0.08, 0.085, 0.095), (1.708, 0.036, 0.04, 0.045),
    ]

    def role(i, k):
        if i in (0, 1):
            return "K_Edge"
        if i == 5 and front(k, n, 200, 340):
            return "K_Void"
        if i in (6, 7) and front(k, n, 200, 340):
            return "K_Edge"
        return "K_Plate"

    h.loft([oval(z, hw, fr, bk, n, cy=0.004) for z, hw, fr, bk in st], role, cap_role=("K_Cloth", "K_Plate"))
    # The comb: a raised bar over the crown from brow to nape.
    crest = [Vector((0, y, z)) for y, z in ((-0.13, 1.6), (-0.115, 1.652), (-0.08, 1.688), (-0.035, 1.708),
                                            (0.048, 1.708), (0.1, 1.688), (0.136, 1.652), (0.152, 1.6), (0.15, 1.54))]
    center = Vector((0, 0.004, 1.5))
    h.strip(lambda i, k: "K_Trim" if k == 0 else "K_Edge", crest,
            [Vector((0, p.y - center.y, p.z - center.z)).normalized() for p in crest], 0.034, proud=0.024, depth=0.02)
    # The visor: a sparrow's beak projecting from the face, raised ribs down its point and
    # its two front facets.
    vis = []
    for z, hw, yb, ys, yt in ((1.432, 0.085, -0.07, -0.126, -0.146), (1.49, 0.112, -0.07, -0.152, -0.197),
                              (1.527, 0.12, -0.07, -0.15, -0.182), (1.53, 0.123, -0.07, -0.153, -0.186),
                              (1.555, 0.123, -0.07, -0.146, -0.166)):
        vis.append([Vector((-hw, yb, z)), Vector((-hw * 0.93, ys + 0.03, z)), Vector((-hw * 0.5, ys, z)), Vector((0, yt, z)),
                    Vector((hw * 0.5, ys, z)), Vector((hw * 0.93, ys + 0.03, z)), Vector((hw, yb, z)), Vector((0, yb + 0.03, z))])
    h.loft(vis, lambda i, k: "K_Edge" if i == 3 else "K_Plate")
    for idx, nrm in ((3, Vector((0, -1, 0))), (2, Vector((-0.45, -1, 0)).normalized()), (4, Vector((0.45, -1, 0)).normalized())):
        line = [ring[idx] for ring in vis[:4]]
        h.strip("K_Trim" if idx == 3 else "K_Edge", line, [nrm] * len(line), 0.024, proud=0.004, depth=0.01)
    # Breaths on the visor: short slots on the left side.
    for dz in (0.0, 0.028):
        a, b = Vector((0.056, -0.176, 1.475 + dz)), Vector((0.112, -0.152, 1.475 + dz))
        nrm = Vector((b.y - a.y, -(b.x - a.x), 0)).normalized()
        if nrm.y > 0:
            nrm = -nrm
        h.decal("K_Void", (a + b) / 2, nrm, Z, 0.036, 0.016)
    # The rondel at the back of the neck, on a short stem.
    rc = Vector((0.0, 0.18, 1.44))
    h.tube("K_Plate", [(rc - Y * 0.05, 0.016, 0.016), (rc - Y * 0.01, 0.016, 0.016)], n=6, hint=X)
    h.tube("K_Edge",
           [(rc - Y * 0.012, 0.05, 0.05), (rc + Y * 0.004, 0.05, 0.05), (rc + Y * 0.014, 0.034, 0.034)], n=8, hint=X,
           phase=math.pi / 8)


def build_bascinet():
    """A pointed, faceted skull; a flat face plate with two eye slits and two
    cross-shaped breaths; a short mail aventail round the neck."""
    h = piece("K_Helm_Bascinet")
    n = 12
    st = [
        (1.398, 0.132, 0.138, 0.14, 0.012, 0.012), (1.424, 0.132, 0.138, 0.14, 0.012, 0.012),
        (1.425, 0.126, 0.131, 0.134, 0.012, 0.012), (1.6, 0.128, 0.133, 0.14, 0.014, 0.014),
        (1.662, 0.104, 0.106, 0.122, 0.016, 0.016), (1.708, 0.062, 0.058, 0.08, 0.012, 0.012),
    ]
    rings = [oval(z, hw, fr, bk, n, kf, kb) for z, hw, fr, bk, kf, kb in st]
    rings.append(Vector((0, 0.022, 1.768)))
    h.loft(rings, lambda i, k: "K_Edge" if i in (0, 1) else "K_Plate", cap_role="K_Cloth")
    # Face plate: a flat plate with a center ridge, wrapped a little round the skull's
    # front, a raised rim along its brow.
    fp = []
    for z in (1.44, 1.6, 1.628):
        fp.append([Vector((-0.1, -0.06, z)), Vector((-0.102, -0.098, z)), Vector((-0.072, -0.138, z)), Vector((0.0, -0.156, z)),
                   Vector((0.072, -0.138, z)), Vector((0.102, -0.098, z)), Vector((0.1, -0.06, z)), Vector((0.0, -0.09, z))])
    h.loft(fp, lambda i, k: "K_Edge" if i == 1 else "K_Plate")
    for sx in (1, -1):
        a, b = Vector((0.0, -0.156, 0)), Vector((0.072 * sx, -0.138, 0))
        nrm = Vector((b.y - a.y, -(b.x - a.x), 0)).normalized()
        if nrm.y > 0:
            nrm = -nrm
        at = lambda x, z: Vector((x, a.y + (b.y - a.y) * (x / b.x), z))  # noqa: E731
        h.decal("K_Void", at(0.038 * sx, 1.575), nrm, Z, 0.056, 0.024)       # eye slit
        h.decal("K_Void", at(0.038 * sx, 1.502), nrm, Z, 0.024, 0.08)        # breath upright
        h.decal("K_Void", at(0.038 * sx, 1.522), nrm, Z, 0.05, 0.022)        # breath crossbar
    # Aventail: a short skirt of mail from the helmet's rim to the shoulders.
    h.loft([oval(1.44, 0.122, 0.126, 0.13, n), oval(1.4, 0.142, 0.144, 0.15, n), oval(1.33, 0.168, 0.155, 0.165, n)],
           "K_Mail")


# --- Assembly ------------------------------------------------------------------------------

def build():
    build_torso()
    build_arm()
    build_leg()
    for j in ("K_Shoulder", "K_Pauldron", "K_UpperArm", "K_Forearm", "K_Hand", "K_Fingers", "K_Tasset", "K_Thigh", "K_Shin", "K_Foot"):
        P[f"{j}_R"] = P[f"{j}_L"].mirrored(f"{j}_R_Mesh")
    build_great_helm()
    build_armet()
    build_bascinet()
    for h in HELMS:  # a little oversized, like the references' big helmets
        for v in P[h].bm.verts:
            v.co.x *= HELM_WIDEN
            v.co.y *= HELM_WIDEN
            v.co.z = 1.39 + (v.co.z - 1.39) * HELM_TALLER

    root = bpy.data.objects.new("Knight", None)
    scene.collection.objects.link(root)
    root["kind"] = "knight"
    root["height"] = 1.72
    empties = {}
    for name, parent, pos in JOINTS + [(h, "K_Head", HEAD) for h in HELMS]:
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.04
        e.empty_display_type = "PLAIN_AXES"
        scene.collection.objects.link(e)
        e.parent = empties[parent] if parent else root
        e.location = pos - (JOINT_POS[parent] if parent else Vector())
        e.rotation_mode = "XYZ"
        if name.startswith("K_Tasset"):
            e["follow"] = TASSET_FOLLOW
        empties[name] = e
    for name, pc in P.items():
        bm = pc.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bmesh.ops.translate(bm, vec=-JOINT_POS[name], verts=bm.verts[:])
        me = bpy.data.meshes.new(pc.name)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        for r in pc.roles:
            me.materials.append(MAT[r])
        ob = bpy.data.objects.new(pc.name, me)
        scene.collection.objects.link(ob)
        ob.parent = empties[name]
    return root, empties


def triangles(name):
    return sum(len(p.vertices) - 2 for p in bpy.data.objects[name].data.polygons)


# Budgets: the body about 5000 triangles, each helmet 900 (test/knightModel.test.mjs).
ROOT_OBJ, EMPTIES = build()
BODY = [f"{name}_Mesh" for name, _, _ in JOINTS]
print("[knight] triangles:", {nm: triangles(nm) for nm in BODY})
print(f"[knight] body={sum(map(triangles, BODY))} " + " ".join(f"{h}={triangles(h + '_Mesh')}" for h in HELMS))


# --- Poses (preview only) -------------------------------------------------------------------
# The runtime's own poses, to check the plates for clipping: src/bonfire/knightPose.js
# evaluated by node (the seated rest at two seat heights, the helmet swap, Praise the Sun
# and a few dance moves at their extremes), each bone's rotation and place in knight
# space put on the empties. Without node the sheet shows the rest pose only.

POSE_JS = r"""
import { createSolver, measureRig, DEFAULT_REST, BONES, SEAT_DEPTH, seatedPose, standingPose, gesture, dance } from './src/bonfire/knightPose.js';
const solver = createSolver(measureRig(DEFAULT_REST, { tassetFollow: FOLLOW }));
const out = [];
function add(name, p, seat = null) {
  const s = solver.solve(p);
  out.push({ name, seat, seatDepth: SEAT_DEPTH, bones: Object.fromEntries(BONES.map((b, i) => [b, [...s.q[i].toArray(), ...s.p[i].toArray()]])) });
}
add('seated', seatedPose(undefined, 0.38), 0.38);
add('seated low', seatedPose(undefined, 0.23), 0.23);
{ const p = seatedPose(undefined, 0.34); gesture(p, 'helm', 0.8, true); add('helm swap', p, 0.34); }
{ const p = standingPose(); gesture(p, 'praise', 1.2); add('praise', p); }
for (const [m, b] of [['headbang', 0.02], ['jumpingJack', 0.02], ['swayArms', 0], ['stomp', 0.8], ['clap', 0.02], ['fistPump', 0.02]]) {
  const p = standingPose(); dance(p, m, 8 + b, { period: 0.5, energy: 1, seed: 0 }); add(m, p);
}
console.log(JSON.stringify(out));
"""


def runtime_poses():
    import json
    import subprocess
    try:
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # (the project with knightPose.js)
        run = subprocess.run(["node", "--input-type=module", "-e", POSE_JS.replace("FOLLOW", str(TASSET_FOLLOW))],
                             cwd=here, capture_output=True, text=True, timeout=60)
        return json.loads(run.stdout)
    except Exception as error:  # (no node, or knightPose.js failed)
        print("[knight] the runtime's poses are unavailable:", error)
        return []


def node_of(bone):
    """knightPose.js's bone name -> the model's node ('upperArmL' -> 'K_UpperArm_L')."""
    side = bone[-1] if bone[-1] in "LR" else ""
    base = bone[:-1] if side else bone
    return f"K_{base[0].upper()}{base[1:]}" + (f"_{side}" if side else "")


REST_LOC = {name: e.location.copy() for name, e in EMPTIES.items()}


def pose(entry=None):
    """The rest pose, or a runtime pose: three.js knight space (y up, +z forward) is
    Blender (x, -z, y)."""
    for name, e in EMPTIES.items():
        e.rotation_euler = (0, 0, 0)
        e.location = REST_LOC[name]
    if entry:
        world = {}
        for bone, (qx, qy, qz, qw, px, py, pz) in entry["bones"].items():
            world[node_of(bone)] = Matrix.Translation((px, -pz, py)) @ Quaternion((qw, qx, -qz, qy)).to_matrix().to_4x4()
        for bone in entry["bones"]:  # (parents first)
            name = node_of(bone)
            e = EMPTIES[name]
            e.matrix_basis = world.get(e.parent.name, Matrix.Identity(4)).inverted() @ world[name]
    bpy.context.view_layer.update()


POSES = runtime_poses()


# --- Renders --------------------------------------------------------------------------------

LIGHTS = []


def set_look(kind):
    """'flat': Workbench material colors like bonfire.py's preview; 'lit': EEVEE with a
    polished finish, by the fire's light and the moon (the fire-lit review renders). The
    flat look's cavity shading draws the flutes' ridges and valleys."""
    finish = {"K_Plate": (0.6, 0.34), "K_Edge": (0.6, 0.28), "K_Trim": (0.6, 0.28), "K_Mail": (0.5, 0.62)}
    for name, m in MAT.items():
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        metal, rough = finish.get(name, (0.0, 0.9)) if kind != "flat" else (0.0, 1.0)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
    if kind == "flat":
        scene.render.engine = "BLENDER_WORKBENCH"
        sh = scene.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sh.cavity_ridge_factor, sh.cavity_valley_factor = 1.0, 1.0
        sh.curvature_ridge_factor, sh.curvature_valley_factor = 0.8, 0.8
        sh.show_object_outline = True
        sh.show_specular_highlight = False
    else:
        for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue
        scene.eevee.taa_render_samples = 32
    scene.view_settings.view_transform = "Standard"
    for ob in LIGHTS:
        ob.hide_render = kind != "lit"


def set_world(rgb):
    """The background color, for Workbench (world.color) and EEVEE (the world's
    Background node)."""
    w = scene.world
    w.color = rgb
    if w.node_tree:
        for node in w.node_tree.nodes:
            if node.type == "BACKGROUND":
                node.inputs[0].default_value = (*rgb, 1.0)
                node.inputs[1].default_value = 1.0


def aim(loc, target, ortho=None, lens=50):
    cam = scene.camera
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens


def around(target, dist, yaw, pitch):
    """Camera position `dist` from target; yaw 0 = in front (-Y), 90 = the knight's left."""
    y, p = math.radians(yaw), math.radians(pitch)
    return Vector(target) + Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * dist


def show_helm(which):
    for h in HELMS:
        bpy.data.objects[f"{h}_Mesh"].hide_render = which is not None and h != which


def render(path, w, h):
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def read_png(path):
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]  # top row first


def write_png(arr, path, levels=48):
    """An RGB PNG (top row first), each channel posterized to `levels` steps so the
    sheets stay small (flat shading has few tones anyway), at zlib's best compression."""
    import struct
    import zlib

    import numpy as np
    rgb = np.clip(np.round(arr[..., :3] * (levels - 1)) / (levels - 1) * 255, 0, 255).astype(np.uint8)
    h, w = rgb.shape[:2]
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def sheet(rows, path, scale=1):
    """Tile rendered images (rows of paths) into one PNG; `scale` enlarges with
    nearest-neighbour pixels."""
    import numpy as np
    grid = [np.concatenate([read_png(p) for p in row], axis=1) for row in rows]
    out = np.concatenate(grid, axis=0)
    if scale > 1:
        out = np.repeat(np.repeat(out, scale, axis=0), scale, axis=1)
    write_png(out, path)


def preview_props():
    """Ground, a seat block, the fire and moon lights and a camera, in a Preview
    collection that is removed before export."""
    props = bpy.data.collections.new("Preview")
    scene.collection.children.link(props)

    def mesh_object(name, bm, hex_color):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(material(name, hex_color))
        ob = bpy.data.objects.new(name, me)
        props.objects.link(ob)
        return ob

    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=2.5)
    ground = mesh_object("PreviewGround", bm, "#1d1a24")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    seat = mesh_object("PreviewSeat", bm, "#57536b")
    fire = bpy.data.lights.new("Fire", "POINT")
    fire.color, fire.energy, fire.shadow_soft_size = (1.0, 0.52, 0.22), 260, 0.15
    moon = bpy.data.lights.new("Moon", "SUN")
    moon.color, moon.energy = (0.55, 0.66, 1.0), 1.4
    lights = []
    for data, loc in ((fire, (0.15, -1.15, 0.42)), (moon, (-2, 2, 3))):
        ob = bpy.data.objects.new(data.name, data)
        ob.location = loc
        if data.type == "SUN":
            ob.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        props.objects.link(ob)
        lights.append(ob)
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    props.objects.link(cam)
    scene.camera = cam
    scene.world = bpy.data.worlds.new("World") if scene.world is None else scene.world
    return props, ground, seat, lights


def knight_bounds():
    """World bounds of the knight's visible pieces, as posed."""
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for ob in scene.objects:
        if ob.type == "MESH" and ob.name.startswith("K_") and not ob.hide_render:
            for c in ob.bound_box:
                w = ob.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
    return lo, hi


def place_seat(seat, spec):
    seat.hide_render = not spec
    if spec:
        seat.location = (spec[0], spec[1], spec[2] / 2)
        seat.scale = (0.5, 0.42, spec[2])


def renders():
    import tempfile
    tmp = tempfile.mkdtemp(prefix="knight-")
    src = os.path.join(ROOT, "assets", "source")
    os.makedirs(src, exist_ok=True)
    props, ground, seat, lights = preview_props()
    LIGHTS[:] = lights
    scene.render.image_settings.compression = 100
    set_world((0.03, 0.03, 0.04))

    # Preview: front three-quarter, side, back (rest pose, great helm).
    set_look("flat")
    pose()
    place_seat(seat, None)
    show_helm("K_Helm_Great")
    if POSES_ONLY:
        poses_sheet(tmp, seat, JUDGE or src)
        return props
    tiles = []
    for i, yaw in enumerate((35, 90, 180)):
        aim(around((0, 0, 0.88), 6, yaw, 6), (0, 0, 0.88), ortho=2.0)
        tiles.append(render(os.path.join(tmp, f"preview{i}.png"), 460, 660))
    sheet([tiles], os.path.join(src, "knight-preview.png"))

    # Helmets: the three side by side, front and three-quarter.
    rows = []
    for yaw in (0, 35):
        row = []
        for h in HELMS:
            show_helm(h)
            aim(around((0, 0, 1.53), 6, yaw, 4), (0, 0, 1.53), ortho=0.66)
            row.append(render(os.path.join(tmp, f"helm-{h}-{yaw}.png"), 360, 360))
        rows.append(row)
    sheet(rows, os.path.join(src, "knight-helmets.png"))

    poses_sheet(tmp, seat, src)
    if JUDGE:
        judge(tmp, seat)
    pose()
    return props


def poses_sheet(tmp, seat, out_dir):
    """The runtime's poses on the model, to check the plates for clipping: from his left
    front, as the site's home camera sees him at his seat (front right, from above) and
    from his right, five to a row."""
    show_helm("K_Helm_Great")
    views = {30: [], -32: [], -75: []}
    entries = POSES or [None]
    for i, entry in enumerate(entries):
        pose(entry)
        place_seat(seat, (0.0, 0.06, entry["seat"]) if entry and entry.get("seat") else None)
        lo, hi = knight_bounds()
        mid = (lo + hi) / 2
        size = max(hi.z - lo.z, (hi.x - lo.x) * 1.2, (hi.y - lo.y) * 1.2) * 1.12
        for yaw, tiles in views.items():
            aim(around(mid, 6, yaw, 13 if yaw == -32 else 8), mid, ortho=size)
            tiles.append(render(os.path.join(tmp, f"pose-{i}-{yaw}.png"), 240, 300))
    per = min(5, len(entries))
    rows = []
    for k in range(0, len(entries), per):
        for tiles in views.values():
            row = tiles[k:k + per]
            rows.append(row + tiles[:per - len(row)])  # (a short last row repeats the first poses)
    sheet(rows, os.path.join(out_dir, "knight-poses.png"))


def judge(tmp, seat):
    """Review renders: seated by the fire (EEVEE, polished plate, a warm light low in
    front and a faint cold moon behind), and the same at sprite size, 4x nearest."""
    os.makedirs(JUDGE, exist_ok=True)
    seated = next((e for e in POSES if e["name"] == "seated"), None)
    pose(seated)
    place_seat(seat, (0.0, 0.06, seated["seat"]) if seated else None)
    set_world((0.004, 0.004, 0.007))
    for look in ("lit", "flat"):
        set_look(look)
        tiles, small = [], []
        for h in HELMS:
            show_helm(h)
            aim(around((0, -0.05, 0.62), 6, -28, 12), (0, -0.05, 0.62), ortho=1.5)
            tiles.append(render(os.path.join(tmp, f"judge-{look}-{h}.png"), 600, 720))
            # sprite size: about 90 px for the seated knight, no anti-aliasing
            scene.render.filter_size, scene.display.render_aa = 0.0, "OFF"
            small.append(render(os.path.join(tmp, f"judge-{look}-{h}-small.png"), 100, 120))
            scene.render.filter_size, scene.display.render_aa = 1.5, "8"
        sheet([tiles], os.path.join(JUDGE, f"judge-{look}.png"))
        sheet([small], os.path.join(JUDGE, f"judge-{look}-pixels.png"), scale=4)
    set_look("flat")
    set_world((0.03, 0.03, 0.04))


if not QUICK:
    for ob in list(renders().objects):
        if ob.type != "CAMERA":  # keep the preview camera in the .blend
            bpy.data.objects.remove(ob)
    show_helm(None)
pose()
if LOOK:
    sys.exit(0)

os.makedirs(os.path.join(ROOT, "assets", "source"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "assets", "source", "knight.blend"))

# Export only the knight: the camera stays in the .blend.
for ob in list(scene.objects):
    if ob.type not in ("EMPTY", "MESH"):
        bpy.data.objects.remove(ob)
os.makedirs(os.path.join(ROOT, "public", "models"), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, "public", "models", "knight.glb"),
    export_format="GLB",
    export_cameras=False,
    export_lights=False,
    export_apply=True,
    export_normals=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_animations=False,   # poses are procedural, in JS
    export_extras=True,        # the root's custom props -> userData
)
print(f"[knight] objects={len(scene.objects)} -> {ROOT}")
