/**
 * End-to-End gegen ein laufendes Durable Object.
 *
 * Braucht einen gestarteten Worker:  npm run dev:worker
 * Dann:                              npm run test:e2e
 *
 * Diese Pruefungen laufen bewusst ueber echte WebSockets statt gegen den
 * Reducer - nur so laesst sich zeigen, was WIRKLICH ueber die Leitung geht.
 * Der wichtigste Teil ist der Redaktionsnachweis: weder secretSeed noch
 * rngState noch fremde Handkarten noch ein einziges Gelaendefeld duerfen in
 * einer Nachricht auftauchen.
 */
// Standard ist der lokale wrangler-Port; mit CATAN_SERVER laesst sich derselbe
// Test gegen den veroeffentlichten Worker fahren:
//   CATAN_SERVER=https://infinite-catharge.msinan.workers.dev npm run test:e2e
const BASE = (process.env.CATAN_SERVER ?? 'ws://127.0.0.1:8787')
  .replace(/^http/, 'ws')
  .replace(/\/$/, '');
// Nur Zeichen aus dem Raumcode-Alphabet - 0/O und 1/I fehlen dort absichtlich.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE = Array.from({ length: 6 }, () =>
  ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
).join('');

function client(name, create) {
  const ws = new WebSocket(`${BASE}/room/${CODE}/ws${create ? '?create=1' : ''}`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  const api = {
    ws, name, inbox,
    open: () => new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); }),
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, label) => new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${name})`)), 6000);
      waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    }),
  };
  return api;
}

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); };

const a = client('Anna', true);
await a.open();
a.send({ t: 'join', name: 'Anna' });
const welA = await a.wait((m) => m.t === 'welcome', 'welcome A');
check(!!welA.you && !!welA.token, 'A bekommt Spieler-Id und Token');
check(welA.room.hostId === welA.you, 'A ist Gastgeber');

const b = client('Bert', false);
await b.open();
b.send({ t: 'join', name: 'Bert' });
const welB = await b.wait((m) => m.t === 'welcome', 'welcome B');
check(welB.room.members.length === 2, 'Raum hat zwei Mitglieder');
check(welB.you !== welA.you, 'unterschiedliche Spieler-Ids');

// Nur der Gastgeber darf starten.
b.send({ t: 'start' });
const err = await b.wait((m) => m.t === 'error', 'Fehler fuer B');
check(err.message.includes('Gastgeber'), 'B darf nicht starten: ' + err.message);

a.send({ t: 'start' });
const stA = await a.wait((m) => m.t === 'state', 'state A');
const stB = await b.wait((m) => m.t === 'state', 'state B');
check(stA.state.phase.t === 'setup', 'Partie beginnt im Aufbau');
check(stA.state.chunks.length > 0, 'Chunks werden mitgeschickt: ' + stA.state.chunks.length);

// Redaktion: kein Geheimnis im Klartext.
const rawA = JSON.stringify(stA.state);
check(!rawA.includes('secretSeed'), 'kein secretSeed in der Nachricht');
check(!rawA.includes('rngState'), 'kein rngState in der Nachricht');
check(rawA.includes('worldSeed'), 'worldSeed ist absichtlich enthalten');
const otherInA = stA.state.players.find((p) => p.id !== welA.you);
check(otherInA.hand === undefined, 'fremde Hand ist nicht enthalten');
const meInA = stA.state.players.find((p) => p.id === welA.you);
check(meInA.hand !== undefined, 'eigene Hand ist enthalten');

// Gelaende wird NICHT uebertragen - nur Koordinaten.
check(!rawA.includes('forest') && !rawA.includes('terrain'), 'kein Gelaende in der Nachricht');

// Falscher Spieler am Zug wird abgewiesen.
const first = stA.state.currentPlayer;
const wrong = first === welA.you ? b : a;
wrong.send({ t: 'action', action: { t: 'placeSettlement', vertex: '0:0:N' } });
const err2 = await wrong.wait((m) => m.t === 'error' && m.message.includes('Zug'), 'Fehler falscher Spieler');
check(err2.message === 'Du bist nicht am Zug.', 'fremder Zug abgewiesen: ' + err2.message);

// Wiedereinstieg mit Token: derselbe Platz.
a.ws.close();
await new Promise((r) => setTimeout(r, 300));
const a2 = client('Anna', false);
await a2.open();
a2.send({ t: 'join', name: 'Anna', token: welA.token });
const welA2 = await a2.wait((m) => m.t === 'welcome', 'welcome A2');
check(welA2.you === welA.you, 'Token holt denselben Platz zurueck');
check(welA2.room.members.length === 2, 'kein zusaetzliches Mitglied durch Wiedereinstieg');

// Laufender Partie kann niemand Neues beitreten.
const c = client('Cem', false);
await c.open();
c.send({ t: 'join', name: 'Cem' });
const errC = await c.wait((m) => m.t === 'error', 'Fehler fuer C');
check(errC.message.includes('laeuft bereits'), 'Beitritt zur laufenden Partie abgewiesen');

a2.ws.close(); b.ws.close(); c.ws.close();
console.log(fails.length === 0 ? '\nALLE PRUEFUNGEN BESTANDEN' : `\n${fails.length} FEHLGESCHLAGEN`);
process.exit(fails.length === 0 ? 0 : 1);
