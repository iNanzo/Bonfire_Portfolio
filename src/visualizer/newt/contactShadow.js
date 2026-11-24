// The toy's standing contact cue for Live devices without shadow maps.
import * as THREE from 'three';
export function createContactShadow({ scene, scope, color }) {
  // Copied from src/invitation/stage.js:92-106,233-238: the standing contact blob.
  // Wider with a firmer falloff so Live's exposed, quantized page retains a cue beyond the boots.
  const blobData = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const alpha = Math.max(0, 1 - Math.hypot((x + 0.5) / 16 - 1, (y + 0.5) / 16 - 1));
      blobData.set([255, 255, 255, Math.round(Math.pow(alpha, 0.5) * 255)], (y * 32 + x) * 4);
    }
  const blobTexture = scope.own(new THREE.DataTexture(blobData, 32, 32));
  blobTexture.magFilter = blobTexture.minFilter = THREE.LinearFilter;
  blobTexture.needsUpdate = true;
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blobTexture,
      color: color,
      opacity: 0.85,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  blob.layers.set(2);
  scope.trackTree(blob);
  scene.add(blob);
  return blob;
}
