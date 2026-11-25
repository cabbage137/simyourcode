// reads STEP files with occt-import-js
importScripts('vendor/occt/occt-import-js.js');
let ready = null;
onmessage = async function (ev) {
  try {
    if (!ready) ready = occtimportjs({ locateFile: (name) => 'vendor/occt/' + name });
    const occt = await ready;
    const res = occt.ReadStepFile(new Uint8Array(ev.data.buffer), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0015, angularDeflection: 0.5 });
    if (!res.success) { postMessage({ error: 'This STEP file could not be read.' }); return; }
    let n = 0;
    for (const m of res.meshes) n += m.index.array.length;
    const tris = new Float32Array(n * 3), parts = [];
    let k = 0;
    for (const m of res.meshes) {
      const p = m.attributes.position.array, idx = m.index.array, start = k;
      for (let i = 0; i < idx.length; i++) { const v = idx[i] * 3; tris[k++] = p[v]; tris[k++] = p[v + 1]; tris[k++] = p[v + 2]; }
      parts.push({ name: m.name || '', start, end: k });
    }
    postMessage({ tris, parts }, [tris.buffer]);
  } catch (e) {
    postMessage({ error: 'This STEP file could not be read: ' + (e && e.message || e) });
  }
};
