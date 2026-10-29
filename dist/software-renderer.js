import * as THREE from "./vendor/three.module.js";
// Compatibility renderer: the same projected and extruded meshes, painted on Canvas 2D.
// Uses painter sorting and flat directional illumination. No WebGL or external services.
export class SoftwareRenderer {
  constructor(canvas) {
    this.domElement = canvas;
    this.context = canvas.getContext("2d");
    if (!this.context) throw Error("Canvas indisponível");
    this.shadowMap = {};
    this.ratio = 1;
    this.software = true;
  }
  setPixelRatio(value) {
    this.ratio = Math.min(value, 1.25);
  }
  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.domElement.width = w * this.ratio;
    this.domElement.height = h * this.ratio;
  }
  render(scene, camera) {
    const ctx = this.context,
      w = this.w,
      h = this.h;
    if (!w || !h) return;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    const vp = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    const project = (v) => {
      const p = v.clone().applyMatrix4(vp);
      return [((p.x + 1) * w) / 2, ((1 - p.y) * h) / 2, p.z];
    };
    const gridColor = "#294955";
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.45;
    ctx.globalAlpha = 0.5;
    for (let i = -120; i <= 120; i += 10) {
      for (const coords of [
        [i, -120, i, 120],
        [-120, i, 120, i],
      ]) {
        const a = project(new THREE.Vector3(coords[0], -0.5, coords[1])),
          b = project(new THREE.Vector3(coords[2], -0.5, coords[3]));
        if (a[2] < 1 && b[2] < 1) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    const triangles = [],
      selectedEdges = [],
      light = new THREE.Vector3(-0.35, 1, 0.45).normalize();
    scene.traverse((object) => {
      if (!object.parent?.isGroup || !object.geometry) return;
      const pos = object.geometry.attributes.position;
      if (object.isMesh) {
        const colors = new Map();
        for (let i = 0; i < pos.count; i += 3) {
          const a = new THREE.Vector3()
              .fromBufferAttribute(pos, i)
              .applyMatrix4(object.matrixWorld),
            b = new THREE.Vector3()
              .fromBufferAttribute(pos, i + 1)
              .applyMatrix4(object.matrixWorld),
            c = new THREE.Vector3()
              .fromBufferAttribute(pos, i + 2)
              .applyMatrix4(object.matrixWorld);
          const normal = new THREE.Vector3()
              .crossVectors(b.clone().sub(a), c.clone().sub(a))
              .normalize(),
            center = a
              .clone()
              .add(b)
              .add(c)
              .multiplyScalar(1 / 3);
          if (normal.dot(camera.position.clone().sub(center)) <= 0) continue;
          const pa = project(a),
            pb = project(b),
            pc = project(c);
          if (Math.min(pa[2], pb[2], pc[2]) > 1) continue;
          const intensity =
            Math.round(
              (0.48 +
                Math.max(0, normal.dot(light)) * 0.55 +
                object.material.emissiveIntensity) *
                20,
            ) / 20;
          let color = colors.get(intensity);
          if (!color) {
            const base = object.material.color.clone();
            base.multiplyScalar(intensity);
            color = "#" + base.getHexString();
            colors.set(intensity, color);
          }
          triangles.push({
            p: [pa, pb, pc],
            depth: (pa[2] + pb[2] + pc[2]) / 3,
            color,
          });
        }
      } else if (object.isLineSegments && object.userData.selected) {
        for (let i = 0; i < pos.count; i += 2) {
          selectedEdges.push([
            project(
              new THREE.Vector3()
                .fromBufferAttribute(pos, i)
                .applyMatrix4(object.matrixWorld),
            ),
            project(
              new THREE.Vector3()
                .fromBufferAttribute(pos, i + 1)
                .applyMatrix4(object.matrixWorld),
            ),
          ]);
        }
      }
    });
    triangles.sort((a, b) => b.depth - a.depth);
    ctx.lineWidth = 0.5;
    for (const t of triangles) {
      ctx.fillStyle = t.color;
      ctx.strokeStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(t.p[0][0], t.p[0][1]);
      ctx.lineTo(t.p[1][0], t.p[1][1]);
      ctx.lineTo(t.p[2][0], t.p[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = "#e7fff4";
    ctx.lineWidth = 1;
    for (const [a, b] of selectedEdges) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    // Selected geometry has an explicit outline; shading does not encode another indicator.
  }
}
