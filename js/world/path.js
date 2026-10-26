// The route along the cove. Scrolling moves a distance `s` (metres) along this curve;
// the buggy, the camera and the stops are all positioned from it.
import * as THREE from 'three';
import { shoreZ, heightAt } from './terrain.js';

export const STOP_X = {
  'thendral-marabu': 42,
  'banglar-shilpo-ghar': 114,
  'sanskriti-milon-kendra': 186,
  'selected-works': 258,
  pier: 326,
};
const X0 = -4, X1 = 340;
// metres inland of the waterline; far enough that the pavilions (on the sea side) stay clear
const pathD = (x) => 20 + 1.4 * Math.sin(x * 0.045);

export function createPath() {
  const pts = [];
  for (let x = X0; x <= X1; x += 4) pts.push(new THREE.Vector3(x, 0, shoreZ(x) + pathD(x)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const length = curve.getLength();
  const DIV = 600;
  const lengths = curve.getLengths(DIV);

  const tmp = new THREE.Vector3();
  const clampS = (s) => Math.min(length, Math.max(0, s));

  return {
    length,
    // ground-level point at distance s (continues straight past either end, for the camera)
    pointAt(s, out = new THREE.Vector3()) {
      const c = clampS(s);
      curve.getPointAt(c / length, out);
      if (c !== s) {
        curve.getTangentAt(c / length, tmp);
        out.addScaledVector(tmp.setY(0).normalize(), s - c);
      }
      out.y = heightAt(out.x, out.z);
      return out;
    },
    tangentAt(s, out = new THREE.Vector3()) {
      curve.getTangentAt(clampS(s) / length, out);
      out.y = 0;
      return out.normalize();
    },
    // land-side normal (points away from the sea)
    inwardAt(s, out = new THREE.Vector3()) {
      this.tangentAt(s, tmp);
      return out.set(-tmp.z, 0, tmp.x).normalize();
    },
    // distance along the path where it passes a given x
    sAtX(x) {
      const t = (x - X0) / (X1 - X0);
      const f = Math.min(DIV, Math.max(0, t * DIV));
      const i = Math.floor(f);
      return lengths[i] + (lengths[Math.min(DIV, i + 1)] - lengths[i]) * (f - i);
    },
  };
}
