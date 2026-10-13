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

Each clip is a list of (frame, pose) keys, or a function of the frame for the cycles (Walk and
Run are keyed on every frame from a few step parameters). Loops end on an exact copy of frame 0;
quaternion signs stay continuous. Held pins the collar (the Neck bone's head) where it rests.
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


def blend(p, q, t):
    """Blend two poses part by part (both must list the same parts, as the presets do)."""
    out = {}
    for k in set(p) | set(q):
        a, b = p.get(k), q.get(k)
        if a is None or b is None or isinstance(a, (bool, str)):
            out[k] = b if t >= 0.5 and b is not None else (a if a is not None else b)
        elif isinstance(a, dict):
            out[k] = {kk: lerp(a[kk], b[kk], t) if kk in a and kk in b else (b.get(kk, a.get(kk))) for kk in set(a) | set(b)}
        else:
            out[k] = lerp(a, b, t)
    return out


# ---------------------------------------------------------------------------------------------
# Key poses (armature space; see the docstring for what each number means)

ANKLE = 0.417  # the ankle over the sole (clips.js ANKLE_HEIGHT)
STANCE = (0.6, 0.06, ANKLE)  # Idle's ankle, his left (+X); the right mirrors it
WIDE = (1.0, -0.08, ANKLE)  # Land's: where Fall's spread feet touch down

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
    'neck': (10, 0, 0),
    'head': (14, 0, 0),
    'armL': {'shoulder': (8, -6), 'upper': (-28, 24), 'lower': (-20, 18), 'twist': 0},
    'armR': {'shoulder': (8, -6), 'upper': (-28, 24), 'lower': (-20, 18), 'twist': 0},
    'legL': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
    'legR': {'at': (0.78, -1.4, 0.7), 'pitch': -55, 'yaw': 12},
}

HELD = {
    'pin': True,
    'hips': {'loc': (0, 0, 0), 'rot': (-6, 0, 0)},
    'chest': (-2, 0, 0),
    'neck': (10, 0, 0),
    'head': (12, 0, 0),
    'armL': {'shoulder': (20, 6), 'upper': (22, 17), 'lower': (36, 12), 'twist': 0},
    'armR': {'shoulder': (20, 6), 'upper': (22, 17), 'lower': (36, 12), 'twist': 0},
    'legL': {'rel': (-0.2, -0.22, 0.06), 'pitch': 62, 'yaw': -8, 'knee': (0.1, -1, 0)},
    'legR': {'rel': (-0.2, -0.22, 0.06), 'pitch': 62, 'yaw': -8, 'knee': (0.1, -1, 0)},
}

FALL = {
    'hips': {'loc': (0, 0, -0.22), 'rot': (-6, 0, 0)},
    'chest': (-6, 0, 0),
    'neck': (-4, 0, 0),
    'head': (-6, 0, 0),
    'armL': {'shoulder': (14, 0), 'upper': (150, 48), 'lower': (165, 30), 'twist': 0},
    'armR': {'shoulder': (14, 0), 'upper': (150, 48), 'lower': (165, 30), 'twist': 0},
    'legL': {'rel': (0.32, -0.1, 0.22), 'pitch': 25, 'knee': (0.6, -1, 0)},
    'legR': {'rel': (0.32, -0.1, 0.22), 'pitch': 25, 'knee': (0.6, -1, 0)},
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


def gait(t, g):
    """A walk or run cycle at t (0..1); the left foot is forward at 0, as in clips.js."""
    p = merge(IDLE)
    c = g['contact']
    feet = {}
    for side, s in SIDES:
        ph = (t + (0.0 if s > 0 else 0.5)) % 1.0
        if ph < c:  # planted: slides back at an even speed
            u = ph / c
            y = -g['step'] / 2 + g['step'] * u
            z = ANKLE
            pitch = lerp(g['heel'], g['toe'], u)
        else:  # swing: lifts and comes forward
            u = (ph - c) / (1 - c)
            e = u * u * (3 - 2 * u)
            y = g['step'] / 2 - g['step'] * e
            z = ANKLE + g['lift'] * math.sin(math.pi * u ** g['peak'])  # peak < 1 kicks up early
            pitch = lerp(g['toe'], g['heel'], e) + g['swing_pitch'] * math.sin(math.pi * u)
        feet[side] = (g['width'], y, z, pitch)
        p['leg' + side] = {'at': (g['width'], y, z), 'pitch': pitch, 'knee': (0.15, -1, 0)}
    bob = math.cos(4 * math.pi * (t - g['low']))  # lowest at g['low'] and half a cycle on
    sw = math.cos(2 * math.pi * t)  # +1 when the left foot leads
    p['hips'] = {
        'loc': (0.0, 0.0, g['height'] - g['bob'] * bob),
        'rot': (g['lean'], g['roll'] * math.sin(2 * math.pi * t), -g['yaw'] * sw),
    }
    p['chest'] = (g['chest'], 0, g['yaw'] * 1.4 * sw)
    p['neck'] = (0, 0, -g['yaw'] * 0.3 * sw)
    p['head'] = (g['head'] + g['nod'] * bob, -g['roll'] * 0.6 * math.sin(2 * math.pi * t), 0)
    for side, s in SIDES:
        k = -s * sw  # the arm opposite the leading foot swings forward
        a = g['arm']
        p['arm' + side] = {
            'shoulder': (a['shrug'], a['protract'] + 4 * k),
            'upper': (a['fwd'] + a['swing'] * k, a['out']),
            'lower': (a['fwd2'] + a['swing2'] * k, a['out2']),
            'twist': 0,
        }
    return p


WALK = {
    'contact': 0.5, 'step': 1.85, 'lift': 0.4, 'peak': 0.9, 'low': 0.0, 'width': 0.46, 'height': -0.2, 'bob': 0.09,
    'heel': -14, 'toe': 18, 'swing_pitch': 8, 'lean': 4, 'roll': 5, 'yaw': 9, 'chest': 2,
    'head': -2, 'nod': 3,
    'arm': {'shrug': 0, 'protract': 0, 'fwd': 2, 'swing': 30, 'out': 20, 'fwd2': 16, 'swing2': 32, 'out2': 14},
}  # fmt: skip
RUN = {
    'contact': 0.3, 'step': 2.0, 'lift': 0.7, 'peak': 0.7, 'low': 0.15, 'width': 0.42, 'height': -0.3, 'bob': 0.15,
    'heel': -8, 'toe': 26, 'swing_pitch': 18, 'lean': 14, 'roll': 4, 'yaw': 6, 'chest': 4,
    'head': -12, 'nod': 3,
    'arm': {'shrug': 18, 'protract': 10, 'fwd': 105, 'swing': 22, 'out': 32, 'fwd2': 125, 'swing2': 20, 'out2': 18},
}  # fmt: skip


def held(t):
    """Dangling by the collar: a gentle sway the limbs follow late, and one small kick."""
    tau = 2 * math.pi
    sw = math.sin(tau * t)
    lag = math.sin(tau * (t - 0.08))  # the arms and legs follow the body's swing late
    kick = math.sin(math.pi * (t - 0.5) / 0.22) if 0.5 <= t <= 0.72 else 0.0
    p = merge(HELD, hips={'loc': (0, 0, 0), 'rot': (-6 + 2 * math.cos(tau * t), 4 * sw, 0)})
    p['chest'] = (-2, -1.5 * lag, 0)
    p['head'] = (12 + 3 * math.cos(tau * t), -4 * lag, 2 * lag)
    for side, s in SIDES:
        arm = HELD['arm' + side]
        p['arm' + side] = merge(arm, upper=(22 + 5 * s * lag, 17 - 4 * s * lag), lower=(36 + 8 * s * lag, 12))
    p['legL'] = merge(HELD['legL'], rel=(-0.2 + 0.05 * lag, -0.22 - 0.6 * kick, 0.06 + 0.45 * kick), pitch=62 - 30 * kick)
    p['legR'] = merge(HELD['legR'], rel=(-0.2 - 0.05 * lag, -0.22 + 0.08 * lag, 0.06))
    return p


def fall(t):
    """Falling: arms up flailing, legs apart, kicking."""
    w = math.sin(2 * math.pi * t)
    p = merge(FALL)
    p['armL'] = merge(FALL['armL'], upper=(150 + 12 * w, 48), lower=(165 + 10 * w, 30))
    p['armR'] = merge(FALL['armR'], upper=(150 - 12 * w, 48), lower=(165 - 10 * w, 30))
    p['legL'] = merge(FALL['legL'], rel=(0.32, -0.1 - 0.12 * w, 0.22 + 0.06 * w))
    p['legR'] = merge(FALL['legR'], rel=(0.32, -0.1 + 0.12 * w, 0.22 - 0.06 * w))
    return p


def keys(*frames):
    """A key-pose table: (frame, pose) pairs, kept as given."""
    return list(frames)


ARM_UP = {'shoulder': (18, 0), 'upper': (155, 50), 'lower': (170, 32), 'twist': 0}
CROUCH = merge(
    IDLE,
    hips={'loc': (0, 0, -0.38), 'rot': (8, 0, 0)},
    chest=(6, 0, 0),
    head=(-4, 0, 0),
    armL={'shoulder': (12, 6), 'upper': (18, 22), 'lower': (40, 12), 'twist': 0},
    armR={'shoulder': (12, 6), 'upper': (18, 22), 'lower': (40, 12), 'twist': 0},
)

WAVE_UP = {'shoulder': (16, 0), 'upper': (160, 70), 'lower': (178, 24), 'twist': 0}


def wave_arm(w):
    """The waving forearm: w = 1 swings it out, w = -0.4 back toward the head (never into it)."""
    return merge(WAVE_UP, lower=(178, 22 + 28 * w))


def waving(w, lean=1.0):
    """Wave's body: tipped toward the waving arm, the head tilted the other way and back, so
    the high camera sees his face."""
    return merge(
        IDLE,
        hips={'loc': (0, 0, -0.06), 'rot': (-3 * lean, -2 * lean, 0)},
        chest=(-4 * lean, -4 * lean, 0),
        neck=(-5 * lean, 0, 0),
        head=(-8 * lean, 10 * lean, -4 * lean),
        armR=wave_arm(w),
        armL=merge(ARM_RELAXED, upper=(6, 24), lower=(20, 20)),
    )


TABLES = {
    'Wave': keys(
        (0, IDLE),
        (5, merge(waving(0.4, 0.7), armR=merge(WAVE_UP, upper=(120, 60), lower=(150, 20)))),
        (8, waving(1.0)),
        (12, waving(-0.4)),
        (16, waving(1.0)),
        (20, waving(-0.4)),
        (24, waving(1.0)),
        (28, waving(0.0, 0.8)),
        (32, merge(IDLE, chest=(1, -1, 0), head=(-2, 3, 0), armR=merge(ARM_RELAXED, upper=(10, 26), lower=(24, 20)))),
        (36, IDLE),
    ),
    'Spook': keys(
        (0, IDLE),
        (2, CROUCH),  # the two-frame flinch
        (5, merge(
            IDLE,  # the hop's top: arms flung up, head thrown back (the high camera sees his face)
            hips={'loc': (0, 0, 0.75), 'rot': (-8, 0, 0)},
            chest=(-8, 0, 0),
            neck=(-6, 0, 0),
            head=(-12, 0, 0),
            armL=ARM_UP,
            armR=ARM_UP,
            legL={'at': (0.66, 0.12, ANKLE + 0.85), 'pitch': 35, 'knee': (0.5, -1, 0)},
            legR={'at': (0.66, 0.12, ANKLE + 0.85), 'pitch': 35, 'knee': (0.5, -1, 0)},
        )),
        (8, merge(
            IDLE,
            hips={'loc': (0, 0, 0.32), 'rot': (-4, 0, 0)},
            chest=(-5, 0, 0),
            neck=(-4, 0, 0),
            head=(-10, 0, 0),
            armL={'shoulder': (16, 0), 'upper': (130, 62), 'lower': (150, 48), 'twist': 0},
            armR={'shoulder': (16, 0), 'upper': (130, 62), 'lower': (150, 48), 'twist': 0},
            legL={'at': (0.64, 0.08, ANKLE + 0.36), 'pitch': 20},
            legR={'at': (0.64, 0.08, ANKLE + 0.36), 'pitch': 20},
        )),
        (10, merge(
            CROUCH,  # lands
            hips={'loc': (0, 0, -0.34), 'rot': (6, 0, 0)},
            head=(2, 0, 0),
            armL={'shoulder': (8, 0), 'upper': (40, 52), 'lower': (60, 40), 'twist': 0},
            armR={'shoulder': (8, 0), 'upper': (40, 52), 'lower': (60, 40), 'twist': 0},
        )),
        (13, merge(IDLE, hips={'loc': (0, 0, 0.02), 'rot': (-2, 0, 0)}, head=(-4, 0, 0), armL=merge(ARM_RELAXED, upper=(4, 28)), armR=merge(ARM_RELAXED, upper=(4, 28)))),
        (16, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (1, 0, 0)}, head=(2, 0, 0))),
        (20, IDLE),
    ),
    'Land': keys(
        (0, 'fall@0'),  # where Fall loops from: the page lands him when a foot touches
        (2, merge(
            FALL,
            hips={'loc': (0, 0, -0.5), 'rot': (6, 0, 0)},
            chest=(4, 0, 0),
            head=(-8, 0, 0),
            armL={'shoulder': (16, 0), 'upper': (125, 58), 'lower': (150, 40), 'twist': 0},
            armR={'shoulder': (16, 0), 'upper': (125, 58), 'lower': (150, 40), 'twist': 0},
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
        (9, merge(IDLE, hips={'loc': (0, 0, -0.1), 'rot': (0, -3, 0)}, legL={'at': (0.8, 0.0, ANKLE + 0.3), 'pitch': 10}, legR={'at': WIDE, 'pitch': 0, 'knee': (0.6, -1, 0)})),
        (11, merge(IDLE, hips={'loc': (0, 0, -0.08), 'rot': (0, 3, 0)}, legR={'at': (0.78, 0.02, ANKLE + 0.25), 'pitch': 8})),
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
        (5, merge(SIT, hips={'loc': (0, 0, -1.56), 'rot': (-8, 0, 0)}, chest=(10, 0, 0), legL={'at': (0.7, -0.6, ANKLE), 'pitch': 0}, legR={'at': (0.7, -0.6, ANKLE), 'pitch': 0})),
        (11, merge(
            CROUCH,
            hips={'loc': (0, 0, -0.75), 'rot': (24, 0, 0)},
            chest=(12, 0, 0),
            armL={'shoulder': (6, 8), 'upper': (40, 20), 'lower': (60, 10), 'twist': 0},
            armR={'shoulder': (6, 8), 'upper': (40, 20), 'lower': (60, 10), 'twist': 0},
        )),
        (17, merge(IDLE, hips={'loc': (0, 0, 0.0), 'rot': (-3, 0, 0)})),
        (21, merge(IDLE, hips={'loc': (0, 0, -0.08), 'rot': (1, 0, 0)})),
        (24, IDLE),
    ),
}


def sit(t):
    """Sitting: legs out, leaning back on his hands; the head sways, the feet wiggle."""
    sw = math.sin(2 * math.pi * t)
    wig = math.sin(2 * math.pi * 3 * t)
    p = merge(SIT, head=(14, 7 * sw, 4 * sw), neck=(10, 2 * sw, 0))
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


def clip_keys(name):
    """[(frame, pose)] for a clip: every frame of a cycle (the last a copy of 0), or its table."""
    last, loop = CLIPS[name]
    if name in CYCLES:
        f = CYCLES[name]
        out = [(i, f(i / last)) for i in range(last)]
        return out + [(last, out[0][1])]
    return [(f, CYCLES[p.split('@')[0].title()](float(p.split('@')[1])) if isinstance(p, str) else p) for f, p in TABLES[name]]


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
    frames = clip_keys(name)
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
    ks = clip_keys(name)
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
