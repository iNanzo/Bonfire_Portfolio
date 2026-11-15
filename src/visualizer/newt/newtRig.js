// NEWT's rest map for the knight solver. No scene, character or GLB loader is created here.
import * as THREE from 'three';
import { BONES, IDX, measureRig } from '../../bonfire/knightRig.js';
import { createSolver } from '../../bonfire/knightSolve.js';
export const K = 1.72 / 6.255;
export const NEWT_NODES = {
  hips: 'Bone',
  chest: 'Chest',
  neck: 'Neck',
  head: 'Neck001',
  shoulderL: 'ShoulderL',
  upperArmL: 'BicepL',
  forearmL: 'ForeArmL',
  shoulderR: 'ShoulderR',
  upperArmR: 'BicepR',
  forearmR: 'ForeArmR',
  thighL: 'ThighL',
  shinL: 'CalfL',
  footL: 'FootL',
  thighR: 'ThighR',
  shinR: 'CalfR',
  footR: 'FootR',
};
/** Rest matrix by runtime bone name, in unscaled model units (for example glbAnim.world). */
export function createNewtRig(world) {
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(world(name)).multiplyScalar(K);
  /** @type {any} */
  const rest = Object.fromEntries(Object.entries(NEWT_NODES).map(([key, name]) => [key, at(name).toArray()]));
  rest.spine = [...rest.chest];
  for (const side of ['L', 'R']) {
    rest['hand' + side] = new THREE.Vector3(0, 0.9, 0)
      .applyMatrix4(world('ForeArm' + side))
      .multiplyScalar(K)
      .toArray();
    rest['fingers' + side] = [...rest['hand' + side]];
    rest['tasset' + side] = [...rest['thigh' + side]];
    rest['pauldron' + side] = [...rest['shoulder' + side]];
  }
  const rig = measureRig(rest, { plates: null });
  const base = createSolver(rig);
  const solver = {
    ...base,
    solve(...args) {
      const solved = base.solve(...args);
      // Knight pauldrons give the shoulder 52% of the arm swing. NEWT has a real
      // shoulder bone; the upper arm already owns the solved swing, so keep it on his chest.
      for (const side of ['L', 'R']) {
        const i = IDX['shoulder' + side];
        solved.q[i].copy(solved.q[IDX.chest]);
        solved.p[i]
          .copy(rig.pos['shoulder' + side])
          .sub(rig.pos.chest)
          .applyQuaternion(solved.q[IDX.chest])
          .add(solved.p[IDX.chest]);
      }
      return solved;
    },
  };
  return { rig, solver, rest, nodes: NEWT_NODES, bones: BONES };
}
