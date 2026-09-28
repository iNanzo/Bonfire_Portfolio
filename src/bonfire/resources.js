// Three.js clones commonly share geometry. Dispose each GPU resource once,
// including original materials that were replaced after loading the model.
//
// A scope collects everything a scene creates: own(resource) for a material, texture or
// render target; trackTree(object) for an object and everything under it (geometries,
// materials and their textures, shadow maps); cleanup(fn) for anything else (listeners,
// the animation loop). dispose() runs the cleanups in reverse, then frees each resource
// exactly once. Trees are collected again at dispose time, so materials swapped in after
// tracking are freed too.
export function createResourceScope() {
  const resources = new Set();
  const trees = new Set();
  const cleanups = [];
  let disposed = false;
  function collect(root) {
    root?.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
      if (object.shadow) cleanups.push(() => object.shadow.dispose());
    });
  }
  return {
    get disposed() { return disposed; },
    own(resource) { resources.add(resource); return resource; },
    trackTree(root) { trees.add(root); collect(root); return root; },
    cleanup(fn) { cleanups.push(fn); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const root of trees) collect(root);
      for (const fn of cleanups.reverse()) fn();
      for (const resource of resources) resource.dispose();
      resources.clear(); trees.clear(); cleanups.length = 0;
    },
  };
}
