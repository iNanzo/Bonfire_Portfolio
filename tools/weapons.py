# Sixteen weapons for the bonfire, built procedurally with bmesh.
#
# Style: dark and worn but simple — blackened fittings, leather-wrapped grips,
# chipped edges, dark fullers. Blades are shaded like pixel sprites with three
# flat tones (bright edge bevels, mid steel flats, dark fuller/spine), which the
# site's pixel renderer quantizes and dithers.
#
# Each weapon is modeled "in hand" (grip at z=0, pointing up +Z, blade flat in
# the XZ plane so its wide face looks at the camera), then planted point-first
# into the ashes by plant(). The final object's origin is the point where it
# enters the ground; sizes are final (the site does not rescale them). Guards
# sit roughly at 1.0m (one-handed) to 1.25m (two-handed), above the flames.

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

WEAPON_KEYS = [
    "longsword", "broadsword", "bastard", "claymore", "katana", "uchigatana",
    "sabre", "rapier", "estoc", "spear", "greatsword", "glaive", "naginata",
    "zweihander", "flamberge", "flambergezwei",
]

# Blade tones → material keys (see bonfire.py).
TONES = ["w_edge", "w_steel", "w_dark"]
EDGE, STEEL, DARK = 0, 1, 2


class Builder:
    def __init__(self, name, seed):
        self.name = name
        self.parts = []  # (bmesh, [material keys])
        self.rng = random.Random(seed)

    def _add(self, bm, mats):
        self.parts.append((bm, list(mats) if isinstance(mats, (list, tuple)) else [mats]))
        return bm

    # --- primitives -------------------------------------------------------------

    def box(self, mat, c, s):
        bm = bmesh.new()
        geom = bmesh.ops.create_cube(bm, size=1.0)
        for v in geom["verts"]:
            v.co = Vector((v.co.x * s[0] + c[0], v.co.y * s[1] + c[1], v.co.z * s[2] + c[2]))
        return self._add(bm, mat)

    def cyl(self, mat, r1, r2, z0, z1, segs=6, x=0.0, y=0.0):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                              radius1=r1, radius2=r2, depth=abs(z1 - z0))
        bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
        return self._add(bm, mat)

    def disc(self, mat, r, thick, z, segs=8, x=0.0):
        """Wheel pommel: a short cylinder facing the camera (axis along Y)."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=thick)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(x, 0, z), verts=bm.verts)
        return self._add(bm, mat)

    def rod_x(self, mat, r, length, z, segs=6):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=length)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, z), verts=bm.verts)
        return self._add(bm, mat)

    def ball(self, mat, r, c, squash=(1, 1, 1)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in bm.verts:
            v.co = Vector((v.co.x * squash[0] + c[0], v.co.y * squash[1] + c[1], v.co.z * squash[2] + c[2]))
        return self._add(bm, mat)

    def plate(self, mat, pts, t, y=0.0, rot_z=0.0):
        """Flat extruded polygon in the XZ plane, `t` thick along Y (centered on y)."""
        bm = bmesh.new()
        top = [bm.verts.new((x, y + t / 2, z)) for x, z in pts]
        bot = [bm.verts.new((x, y - t / 2, z)) for x, z in pts]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((top[i], bot[i], bot[j], top[j]))
        if rot_z:
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z, 3, "Z"), verts=bm.verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._add(bm, mat)

    def band(self, mat, outer, inner, t, y=0.0):
        return self.plate(mat, list(outer) + list(reversed(inner)), t, y)

    def ring(self, mat, R, r, t, z, segs=10):
        bm = bmesh.new()
        ot, ob, it, ib = [], [], [], []
        for i in range(segs):
            a = i / segs * math.tau
            c, s = math.cos(a), math.sin(a)
            ot.append(bm.verts.new((R * c, R * s, z + t / 2)))
            ob.append(bm.verts.new((R * c, R * s, z - t / 2)))
            it.append(bm.verts.new((r * c, r * s, z + t / 2)))
            ib.append(bm.verts.new((r * c, r * s, z - t / 2)))
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((ot[i], ot[j], it[j], it[i]))
            bm.faces.new((ob[i], ib[i], ib[j], ob[j]))
            bm.faces.new((ot[i], ob[i], ob[j], ot[j]))
            bm.faces.new((it[i], it[j], ib[j], ib[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._add(bm, mat)

    def grip(self, mat, r, z0, z1, rings=3, ring_mat="w_iron", segs=6):
        """Wrapped grip with raised binding rings."""
        self.cyl(mat, r, r * 0.94, z0, z1, segs)
        for k in range(rings):
            z = z0 + (z1 - z0) * (k + 0.5) / rings
            self.cyl(ring_mat, r * 1.16, r * 1.16, z - 0.006, z + 0.006, segs)

    def fuller(self, z0, z1, w, t, x=0.0):
        """Dark groove down the blade's center, on both faces."""
        for side in (1, -1):
            self.box("w_dark", (x, side * t * 0.97, (z0 + z1) / 2), (w, 0.004, z1 - z0))

    def blade(self, stations, tip, single=False, chips=0.0):
        """Loft a blade along stations, shaded in three tones.

        station = ((px, pz), (nx, nz), a, b, t)
          p: center, n: unit normal in XZ, a: extent toward -n (the edge on
          single-edged blades), b: extent toward +n, t: half thickness.
        chips: chance per station of a notch in an edge (gritty, worn blades).
        """
        bm = bmesh.new()
        rings, tones = [], None
        last = len(stations) - 1
        for i, ((px, pz), (nx, nz), a, b, t) in enumerate(stations):
            if chips and 1 < i < last - 1 and self.rng.random() < chips:
                if single or self.rng.random() < 0.5:
                    a *= self.rng.uniform(0.62, 0.85)
                else:
                    b *= self.rng.uniform(0.62, 0.85)
            if single:
                prof = [(-a, 0, EDGE), (-a * 0.45, t * 0.8, STEEL), (b * 0.4, t, STEEL), (b, t * 0.6, DARK),
                        (b, -t * 0.6, STEEL), (b * 0.4, -t, STEEL), (-a * 0.45, -t * 0.8, EDGE)]
            else:
                prof = [(-a, 0, EDGE), (-a * 0.6, t * 0.85, STEEL), (0, t, STEEL), (b * 0.6, t * 0.85, EDGE),
                        (b, 0, EDGE), (b * 0.6, -t * 0.85, STEEL), (0, -t, STEEL), (-a * 0.6, -t * 0.85, EDGE)]
            tones = [p[2] for p in prof]
            rings.append([bm.verts.new((px + nx * o, y, pz + nz * o)) for o, y, _ in prof])
        n = len(tones)
        for i in range(len(rings) - 1):
            for k in range(n):
                k2 = (k + 1) % n
                f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
                f.material_index = tones[k]
        cap = bm.faces.new(list(reversed(rings[0])))
        cap.material_index = STEEL
        tv = bm.verts.new((tip[0], 0, tip[1]))
        for k in range(n):
            f = bm.faces.new((rings[-1][k], rings[-1][(k + 1) % n], tv))
            f.material_index = tones[k]
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._add(bm, TONES)

    # --- finishing ----------------------------------------------------------------

    def finish(self, xform, M, join):
        objs = []
        for i, (bm, mats) in enumerate(self.parts):
            bm.transform(xform)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new(f"{self.name}_part{i:02d}")
            bm.to_mesh(me)
            bm.free()
            for p in me.polygons:
                p.use_smooth = False
            for m in mats:
                me.materials.append(M[m])
            ob = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        return join(objs, self.name)


# --- station helpers -----------------------------------------------------------------

def straight(z0, z1, widths, t, count=14):
    """Symmetric straight blade; widths are sampled evenly and interpolated."""
    out = []
    for i in range(count + 1):
        s = i / count
        f = s * (len(widths) - 1)
        k = min(int(f), len(widths) - 2)
        w = widths[k] + (widths[k + 1] - widths[k]) * (f - k)
        out.append(((0.0, z0 + (z1 - z0) * s), (1.0, 0.0), w, w, t))
    return out


def along(path, count, a_fn, b_fn, t_fn, s_end=1.0):
    """Stations following path(s) -> (x, z); normals come from the tangent."""
    out = []
    for i in range(count + 1):
        s = i / count * s_end
        x, z = path(s)
        x2, z2 = path(min(1.0, s + 0.005))
        x1, z1 = path(max(0.0, s - 0.005))
        tx, tz = x2 - x1, z2 - z1
        ln = math.hypot(tx, tz) or 1
        out.append(((x, z), (tz / ln, -tx / ln), a_fn(s), b_fn(s), t_fn(s)))
    return out


def plant(tip, depth, grip=(0.0, 0.0), scale=1.0):
    """Turn the weapon so grip→tip points straight down, bury the tip `depth`,
    and put the ground-entry point at the origin."""
    tx, tz = (tip[0] - grip[0]) * scale, (tip[1] - grip[1]) * scale
    phi = math.pi - math.atan2(tx, tz)
    R = Matrix.Rotation(phi, 4, "Y")
    tip_r = R @ Vector((tip[0] * scale, 0, tip[1] * scale))
    return Matrix.Translation((-tip_r.x, 0, -(tip_r.z + depth))) @ R @ Matrix.Scale(scale, 4)


def wave(w, k, amp, phase=0.0, calm=0.12):
    """Flamberge edge: width w(s) rippled k times, calm near the guard."""
    return lambda s: w(s) * (1 + (amp * math.sin(math.tau * k * s + phase) if s > calm else 0))


# --- hilt helpers ----------------------------------------------------------------------

def crossguard(b, z, half, thick=0.04, drop=0.0):
    """Straight bar; `drop` turns the tips toward the blade."""
    b.box("w_iron", (0, 0, z), (half * 2, thick, thick * 0.9))
    if drop:
        for sx in (1, -1):
            b.box("w_iron", (sx * (half - 0.012), 0, z + drop / 2), (0.026, thick, abs(drop) + thick * 0.6))


def tsuba(b, r, z, square=False, mat="w_iron"):
    if square:
        b.box(mat, (0, 0, z), (r * 1.8, r * 1.8, 0.012))
    else:
        b.cyl(mat, r, r, z - 0.006, z + 0.006, segs=8)


# --- the weapons ------------------------------------------------------------------------

def build_longsword(b):
    b.disc("w_iron", 0.036, 0.026, 0.03)
    b.grip("w_leather", 0.019, 0.05, 0.25, rings=3)
    crossguard(b, 0.27, 0.12, drop=0.028)
    b.blade(straight(0.29, 1.3, [0.05, 0.049, 0.046, 0.042, 0.036, 0.026], 0.01), (0, 1.42), chips=0.15)
    b.fuller(0.32, 0.95, 0.012, 0.01)
    return plant((0, 1.42), 0.14)


def build_broadsword(b):
    b.ball("w_iron", 0.033, (0, 0, 0.03), squash=(1, 0.8, 1.1))
    b.grip("w_leather", 0.02, 0.05, 0.22, rings=2)
    b.box("w_iron", (0.01, 0, 0.235), (0.2, 0.04, 0.03))
    outer = [(-0.03, 0.245), (-0.085, 0.2), (-0.1, 0.12), (-0.08, 0.05), (-0.03, 0.02)]
    b.band("w_iron", outer, [(x + 0.014, z) for x, z in outer], 0.012)
    side = [(-0.02, 0.245), (-0.07, 0.2), (-0.075, 0.14)]
    for y in (0.028, -0.028):
        b.band("w_iron", side, [(x + 0.01, z) for x, z in side], 0.008, y=y)
    st = [((0.0, 0.25 + 1.0 * s), (1.0, 0.0), 0.042 - 0.012 * s, 0.022 - 0.01 * s, 0.011)
          for s in [i / 14 for i in range(15)]]
    b.blade(st, (0.012, 1.37), single=True, chips=0.22)
    return plant((0.012, 1.37), 0.14)


def build_bastard(b):
    b.ball("w_iron", 0.03, (0, 0, 0.035), squash=(0.85, 0.7, 1.3))
    b.grip("w_leather", 0.02, 0.06, 0.33, rings=4)
    b.plate("w_iron", [(-0.155, 0.365), (-0.05, 0.352), (0.05, 0.352), (0.155, 0.365),
                       (0.155, 0.34), (0.05, 0.33), (-0.05, 0.33), (-0.155, 0.34)], 0.04)
    b.blade(straight(0.37, 1.45, [0.052, 0.05, 0.047, 0.043, 0.037, 0.027], 0.011), (0, 1.57), chips=0.18)
    b.fuller(0.4, 0.95, 0.013, 0.011)
    return plant((0, 1.57), 0.14)


def build_claymore(b):
    b.disc("w_iron", 0.032, 0.03, 0.03)
    b.ball("w_iron", 0.016, (0, 0, 0.065))
    b.grip("w_wrap", 0.021, 0.08, 0.4, rings=5, ring_mat="w_leather")
    b.box("w_iron", (0, 0, 0.415), (0.06, 0.045, 0.05))
    for sx in (1, -1):
        b.plate("w_iron", [(sx * 0.02, 0.41), (sx * 0.2, 0.5), (sx * 0.215, 0.47), (sx * 0.03, 0.39)], 0.03)
        for dx, dz in ((0.0, 0.028), (0.022, 0.0), (-0.022, 0.0)):
            b.ball("w_iron", 0.017, (sx * (0.215 + dx), 0, 0.49 + dz))
    b.box("w_leather", (0, 0, 0.455), (0.075, 0.05, 0.03))   # rain guard
    b.plate("w_cloth", [(0.03, 0.46), (0.06, 0.45), (0.075, 0.3), (0.05, 0.28), (0.045, 0.4)], 0.006, y=0.03)
    b.blade(straight(0.47, 1.64, [0.056, 0.055, 0.052, 0.048, 0.042, 0.03], 0.011), (0, 1.77), chips=0.2)
    b.fuller(0.5, 1.0, 0.014, 0.011)
    return plant((0, 1.77), 0.14)


def build_katana(b):
    b.cyl("w_iron", 0.025, 0.024, 0.0, 0.025)
    b.grip("w_wrap", 0.023, 0.025, 0.33, rings=5, ring_mat="w_wrap")
    tsuba(b, 0.05, 0.337)
    b.box("w_brass", (0.004, 0, 0.352), (0.034, 0.022, 0.02))
    path = lambda s: (0.07 * s * s, 0.36 + 1.05 * s)
    st = along(path, 16, lambda s: 0.03 * (1 - 0.25 * s), lambda s: 0.01, lambda s: 0.008, s_end=0.93)
    x, z = path(1.0)
    b.blade(st, (x + 0.01, z), single=True, chips=0.08)
    return plant((x + 0.01, z), 0.14)


def build_uchigatana(b):
    b.cyl("w_iron", 0.024, 0.024, 0.0, 0.022)
    b.grip("w_leather", 0.023, 0.022, 0.3, rings=4, ring_mat="w_wrap")
    tsuba(b, 0.045, 0.31, square=True)
    path = lambda s: (0.05 * s * s, 0.325 + 0.98 * s)
    st = along(path, 16, lambda s: 0.031 * (1 - 0.2 * s), lambda s: 0.011, lambda s: 0.009, s_end=0.93)
    x, z = path(1.0)
    b.blade(st, (x + 0.01, z), single=True, chips=0.14)
    return plant((x + 0.01, z), 0.14)


def build_sabre(b):
    b.ball("w_brass", 0.026, (0, 0, 0.022))
    b.grip("w_leather", 0.02, 0.04, 0.22, rings=4, ring_mat="w_brass")
    b.box("w_iron", (0.02, 0, 0.235), (0.12, 0.034, 0.03))
    outer = [(-0.035, 0.245), (-0.085, 0.205), (-0.1, 0.12), (-0.078, 0.045), (-0.03, 0.01)]
    b.band("w_iron", outer, [(x + 0.014, z) for x, z in outer], 0.012)
    path = lambda s: (0.07 * s * s, 0.25 + 1.05 * s)
    st = along(path, 16, lambda s: 0.027 * (1 - 0.3 * s), lambda s: 0.009, lambda s: 0.008, s_end=0.93)
    x, z = path(1.0)
    b.blade(st, (x + 0.005, z), single=True, chips=0.12)
    return plant((x + 0.005, z), 0.14)


def build_rapier(b):
    b.ball("w_iron", 0.04, (0, 0, 0.025))
    b.grip("w_wrap", 0.018, 0.06, 0.24, rings=6, ring_mat="w_brass")
    b.rod_x("w_iron", 0.011, 0.38, 0.255)
    for sx in (1, -1):
        b.ball("w_iron", 0.017, (sx * 0.19, 0, 0.255))
    outer = [(-0.025, 0.265), (-0.085, 0.215), (-0.1, 0.13), (-0.075, 0.06), (-0.025, 0.04)]
    b.band("w_iron", outer, [(x + 0.014, z) for x, z in outer], 0.011)
    b.ring("w_iron", 0.06, 0.047, 0.009, 0.275)
    b.blade(straight(0.28, 1.3, [0.021, 0.019, 0.017, 0.014, 0.011], 0.009), (0, 1.44), chips=0.05)
    return plant((0, 1.44), 0.14)


def build_estoc(b):
    b.ball("w_iron", 0.03, (0, 0, 0.035), squash=(1, 0.9, 1.25))
    b.grip("w_leather", 0.02, 0.06, 0.33, rings=4)
    crossguard(b, 0.35, 0.13, thick=0.036, drop=0.022)
    b.ring("w_iron", 0.035, 0.024, 0.008, 0.37)
    b.blade(straight(0.37, 1.44, [0.018, 0.017, 0.016, 0.014, 0.011], 0.013), (0, 1.56))
    return plant((0, 1.56), 0.14)


def build_spear(b):
    b.cyl("w_iron", 0.02, 0.026, -0.05, 0.0)                   # butt cap
    b.cyl("w_wood", 0.022, 0.022, 0.0, 1.55)
    for z in (0.5, 1.0):
        b.cyl("w_iron", 0.026, 0.026, z - 0.015, z + 0.015)
    b.cyl("w_iron", 0.034, 0.024, 1.55, 1.65)                  # socket
    b.plate("w_cloth", [(0.02, 1.54), (0.05, 1.53), (0.07, 1.36), (0.045, 1.34), (0.04, 1.5)], 0.006, y=0.026)
    b.blade(straight(1.65, 1.9, [0.02, 0.054, 0.05, 0.034], 0.012, count=8), (0, 2.02), chips=0.1)
    return plant((0, 2.02), 0.16, scale=0.9)


def build_greatsword(b):
    b.ball("w_iron", 0.045, (0, 0, 0.035), squash=(1, 0.8, 0.9))
    b.grip("w_leather", 0.026, 0.07, 0.42, rings=5)
    b.box("w_iron", (0, 0, 0.45), (0.34, 0.06, 0.055))
    b.box("w_iron", (0, 0, 0.455), (0.1, 0.07, 0.085))
    b.plate("w_cloth", [(-0.04, 0.47), (-0.07, 0.47), (-0.1, 0.3), (-0.08, 0.27), (-0.06, 0.4)], 0.006, y=0.036)
    b.blade(straight(0.49, 1.6, [0.12, 0.118, 0.114, 0.108, 0.098, 0.085], 0.018), (0, 1.7), chips=0.35)
    b.fuller(0.53, 1.2, 0.03, 0.018)
    return plant((0, 1.7), 0.16)


def build_glaive(b):
    b.cyl("w_iron", 0.02, 0.026, -0.05, 0.0)
    b.cyl("w_wood", 0.023, 0.023, 0.0, 1.35)
    for z in (0.45, 0.9, 1.3):
        b.cyl("w_iron", 0.027, 0.027, z - 0.015, z + 0.015)
    b.cyl("w_iron", 0.032, 0.028, 1.33, 1.42)
    b.plate("w_iron", [(0.02, 1.38), (0.08, 1.4), (0.1, 1.46), (0.02, 1.43)], 0.012)   # back spur
    path = lambda s: (-0.045 * s * s, 1.42 + 0.6 * s)
    st = along(path, 12, lambda s: 0.055 + 0.02 * math.sin(math.pi * s) - 0.03 * s, lambda s: 0.014,
               lambda s: 0.011, s_end=0.94)
    x, z = path(1.0)
    b.blade(st, (x - 0.015, z), single=True, chips=0.2)
    return plant((x - 0.015, z), 0.15, scale=0.9)


def build_naginata(b):
    b.cyl("w_iron", 0.02, 0.025, -0.04, 0.0)
    b.cyl("w_wood", 0.022, 0.022, 0.0, 1.3)
    for z in (0.4, 0.8, 1.22):
        b.cyl("w_iron", 0.025, 0.025, z - 0.012, z + 0.012)
    tsuba(b, 0.036, 1.305)
    b.box("w_brass", (0.003, 0, 1.325), (0.032, 0.022, 0.02))
    path = lambda s: (0.1 * s * s, 1.335 + 0.62 * s)
    st = along(path, 14, lambda s: 0.034 * (1 - 0.1 * s), lambda s: 0.011, lambda s: 0.009, s_end=0.92)
    x, z = path(1.0)
    b.blade(st, (x + 0.012, z), single=True, chips=0.12)
    return plant((x + 0.012, z), 0.15, scale=0.9)


def zwei_hilt(b):
    b.ball("w_iron", 0.04, (0, 0, 0.04), squash=(0.9, 0.7, 1.4))
    b.grip("w_wrap", 0.024, 0.08, 0.46, rings=4, ring_mat="w_leather")
    b.cyl("w_leather", 0.03, 0.03, 0.26, 0.29)
    b.box("w_iron", (0, 0, 0.48), (0.5, 0.045, 0.04))
    for sx in (1, -1):
        b.ball("w_iron", 0.02, (sx * 0.25, 0, 0.5))
        b.box("w_iron", (sx * 0.24, 0, 0.465), (0.02, 0.04, 0.05))
    b.box("w_leather", (0, 0, 0.56), (0.046, 0.03, 0.14))    # ricasso wrap
    for sx in (1, -1):
        b.plate("w_iron", [(sx * 0.028, 0.63), (sx * 0.095, 0.675), (sx * 0.034, 0.695)], 0.014)  # parrying hooks


def build_zweihander(b):
    zwei_hilt(b)
    b.blade(straight(0.5, 1.76, [0.058, 0.056, 0.053, 0.049, 0.043, 0.032], 0.012), (0, 1.9), chips=0.2)
    b.fuller(0.72, 1.3, 0.014, 0.012)
    return plant((0, 1.9), 0.15)


def build_flamberge(b):
    b.disc("w_iron", 0.034, 0.026, 0.03)
    b.grip("w_leather", 0.02, 0.05, 0.3, rings=3)
    crossguard(b, 0.32, 0.13, drop=0.03)
    w = lambda s: 0.05 * (1 - 0.35 * s)
    st = [((0.0, 0.34 + 1.1 * s), (1.0, 0.0), wave(w, 6, 0.3)(s), wave(w, 6, 0.3, math.pi)(s), 0.01)
          for s in [i / 36 for i in range(37)]]
    b.blade(st, (0, 1.56), chips=0.05)
    return plant((0, 1.56), 0.14)


def build_flambergezwei(b):
    zwei_hilt(b)
    w = lambda s: 0.06 * (1 - 0.35 * s)
    st = [((0.0, 0.5 + 1.28 * s), (1.0, 0.0), wave(w, 8, 0.3, 0.0, 0.18)(s), wave(w, 8, 0.3, math.pi, 0.18)(s), 0.012)
          for s in [i / 44 for i in range(45)]]
    b.blade(st, (0, 1.92), chips=0.05)
    return plant((0, 1.92), 0.15)


BUILDERS = {k: globals()[f"build_{k}"] for k in WEAPON_KEYS}


def build_all(M, join):
    out = {}
    for i, key in enumerate(WEAPON_KEYS):
        b = Builder(f"Weapon_{key}", seed=100 + i)
        xform = BUILDERS[key](b)
        out[key] = b.finish(xform, M, join)
    return out
