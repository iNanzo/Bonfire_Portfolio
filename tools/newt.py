"""NEWT's clips for the invitation toy: the user's low-poly chibi, animated.

Builds the 22 clips of src/invitation/clips.js (Idle, Walk, Run, Wave, Spook, Held, Fall, Land,
SitDown, Sit, StandUp, round 15's talking gestures Talk, Nod, Shrug, Point, Think, Cheer, and
round 16's Thrash and Give Device's DeviceSit, LieDown, DeviceLie, GetUp) on NEWT's rig as one slotted Action each, and exports the rig, its meshes and every clip as a binary
glTF for three.js.

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
  public/models/newt.glb               the rig (17 bones), the meshes, the 22 clips; WebP, no Draco
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
           forward, 180 straight up), out toward his side (90 is the T-pose); twist about the bone;
           or hand (x, y, z): the palm's (the ForeArm's tip's) place in armature space, reached by
           a two-bone IK with the elbow bent toward elbow (a direction in the chest's frame)
  leg L/R  at (x, y, z): the ankle's place in armature space (feet planted), or rel (dx, dy, dz)
           from the rest ankle, carried by the hips (dangling legs); pitch: toes down (+) or up
           (-); yaw: toes out; knee: which way the knee points
Angles are degrees. Pitch + leans forward, roll + tips toward his left (+X), yaw + turns his
face toward his left. Values given for L mirror onto R by the same numbers.

Each clip is a table of (frame, pose) key poses, or a function of the frame for the cycles (Walk
and Run from a few step parameters; Idle, Held, Fall, Sit, Talk and Think from a few waves). Every frame is keyed: a table's key poses are eased number by
number along a monotone cubic (tween), so the legs' IK runs on each frame and a planted foot stays
put. Loops end on an exact copy of frame 0; quaternion signs stay continuous. Held and Thrash pin
the collar (the Neck bone's head) where it rests. DeviceSit and DeviceLie pin both palms to the
tablet's grip (DEVICE, the same numbers as clips.js DEVICE): its side edges sitting, its near
edge's corners lying.
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
    'Talk': (48, True),
    'Nod': (18, False),
    'Shrug': (24, False),
    'Point': (30, False),
    'Think': (48, True),
    'Cheer': (30, False),
    'Thrash': (28, False),
    'DeviceSit': (72, True),
    'LieDown': (36, False),
    'DeviceLie': (48, True),
    'GetUp': (30, False),
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


def two_bone(root, target, l1, l2, pole, label):
    """A two-bone chain from `root` reaching for `target` (armature space): the middle joint
    (knee or elbow) bent toward `pole`, and where the chain's end lands (on target, or as near as
    it reaches)."""
    to = target - root
    dist = to.length
    reach = (l1 + l2) * 0.9995
    if dist > reach:
        WARN.append('%s short by %.3f' % (label, dist - reach))
        dist = reach
    dist = max(dist, abs(l1 - l2) + 1e-3)
    u = to.normalized()
    v = (pole - u * pole.dot(u)).normalized()
    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    a = math.acos(cos_a)
    return root + l1 * (math.cos(a) * u + math.sin(a) * v), root + u * dist


def reach_arm(S, side, s, a, chest, name):
    """An arm by IK: its palm (the ForeArm bone's tip) on a['hand'] (armature space, x given for
    his left and mirrored), the elbow bent toward a['elbow'] (a direction in the chest's frame)."""
    hx, hy, hz = a['hand']
    ex, ey, ez = a.get('elbow', ELBOW_POLE)
    root = S.base('Bicep.' + side).translation
    elbow, end = two_bone(
        root,
        Vector((s * hx, hy, hz)),
        S.len['Bicep.' + side],
        S.len['ForeArm.' + side],
        chest @ Vector((s * ex, ey, ez)),
        '%s arm %s' % (name, side),
    )
    S.aim('Bicep.' + side, elbow - root, s * a.get('twist', 0))
    S.aim('ForeArm.' + side, end - S.tail('Bicep.' + side), s * a.get('twist2', 0))


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
        if a.get('hand') is not None:
            reach_arm(S, side, s, a, chest, pose.get('_name', '?'))
            continue
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
        kx, ky, kz = leg.get('knee', (0.25, -1, 0))
        knee, end = two_bone(
            hip,
            ankle,
            S.len['Thigh.' + side],
            S.len['Calf.' + side],
            hipq @ Vector((s * kx, ky, kz)),
            '%s leg %s' % (pose.get('_name', '?'), side),
        )
        S.aim('Thigh.' + side, knee - hip)
        S.aim('Calf.' + side, end - S.tail('Thigh.' + side))
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
ELBOW_POLE = (1, 0.4, -1)  # an IK arm's elbow: out, a little back and down (the chest's frame)
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


def swung(S, pose):
    """The pose with any IK arm ('hand') written as the same arm swung by its angles (upper and
    lower as limb_dir's fwd and out in the chest's frame), so a key-pose table can ease between an
    arm on the tablet and a free one number by number."""
    if not any(pose.get('arm' + side, {}).get('hand') is not None for side, _ in SIDES):
        return pose
    apply(S, pose)
    out = dict(pose)
    chest = (S.M['Chest'].to_quaternion() @ S.rest['Chest'].to_quaternion().inverted()).inverted()

    def angles(s, d):  # limb_dir's inverse
        d = (chest @ d).normalized()
        return math.degrees(math.atan2(-d.y, -d.z)), math.degrees(math.asin(max(-1.0, min(1.0, s * d.x))))

    for side, s in SIDES:
        a = pose.get('arm' + side, {})
        if a.get('hand') is None:
            continue
        up = S.tail('Bicep.' + side) - S.head('Bicep.' + side)
        lo = S.tail('ForeArm.' + side) - S.head('ForeArm.' + side)
        out['arm' + side] = {
            'shoulder': a.get('shoulder', (0, 0)),
            'upper': angles(s, up),
            'lower': angles(s, lo),
            'twist': a.get('twist', 0),
            'twist2': a.get('twist2', 0),
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
    rows = [flat(S, swung(S, planted(S, p))) for _, p in table]
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
# StandUp's: where the feet set down to take his weight. Nearer his hips, his short thighs would
# fold the knees back behind them while he's still sitting. A touch high: the deeply bent calves
# pull the half-weighted heels down.
STAND_FEET = (0.72, -0.35, ANKLE + 0.03)
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
    'hips': {'loc': (0, 0, -1.58), 'rot': (-16, 0, 0)},
    'chest': (-2, 0, 0),
    'neck': (2, 0, 0),
    'head': (0, 0, 0),
    # the hands down on the floor beside his hips, where the high camera sees them peek out
    'armL': {'shoulder': (-14, 0), 'upper': (-5, 30), 'lower': (1, 34), 'twist': 0},
    'armR': {'shoulder': (-14, 0), 'upper': (-5, 30), 'lower': (1, 34), 'twist': 0},
    'legL': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
    'legR': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
}

HELD = {
    'pin': True,
    'hips': {'loc': (0, 0, 0), 'rot': (2, 0, 0)},  # plumb under the collar
    'chest': (5, 0, 0),
    'neck': (9, 0, 0),
    'head': (9, 0, 0),  # defeated: the head hangs about 25 degrees down in all
    # limp: shoulders dropped, the arms hanging nearly straight down by his sides
    'armL': {'shoulder': (-18, 4), 'upper': (-2, 11), 'lower': (2, 8), 'twist': 0},
    'armR': {'shoulder': (-18, 4), 'upper': (-2, 11), 'lower': (2, 8), 'twist': 0},
    # the legs hanging straight under the hips, toes down
    'legL': {'rel': (0, 0.02, 0.04), 'pitch': 55, 'yaw': -6, 'knee': (0, -1, 0)},
    'legR': {'rel': (0, 0.02, 0.04), 'pitch': 55, 'yaw': -6, 'knee': (0, -1, 0)},
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


def smooth(u):
    """0 below 0, 1 above 1, eased in between."""
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def idle(t):
    """Idle at t (0..1 of its loop): breathing twice, a small sway once, and one glance to his left
    (turning f12-f18, held, back by f30), so frame 0 stays the pose every clip blends from."""
    br = math.sin(2 * math.pi * 2 * t)
    sw = math.sin(2 * math.pi * t)
    f = t * CLIPS['Idle'][0]
    glance = smooth((f - 12) / 6) - smooth((f - 24) / 6)
    p = merge(
        IDLE,
        hips={'loc': (0.0, 0, -0.06 - 0.025 * br), 'rot': (0, 2.4 * sw, 0)},
        chest=(2 + 2.0 * br, -1.2 * sw, 0),
        head=(-1.2 * br, -2.2 * sw + 3 * glance, 10 * glance),
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
    'contact': 0.3, 'step': 2.3, 'lift': 0.65, 'peak': 0.6, 'low': 0.15, 'width': 0.42, 'height': -0.45, 'bob': 0.15,
    'heel': -6, 'toe': 25, 'heel_t': 0.15, 'toe_t': 0.45, 'swing_pitch': 18, 'lean': 16, 'roll': 4, 'yaw': 6,
    'shift': 0.03, 'counter': 1, 'chest': 10, 'neck': -20, 'head': -24, 'nod': 3,
    # the user's reference (a scared cartoon run): long low strides, the trunk leaning about 24
    # degrees, the head tipped back (half from the collar, so the back hair digs less into his shirt)
    # so the high camera sees the screaming face, both arms reaching straight out in front at shoulder
    # height, a little up, the elbows nearly straight, pumping a little. fwd is in the chest's frame:
    # 90 + the trunk's lean is level. The hands stay 0.45 below the chin and 1.2 under the cap's brim.
    'arm': {'shrug': 6, 'protract': 14, 'fwd': 126, 'swing': 4, 'out': 8, 'fwd2': 134, 'swing2': 6, 'out2': 3},
}  # fmt: skip


def held(t):
    """Dangling limp by the collar, head down: a small sway the arms follow 4 frames late and the
    legs 6, the head lolling with it. No kick: Thrash is the struggle, now and then."""
    tau = 2 * math.pi
    sw = math.sin(tau * t)
    arms = tau * (t - 4 / 36)
    legs = tau * (t - 6 / 36)
    loll = math.sin(arms)
    p = merge(HELD, hips={'loc': (0, 0, 0), 'rot': (2 + 1.0 * math.cos(tau * t), 2.5 * sw, 0)})
    p['chest'] = (5, -1.0 * math.sin(legs), 0)
    p['head'] = (11 + 1.5 * math.cos(arms), 5 * loll, 2 * loll)
    for side, s in SIDES:
        # a +-5 degree pendulum, fore and aft and side to side, trailing the body's own swing
        arm = HELD['arm' + side]
        (fu, ou), (fl, ol) = arm['upper'], arm['lower']
        fwd, out = -5 * math.cos(arms), -s * 5 * math.sin(arms)
        p['arm' + side] = merge(arm, upper=(fu + fwd, ou + out), lower=(fl + 1.2 * fwd, ol + 1.2 * out))
        # the legs +-4 degrees (about 0.11 at the ankle), later still
        dx, dy, dz = HELD['leg' + side]['rel']
        p['leg' + side] = merge(HELD['leg' + side], rel=(dx + s * 0.1 * math.sin(legs), dy - 0.08 * math.cos(legs), dz))
    return p


# Thrash (28 frames, pinned like Held, from and back to Held's first pose): a wind-up at f3 (knees
# up, forearms in, head up), alternating kicks every 4 frames from f6 (left at f6 and f14, right at
# f10 and f18) with the arms flailing and the head shaking, a droop past limp at f22, and back.
THRASH_WIND = monotone([0, 3, 6, 28], [0, 1, 0, 0])
THRASH_ACT = monotone([0, 3, 6, 19, 22, 28], [0, 0.35, 1, 1, 0, 0])
THRASH_DROOP = monotone([0, 19, 22, 25, 28], [0, 0, 1, 0.5, 0])


def thrash(t):
    """Thrash at t (0..1 of its 28 frames), on top of Held's first pose."""
    f = t * CLIPS['Thrash'][0]
    wind, act, droop = THRASH_WIND(f), THRASH_ACT(f), THRASH_DROOP(f)
    ph = 2 * math.pi * (f - 6) / 8  # each leg kicks every 8 frames, the other 4 frames after
    c, w = math.cos(ph), math.sin(ph)
    base = held(0)
    (hp, hr, hy) = base['hips']['rot']
    p = merge(base, hips={'loc': (0, 0, 0), 'rot': (hp + 8 * wind + 4 * act, hr + 5 * w * act, hy)})
    p['chest'] = (base['chest'][0] - 4 * act + 5 * droop, base['chest'][1] - 4 * w * act, 0)
    hd = base['head']
    p['head'] = (
        hd[0] - 16 * wind - 10 * act + 12 * droop,
        hd[1] + 8 * math.sin(ph + 1) * act,
        hd[2] + 15 * math.sin(2 * math.pi * (f - 4) / 8) * act,
    )
    for side, s in SIDES:
        k = c * s  # +1: this leg kicks forward, -1: it swings back
        arm = base['arm' + side]
        (fu, ou), (fl, ol) = arm['upper'], arm['lower']
        flail = math.sin(ph + (0 if s > 0 else math.pi) + 0.6)
        p['arm' + side] = merge(
            arm,
            upper=(fu + 20 * wind + 25 * flail * act, ou + (55 - ou + 15 * flail) * act - 10 * droop),
            lower=(fl + 60 * wind + (35 * flail + 30) * act, ol + (75 - ol - 20 * flail) * act),
        )
        dx, dy, dz = base['leg' + side]['rel']
        p['leg' + side] = merge(
            base['leg' + side],
            rel=(dx + 0.05 * act, dy + (-0.2 - 0.6 * k) * act, dz + 0.4 * wind + (0.3 + 0.3 * k) * act),
            pitch=base['leg' + side]['pitch'] - 25 * wind - 35 * max(k, 0) * act,
            knee=(0.2 * max(wind, act), -1, 0),
        )
    return p


# Give Device: the tablet (clips.js DEVICE; the page draws it from his palms) in both hands while he
# sits (DeviceSit) and while he lies on his stomach (DeviceLie). Each palm (the ForeArm bone's
# tip) is pinned by the arm IK to the clip's grip: `grip` = (across, back toward him along the
# screen) from the tablet's middle, raised `lift` along the screen's normal.
DEVICE = {
    # held on his lap in front of the knees by its side edges, tipped a little toward his face
    # (more and the 36 degree camera sees only its edge)
    'DeviceSit': {'centre': (0, -0.85, 1.45), 'tilt': 12, 'lift': 0.0, 'grip': (0.8, 0.0)},
    # round 17 (the user's pose): flat on the floor out in front, his palms on its near edge's
    # corners at the end of near-straight arms, so it sticks out past his face (and shows under it)
    'DeviceLie': {'centre': (0, -3.5, 0.045), 'tilt': 0, 'lift': 0.2, 'grip': (0.7, 0.6)},
}


def palm(clip, dz=0.0):
    """His left palm's place on the tablet in a clip (armature space; the right mirrors it)."""
    d = DEVICE[clip]
    t = math.radians(d['tilt'])
    cx, cy, cz = d['centre']
    gx, gy = d['grip']
    return (
        cx + gx,
        cy + gy * math.cos(t) + d['lift'] * math.sin(t),
        cz - gy * math.sin(t) + d['lift'] * math.cos(t) + dz,
    )


DEV_SIT = merge(
    SIT,
    # leaning in a little over the tablet (the 36 degree camera still sees its screen past the brim)
    hips={'loc': (0, 0, -1.58), 'rot': (-12, 0, 0)},
    chest=(4, 0, 0),
    neck=(0, 0, 0),
    head=(-2, 0, 0),
    armL={'shoulder': (-6, 6), 'hand': palm('DeviceSit'), 'twist': 0, 'twist2': 0},
    armR={'shoulder': (-6, 6), 'hand': palm('DeviceSit'), 'twist': 0, 'twist2': 0},
)


def device_sit(t):
    """Sitting with the tablet: Sit's legs and foot wiggle, the head bobbing and nodding to the
    game, the tablet rising and falling a little with his breath."""
    tau = 2 * math.pi
    sw = math.sin(tau * t)
    wig = math.sin(tau * 3 * t)
    bob = math.sin(tau * 2 * t)
    nod = math.sin(tau * 4 * t)
    (x, y, z), rot = DEV_SIT['hips']['loc'], DEV_SIT['hips']['rot']
    p = merge(
        DEV_SIT,
        hips={'loc': (x, y, z + 0.01 * bob), 'rot': rot},
        head=(DEV_SIT['head'][0] + 3 * nod, 6 * sw, 3 * sw),
        neck=(DEV_SIT['neck'][0], 2 * sw, 0),
        chest=(DEV_SIT['chest'][0] + 2 * bob, 0, 0),
    )
    for side, _ in SIDES:
        p['arm' + side] = merge(DEV_SIT['arm' + side], hand=palm('DeviceSit', 0.03 * bob))
    p['legL'] = merge(SIT['legL'], pitch=-55 + 12 * wig, yaw=12 + 6 * wig)
    p['legR'] = merge(SIT['legR'], pitch=-55 - 12 * wig, yaw=12 - 6 * wig)
    return p


LIE_KNEE = (0.5, 0.42, 0.45)  # the knees on the floor behind him (x for his left; the joint's centre)
LIE_SHIN = 0.93  # knee to ankle, model units (a little inside the calf's reach)
LIE_KICK = (55, 28)  # the shins' angle up off the floor behind him: the middle, and each way


def lie_foot(a):
    """The left ankle's place lying, the shin `a` degrees up off the floor behind the knee."""
    kx, ky, kz = LIE_KNEE
    r = math.radians(a)
    return (kx - 0.05, ky + LIE_SHIN * math.cos(r), kz + LIE_SHIN * math.sin(r))


DEV_LIE = {
    # round 17, the user's pose: on his stomach, the belly and hips flat on the floor, the chest
    # raised about 21 degrees, the arms stretched nearly straight out in front holding the tablet
    # by its near edge. The neck tips back and the head forward on it: the back hair keeps clear
    # of his shirt only while the head itself tips back little on the neck (the shirt's collar
    # turns with the neck, not the head), so the face comes up this way.
    'hips': {'loc': (0, 0, -1.24), 'rot': (86, 0, 0)},
    'chest': (-17, 0, 0),
    'neck': (-62, 0, 0),
    'head': (22, 0, 0),
    'armL': {'shoulder': (0, 50), 'hand': palm('DeviceLie'), 'elbow': (1, 0.2, -0.6), 'twist': 0, 'twist2': 0},
    'armR': {'shoulder': (0, 50), 'hand': palm('DeviceLie'), 'elbow': (1, 0.2, -0.6), 'twist': 0, 'twist2': 0},
    'legL': {'at': lie_foot(LIE_KICK[0]), 'pitch': -120, 'knee': (0.1, -1, 0)},  # toes pointed
    'legR': {'at': lie_foot(LIE_KICK[0]), 'pitch': -120, 'knee': (0.1, -1, 0)},
}


def device_lie(t):
    """Lying with the tablet: the feet kicking up and down behind him in turn (three times a
    loop), a small head bob, the palms tapping the tablet's near corners in turn."""
    tau = 2 * math.pi
    bob = math.sin(tau * 2 * t + 1)
    # (the head only bobs forward of DEV_LIE's: back from it, the back hair digs in)
    p = merge(DEV_LIE, head=(DEV_LIE['head'][0] + 1.5 * (1 + bob), 2 * math.sin(tau * t), 0))
    mid, swing = LIE_KICK
    for side, s in SIDES:
        k = math.sin(tau * 3 * t) * s
        p['leg' + side] = merge(DEV_LIE['leg' + side], at=lie_foot(mid + swing * k), pitch=-120 + 15 * k)
        tap = max(0.0, math.sin(tau * 2 * t + (0 if s > 0 else math.pi))) ** 2
        p['arm' + side] = merge(DEV_LIE['arm' + side], hand=palm('DeviceLie', 0.03 * tap))
    return p


KNEEL_FEET = (0.6, 0.95, 0.55)  # kneeling: the shins along the floor behind him, the toes back


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
            CROUCH,  # the feet stay planted where Idle has them
            hips={'loc': (0, 0, -0.55), 'rot': (14, 0, 0)},
            armL={'shoulder': (6, 8), 'upper': (50, 20), 'lower': (70, 10), 'twist': 0},
            armR={'shoulder': (6, 8), 'upper': (50, 20), 'lower': (70, 10), 'twist': 0},
        )),
        (12, merge(SIT, hips={'loc': (0, 0, -1.3), 'rot': (-10, 0, 0)}, legL={'at': (0.7, -1.1, 0.75), 'pitch': -30}, legR={'at': (0.7, -1.1, 0.75), 'pitch': -30})),
        # the bump: the bottom stops at the floor, the chest and head carry on forward
        (15, merge(SIT, hips={'loc': (0, 0, -1.6), 'rot': (-16, 0, 0)}, chest=(4, 0, 0), head=(5, 0, 0))),
        (19, merge(SIT, hips={'loc': (0, 0, -1.55), 'rot': (-18, 0, 0)}, chest=(-4, 0, 0), head=(-3, 0, 0))),
        (24, SIT),
    ),
    'StandUp': keys(
        (0, SIT),
        (3, merge(SIT, hips={'loc': (0, 0, -1.58), 'rot': (-10, 0, 0)}, chest=(4, 0, 0), legL={'at': (0.74, -0.75, 0.62), 'pitch': -20, 'knee': (0.8, -0.3, 1)}, legR={'at': (0.74, -0.75, 0.62), 'pitch': -20, 'knee': (0.8, -0.3, 1)})),
        (6, merge(
            SIT,  # the feet set down flat just in front of him, the knees up and open, rocking forward
            hips={'loc': (0, 0, -1.42), 'rot': (10, 0, 0)},
            chest=(20, 0, 0),
            neck=(4, 0, 0),
            head=(-8, 0, 0),
            armL={'shoulder': (4, 6), 'upper': (30, 30), 'lower': (50, 20), 'twist': 0},
            armR={'shoulder': (4, 6), 'upper': (30, 30), 'lower': (50, 20), 'twist': 0},
            legL={'at': STAND_FEET, 'pitch': -6, 'yaw': 0, 'knee': (0.9, -0.3, 1)},  # toes up a little: the
            legR={'at': STAND_FEET, 'pitch': -6, 'yaw': 0, 'knee': (0.9, -0.3, 1)},  # bent calf pulls the sole down
        )),
        (10, merge(
            CROUCH,  # the head's weight over the feet (leaning 50 degrees), pushing off, arms forward
            hips={'loc': (0, -0.1, -0.95), 'rot': (30, 0, 0)},
            chest=(20, 0, 0),
            neck=(-4, 0, 0),
            head=(-12, 0, 0),
            armL={'shoulder': (6, 10), 'upper': (70, 26), 'lower': (85, 14), 'twist': 0},
            armR={'shoulder': (6, 10), 'upper': (70, 26), 'lower': (85, 14), 'twist': 0},
            legL={'at': STAND_FEET, 'pitch': -2, 'yaw': 0, 'knee': (0.9, -0.8, 0.5)},
            legR={'at': STAND_FEET, 'pitch': -2, 'yaw': 0, 'knee': (0.9, -0.8, 0.5)},
        )),
        (13, merge(
            IDLE,
            hips={'loc': (0, -0.05, -0.4), 'rot': (14, 0, 0)},
            chest=(8, 0, 0),
            head=(-6, 0, 0),
            legL={'at': STAND_FEET, 'pitch': 0, 'knee': (0.5, -1, 0)},
            legR={'at': STAND_FEET, 'pitch': 0, 'knee': (0.5, -1, 0)},
        )),
        (15, merge(IDLE, hips={'loc': (0, 0, -0.04), 'rot': (-4, 0, 0)}, chest=(-3, 0, 0), head=(-4, 0, 0), legL={'at': STAND_FEET, 'pitch': 0}, legR={'at': STAND_FEET, 'pitch': 0})),
        # two small steps back to where Idle stands, one foot at a time
        (17, merge(IDLE, hips={'loc': (-0.04, 0, -0.06), 'rot': (0, -2, 0)}, legL={'at': (0.66, -0.14, ANKLE + 0.16), 'pitch': 6}, legR={'at': STAND_FEET, 'pitch': 0})),
        (18, merge(IDLE, hips={'loc': (-0.02, 0, -0.08), 'rot': (0, 0, 0)}, legR={'at': STAND_FEET, 'pitch': 0})),
        (20, merge(IDLE, hips={'loc': (0.04, 0, -0.06), 'rot': (0, 2, 0)}, legR={'at': (0.66, -0.14, ANKLE + 0.16), 'pitch': 6})),
        (21, merge(IDLE, hips={'loc': (0.02, 0, -0.08), 'rot': (0, 0, 0)})),
        (24, IDLE),
    ),
    # Give Device's second press: from sitting with the tablet onto his stomach with it (the hips
    # stay over the same spot of floor: the page moves his root, the model test holds them). The
    # page holds the tablet by its near edge all the way (clips.js DEVICE LieDown), so his palms
    # set it down on the floor in front of him and push it out ahead as he lowers himself.
    'LieDown': keys(
        (0, 'devicesit@0'),
        (8, merge(
            DEV_SIT,  # leaning forward, the feet pulled in, the tablet going down in front
            hips={'loc': (0, 0, -1.2), 'rot': (10, 0, 0)},
            chest=(15, 0, 0),
            head=(-5, 0, 0),
            armL={'shoulder': (0, 20), 'hand': (0.7, -1.55, 1.0), 'twist': 0, 'twist2': 0},
            armR={'shoulder': (0, 20), 'hand': (0.7, -1.55, 1.0), 'twist': 0, 'twist2': 0},
            legL={'at': (0.7, -0.7, 0.45), 'pitch': -10, 'yaw': 6},
            legR={'at': (0.7, -0.7, 0.45), 'pitch': -10, 'yaw': 6},
        )),
        (16, merge(
            DEV_LIE,  # on his knees, the tablet set down on the floor in front, his palms on it
            hips={'loc': (0, 0, -0.8), 'rot': (60, 0, 0)},
            chest=(15, 0, 0),
            neck=(-25, 0, 0),
            head=(8, 0, 0),
            armL={'shoulder': (0, 20), 'hand': (0.7, -2.3, 0.5), 'twist': 0, 'twist2': 0},
            armR={'shoulder': (0, 20), 'hand': (0.7, -2.3, 0.5), 'twist': 0, 'twist2': 0},
            legL={'at': KNEEL_FEET, 'pitch': -100, 'knee': (0.25, -1, 0)},
            legR={'at': KNEEL_FEET, 'pitch': -100, 'knee': (0.25, -1, 0)},
        )),
        (26, merge(
            DEV_LIE,  # down onto his belly, the legs out straight behind, the tablet pushed ahead
            hips={'loc': (0, 0, -1.1), 'rot': (84, 0, 0)},
            chest=(-12, 0, 0),
            neck=(-48, 0, 0),
            head=(18, 0, 0),
            armL={'shoulder': (0, 40), 'hand': (0.7, -2.85, 0.55), 'twist': 0, 'twist2': 0},
            armR={'shoulder': (0, 40), 'hand': (0.7, -2.85, 0.55), 'twist': 0, 'twist2': 0},
            legL={'at': (0.5, 1.35, 0.6), 'pitch': -100},
            legR={'at': (0.5, 1.35, 0.6), 'pitch': -100},
        )),
        (31, merge(DEV_LIE, legL={'at': lie_foot(35), 'pitch': -110}, legR={'at': lie_foot(35), 'pitch': -110})),
        (36, 'devicelie@0'),
    ),
    # Give Device's third press (or any other input): up from lying to Idle (the tablet is put
    # away from its first frame).
    'GetUp': keys(
        (0, 'devicelie@0'),
        (6, merge(
            DEV_LIE,  # pushing up, the hands coming in under the shoulders
            hips={'loc': (0, 0, -1.05), 'rot': (76, 0, 0)},
            chest=(-25, 0, 0),
            neck=(-35, 0, 0),
            head=(12, 0, 0),
            armL={'shoulder': (0, 8), 'hand': (0.8, -1.45, 0.3), 'twist': 0, 'twist2': 0},
            armR={'shoulder': (0, 8), 'hand': (0.8, -1.45, 0.3), 'twist': 0, 'twist2': 0},
            legL={'at': (0.55, 1.2, 0.55), 'pitch': -100},
            legR={'at': (0.55, 1.2, 0.55), 'pitch': -100},
        )),
        (12, merge(
            DEV_LIE,  # up on his knees
            hips={'loc': (0, 0, -0.75), 'rot': (30, 0, 0)},
            chest=(0, 0, 0),
            neck=(0, 0, 0),
            head=(-5, 0, 0),
            armL={'shoulder': (0, 4), 'upper': (30, 20), 'lower': (50, 15), 'twist': 0, 'hand': None},
            armR={'shoulder': (0, 4), 'upper': (30, 20), 'lower': (50, 15), 'twist': 0, 'hand': None},
            legL={'at': KNEEL_FEET, 'pitch': -100, 'knee': (0.25, -1, 0)},
            legR={'at': KNEEL_FEET, 'pitch': -100, 'knee': (0.25, -1, 0)},
        )),
        (17, merge(
            CROUCH,  # the left foot forward
            hips={'loc': (0, 0, -0.85), 'rot': (20, 0, 0)},
            legL={'at': (0.6, -0.45, ANKLE), 'pitch': 0, 'knee': (0.3, -1, 0.3)},
            legR={'at': KNEEL_FEET, 'pitch': -100, 'knee': (0.25, -1, 0)},
        )),
        (22, merge(CROUCH, hips={'loc': (0, 0, -0.7), 'rot': (20, 0, 0)}, legL={'at': (0.6, -0.1, ANKLE), 'pitch': 0}, legR={'at': (0.6, -0.1, ANKLE), 'pitch': 0})),
        (26, merge(IDLE, hips={'loc': (0, 0, -0.15), 'rot': (4, 0, 0)})),
        (30, 'idle@0'),
    ),
}


def sit(t):
    """Sitting: legs out, hands on the floor at his sides; breathing (twice a loop), the head
    sways, the feet wiggle."""
    sw = math.sin(2 * math.pi * t)
    wig = math.sin(2 * math.pi * 3 * t)
    bob = math.sin(2 * math.pi * 2 * t)
    (x, y, z), rot = SIT['hips']['loc'], SIT['hips']['rot']
    p = merge(
        SIT,
        hips={'loc': (x, y, z + 0.01 * bob), 'rot': rot},
        head=(-2 * bob, 10 * sw, 5 * sw),
        neck=(2, 3 * sw, 0),
        chest=(SIT['chest'][0] + 2 * bob, 0, 0),
    )
    p['legL'] = merge(SIT['legL'], pitch=-55 + 12 * wig, yaw=12 + 6 * wig)
    p['legR'] = merge(SIT['legR'], pitch=-55 - 12 * wig, yaw=12 - 6 * wig)
    return p


# ---------------------------------------------------------------------------------------------
# Round 15's talking gestures for the dialogue (clips.js DIALOGUE_CLIPS). His head is huge and
# hangs low over his shoulders, so a raised hand goes out beside it (Cheer, Shrug) or stays
# under its chin and in front of it (Talk, Point, Think); the hands keep at least 0.1 from the
# head, hair and cap (Think's comes up under the chin, 0.05), measured on the skinned meshes
# (test/invitationModel.test.mjs). The one-shots start and end on IDLE.


def pulse(t, at, width):
    """A bump of height 1 at `at` (0..1 of a loop), `width` wide, wrapping round the loop."""
    d = (t - at + 0.5) % 1.0 - 0.5
    return math.exp(-((d / width) ** 2))


def arm_blend(a, b, k):
    """An arm k of the way from pose a to pose b (each an arm dict)."""
    a, b = dict(ARM_DEFAULT, **a), dict(ARM_DEFAULT, **b)
    return {key: lerp(a[key], b[key], k) for key in ARM_DEFAULT}


def nudge(arm, upper=(0, 0), lower=(0, 0), shoulder=(0, 0), twist2=0):
    """An arm with some of its numbers moved by the given amounts."""
    a = dict(ARM_DEFAULT, **arm)
    return dict(
        a,
        upper=tuple(x + y for x, y in zip(a['upper'], upper)),
        lower=tuple(x + y for x, y in zip(a['lower'], lower)),
        shoulder=tuple(x + y for x, y in zip(a['shoulder'], shoulder)),
        twist2=a['twist2'] + twist2,
    )


# Talk's raised hand: the elbow a little forward, the forearm out level in front of his belly,
# where the high camera sees it under the head's front.
TALK_R = {'shoulder': (4, 6), 'upper': (46, 20), 'lower': (134, 18), 'twist': 0, 'twist2': 20}
TALK_L = {'shoulder': (4, 6), 'upper': (40, 20), 'lower': (124, 20), 'twist': 0, 'twist2': 20}


def talk(t):
    """Talk at t (0..1 of its loop): chatting like an Uma Musume girl does. The right hand comes up
    in front of him and beats twice on his words (t 0.12 and 0.32), then the left takes a turn
    (t 0.68) while the right settles half down; his head nods a little on each beat, tilts from
    side to side and his weight shifts once a loop."""
    tau = 2 * math.pi
    up_r = 0.62 + 0.38 * math.cos(tau * (t - 0.22))
    up_l = 0.85 * (0.5 + 0.5 * math.cos(tau * (t - 0.7)))
    beat_r = pulse(t, 0.12, 0.06) + pulse(t, 0.32, 0.06)
    beat_l = pulse(t, 0.68, 0.07)
    beat = beat_r + beat_l
    sw = math.sin(tau * t)
    br = math.sin(tau * 2 * t)
    p = merge(
        IDLE,
        hips={'loc': (0, 0, -0.06 - 0.02 * br), 'rot': (0, 2.0 * sw, 0)},
        chest=(2 + 1.5 * br + 2 * beat, -1.0 * sw, 4 * math.sin(tau * (t - 0.2))),
        neck=(-2, 0, 0),
        head=(-7 + 5 * beat, -6 * math.sin(tau * (t - 0.1)), 5 * math.sin(tau * (t - 0.15))),
    )
    p['armR'] = nudge(arm_blend(ARM_RELAXED, TALK_R, up_r), upper=(4 * beat_r, 8 * beat_r), lower=(10 * beat_r, 22 * beat_r))
    p['armL'] = nudge(arm_blend(ARM_RELAXED, TALK_L, up_l), upper=(4 * beat_l, 8 * beat_l), lower=(10 * beat_l, 22 * beat_l))
    return p


# Think's hands: the right elbow tucked in front of his belly, the forearm up so the hand sits
# under the front of his chin; the left forearm across his middle under the right elbow.
THINK_R = {'shoulder': (6, 10), 'upper': (50, 10), 'lower': (146, -10), 'twist': 0, 'twist2': 0}
THINK_L = {'shoulder': (2, 8), 'upper': (38, 8), 'lower': (86, -55), 'twist': 0, 'twist2': 0}


def think(t):
    """Think at t (0..1): the hand to his chin, the head tilted and looking up to one side,
    swaying a little side to side once a loop, the finger tapping the chin twice."""
    tau = 2 * math.pi
    sw = math.sin(tau * t)
    tap = max(0.0, math.sin(tau * 2 * t)) ** 2
    p = merge(
        IDLE,
        hips={'loc': (0, 0, -0.06), 'rot': (0, 2.5 * sw, 0)},
        chest=(-1, -1.5 * sw, -4),
        neck=(-3, -3, 0),
        head=(-9 + 1.5 * tap, -11 - 3 * sw, 10 + 2 * sw),
    )
    p['armR'] = nudge(THINK_R, lower=(-5 * tap, 0))
    p['armL'] = THINK_L
    return p


# Nod's down beat: shallow (15 degrees in all, his huge head's fringe would hide his eyes past
# that from the default view's 36 degrees up and the medium shot's 16), carried as a dip down the
# body and a chin drop, so his face (and the box's) still reads at the bottom of the nod.
NOD_DOWN = merge(
    IDLE,
    hips={'loc': (0, 0, -0.22), 'rot': (1, 0, 0)},
    chest=(3, 0, 0),
    neck=(2, 0, 0),
    head=(9, 0, 0),
    armL=merge(ARM_RELAXED, upper=(10, 19), lower=(24, 15)),
    armR=merge(ARM_RELAXED, upper=(10, 19), lower=(24, 15)),
)

SHRUG_R = {'shoulder': (30, 4), 'upper': (12, 32), 'lower': (85, 60), 'twist': 0, 'twist2': -50}
SHRUG = merge(
    IDLE,
    hips={'loc': (0, 0, -0.04), 'rot': (-2, 0, 0)},
    chest=(-4, 0, 0),
    neck=(-2, 0, 0),
    head=(-6, -11, -4),
    armL=SHRUG_R,
    armR=SHRUG_R,
)

POINT_ARM = {'shoulder': (0, 12), 'upper': (110, 30), 'lower': (124, 30), 'twist': 0, 'twist2': 0}
POINT = merge(
    IDLE,
    hips={'loc': (0, 0, -0.06), 'rot': (0, 2, -4)},
    chest=(3, -2, -6),
    neck=(-3, 0, 0),
    head=(-10, -7, -6),
    armR=POINT_ARM,
    armL=merge(ARM_RELAXED, upper=(-6, 24), lower=(8, 22)),
)

CHEER_UP = {'shoulder': (20, 0), 'upper': (148, 63), 'lower': (165, 42), 'twist': 0, 'twist2': 0}
CHEER_DOWN = {'shoulder': (-4, 0), 'upper': (-12, 22), 'lower': (8, 16), 'twist': 0, 'twist2': 0}


def gesture_tables():
    """The one-shot gestures' key-pose tables."""
    return {
        'Nod': keys(
            (0, IDLE),
            (3, merge(IDLE, chest=(1, 0, 0), head=(-4, 0, 0))),  # a small lift first
            (7, NOD_DOWN),
            (10, merge(IDLE, hips={'loc': (0, 0, -0.04), 'rot': (0, 0, 0)}, head=(-3, 0, 0))),
            (13, merge(IDLE, chest=(3, 0, 0), head=(6, 0, 0))),  # and a smaller second nod
            (18, IDLE),
        ),
        'Shrug': keys(
            (0, IDLE),
            (4, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (0, 0, 0)}, armL=arm_blend(ARM_RELAXED, SHRUG_R, 0.3), armR=arm_blend(ARM_RELAXED, SHRUG_R, 0.3))),
            (8, SHRUG),
            (12, merge(SHRUG, armL=nudge(SHRUG_R, shoulder=(6, 0), lower=(0, 6)), armR=nudge(SHRUG_R, shoulder=(6, 0), lower=(0, 6)), head=(-7, -13, -4))),
            (16, SHRUG),
            (20, merge(IDLE, head=(-2, -3, 0), armL=arm_blend(ARM_RELAXED, SHRUG_R, 0.2), armR=arm_blend(ARM_RELAXED, SHRUG_R, 0.2))),
            (24, IDLE),
        ),
        'Point': keys(
            (0, IDLE),
            (5, merge(  # the wind-up: the hand drawn back to his chest, turning away
                IDLE,
                hips={'loc': (0, 0, -0.1), 'rot': (0, -1, 3)},
                chest=(4, 1, 5),
                head=(0, 2, 3),
                armR={'shoulder': (6, -4), 'upper': (12, 30), 'lower': (140, 14), 'twist': 0, 'twist2': 0},
            )),
            (9, POINT),
            (12, merge(POINT, armR=nudge(POINT_ARM, upper=(-6, 0), lower=(-14, 0)), head=(-5, -6, -6))),  # two beats
            (15, POINT),
            (18, merge(POINT, armR=nudge(POINT_ARM, upper=(-6, 0), lower=(-14, 0)), head=(-5, -6, -6))),
            (21, POINT),
            (26, merge(IDLE, armR=arm_blend(ARM_RELAXED, POINT_ARM, 0.2), head=(-2, -2, -2))),
            (30, IDLE),
        ),
        'Cheer': keys(
            (0, IDLE),
            (4, merge(  # the crouch before the hop, the fists down
                IDLE,
                hips={'loc': (0, 0, -0.34), 'rot': (8, 0, 0)},
                chest=(8, 0, 0),
                head=(2, 0, 0),
                armL=CHEER_DOWN,
                armR=CHEER_DOWN,
            )),
            (7, merge(
                IDLE,
                hips={'loc': (0, 0, 0.22), 'rot': (-2, 0, 0)},
                chest=(-3, 0, 0),
                head=(-6, 0, 0),
                armL=arm_blend(CHEER_DOWN, CHEER_UP, 0.75),
                armR=arm_blend(CHEER_DOWN, CHEER_UP, 0.75),
                legL={'at': (0.62, 0.08, ANKLE + 0.26), 'pitch': 20},
                legR={'at': (0.62, 0.08, ANKLE + 0.26), 'pitch': 20},
            )),
            (10, merge(  # the top of the hop, the fists up beside his head
                IDLE,
                hips={'loc': (0, 0, 0.5), 'rot': (-5, 0, 0)},
                chest=(-6, 0, 0),
                neck=(-4, 0, 0),
                head=(-8, 0, 0),
                armL=CHEER_UP,
                armR=CHEER_UP,
                legL={'at': (0.64, 0.1, ANKLE + 0.52), 'pitch': 30, 'knee': (0.4, -1, 0)},
                legR={'at': (0.64, 0.1, ANKLE + 0.52), 'pitch': 30, 'knee': (0.4, -1, 0)},
            )),
            (12, merge(
                IDLE,
                hips={'loc': (0, 0, 0.36), 'rot': (-4, 0, 0)},
                chest=(-5, 0, 0),
                neck=(-4, 0, 0),
                head=(-8, 0, 0),
                armL=nudge(CHEER_UP, upper=(4, 0)),
                armR=nudge(CHEER_UP, upper=(4, 0)),
                legL={'at': (0.63, 0.09, ANKLE + 0.38), 'pitch': 24},
                legR={'at': (0.63, 0.09, ANKLE + 0.38), 'pitch': 24},
            )),
            (15, merge(  # lands, the fists pumped down a little
                IDLE,
                hips={'loc': (0, 0, -0.26), 'rot': (6, 0, 0)},
                chest=(5, 0, 0),
                head=(-2, 0, 0),
                armL=nudge(CHEER_UP, upper=(-22, 4), lower=(-30, 4)),
                armR=nudge(CHEER_UP, upper=(-22, 4), lower=(-30, 4)),
            )),
            (18, merge(IDLE, hips={'loc': (0, 0, -0.02), 'rot': (-3, 0, 0)}, chest=(-4, 0, 0), head=(-7, 0, 0), armL=CHEER_UP, armR=CHEER_UP)),
            (22, merge(IDLE, hips={'loc': (0, 0, -0.04), 'rot': (-2, 0, 0)}, chest=(-3, 0, 0), head=(-6, 0, 0), armL=nudge(CHEER_UP, upper=(-6, 0), lower=(-8, 0)), armR=nudge(CHEER_UP, upper=(-6, 0), lower=(-8, 0)))),
            (26, merge(IDLE, head=(-2, 0, 0), armL=arm_blend(ARM_RELAXED, CHEER_UP, 0.25), armR=arm_blend(ARM_RELAXED, CHEER_UP, 0.25))),
            (30, IDLE),
        ),
    }


TABLES.update(gesture_tables())

CYCLES = {
    'Idle': idle,
    'Walk': lambda t: gait(t, WALK),
    'Run': lambda t: gait(t, RUN),
    'Held': held,
    'Fall': fall,
    'Sit': sit,
    'Talk': talk,
    'Think': think,
    'Thrash': thrash,
    'DeviceSit': device_sit,
    'DeviceLie': device_lie,
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
    return {k.lower(): f for k, f in CYCLES.items()}[clip.lower()](float(at))


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
