export const AZ_BIN = 3;              // degrees; 120 bins x 7 layers = 840 points max
export const SENSOR_OFFSET_MM = 0;    // distance from rotation/tilt axis to the PING face

export function parseLine(line) {
  const m = /^(\d{1,3}),(-?\d{1,2}),(\d{1,4})$/.exec(line.trim());
  if (!m) return null;
  const [a, e, d] = m.slice(1).map(Number);
  if (a > 359 || Math.abs(e) > 45 || d > 3000) return null;
  return { a, e, d };
}

export const binKey = p => `${p.e}_${Math.floor(p.a / AZ_BIN)}`;

// metres; y is up, azimuth 0 is "forward" (-z), 90 is right (+x)
export function toXYZ({ a, e, d }) {
  const r = (d + SENSOR_OFFSET_MM) / 1000;
  const az = a * Math.PI / 180, el = e * Math.PI / 180;
  return [r * Math.cos(el) * Math.sin(az), r * Math.sin(el), -r * Math.cos(el) * Math.cos(az)];
}
