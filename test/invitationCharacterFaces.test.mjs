// NEWT's eight faces on his character (src/invitation/character.js setFace): the first four from
// the glb's sheet and newt-face.png, the dialogue's four (clips.js EXTRA_FACES) from their own
// sheets (newt-face-smooth-extra.png and newt-face-extra.png, beside the glb), each pixel cell at
// the size picked for his half face (the same for all eight, so a face change never flips the
// sheet), the smooth cell where his face is smooth, and the nearest of the first four
// (faceSheets.js FACE_FALLBACK) until their sheets come or where an older cached image hasn't the
// size showing. A stand-in document records what each cell was cut from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter, extraFaceUrls } from '../src/invitation/character.js';
import { FACE_FALLBACK, FACE_IMAGE, FACE_LAYOUT } from '../src/invitation/faceSheets.js';
import { LOOKS } from '../src/invitation/look.js';
import { BONES, EXTRA_FACES, FACE_NAMES, FACES } from '../src/invitation/clips.js';
import { cameraAt, viewportOf, withFace } from './lib/newtStandIn.mjs';

/**
 * A stand-in document whose canvases remember what was drawn on them (the image and where in it),
 * enough to tell which sheet and cell his face shows; `run` with it in place.
 * @param {() => any} run
 */
async function withCanvases(run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        /** @type {any} */
        const canvas = { width: 0, height: 0, from: null };
        canvas.getContext = () => ({
          drawImage: (img, x, y, w, h) => {
            canvas.from = { img, x, y, w, h };
          },
        });
        return canvas;
      },
    },
  });
  try {
    return await run();
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had);
    else delete (/** @type {any} */ (globalThis).document);
  }
}

/** An image stand-in, as TextureLoader's would be: a size and a name to tell it by. */
const image = (name, width, height) => ({ name, width, height });

test('setFace shows all eight faces by name: the first four from their sheets, the dialogue’s four from theirs (smooth, and pixel at the size picked: the same size for all eight), the nearest of the first four until theirs come', async () => {
  await withCanvases(async () => {
    const { gltf, face } = withFace();
    face.material.map = new THREE.Texture(image('smooth', 1024, 1024));
    const pixelFace = new THREE.Texture(image('pixel', FACE_IMAGE.w, FACE_IMAGE.h));
    /** @type {(t: any) => void} */
    let giveSmooth = () => {};
    /** @type {(t: any) => void} */
    let givePixel = () => {};
    const extraFace = new Promise((done) => (giveSmooth = done));
    const pixelExtraFace = new Promise((done) => (givePixel = done));
    const ch = createCharacter(gltf, { preset: LOOKS.soft, pixel: false, pixelFace, extraFace, pixelExtraFace });
    ch.root.updateMatrixWorld(true);
    const c = ch.root.getObjectByName(BONES.head).localToWorld(new THREE.Vector3(0, 1, 0));
    const toon = /** @type {any} */ (face.material);
    face.onBeforeRender(viewportOf(195, 422), null, cameraAt(c, 40), face.geometry, toon, null);
    /** Where the cell on his face came from: its image's name, its corner, its size. */
    const shown = () => {
      const f = toon.map.image.from;
      return { img: f.img.name, x: f.x, y: f.y, w: f.w };
    };
    // Smooth (the pixel filter off): before the dialogue's sheet comes, the nearest of the first four.
    for (const name of Object.keys(EXTRA_FACES)) {
      ch.setFace(/** @type {any} */ (name));
      assert.equal(ch.face, name, `${name}: asked for`);
      assert.equal(ch.faceShown, FACE_FALLBACK[name], `${name}: ${FACE_FALLBACK[name]} until its sheet comes`);
      const [u, v] = FACES[FACE_FALLBACK[name]];
      assert.deepEqual(shown(), { img: 'smooth', x: u * 1024, y: v * 1024, w: 512 });
    }
    giveSmooth(new THREE.Texture(image('smooth-extra', 1024, 1024)));
    givePixel(new THREE.Texture(image('pixel-extra', FACE_IMAGE.w, FACE_IMAGE.h)));
    await ch.faceReady;
    assert.equal(ch.faceShown, 'smug', 'its sheet in: the face asked for shows');
    for (const name of FACE_NAMES) {
      ch.setFace(/** @type {any} */ (name));
      const extra = name in EXTRA_FACES;
      const [u, v] = extra ? EXTRA_FACES[name] : FACES[name];
      assert.equal(ch.faceShown, name, `${name}: shows`);
      assert.equal(ch.faceSheet, 'smooth');
      assert.deepEqual(
        shown(),
        { img: extra ? 'smooth-extra' : 'smooth', x: u * 1024, y: v * 1024, w: 512 },
        `${name}: its smooth cell`,
      );
    }
    // The pixel filter on: each face's cell at the size picked for his half face, all eight alike.
    ch.setStyle(LOOKS.soft, true);
    const size = ch.faceSize;
    assert.equal(typeof size, 'number');
    const sheet = FACE_LAYOUT.find((l) => l.w === size);
    for (const name of FACE_NAMES) {
      ch.setFace(/** @type {any} */ (name));
      const extra = name in EXTRA_FACES;
      const [u, v] = extra ? EXTRA_FACES[name] : FACES[name];
      assert.equal(ch.faceSheet, size, `${name}: the ${size} px sheet`);
      assert.equal(toon.map.magFilter, THREE.NearestFilter, `${name}: a pixel cell`);
      assert.deepEqual(
        shown(),
        { img: extra ? 'pixel-extra' : 'pixel', x: sheet.x + u * 2 * sheet.w, y: sheet.y + v * 2 * sheet.h, w: size },
        `${name}: its ${size} px cell`,
      );
    }
    // His breathing never flips the sheet, whatever the face (the pick is his half face's, not the face's).
    face.onBeforeRender(viewportOf(195, 422), null, cameraAt(c, 40 * 1.03), face.geometry, toon, null);
    assert.equal(ch.faceSheet, size, 'a 3% change keeps the sheet on a dialogue face');
    // A name that isn't a face changes nothing.
    ch.setFace(/** @type {any} */ ('grumpy'));
    assert.equal(ch.face, FACE_NAMES.at(-1));
    ch.dispose();
  });
});

test('the dialogue faces with an older pixel image cached (its sheets to 34 px): their cells at the sizes it has, the nearest of the first four (in pixels too) at a size it hasn’t, their smooth cells past the largest sheet', async () => {
  await withCanvases(async () => {
    const { gltf, face } = withFace();
    face.material.map = new THREE.Texture(image('smooth', 1024, 1024));
    const ch = createCharacter(gltf, {
      preset: LOOKS.soft,
      pixel: true,
      pixelFace: new THREE.Texture(image('pixel', FACE_IMAGE.w, FACE_IMAGE.h)),
      extraFace: new THREE.Texture(image('smooth-extra', 1024, 1024)),
      pixelExtraFace: new THREE.Texture(image('pixel-extra', 512, 120)),
    });
    ch.root.updateMatrixWorld(true);
    const c = ch.root.getObjectByName(BONES.head).localToWorld(new THREE.Vector3(0, 1, 0));
    const toon = /** @type {any} */ (face.material);
    const draw = (texels) => {
      face.onBeforeRender(viewportOf(195, 422), null, cameraAt(c, 40), face.geometry, toon, null);
      const d = (40 * ch.faceTexels) / texels;
      face.onBeforeRender(viewportOf(195, 422), null, cameraAt(c, d), face.geometry, toon, null);
    };
    ch.setFace('angry');
    draw(30);
    assert.equal(ch.faceSheet, 30);
    assert.equal(ch.faceShown, 'angry', 'the older image has 30 px sheets: angry’s');
    assert.equal(toon.map.image.from.img.name, 'pixel-extra');
    draw(53);
    assert.equal(ch.faceSheet, 53, 'the sheet still picked by his texels');
    assert.equal(ch.faceShown, 'neutral', 'no 53 px sheet in the older image: neutral’s, in pixels');
    assert.equal(toon.map.image.from.img.name, 'pixel');
    draw(200);
    assert.equal(ch.faceSheet, 'smooth');
    assert.equal(ch.faceShown, 'angry', 'past the largest sheet: angry’s smooth cell');
    assert.equal(toon.map.image.from.img.name, 'smooth-extra');
    ch.dispose();
  });
});

test('the dialogue faces’ sheets sit beside the glb: loadCharacter derives their addresses from the glb’s', () => {
  assert.deepEqual(extraFaceUrls('/invitation/models/newt.glb'), {
    smooth: '/invitation/models/newt-face-smooth-extra.png',
    pixel: '/invitation/models/newt-face-extra.png',
  });
  assert.deepEqual(extraFaceUrls('models/newt.glb?v=2'), {
    smooth: 'models/newt-face-smooth-extra.png',
    pixel: 'models/newt-face-extra.png',
  });
});
