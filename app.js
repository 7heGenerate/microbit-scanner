import { createView } from './view.js';
import { parseLine, binKey, toXYZ } from './geometry.js';

const $ = id => document.getElementById(id);
const say = text => { $('status').textContent = text; };
const room = (new URLSearchParams(location.search).get('room') || 'room1').replace(/[^\w-]/g, '');

// ---------- 3D view ----------
window.appStarted = true;
say('Ready. Tap Demo to test the view.');
const view = createView($('view'));
$('reset').onclick = view.reset;

const points = new Map();      // bin -> {a,e,d,t}
let clearedAt = 0;             // this user's personal "clear" time
let dirty = false;

// redraw at most 10 times a second, and only when data changed
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const list = [];
  for (const p of points.values()) {
    if (!p.d || p.t <= clearedAt) continue;
    const hue = Math.round(234 - 234 * (p.e + 30) / 60);     // colour = height layer
    list.push({ xyz: toXYZ(p), colour: `hsl(${hue} 90% 60%)` });
  }
  view.setPoints(list);
}, 100);

// ---------- Firebase ----------
let fb = null, uid = null, offset = 0, isScanner = false;
const pending = {};
let count = 0;
const now = () => Date.now() + offset;

// Give up with a named step instead of waiting for ever
const within = (what, promise) => Promise.race([promise, new Promise((_, reject) =>
  setTimeout(() => reject(new Error(what + ' timed out')), 15000))]);
// Status messages from Firebase must not overwrite the demo or live readings
const note = text => { if (!demoTimer && !count) say(text); };

async function startFirebase() {
  let firebaseConfig;
  try { ({ firebaseConfig } = await import('./firebase-config.js')); }
  catch (e) { note('firebase-config.js problem: ' + e.message + '. Demo still works.'); return; }
  if (!firebaseConfig) { note('firebase-config.js needs "export const firebaseConfig". Demo still works.'); return; }
  if (firebaseConfig.apiKey === 'PASTE_ME') { note('Firebase not set up yet. Demo works.'); return; }
  if (!firebaseConfig.databaseURL) { note('databaseURL is missing from firebase-config.js. Demo still works.'); return; }
  note('Loading Firebase...');
  const base = 'https://www.gstatic.com/firebasejs/13.1.0/';
  const [{ initializeApp }, auth, db] = await within('Loading Firebase', Promise.all(
    ['app', 'auth', 'database'].map(m => import(`${base}firebase-${m}.js`))));
  note('Signing in...');
  const app = initializeApp(firebaseConfig);
  uid = (await within('Anonymous sign-in', auth.signInAnonymously(auth.getAuth(app)))).user.uid;
  const database = db.getDatabase(app);
  fb = { ...db, database };

  db.onValue(db.ref(database, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  db.onValue(db.ref(database, `users/${uid}/rooms/${room}/clearedAt`),
    s => { clearedAt = s.val() || 0; dirty = true; });

  const pts = db.ref(database, `rooms/${room}/points`);
  const put = s => { points.set(s.key, s.val()); dirty = true; };
  const fail = e => say('Database read failed: ' + e.message);
  db.onChildAdded(pts, put, fail);
  db.onChildChanged(pts, put, fail);
  db.onChildRemoved(pts, s => { points.delete(s.key); dirty = true; }, fail);
  note(`Viewing "${room}"`);
}
let demoTimer = null;
const ready = startFirebase().catch(e => note('Firebase error: ' + e.message + '. Demo still works.'));

// The first phone to connect to a room becomes its only allowed uploader
async function claimRoom() {
  if (!fb) return false;
  const ownerRef = fb.ref(fb.database, `rooms/${room}/owner`);
  const snap = await fb.get(ownerRef);
  if (!snap.exists()) await fb.set(ownerRef, uid);
  return !snap.exists() || snap.val() === uid;
}

// Upload in batches, twice a second
setInterval(() => {
  const keys = Object.keys(pending);
  if (!fb || !isScanner || !keys.length) return;
  const batch = {};
  for (const k of keys) { batch[k] = { ...pending[k], t: fb.serverTimestamp() }; delete pending[k]; }
  fb.update(fb.ref(fb.database, `rooms/${room}/points`), batch)
    .catch(e => say('Upload failed: ' + e.message));
}, 500);

// ---------- Bluetooth ----------
const UART = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
let buffer = '';

function onBytes(event) {
  buffer += new TextDecoder().decode(event.target.value);
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    const key = binKey(p);
    points.set(key, { ...p, t: now() });
    if (isScanner) pending[key] = p;
    dirty = true;
    say(`${++count} readings | az ${p.a}°, tilt ${p.e}°, ${p.d ? p.d + ' mm' : 'no echo'}` +
        (isScanner ? ' | uploading' : ' | local only'));
  }
}

$('connect').onclick = async () => {
  if (!navigator.bluetooth) return say('No Web Bluetooth. Use Chrome on Android, or Bluefy on iPhone.');
  try {
    if (demoTimer) return say('Tap Demo again to leave the demo first.');
    // requestDevice must run straight from the tap
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'BBC micro:bit' }], optionalServices: [UART] });
    device.addEventListener('gattserverdisconnected', () => say('Radar disconnected. Tap Connect again.'));
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(UART);
    const chars = await service.getCharacteristics();
    const incoming = chars.find(c => c.properties.indicate || c.properties.notify);
    await ready;
    isScanner = await claimRoom().catch(() => false);
    buffer = '';
    incoming.addEventListener('characteristicvaluechanged', onBytes);
    await incoming.startNotifications();
    navigator.wakeLock?.request('screen').catch(() => {});
    say(isScanner ? 'Connected. Switch the motor on.' : 'Connected, but this phone cannot upload to this room.');
  } catch (e) { say('Bluetooth: ' + e.message); }
};

// ---------- Clear: affects only this user ----------
function setCleared(value) {
  clearedAt = value ?? now();
  dirty = true;
  if (fb) {
    fb.set(fb.ref(fb.database, `users/${uid}/rooms/${room}/clearedAt`),
      value ?? fb.serverTimestamp()).catch(e => say('Could not save: ' + e.message));
  }
}
$('clear').onclick = () => setCleared(null);
$('restore').onclick = () => setCleared(0);

// ---------- Demo: fake 4 m x 3 m room, never uploaded ----------
$('demo').onclick = () => {
  if (demoTimer) { location.reload(); return; }
  if (isScanner) return say('Reload the page before using the demo.');
  say('Demo: drag to rotate, pinch to zoom, double tap to reset.');
  let i = 0;
  demoTimer = setInterval(() => {
    for (let n = 0; n < 12; n++, i++) {
      const a = (i * 3) % 360, e = -30 + (Math.floor(i / 120) % 7) * 10;
      const [x, , z] = toXYZ({ a, e, d: 1000 });
      const flat = Math.min(2 / Math.abs(x || 1e-9), 1.5 / Math.abs(z || 1e-9));
      const d = Math.round(1000 * flat);
      points.set(binKey({ a, e }), { a, e, d: d <= 3000 ? d : 0, t: now() });
    }
    dirty = true;
  }, 50);
};
