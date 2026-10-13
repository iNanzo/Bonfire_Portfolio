"""NEWT's clips for the invitation toy: the user's low-poly chibi, animated.

Builds the 11 clips of src/invitation/clips.js (Idle, Walk, Run, Wave, Spook, Held, Fall, Land,
SitDown, Sit, StandUp) on NEWT's rig as one slotted Action each, and exports the rig, its meshes
and every clip as a binary glTF for three.js.

Run it either way:
  npm run model -- newt
      headless (tools/build-model.mjs runs
      blender --background --factory-startup --python tools/newt.py -- <repo root>):
      opens $NEWT_BLEND (default C:/Users/newto/Documents/NEWT_optimized.blend), builds, exports
      and saves NEWT_animated.blend next to it. The source .blend is never written.
      NEWT_BLEND=C:/Users/newto/Documents/NEWT_animated.blend npm run model -- newt rebuilds the
      committed glb byte for byte: the live file carries a small head fix NEWT_optimized.blend
      doesn't have (one chin quad of the face split in two), so the default differs there.
  In the live Blender (through the Blender MCP):
      exec(open(r'<repo>/tools/newt.py').read(), {'__name__': '__main__', '__file__': r'<repo>/tools/newt.py'})
      builds on the open file, exports, and saves it as NEWT_animated.blend beside it.
      NEWT_ONLY = ['Walk', ...] in those globals builds just those clips; NEWT_EXPORT = False skips
      the export and the save; NEWT_POSE = 'Sit' (a clip) with NEWT_FRAME shows a frame, keys none.

Outputs:
  public/models/newt.glb               the rig (17 bones), the meshes, the 11 clips; WebP, no Draco
  <source dir>/NEWT_animated.blend     the file with the Actions (never over another NEWT_*.blend)

The rig (armature object "Hip", T-pose rest, facing -Y, origin on the floor between the feet,
6.26 units tall): Bone (the hips, the root) -> Bone.001 (spare), Chest -> Neck -> Neck.001 (the
head); Chest -> Shoulder -> Bicep -> ForeArm (L/R); Bone -> Thigh -> Calf -> Foot (L/R). The
bones' rolls differ between the sides, so every pose here is written in ARMATURE SPACE and a small
forward-kinematics solver (Solver) turns it into each bone's local quaternion:
  hips   loc (x, y, z) offset from rest; rot (pitch, roll, yaw)
  chest, neck, head   (pitch, roll, yaw) on top of the parent's turn
  arm L/R  shoulder (up, fwd) degrees; upper/lower (fwd, out): the bicep's and forearm's direction
           in the chest's frame, swung from hanging straight down: fwd toward the front (90 points
           forward, 180 straight up), out toward his side (90 is the T-pose); twist about the bone
  leg L/R  at (x, y, z): the ankle's place in armature space (feet planted), or rel (dx, dy, dz)
           from the rest ankle, carried by the hips (dangling legs); pitch: toes down (+) or up
           (-); yaw: toes out; knee: which way the knee points
Angles are degrees. Pitch + leans forward, roll + tips toward his left (+X), yaw + turns his
face toward his left. Values given for L mirror onto R by the same numbers.

Each clip is a table of (frame, pose) key poses, or a function of the frame for the cycles (Walk
and Run from a few step parameters). Every frame is keyed: a table's key poses are eased number by
number along a monotone cubic (tween), so the legs' IK runs on each frame and a planted foot stays
put. Loops end on an exact copy of frame 0; quaternion signs stay continuous. Held pins the collar
(the Neck bone's head) where it rests.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 24
# name: (last frame, loops). Frame 0..last; a clip lasts last / FPS seconds (clips.js CLIPS).
CLIPS = {
    'Idle': (48, True),
    'Walk': (20, True),
    'Run': (14, True),
    'Wave': (36, False),
    'Spook': (20, False),
    'Held': (36, True),
    'Fall': (12, True),
    'Land': (14, False),
    'SitDown': (24, False),
    'Sit': (72, True),
    'StandUp': (24, False),
}
ORDER = [
    'Bone', 'Bone.001', 'Chest', 'Neck', 'Neck.001',
    'Shoulder.L', 'Bicep.L', 'ForeArm.L', 'Shoulder.R', 'Bicep.R', 'ForeArm.R',
    'Thigh.L', 'Calf.L', 'Foot.L', 'Thigh.R', 'Calf.R', 'Foot.R',
]  # fmt: skip
SIDES = (('L', 1), ('R', -1))
ARMATURE = 'Hip'


# ---------------------------------------------------------------------------------------------
# Armature-space posing


def rq(pitch=0.0, roll=0.0, yaw=0.0):
    """A turn about the armature's axes (degrees): X pitch, then Y roll, then Z yaw."""
    r = math.radians
    return (
        Quaternion((0, 0, 1), r(yaw))
        @ Quaternion((0, 1, 0), r(roll))
        @ Quaternion((1, 0, 0), r(pitch))
    )


def limb_dir(s, fwd, out):
    """A limb's direction from hanging straight down: fwd toward -Y (front), out toward his side."""
    f, o = math.radians(fwd), math.radians(out)
    return Vector((s * math.sin(o), -math.cos(o) * math.sin(f), -math.cos(o) * math.cos(f)))


class Solver:
    """Forward kinematics on the rest matrices, so poses are set without depsgraph updates."""

    def __init__(self, arm):
        bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.len = {b.name: (b.tail_local - b.head_local).length for b in bones}
        self.collar = self.rest['Neck'].translation.copy()
        self.reset()

    def reset(self):
        self.q = {n: Quaternion() for n in self.rest}
        self.M = {}
        self.loc = Vector()

    def base(self, n):
        """Where bone n would be with no turn of its own (its parent posed)."""
        p = self.parent[n]
        if p is None:
            return Matrix.Translation(self.loc) @ self.rest[n]
        return self.M[p] @ self.rest[p].inverted() @ self.rest[n]

    def set(self, n, q_arm):
        b = self.base(n)
        local = (b.to_quaternion().inverted() @ q_arm).normalized()
        self.q[n] = local
        self.M[n] = b @ local.to_matrix().to_4x4()

    def turn(self, n, dq):
        self.set(n, dq @ self.base(n).to_quaternion())

    def aim(self, n, d, twist=0.0):
        """Point bone n along d (armature space), swung the short way, then twisted about d."""
        bq = self.base(n).to_quaternion()
        d = d.normalized()
        y = bq @ Vector((0, 1, 0))
        self.set(n, Quaternion(d, math.radians(twist)) @ y.rotation_difference(d) @ bq)

    def head(self, n):
        return self.M[n].translation.copy()

    def tail(self, n):
        return self.M[n] @ Vector((0, self.len[n], 0))

    def local_loc(self):
        """The root's pose location (its own rest frame) for the armature-space offset."""
        return self.rest['Bone'].to_quaternion().inverted() @ self.loc


WARN = []


def apply(S, pose, _pinned=False):
    """Pose the solver from a pose dict (see the module docstring)."""
    S.reset()
    hips = pose.get('hips', {})
    S.loc = Vector(hips.get('loc', (0, 0, 0))) + pose.get('_shift', Vector())
    S.turn('Bone', rq(*hips.get('rot', (0, 0, 0))))
    S.turn('Bone.001', Quaternion())
    S.turn('Chest', rq(*pose.get('chest', (0, 0, 0))))
    S.turn('Neck', rq(*pose.get('neck', (0, 0, 0))))
    S.turn('Neck.001', rq(*pose.get('head', (0, 0, 0))))
    chest = S.M['Chest'].to_quaternion() @ S.rest['Chest'].to_quaternion().inverted()
    hipq = S.M['Bone'].to_quaternion() @ S.rest['Bone'].to_quaternion().inverted()
    for side, s in SIDES:
        a = pose.get('arm' + side, {})
        up, fwd = a.get('shoulder', (0, 0))
        # Shoulder up rolls the tip about Y; fwd swings it toward the front about Z.
        sq = Quaternion((0, 0, 1), math.radians(-s * fwd)) @ Quaternion((0, 1, 0), math.radians(-s * up))
        S.turn('Shoulder.' + side, chest @ sq @ chest.inverted())
        S.aim('Bicep.' + side, chest @ limb_dir(s, *a.get('upper', (0, 90))), s * a.get('twist', 0))
        S.aim('ForeArm.' + side, chest @ limb_dir(s, *a.get('lower', (0, 90))), s * a.get('twist2', 0))
    for side, s in SIDES:
        leg = pose.get('leg' + side, {})
        rest_ankle = S.rest['Foot.' + side].translation
        if 'rel' in leg:
            dx, dy, dz = leg['rel']
            ankle = S.M['Bone'] @ S.rest['Bone'].inverted() @ (rest_ankle + Vector((s * dx, dy, dz)))
        else:
            x, y, z = leg.get('at', (abs(rest_ankle.x), rest_ankle.y, rest_ankle.z))
            ankle = Vector((s * x, y, z))
        hip = S.base('Thigh.' + side).translation
        l1, l2 = S.len['Thigh.' + side], S.len['Calf.' + side]
        to = ankle - hip
        dist = to.length
        reach = (l1 + l2) * 0.9995
        if dist > reach:
            WARN.append('%s leg %s short by %.3f' % (pose.get('_name', '?'), side, dist - reach))
            dist = reach
        u = to.normalized()
        kx, ky, kz = leg.get('knee', (0.25, -1, 0))
        pole = hipq @ Vector((s * kx, ky, kz))
        v = (pole - u * pole.dot(u)).normalized()
        cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
        a = math.acos(cos_a)
        knee = hip + l1 * (math.cos(a) * u + math.sin(a) * v)
        S.aim('Thigh.' + side, knee - hip)
        S.aim('Calf.' + side, hip + u * dist - S.tail('Thigh.' + side))
        f0 = (S.rest['Foot.' + side].to_quaternion() @ Vector((0, 1, 0))).normalized()
        yaw = math.radians(hips.get('rot', (0, 0, 0))[2] + s * leg.get('yaw', 0))
        foot = Quaternion((0, 0, 1), yaw) @ Quaternion((1, 0, 0), math.radians(leg.get('pitch', 0))) @ f0
        if 'rel' in leg:
            foot = hipq @ Quaternion((1, 0, 0), math.radians(leg.get('pitch', 0))) @ f0
        S.aim('Foot.' + side, foot)
    if pose.get('pin') and not _pinned:
        # Held: move the hips so the collar stays where it rests (plus the pin's own offset).
        shift = S.collar + Vector(pose.get('pin_at', (0, 0, 0))) - S.head('Neck')
        pinned = dict(pose)
        pinned['_shift'] = pose.get('_shift', Vector()) + shift
        apply(S, pinned, _pinned=True)


def merge(base, **over):
    """A pose: base with some parts replaced (dicts one level deep merge)."""
    out = dict(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            d = dict(out[k])
            d.update(v)
            out[k] = d
        else:
            out[k] = v
    return out


def lerp(a, b, t):
    """Blend two numbers or tuples."""
    if isinstance(a, (int, float)):
        return a + (b - a) * t
    return tuple(x + (y - x) * t for x, y in zip(a, b))


ARM_DEFAULT = {'shoulder': (0, 0), 'upper': (0, 90), 'lower': (0, 90), 'twist': 0, 'twist2': 0}
LEG_DEFAULT = {'pitch': 0, 'yaw': 0, 'knee': (0.25, -1, 0)}


def planted(S, pose):
    """The pose with any dangling ('rel') leg written as the same leg placed by its ankle ('at'),
    so a key-pose table can ease from a dangling leg to a planted one number by number."""
    if not any('rel' in pose.get('leg' + side, {}) for side, _ in SIDES):
        return pose
    apply(S, pose)
    out = dict(pose)
    hip_yaw = pose.get('hips', {}).get('rot', (0, 0, 0))[2]

    def angles(d):  # below the horizontal, and the heading toward his left
        return math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y))), math.degrees(math.atan2(d.x, -d.y))

    for side, s in SIDES:
        leg = pose.get('leg' + side, {})
        if 'rel' not in leg:
            continue
        a = S.head('Foot.' + side)
        down, heading = angles(S.M['Foot.' + side].to_quaternion() @ Vector((0, 1, 0)))
        down0, heading0 = angles(S.rest['Foot.' + side].to_quaternion() @ Vector((0, 1, 0)))
        out['leg' + side] = {
            'at': (s * a.x, a.y, a.z),
            'pitch': down - down0,
            'yaw': s * (heading - heading0 - hip_yaw),
            'knee': leg.get('knee', LEG_DEFAULT['knee']),
        }
    return out


def flat(S, pose):
    """A pose as one list of numbers, every part and default spelled out (see unflat)."""
    v = []
    hips = pose.get('hips', {})
    v += hips.get('loc', (0, 0, 0))
    v += hips.get('rot', (0, 0, 0))
    for part in ('chest', 'neck', 'head'):
        v += pose.get(part, (0, 0, 0))
    for side, _ in SIDES:
        a = dict(ARM_DEFAULT, **pose.get('arm' + side, {}))
        v += [*a['shoulder'], *a['upper'], *a['lower'], a['twist'], a['twist2']]
    for side, _ in SIDES:
        leg = dict(LEG_DEFAULT, **pose.get('leg' + side, {}))
        rest = S.rest['Foot.' + side].translation
        v += [*leg.get('at', (abs(rest.x), rest.y, rest.z)), leg['pitch'], leg['yaw'], *leg['knee']]
    return v


def unflat(v):
    """flat's list back into a pose."""
    it = iter(v)

    def take(n):
        return tuple(next(it) for _ in range(n))

    p = {'hips': {'loc': take(3), 'rot': take(3)}, 'chest': take(3), 'neck': take(3), 'head': take(3)}
    for side, _ in SIDES:
        sh, up, lo, tw = take(2), take(2), take(2), take(2)
        p['arm' + side] = {'shoulder': sh, 'upper': up, 'lower': lo, 'twist': tw[0], 'twist2': tw[1]}
    for side, _ in SIDES:
        at, (pitch, yaw), knee = take(3), take(2), take(3)
        p['leg' + side] = {'at': at, 'pitch': pitch, 'yaw': yaw, 'knee': knee}
    return p


def monotone(xs, ys):
    """A monotone cubic through (xs, ys) (Fritsch-Carlson), flat at the ends: it eases through the
    keys, never overshoots them, and stays put between two equal ones."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def at(x):
        i = max(j for j in range(n - 1) if xs[j] <= x) if x > xs[0] else 0
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return (
            (2 * t3 - 3 * t2 + 1) * ys[i]
            + (t3 - 2 * t2 + t) * h[i] * m[i]
            + (3 * t2 - 2 * t3) * ys[i + 1]
            + (t3 - t2) * h[i] * m[i + 1]
        )

    return at


def tween(S, table, last):
    """Every frame 0..last of a key-pose table: each key as given, and between keys every number of
    the pose eased along a monotone cubic, so the legs' IK runs on each frame and a foot held
    between two keys stays exactly where it is (keying only the keys let rotations interpolate
    and the feet slid and sank)."""
    xs = [f for f, _ in table]
    rows = [flat(S, planted(S, p)) for _, p in table]
    curves = [monotone(xs, [r[i] for r in rows]) for i in range(len(rows[0]))]
    exact = dict(table)
    return [(f, exact[f] if f in exact else unflat([c(f) for c in curves])) for f in range(last + 1)]


# ---------------------------------------------------------------------------------------------
# Key poses (armature space; see the docstring for what each number means)

ANKLE = 0.417  # the ankle over the sole (clips.js ANKLE_HEIGHT)
TOE_TIP = (-0.826, -0.417)  # the sole's front edge from the ankle (y, z), the foot at rest
HEEL_TIP = (0.437, -0.417)  # the heel's back edge, likewise
STANCE = (0.6, 0.06, ANKLE)  # Idle's ankle, his left (+X); the right mirrors it
WIDE = (1.0, -0.08, ANKLE)  # Land's: where Fall's spread feet touch down
FALL_Z = 0.02  # Fall's hips over rest: its lowest sole meets the floor where Land begins

ARM_RELAXED = {'shoulder': (0, 0), 'upper': (4, 19), 'lower': (16, 15), 'twist': 0}
IDLE = {
    'hips': {'loc': (0, 0, -0.06), 'rot': (0, 0, 0)},
    'chest': (2, 0, 0),
    'neck': (0, 0, 0),
    'head': (0, 0, 0),
    'armL': ARM_RELAXED,
    'armR': ARM_RELAXED,
    'legL': {'at': STANCE, 'pitch': 0},
    'legR': {'at': STANCE, 'pitch': 0},
}

SIT = {
    'hips': {'loc': (0, 0, -1.58), 'rot': (-22, 0, 0)},
    'chest': (-4, 0, 0),
    'neck': (2, 0, 0),
    'head': (0, 0, 0),
    'armL': {'shoulder': (8, -6), 'upper': (-28, 24), 'lower': (-20, 18), 'twist': 0},
    'armR': {'shoulder': (8, -6), 'upper': (-28, 24), 'lower': (-20, 18), 'twist': 0},
    'legL': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
    'legR': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
}

HELD = {
    'pin': True,
    'hips': {'loc': (0, 0, 0), 'rot': (-6, 0, 0)},
    'chest': (-2, 0, 0),
    'neck': (4, 0, 0),
    'head': (9, 0, 0),  # drooping about 5 degrees in all, so the camera still sees his face
    # limp: shoulders dropped, the upper arms hanging straight down (the chest tilts back), the
    # elbows nearly straight, the hands at about (+-1.0, -0.25, 1.9)
    'armL': {'shoulder': (-14, 0), 'upper': (0, 16), 'lower': (4, 18), 'twist': 0},
    'armR': {'shoulder': (-14, 0), 'upper': (0, 16), 'lower': (4, 18), 'twist': 0},
    'legL': {'rel': (0.04, -0.22, 0.06), 'pitch': 62, 'yaw': -8, 'knee': (0.1, -1, 0)},  # feet apart, x +-0.75
    'legR': {'rel': (0.04, -0.22, 0.06), 'pitch': 62, 'yaw': -8, 'knee': (0.1, -1, 0)},
}

FALL = {
    'hips': {'loc': (0, 0, FALL_Z), 'rot': (-6, 0, 0)},
    'chest': (-6, 0, 0),
    'neck': (-4, 0, 0),
    'head': (-6, 0, 0),
    # arms up in front of the head (not behind the ears, where the sleeves went into it)
    'armL': {'shoulder': (14, 0), 'upper': (137, 48), 'lower': (150, 30), 'twist': 0},
    'armR': {'shoulder': (14, 0), 'upper': (137, 48), 'lower': (150, 30), 'twist': 0},
    'legL': {'rel': (0.32, -0.1, 0.32), 'pitch': 25, 'knee': (0.6, -1, 0)},
    'legR': {'rel': (0.32, -0.1, 0.32), 'pitch': 25, 'knee': (0.6, -1, 0)},
}


def idle(t):
    """Idle at t (0..1 of its loop): breathing twice, a small sway once."""
    br = math.sin(2 * math.pi * 2 * t)
    sw = math.sin(2 * math.pi * t)
    p = merge(
        IDLE,
        hips={'loc': (0.0, 0, -0.06 - 0.025 * br), 'rot': (0, 2.4 * sw, 0)},
        chest=(2 + 1.8 * br, -1.2 * sw, 0),
        head=(-1.2 * br, -2.2 * sw, 0),
    )
    up, out = ARM_RELAXED['upper']
    lo, out2 = ARM_RELAXED['lower']
    for side, s in SIDES:
        lean = -s * sw  # the arms swing a little with the sway
        p['arm' + side] = merge(
            ARM_RELAXED,
            shoulder=(2.0 * br, 0),
            upper=(up, out + 2.0 * br + 1.5 * lean),
            lower=(lo + 2 * br, out2 + 1.5 * lean),
        )
    return p


def rolled(point, pitch):
    """The ankle's (dy, dz) from a sole point (TOE_TIP or HEEL_TIP) that stays put on the floor
    while the foot pitches about it (pitch as in a leg's: toes down +, from rest)."""
    y, z = point
    c, s = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    return (-(y * c - z * s), -(y * s + z * c))


def stance(u, g):
    """A planted foot at u (0..1 of its time down): the ankle (y, z) and the foot's pitch. The sole
    moves back at the belt's even speed; the foot lands on its heel (toes up), lies flat, then
    peels off over the toe tip, so neither end of it ever dips into the floor."""
    belt = -g['step'] / 2 + g['step'] * u
    if u < g['heel_t']:  # heel strike: rocks down onto the sole about the heel's back edge
        e = u / g['heel_t']
        pitch = g['heel'] * (1 - e) * (1 - e)
        point = HEEL_TIP
    elif u > 1 - g['toe_t']:  # heel off: the ankle rises, the toe tip stays on the floor
        e = (u - 1 + g['toe_t']) / g['toe_t']
        pitch = g['toe'] * e * e
        point = TOE_TIP
    else:
        return belt, ANKLE, 0.0
    dy, dz = rolled(point, pitch)
    return belt + point[0] + dy, dz, pitch


def gait(t, g):
    """A walk or run cycle at t (0..1); the left foot is forward at 0, as in clips.js."""
    p = merge(IDLE)
    c = g['contact']
    sw = math.cos(2 * math.pi * t)  # +1 when the left foot leads
    hip_yaw = -g['yaw'] * sw
    for side, s in SIDES:
        ph = (t + (0.0 if s > 0 else 0.5)) % 1.0
        if ph < c:  # planted: rolls heel to toe, its sole never turning or sliding on the floor
            y, z, pitch = stance(ph / c, g)
            net_yaw = 0.0
        else:  # swing: from toe-off, lifts and comes forward to the next heel strike
            u = (ph - c) / (1 - c)
            e = u * u * (3 - 2 * u)
            y0, z0, p0 = stance(1.0, g)
            y1, z1, p1 = stance(0.0, g)
            y = lerp(y0, y1, e)
            z = lerp(z0, z1, e) + g['lift'] * math.sin(math.pi * u ** g['peak'])  # peak < 1 kicks up early
            pitch = lerp(p0, p1, e) + g['swing_pitch'] * math.sin(math.pi * u)
            net_yaw = hip_yaw * math.sin(math.pi * u)  # swings round with the hips, lands straight
        p['leg' + side] = {'at': (g['width'], y, z), 'pitch': pitch, 'yaw': s * (net_yaw - hip_yaw), 'knee': (0.15, -1, 0)}
    bob = math.cos(4 * math.pi * (t - g['low']))  # lowest at g['low'] and half a cycle on
    shift = math.sin(2 * math.pi * t)  # +1 over the left foot (planted 0..0.5), -1 over the right
    p['hips'] = {
        'loc': (g['shift'] * shift, 0.0, g['height'] - g['bob'] * bob),
        'rot': (g['lean'], g['roll'] * shift, hip_yaw),
    }
    p['chest'] = (g['chest'], -g['counter'] * shift, g['yaw'] * 1.4 * sw)
    p['neck'] = (g.get('neck', 0), 0, -g['yaw'] * 0.3 * sw)
    p['head'] = (g['head'] + g['nod'] * bob, -g['roll'] * 0.6 * math.sin(2 * math.pi * t), 0)
    for side, s in SIDES:
        k = -s * sw  # the arm opposite the leading foot swings forward
        a = g['arm']
        p['arm' + side] = {
            'shoulder': (a['shrug'], a['protract'] + 4 * k),
            'upper': (a['fwd'] + a['swing'] * k, a['out'] + a.get('swing_out', 0) * k),
            'lower': (a['fwd2'] + a['swing2'] * k, a['out2'] + a.get('swing_out', 0) * k),
            'twist': 0,
        }
    return p


# contact: the share of the cycle a foot is down; heel_t / toe_t: the share of that spent rocking
# onto the sole from the heel / peeling off over the toe; heel, toe: the foot's pitch at strike
# and at toe-off; shift: the hips' sway over the planted foot (roll tips them with it, counter
# rolls the chest back).
WALK = {
    'contact': 0.5, 'step': 1.85, 'lift': 0.4, 'peak': 0.9, 'low': 0.0, 'width': 0.46, 'height': -0.2, 'bob': 0.09,
    'heel': -10, 'toe': 15, 'heel_t': 0.2, 'toe_t': 0.4, 'swing_pitch': 8, 'lean': 4, 'roll': 4, 'yaw': 9,
    'shift': 0.06, 'counter': 2, 'chest': 2, 'head': -2, 'nod': 3,
    'arm': {'shrug': 0, 'protract': 0, 'fwd': 2, 'swing': 30, 'out': 20, 'fwd2': 16, 'swing2': 32, 'out2': 14},
}  # fmt: skip
RUN = {
    'contact': 0.3, 'step': 2.0, 'lift': 0.45, 'peak': 0.7, 'low': 0.15, 'width': 0.42, 'height': -0.3, 'bob': 0.15,
    'heel': -6, 'toe': 25, 'heel_t': 0.15, 'toe_t': 0.45, 'swing_pitch': 18, 'lean': 7, 'roll': 4, 'yaw': 6,
    'shift': 0.03, 'counter': 1, 'chest': 2, 'neck': -12, 'head': -13, 'nod': 3,
    # the head thrown back (half from the collar, so the back hair digs less into his shirt) so the high
    # camera sees the scared face; the hands flung up and out past the cap's edge, pumping, the forearms
    # whipping further than the upper arms
    'arm': {'shrug': 28, 'protract': 10, 'fwd': 168, 'swing': 26, 'swing_out': 4, 'out': 56, 'fwd2': 174, 'swing2': 48, 'out2': 46},
}  # fmt: skip


def held(t):
    """Dangling by the collar: a gentle sway the limp arms, the head and the legs follow late, and one
    small kick, itself late."""
    tau = 2 * math.pi
    sw = math.sin(tau * t)
    lag = math.sin(tau * (t - 0.08))  # the legs follow the body's swing late
    late = tau * (t - 3.5 / 36)  # the arms dangle 3-4 frames behind it, the head 4
    nod = math.sin(tau * (t - 4 / 36))
    kick = math.sin(math.pi * (t - 0.56) / 0.22) if 0.56 <= t <= 0.78 else 0.0
    p = merge(HELD, hips={'loc': (0, 0, 0), 'rot': (-6 + 2 * math.cos(tau * t), 4 * sw, 0)})
    p['chest'] = (-2, -1.5 * lag, 0)
    p['head'] = (9 + 2 * math.cos(tau * t), 12 * nod, 3 * nod)
    for side, s in SIDES:
        # a +-8 degree pendulum, fore and aft and side to side, that trails the body's own swing
        arm = HELD['arm' + side]
        (fu, ou), (fl, ol) = arm['upper'], arm['lower']
        fwd, out = -8 * math.cos(late), -s * 8 * math.sin(late)
        p['arm' + side] = merge(arm, upper=(fu + fwd, ou + out), lower=(fl + 1.2 * fwd, ol + 1.2 * out))
    p['legL'] = merge(HELD['legL'], rel=(0.04 + 0.05 * lag, -0.22 - 0.6 * kick, 0.06 + 0.45 * kick), pitch=62 - 30 * kick)
    p['legR'] = merge(HELD['legR'], rel=(0.04 - 0.05 * lag, -0.22 + 0.08 * lag, 0.06))
    return p


def fall(t):
    """Falling: arms up, the forearms flapping (left and right in turn), legs apart, pedalling."""
    w, c = math.sin(2 * math.pi * t), math.cos(2 * math.pi * t)
    p = merge(FALL)
    for side, s in SIDES:
        (fu, ou), (fl, ol) = FALL['arm' + side]['upper'], FALL['arm' + side]['lower']
        p['arm' + side] = merge(FALL['arm' + side], upper=(fu + 10 * s * w, ou + 6 * s * w), lower=(fl + 12 * s * w, ol + 25 * s * w))
        dx, dy, dz = FALL['leg' + side]['rel']
        p['leg' + side] = merge(FALL['leg' + side], rel=(dx, dy - 0.32 * s * w, dz + 0.2 * s * c), pitch=25 + 10 * s * c)
    return p


def keys(*frames):
    """A key-pose table: (frame, pose) pairs, kept as given."""
    return list(frames)


ARM_UP = {'shoulder': (18, 0), 'upper': (155, 50), 'lower': (170, 32), 'twist': 0}
SPOOK_TOP = {  # the hop's top: arms flung up, legs tucked, the head back 25 degrees in all (the
    # high camera sees his surprised face; further back, his hair digs into his shirt)
    'hips': {'loc': (0, 0, 0.75), 'rot': (-6, 0, 0)},
    'chest': (-6, 0, 0),
    'neck': (-5, 0, 0),
    'head': (-8, 0, 0),
    'armL': ARM_UP,
    'armR': ARM_UP,
    'legL': {'at': (0.66, 0.12, ANKLE + 0.85), 'pitch': 35, 'knee': (0.5, -1, 0)},
    'legR': {'at': (0.66, 0.12, ANKLE + 0.85), 'pitch': 35, 'knee': (0.5, -1, 0)},
}
CROUCH = merge(
    IDLE,
    hips={'loc': (0, 0, -0.38), 'rot': (8, 0, 0)},
    chest=(6, 0, 0),
    head=(-4, 0, 0),
    armL={'shoulder': (12, 6), 'upper': (18, 22), 'lower': (40, 12), 'twist': 0},
    armR={'shoulder': (12, 6), 'upper': (18, 22), 'lower': (40, 12), 'twist': 0},
)

# The waving arm: the shoulder shrugged and the upper arm raised out to the side and forward, so
# the forearm can swing +-30 degrees about the elbow beside the head (the hand from about
# (-1.2, -0.3, 4.55) to (-1.86, -0.06, 3.96)), in front of the body plane.
WAVE_UP = {'shoulder': (36, 6), 'upper': (95, 66), 'lower': (155, 50), 'twist': 0}
WAVE_FROM, WAVE_TO, WAVE_PERIOD = 6, 30, 8  # three waves


def waving(w, k=1.0, bob=0.0, drift=0.0):
    """Wave's pose: the forearm at w (-1 in by the head .. 1 out), k of the way into the body's
    lean: the chest tipped away from the waving arm, the head cocked toward it and back so the high
    camera sees his face, a little bounce (bob 0..1), the other arm drifting (drift -1..1)."""
    return merge(
        IDLE,
        hips={'loc': (0, 0, -0.06 + 0.03 * bob), 'rot': (-3 * k, 0, 0)},
        chest=(-4 * k, 6 * k, 0),
        neck=(-5 * k, 0, 0),
        head=(-8 * k, -14 * k, -4 * k),
        armR=merge(WAVE_UP, lower=(155, 50 + 30 * w)),
        armL=merge(ARM_RELAXED, upper=(6 + 3 * drift, 24 + 3 * drift), lower=(20 + 3 * drift, 20)),
    )


def wave_keys():
    """Wave: up by f6, three waves on an 8-frame period keyed on every frame, down by f36."""
    out = [
        (0, IDLE),
        (3, merge(waving(0.0, 0.6), armR=merge(WAVE_UP, upper=(70, 50), lower=(110, 40)))),
    ]
    for f in range(WAVE_FROM, WAVE_TO + 1):
        ph = 2 * math.pi * (f - WAVE_FROM) / WAVE_PERIOD
        drift = math.sin(2 * math.pi * (f - WAVE_FROM) / (WAVE_TO - WAVE_FROM))
        out.append((f, waving(math.sin(ph), 1.0, 0.5 + 0.5 * math.sin(ph), drift)))
    out += [
        (33, merge(IDLE, chest=(1, 2, 0), head=(-3, -4, 0), armR=merge(ARM_RELAXED, upper=(30, 40), lower=(50, 30)))),
        (36, IDLE),
    ]
    return out


TABLES = {
    'Wave': wave_keys(),
    'Spook': keys(
        (0, IDLE),
        (1, merge(IDLE, hips={'loc': (0, 0, -0.18), 'rot': (4, 0, 0)}, chest=(3, 0, 0), head=(-2, 0, 0))),  # a one-frame flinch
        (2, merge(  # pushing off: the heels up, the toe tips still on the floor
            IDLE,
            hips={'loc': (0, 0, 0.1), 'rot': (0, 0, 0)},
            head=(-4, 0, 0),
            armL={'shoulder': (10, 0), 'upper': (60, 40), 'lower': (80, 30), 'twist': 0},
            armR={'shoulder': (10, 0), 'upper': (60, 40), 'lower': (80, 30), 'twist': 0},
            legL={'at': (0.61, 0.07, ANKLE + 0.17), 'pitch': 12},
            legR={'at': (0.61, 0.07, ANKLE + 0.17), 'pitch': 12},
        )),
        (3, merge(
            IDLE,  # springing up, the arms flying up
            hips={'loc': (0, 0, 0.45), 'rot': (-4, 0, 0)},
            chest=(-4, 0, 0),
            neck=(-3, 0, 0),
            head=(-6, 0, 0),
            armL={'shoulder': (14, 0), 'upper': (120, 50), 'lower': (135, 36), 'twist': 0},
            armR={'shoulder': (14, 0), 'upper': (120, 50), 'lower': (135, 36), 'twist': 0},
            legL={'at': (0.64, 0.1, ANKLE + 0.45), 'pitch': 40, 'knee': (0.4, -1, 0)},
            legR={'at': (0.64, 0.1, ANKLE + 0.45), 'pitch': 40, 'knee': (0.4, -1, 0)},
        )),
        (5, SPOOK_TOP),  # held at the top f5-f8, so the startle reads at real speed
        (7, merge(SPOOK_TOP, hips={'loc': (0, 0, 0.78), 'rot': (-6, 0, 0)}, armL=merge(ARM_UP, upper=(160, 52)), armR=merge(ARM_UP, upper=(160, 52)))),
        (8, merge(SPOOK_TOP, hips={'loc': (0, 0, 0.62), 'rot': (-5, 0, 0)}, armL=merge(ARM_UP, upper=(140, 56), lower=(175, 40)), armR=merge(ARM_UP, upper=(140, 56), lower=(175, 40)))),
        (10, merge(
            IDLE,  # coming down, the forearms dragging behind the upper arms
            hips={'loc': (0, 0, 0.22), 'rot': (-2, 0, 0)},
            chest=(-3, 0, 0),
            neck=(-3, 0, 0),
            head=(-6, 0, 0),
            armL={'shoulder': (10, 0), 'upper': (80, 58), 'lower': (125, 46), 'twist': 0},
            armR={'shoulder': (10, 0), 'upper': (80, 58), 'lower': (125, 46), 'twist': 0},
            legL={'at': (0.62, 0.08, ANKLE + 0.22), 'pitch': 18},
            legR={'at': (0.62, 0.08, ANKLE + 0.22), 'pitch': 18},
        )),
        (11, merge(
            CROUCH,  # lands
            hips={'loc': (0, 0, -0.32), 'rot': (6, 0, 0)},
            head=(2, 0, 0),
            armL={'shoulder': (8, 0), 'upper': (40, 52), 'lower': (72, 40), 'twist': 0},
            armR={'shoulder': (8, 0), 'upper': (40, 52), 'lower': (72, 40), 'twist': 0},
        )),
        (14, merge(IDLE, hips={'loc': (0, 0, -0.02), 'rot': (-2, 0, 0)}, head=(-4, 0, 0), armL=merge(ARM_RELAXED, upper=(4, 28)), armR=merge(ARM_RELAXED, upper=(4, 28)))),
        (17, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (1, 0, 0)}, head=(2, 0, 0))),
        (20, IDLE),
    ),
    'Land': keys(
        (0, 'fall@0'),  # where Fall loops from: the page lands him when a foot touches
        (2, merge(
            IDLE,  # touchdown: both feet flat, the legs still nearly straight, only the chest dips
            hips={'loc': (0, 0, -0.22), 'rot': (0, 0, 0)},
            chest=(10, 0, 0),
            neck=(-4, 0, 0),
            head=(-8, 0, 0),
            armL={'shoulder': (16, 0), 'upper': (125, 58), 'lower': (140, 40), 'twist': 0},
            armR={'shoulder': (16, 0), 'upper': (125, 58), 'lower': (140, 40), 'twist': 0},
            legL={'at': WIDE, 'pitch': 0, 'knee': (0.8, -1, 0)},
            legR={'at': WIDE, 'pitch': 0, 'knee': (0.8, -1, 0)},
        )),
        (4, merge(
            IDLE,
            hips={'loc': (0, 0, -0.66), 'rot': (12, 0, 0)},
            chest=(10, 0, 0),
            head=(8, 0, 0),
            armL={'shoulder': (2, 0), 'upper': (40, 58), 'lower': (62, 42), 'twist': 0},
            armR={'shoulder': (2, 0), 'upper': (40, 58), 'lower': (62, 42), 'twist': 0},
            legL={'at': WIDE, 'pitch': 0, 'knee': (0.8, -1, 0)},
            legR={'at': WIDE, 'pitch': 0, 'knee': (0.8, -1, 0)},
        )),
        (7, merge(
            IDLE,
            hips={'loc': (0, 0, -0.12), 'rot': (-3, 0, 0)},
            chest=(-2, 0, 0),
            head=(4, 0, 0),
            armL={'shoulder': (4, 0), 'upper': (6, 34), 'lower': (14, 30), 'twist': 0},
            armR={'shoulder': (4, 0), 'upper': (6, 34), 'lower': (14, 30), 'twist': 0},
            legL={'at': WIDE, 'pitch': 0, 'knee': (0.6, -1, 0)},
            legR={'at': WIDE, 'pitch': 0, 'knee': (0.6, -1, 0)},
        )),
        # steps the wide feet back under him, one at a time: the right stays planted until the
        # left is down
        (9, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (0, -3, 0)}, legL={'at': (0.8, 0.0, ANKLE + 0.3), 'pitch': 10}, legR={'at': WIDE, 'pitch': 0, 'knee': (0.6, -1, 0)})),
        (10, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (0, -1, 0)}, legR={'at': WIDE, 'pitch': 0, 'knee': (0.6, -1, 0)})),
        (12, merge(IDLE, hips={'loc': (0, 0, -0.08), 'rot': (0, 3, 0)}, legR={'at': (0.78, 0.02, ANKLE + 0.25), 'pitch': 8})),
        (14, IDLE),
    ),
    'SitDown': keys(
        (0, IDLE),
        (6, merge(
            CROUCH,
            hips={'loc': (0, 0, -0.55), 'rot': (14, 0, 0)},
            armL={'shoulder': (6, 8), 'upper': (50, 20), 'lower': (70, 10), 'twist': 0},
            armR={'shoulder': (6, 8), 'upper': (50, 20), 'lower': (70, 10), 'twist': 0},
        )),
        (12, merge(SIT, hips={'loc': (0, 0, -1.3), 'rot': (-10, 0, 0)}, legL={'at': (0.7, -1.1, 0.75), 'pitch': -30}, legR={'at': (0.7, -1.1, 0.75), 'pitch': -30})),
        (15, merge(SIT, hips={'loc': (0, 0, -1.64), 'rot': (-26, 0, 0)})),
        (19, merge(SIT, hips={'loc': (0, 0, -1.54), 'rot': (-20, 0, 0)})),
        (24, SIT),
    ),
    'StandUp': keys(
        (0, SIT),
        (3, merge(SIT, hips={'loc': (0, 0, -1.58), 'rot': (-14, 0, 0)}, chest=(4, 0, 0), legL={'at': (0.76, -1.0, 0.56), 'pitch': -30}, legR={'at': (0.76, -1.0, 0.56), 'pitch': -30})),
        (6, merge(
            SIT,  # knees up, feet pulled in flat, rocking forward
            hips={'loc': (0, 0, -1.52), 'rot': (4, 0, 0)},
            chest=(12, 0, 0),
            neck=(4, 0, 0),
            head=(-6, 0, 0),
            armL={'shoulder': (4, 6), 'upper': (30, 30), 'lower': (50, 20), 'twist': 0},
            armR={'shoulder': (4, 6), 'upper': (30, 30), 'lower': (50, 20), 'twist': 0},
            legL={'at': (0.7, -0.55, ANKLE), 'pitch': 0, 'knee': (0.4, -1, 0.3)},
            legR={'at': (0.7, -0.55, ANKLE), 'pitch': 0, 'knee': (0.4, -1, 0.3)},
        )),
        (10, merge(
            CROUCH,  # weight over the feet, pushing off, arms forward for balance
            hips={'loc': (0, 0, -0.95), 'rot': (30, 0, 0)},
            chest=(14, 0, 0),
            neck=(-4, 0, 0),
            head=(-10, 0, 0),
            armL={'shoulder': (6, 10), 'upper': (70, 26), 'lower': (85, 14), 'twist': 0},
            armR={'shoulder': (6, 10), 'upper': (70, 26), 'lower': (85, 14), 'twist': 0},
            legL={'at': (0.66, -0.2, ANKLE), 'pitch': 0},
            legR={'at': (0.66, -0.2, ANKLE), 'pitch': 0},
        )),
        (15, merge(IDLE, hips={'loc': (0, 0, 0.0), 'rot': (-4, 0, 0)}, chest=(-3, 0, 0), head=(-4, 0, 0))),
        (19, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (2, 0, 0)}, head=(3, 0, 0))),
        (24, IDLE),
    ),
}


def sit(t):
    """Sitting: legs out, leaning back on his hands; the head sways, the feet wiggle."""
    sw = math.sin(2 * math.pi * t)
    wig = math.sin(2 * math.pi * 3 * t)
    bob = math.sin(2 * math.pi * 2 * t)
    p = merge(SIT, head=(-2 * bob, 10 * sw, 5 * sw), neck=(2, 3 * sw, 0), chest=(-4 + 1.5 * bob, 0, 0))
    p['legL'] = merge(SIT['legL'], pitch=-55 + 12 * wig, yaw=12 + 6 * wig)
    p['legR'] = merge(SIT['legR'], pitch=-55 - 12 * wig, yaw=12 - 6 * wig)
    return p


CYCLES = {
    'Idle': idle,
    'Walk': lambda t: gait(t, WALK),
    'Run': lambda t: gait(t, RUN),
    'Held': held,
    'Fall': fall,
    'Sit': sit,
}


def clip_keys(name, S):
    """[(frame, pose)] for every frame of a clip: a cycle's (the last a copy of 0), or its key-pose
    table tweened."""
    last, loop = CLIPS[name]
    if name in CYCLES:
        f = CYCLES[name]
        out = [(i, f(i / last)) for i in range(last)]
        return out + [(last, out[0][1])]
    return tween(S, [(f, cycle_pose(p) if isinstance(p, str) else p) for f, p in TABLES[name]], last)


def cycle_pose(ref):
    """'fall@0' in a table: the Fall cycle's pose at that point of its loop (0..1)."""
    clip, at = ref.split('@')
    return CYCLES[clip.title()](float(at))


# ---------------------------------------------------------------------------------------------
# Building the Actions


def prepare(arm):
    """The rig's settings the clips need (idempotent)."""
    arm.data.pose_position = 'POSE'
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    mesh = bpy.data.objects.get('Neck')
    if mesh is not None and mesh.type == 'MESH':
        mesh.name = 'NeckMesh'  # the bone keeps its name; a mixer target by name must not hit the mesh


def write_pose(arm, S):
    for n in ORDER:
        pb = arm.pose.bones[n]
        pb.rotation_quaternion = S.q[n]
        pb.location = S.local_loc() if n == 'Bone' else (0, 0, 0)


def build_action(arm, S, name):
    last, loop = CLIPS[name]
    old = bpy.data.actions.get(name)
    if old is not None:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    slot = act.slots.new(id_type='OBJECT', name=ARMATURE)
    strip = act.layers.new('Layer').strips.new(type='KEYFRAME')
    bag = strip.channelbag(slot, ensure=True)
    frames = clip_keys(name, S)
    # Every bone's quaternion at every key, signs kept continuous.
    rot = {n: [] for n in ORDER}
    loc = []
    for f, pose in frames:
        apply(S, dict(pose, _name='%s@%d' % (name, f)))
        for n in ORDER:
            q = S.q[n].copy()
            if rot[n] and rot[n][-1][1].dot(q) < 0:
                q.negate()
            rot[n].append((f, q))
        loc.append((f, S.local_loc()))
    if loop:  # the last key is frame 0 exactly; pad one key either side so the seam is smooth
        for n in ORDER:
            if rot[n][-2][1].dot(rot[n][0][1]) < 0:
                WARN.append('%s %s flips sign at the seam' % (name, n))
            rot[n][-1] = (last, rot[n][0][1].copy())
        loc[-1] = (last, loc[0][1].copy())

    def pad(seq):
        if not loop:
            return seq
        return [(seq[-2][0] - last, seq[-2][1])] + seq + [(seq[1][0] + last, seq[1][1])]

    def curve(path, idx, group, pts):
        fc = bag.fcurves.new(path, index=idx, group_name=group)
        fc.keyframe_points.add(len(pts))
        co = []
        for f, v in pts:
            co += [f, v]
        fc.keyframe_points.foreach_set('co', co)
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()

    for n in ORDER:
        seq = pad(rot[n])
        for i in range(4):
            curve('pose.bones["%s"].rotation_quaternion' % n, i, n, [(f, q[i]) for f, q in seq])
    seq = pad(loc)
    for i in range(3):
        curve('pose.bones["Bone"].location', i, 'Bone', [(f, v[i]) for f, v in seq])
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, last
    act.use_cyclic = loop
    return act, slot


def build(arm, only=None):
    prepare(arm)
    S = Solver(arm)
    WARN.clear()
    made = {}
    for name in CLIPS:
        if only and name not in only:
            continue
        made[name] = build_action(arm, S, name)
    ad = arm.animation_data_create()
    first = made.get('Idle') or next(iter(made.values()))
    ad.action, ad.action_slot = first
    for w in WARN:
        print('newt.py warning:', w)
    return made


def show(arm, name, frame):
    """Pose the rig at one frame of a clip without keying (for looking)."""
    prepare(arm)
    S = Solver(arm)
    ks = clip_keys(name, S)
    f, pose = min(ks, key=lambda k: abs(k[0] - frame))
    arm.animation_data_create().action = None
    apply(S, pose)
    write_pose(arm, S)
    bpy.context.view_layer.update()


# ---------------------------------------------------------------------------------------------
# Export


def export(arm, path):
    """The rig and its meshes (never the Light parented to it) as a GLB with every clip."""
    meshes = [o for o in arm.children if o.type == 'MESH']
    was_hidden = {o.name: o.hide_get() for o in [arm] + meshes}
    was_selected = [o for o in bpy.context.view_layer.objects if o.select_get()]
    was_active = bpy.context.view_layer.objects.active
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in [arm] + meshes:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_lights=False,
        export_cameras=False,
        export_apply=True,
        export_skins=True,
        export_def_bones=False,
        export_influence_nb=4,
        export_yup=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_anim_slide_to_zero=True,
        export_negative_frame='CROP',
        export_image_format='WEBP',
        export_image_quality=90,
        export_draco_mesh_compression_enable=False,
        export_extras=False,
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in [arm] + meshes:
        o.hide_set(was_hidden[o.name])
    for o in was_selected:
        o.select_set(True)
    bpy.context.view_layer.objects.active = was_active


def main():
    live = not bpy.app.background
    g = globals()
    if live:
        repo = os.environ.get('NEWT_REPO') or os.path.dirname(os.path.dirname(os.path.abspath(g['__file__'])))
    else:
        argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
        repo = argv[0] if argv else os.getcwd()
        src = os.environ.get('NEWT_BLEND', 'C:/Users/newto/Documents/NEWT_optimized.blend')
        bpy.ops.wm.open_mainfile(filepath=src)
    arm = bpy.data.objects[ARMATURE]
    if g.get('NEWT_POSE'):
        show(arm, g['NEWT_POSE'], g.get('NEWT_FRAME', 0))
        return
    build(arm, g.get('NEWT_ONLY'))
    bpy.context.scene.render.fps = FPS
    if g.get('NEWT_EXPORT', True) is False:
        return
    out = os.path.join(repo, 'public', 'models', 'newt.glb')
    export(arm, out)
    print('newt.py: wrote', out, os.path.getsize(out), 'bytes')
    target = os.path.join(os.path.dirname(bpy.data.filepath), 'NEWT_animated.blend')
    bpy.ops.wm.save_as_mainfile(filepath=target)
    print('newt.py: saved', target)


if __name__ == '__main__':
    main()
