// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* The bench this application is standing on: what answered on the network, and
   which of it will take an instruction.
 *
 * Everything here is READ FROM APK:OS AND NOT DISCOVERED BY THIS APP. A browser
 * cannot send mDNS, ICMP or Cast frames, and the discovery that matters has
 * already happened twice over — `APK:OS/discovery_sweep.py` re-asks the bench on
 * a cadence, and the Rust agents own the protocols. So this is a reader of
 * `GET /api/devices`, which is where the join between "what was found" and
 * "what can be driven" is made (server.py, `discovered_devices`).
 *
 * WITH NO SERVER IT FALLS BACK TO THE COMMITTED SNAPSHOT, and says so. APK:OS
 * writes `system/trees/Discovered.json` to disk for exactly this case — the
 * published site has no Python behind it — and that file holds the same panel
 * rows without the console join. A list that is a day old, labelled as such,
 * beats an empty screen with an error on it; what it must never do is offer a
 * button, because the snapshot is a photograph and nothing is listening.
 *
 * The two spellings of the snapshot's address are the two places the shell is
 * served from: `/APK:OS/` on apk.audio, and the web root under server.py. */

export interface DeviceControl {
  /** The field name in the console frame — `volume`, `play`, `app_id`. */
  name: string;
  /** The verb after `/Control/`, which is what the protocol agent switches on. */
  verb: string;
  label: string;
  /** How it is drawn, and with it how it publishes: a button is a press, a
   *  fader and a text field are state. server.py decides the retain flag from
   *  this; it is here to draw with, never to send. */
  kind: 'button' | 'fader' | 'text' | string;
  widget: string;
  topic: string;
  retain: boolean;
  min: number | null;
  max: number | null;
  default: number | string | null;
}

export interface Device {
  /** `…/System/Protocols/<proto>/Device/<category>/<key>` — the identity every
   *  other surface on this bench keys the same device by. Written short on
   *  purpose: this file talks to APK:OS over HTTP and to no broker at all, and a
   *  whole live topic spelled out in a file with no client is what
   *  `check_bus_honesty.py` counts. The topics themselves arrive in the data. */
  prefix: string;
  protocol: string;
  category: string;
  key: string;
  name: string;
  address: string;
  status: string;
  last_seen: string;
  mac: string;
  /** The generated panel this row was read out of. */
  panel: string;
  /** The console frame that binds it, or null when nothing can drive it. */
  console: string | null;
  controls: DeviceControl[];
  fields: Record<string, string>;
  /** Every row that went into this device, primary included and never empty.
   *  The fold removes rows from a LIST; it does not decide that an observation
   *  did not happen, and this is where the ones it merged are still readable. */
  sightings: Sighting[];
  /** The protocols that heard it, sorted. One entry is the ordinary case. */
  heard_by: string[];
}

/** One row of one discovery tree — a thing that was heard, once, by one agent. */
export interface Sighting {
  prefix: string;
  protocol: string;
  panel: string;
  console: string | null;
  status: string;
  last_seen: string;
  address: string;
  /** The category leg of this row's own topic, which for dnssd is the announced
   *  service type. Stated here rather than left to be parsed back out of the
   *  prefix, because after THE HOST fold this is the only place a reader can
   *  see that the six rows behind one printer were six different services and
   *  not six sightings of the same one. */
  category: string;
  /** `announcement` = an agent heard the device itself. `re-export` = the
   *  nmos-bridge published a view of a row another agent had already filed. */
  via: 'announcement' | 're-export' | string;
}

export interface DevicesReport {
  devices: Device[];
  count: number;
  controllable: number;
  /** Rows in the discovered tree that named no topic — the roll-up panels and
   *  the agent status tables. Carried so the count on screen can be explained. */
  skipped: number;
  /** Rows the trees hold, before the fold. `folded` is how many of them were a
   *  second view of a device already on the list. */
  sightings: number;
  folded: number;
  /** A stated cross-reference the fold declined to act on, with the reason.
   *  Reported rather than guessed at — see `foldDevices`. */
  unresolved: Unfolded[];
  at: number;
  /** `server` = asked just now and controls are live. `snapshot` = read off the
   *  committed tree, so it is a photograph and nothing can be driven. */
  source: 'server' | 'snapshot';
}

export interface SweepState {
  state: string;
  sweep: number;
  interval_s?: number;
  seconds_to_next?: number;
  finished_at?: number | null;
  devices?: number;
  online?: number;
  offline?: number;
  note?: string;
}

const DEVICES_API = '/api/devices';
const COMMAND_API = '/api/device/command';
const SWEEP_API = '/api/discovery/sweep';
const SNAPSHOTS = ['/APK:OS/system/trees/Discovered.json', '/system/trees/Discovered.json'];

/** Raised when a command is asked for and there is no bench server to take it. */
export class NoBenchServer extends Error {}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** Every OcaTable row in a frame tree that names a device topic.
 *
 *  The same rule server.py applies, because the fallback reads the same rows out
 *  of a different wrapper: a row with `_topic_prefix` is an addressable device,
 *  and a row without one is a roll-up copy of one that has it. The snapshot
 *  nests the panels inside tree nodes, so this walks anything. */
function rowsInTree(node: any, into: Map<string, any>, skipped: { n: number }): void {
  if (Array.isArray(node)) {
    for (const item of node) rowsInTree(item, into, skipped);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (node.type === 'OcaTable' && Array.isArray(node.data)) {
    for (const row of node.data) {
      if (!row || typeof row !== 'object') continue;
      const prefix = String(row._topic_prefix || '');
      if (!prefix) { skipped.n++; continue; }
      const kept = into.get(prefix);
      if (!kept || Object.keys(row).length > Object.keys(kept).length) into.set(prefix, row);
    }
  }
  for (const value of Object.values(node)) rowsInTree(value, into, skipped);
}

const NAME_KEYS = ['friendly_name', 'device', 'instance', 'printer', 'stream', 'name', 'model', 'service'];
const ADDRESS_KEYS = ['addresses', 'address', 'host', 'hostname', 'resource', 'port'];

const firstField = (row: any, keys: string[]): string => {
  for (const key of keys) {
    const text = String(row[key] ?? '').trim();
    if (text && !['N/A', '---', 'UNKNOWN'].includes(text.toUpperCase())) return text;
  }
  return '';
};

/** (protocol, category, key) off the topic prefix — server.py's `device_identity`. */
function identity(prefix: string): [string, string, string] {
  const segments = prefix.split('/');
  const proto = segments[3] || '';
  const at = segments.indexOf('Device');
  if (at === -1) return [proto, '', segments[segments.length - 1] || ''];
  const rest = segments.slice(at + 1);
  if (rest.length > 1) return [proto, rest[0], rest.slice(1).join('/')];
  return [proto, '', rest[0] || ''];
}

/** A stated cross-reference that did not resolve to exactly one device. */
export interface Unfolded { prefix: string; service: string; why: string }

/* ONE DEVICE, HOWEVER MANY THINGS HEARD IT.
 *
 * A SECOND COPY OF server.py's `fold_devices`, and deliberately so — the same
 * arrangement, and the same reason, as `rowsInTree` above and as the state
 * words in DevicesTab: this application has no server to ask when it is reading
 * the committed snapshot, and a list that folds with a bench behind it and does
 * not without one is two different answers to "what is on this bench".
 * `check.sh devicefold` fails when the two copies disagree.
 *
 * Why the fold exists at all, and why it is here rather than in the agents, is
 * written once in server.py above `fold_devices` — the short of it: the SAP and
 * RAVENNA listeners publish the same stream twice on purpose and say the
 * correlation belongs to a reader, and the nmos-bridge re-exports the whole bus
 * as IS-04 nodes. Both are correct. Neither is a list of devices.
 *
 * EVERY RULE IS A STATED REFERENCE, NEVER A RESEMBLANCE. Nothing folds on a
 * name and nothing folds on a MAC — `F0:EF:86:51:1A:FB` is the Garage speaker
 * AND `garagemahall`, the cast group it leads. */
const BRIDGE_PROTOCOL = 'nmos';
const BRIDGE_LABEL = 'APK:audio:';
const FOLD_FAMILY_ALIAS: Record<string, string> = { printer: 'printers' };
const FOLD_IDENTITY_FIELDS = ['cast_id', 'serial', 'resource', 'uuid', 'entity_id',
                              'clock_id', 'mac', 'hostname'];
const FOLD_STREAM_FIELDS = ['destination', 'rtp_port'];
/** ONE ROW PER SERVICE, AND SIX SERVICES IS STILL ONE MACHINE. The dnssd hunter
 *  files a row per announced service — a Brother HL-L2405W announces `_http`,
 *  `_printer`, `_ipp`, `_ipp-tls`, `_ipps` and `_pdl-datastream` and is six
 *  rows. mDNS renames a colliding instance, so a hostname is unique on the link
 *  by the protocol's own rule: two rows that agree on the host agree because
 *  they are one machine. A stated fact about the protocol, not a resemblance,
 *  and restricted to dnssd — which is what keeps `mac` safe in here for exactly
 *  the reason it is safe in FOLD_IDENTITY_FIELDS. */
const FOLD_HOST_PROTOCOL = 'dnssd';
const FOLD_HOST_FIELDS = ['mac', 'hostname'];

/** One spelling for two spellings of the same identifier — server.py's
 *  `fold_normalise`. The bridge writes `…gpib7-4…` where the panel holds
 *  `…gpib7,4…`, and `Living-Room.local` is the folder `Living-Room_local`. */
const foldNormalise = (text: unknown): string =>
  String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

/** The device an nmos-bridge row re-exports, or why it could not be settled.
 *
 *  An empty `why` beside a null device means there was no reference to resolve:
 *  `APK:audio:HAL_Fader` is bare metal and the only sighting of it.
 *
 *  `rootOf` is the fold in progress — a prefix mapped to the group it has been
 *  put in so far. Several rows stating one identity are not ambiguous when the
 *  fold has ALREADY decided they are one device: the bridge names a dnssd host
 *  and the panel holds one row per service, so a reference to a six-service
 *  printer states six rows, and once THE HOST has merged them the reference has
 *  exactly one device to land on. Without it the honest answer is still
 *  ambiguity — picking one of six unrelated rows would be a guess wearing a
 *  fold's confidence. */
function bridgeTarget(device: Device, byProtocol: Map<string, Device[]>,
                      rootOf?: (prefix: string) => string): [Device | null, string] {
  if (device.protocol !== BRIDGE_PROTOCOL) return [null, ''];
  const service = String(device.fields.service ?? '');
  if (!service.startsWith(BRIDGE_LABEL)) return [null, ''];
  const rest = service.slice(BRIDGE_LABEL.length);
  const at = rest.indexOf(':');
  if (at === -1 || at === rest.length - 1) return [null, ''];
  const family = FOLD_FAMILY_ALIAS[rest.slice(0, at)] ?? rest.slice(0, at);
  const stated = rest.slice(at + 1);
  const candidates = byProtocol.get(family);
  if (!candidates) return [null, `no ${rest.slice(0, at)} on this list`];
  const want = foldNormalise(stated);
  if (!want) return [null, 'nothing to resolve'];
  /* Searched only inside the protocol the reference already named. That is what
     keeps `mac` in the field list safe. */
  const hits = candidates.filter(candidate =>
    [candidate.key, ...FOLD_IDENTITY_FIELDS.map(f => candidate.fields[f])]
      .some(value => value && foldNormalise(value) === want));
  if (hits.length === 1) return [hits[0], ''];
  if (!hits.length) return [null, `no ${family} row states ${stated}`];
  /* Several rows, one device: any member names the group, and a union on it
     reaches the same root as a union on any other. */
  if (rootOf && new Set(hits.map(h => rootOf(h.prefix))).size === 1) return [hits[0], ''];
  return [null, `${hits.length} ${family} rows state ${stated}`];
}

/** Sightings into devices. The merged row keeps the PRIMARY sighting's prefix,
 *  so a console binding and a control topic still resolve — the fold removes
 *  rows from a list and moves nothing on the bus. A re-export is never the
 *  primary: it is by construction a view of something else. */
export function foldDevices(devices: Device[]): [Device[], Unfolded[]] {
  const order = new Map(devices.map((device, i) => [device.prefix, i]));
  const parent = new Map(devices.map(device => [device.prefix, device.prefix]));
  const find = (prefix: string): string => {
    let at = prefix;
    while (parent.get(at) !== at) { parent.set(at, parent.get(parent.get(at)!)!); at = parent.get(at)!; }
    return at;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const [keep, drop] = (order.get(ra)! < order.get(rb)!) ? [ra, rb] : [rb, ra];
    parent.set(drop, keep);
  };

  const byProtocol = new Map<string, Device[]>();
  for (const device of devices) {
    const list = byProtocol.get(device.protocol);
    if (list) list.push(device); else byProtocol.set(device.protocol, [device]);
  }

  /* THE STREAM. Two rows naming the same multicast group and port are the same
     session, because a group and port pair cannot carry two of them. */
  const streams = new Map<string, Device[]>();
  for (const device of devices) {
    const mark = FOLD_STREAM_FIELDS.map(f => String(device.fields[f] ?? '').trim());
    if (!mark.every(Boolean)) continue;
    const key = mark.join('|');
    const list = streams.get(key);
    if (list) list.push(device); else streams.set(key, [device]);
  }
  for (const group of streams.values()) {
    for (const other of group.slice(1)) union(group[0].prefix, other.prefix);
  }

  /* THE HOST. Same machine, however many services it announced.

     THE SERVICE LIST IS NOT THROWN AWAY: six announcements are six places to
     put a probe, and every merged row stays in `sightings` stating its own
     `category`, which for dnssd IS the service type. A duplication is traded
     for a fold, never for an absence. */
  const hosts = new Map<string, Device[]>();
  for (const device of devices) {
    if (device.protocol !== FOLD_HOST_PROTOCOL) continue;
    for (const field of FOLD_HOST_FIELDS) {
      /* firstField rather than a bare read: `---` and `N/A` are how the
         generated panels spell "this column was not filled in", and every row
         that never filled in a hostname is not one host. */
      const mark = foldNormalise(firstField(device.fields, [field]));
      if (!mark) continue;
      const key = `${field}|${mark}`;
      const list = hosts.get(key);
      if (list) list.push(device); else hosts.set(key, [device]);
    }
  }
  for (const group of hosts.values()) {
    for (const other of group.slice(1)) union(group[0].prefix, other.prefix);
  }

  /* THE STATED RE-EXPORT. After the host fold, so a reference naming a host
     that offers several services resolves onto the one device those rows have
     already become rather than being refused as ambiguous. */
  const bridged = new Set<string>();
  const unresolved: Unfolded[] = [];
  for (const device of devices) {
    if (device.protocol !== BRIDGE_PROTOCOL) continue;
    const [target, why] = bridgeTarget(device, byProtocol, find);
    if (target) { bridged.add(device.prefix); union(target.prefix, device.prefix); }
    else if (why) unresolved.push({ prefix: device.prefix, service: String(device.fields.service ?? ''), why });
  }

  const groups = new Map<string, Device[]>();
  for (const device of devices) {
    const root = find(device.prefix);
    const list = groups.get(root);
    if (list) list.push(device); else groups.set(root, [device]);
  }

  /* Not a re-export first, then something that can actually drive it, then the
     richest row, then the prefix — so the answer never depends on the order the
     walk happened to hand them over in. */
  const primacy = (device: Device): [number, number, number, string] => [
    bridged.has(device.prefix) ? 1 : 0,
    device.console ? 0 : 1,
    -Object.keys(device.fields).length,
    device.prefix,
  ];
  const byPrimacy = (a: Device, b: Device): number => {
    const [x, y] = [primacy(a), primacy(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
    return String(x[3]) < String(y[3]) ? -1 : String(x[3]) > String(y[3]) ? 1 : 0;
  };

  const folded: Device[] = [];
  for (const root of [...groups.keys()].sort((a, b) => order.get(a)! - order.get(b)!)) {
    const members = [...groups.get(root)!].sort(byPrimacy);
    const primary: Device = { ...members[0] };
    primary.sightings = [...members]
      .sort((a, b) => order.get(a.prefix)! - order.get(b.prefix)!)
      .map(m => ({
        prefix: m.prefix, protocol: m.protocol, panel: m.panel, console: m.console,
        status: m.status, last_seen: m.last_seen, address: m.address,
        category: m.category,
        via: bridged.has(m.prefix) ? 're-export' : 'announcement',
      }));
    primary.heard_by = [...new Set(members.map(m => m.protocol).filter(Boolean))].sort();
    /* The union of the surfaces, by topic: a device driven over one protocol
       keeps its controls when the row it was found on is not the row on screen. */
    const controls = [...primary.controls];
    const held = new Set(controls.map(c => c.topic));
    for (const member of members.slice(1)) {
      for (const control of member.controls) {
        if (held.has(control.topic)) continue;
        held.add(control.topic);
        controls.push(control);
      }
    }
    primary.controls = controls;
    primary.console = primary.console || members.find(m => m.console)?.console || null;
    /* STATUS AND LAST SEEN STAY THE PRIMARY'S and are not reconciled — two
       sightings disagreeing about when a device was last heard is a fact about
       two agents' cadences, and picking the newer would print a freshness the
       primary's own protocol never observed. Every sighting carries its own. */
    folded.push(primary);
  }
  return [folded, unresolved];
}

export function devicesFromSnapshot(tree: any): DevicesReport {
  const rows = new Map<string, any>();
  const skipped = { n: 0 };
  rowsInTree(tree, rows, skipped);

  const devices: Device[] = Array.from(rows.keys()).sort().map(prefix => {
    const row = rows.get(prefix);
    const [protocol, category, key] = identity(prefix);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) fields[k] = String(v ?? '');
    return {
      prefix, protocol, category, key,
      name: firstField(row, NAME_KEYS) || key,
      address: firstField(row, ADDRESS_KEYS),
      status: String(row.status || row._row_state || '').trim(),
      last_seen: String(row.last_seen || '').trim(),
      mac: String(row.mac || '').trim(),
      panel: '', console: null, controls: [], fields,
      sightings: [], heard_by: [],
    };
  });

  const [folded, unresolved] = foldDevices(devices);
  return {
    devices: folded, count: folded.length, controllable: 0, skipped: skipped.n,
    sightings: devices.length, folded: devices.length - folded.length, unresolved,
    at: Math.floor(Date.now() / 1000), source: 'snapshot',
  };
}

/** The bench, live if there is a server and off the committed tree if not. */
export async function fetchDevices(): Promise<DevicesReport> {
  try {
    const report = await getJson(DEVICES_API);
    /* server.py has already folded; this normalises the SHAPE rather than
       redoing the work. A server older than the fold answers without these
       fields, and the one place to give a device its own sighting back is the
       boundary the answer arrives at — not every reader downstream. */
    const devices: Device[] = (report.devices || []).map((device: Device) => ({
      ...device,
      heard_by: device.heard_by?.length ? device.heard_by : [device.protocol].filter(Boolean),
      sightings: device.sightings?.length ? device.sightings : [{
        prefix: device.prefix, protocol: device.protocol, panel: device.panel,
        console: device.console, status: device.status, last_seen: device.last_seen,
        address: device.address, category: device.category, via: 'announcement',
      }],
    }));
    return {
      ...report, devices, source: 'server',
      sightings: report.sightings ?? devices.length,
      folded: report.folded ?? 0,
      unresolved: report.unresolved ?? [],
    } as DevicesReport;
  } catch {
    /* No server here. Fall through to the snapshot — see the file header. */
  }
  let lastError: unknown = null;
  for (const url of SNAPSHOTS) {
    try {
      return devicesFromSnapshot(await getJson(url));
    } catch (err) { lastError = err; }
  }
  throw new Error(`no bench server and no committed snapshot: ${lastError}`);
}

/** The sweep's own state, for the countdown. Null where nothing is sweeping. */
export async function fetchSweep(): Promise<SweepState | null> {
  try {
    return await getJson(SWEEP_API) as SweepState;
  } catch {
    return null;
  }
}

/** Ask for a sweep now rather than at the top of the next one. */
export async function requestSweep(): Promise<SweepState | null> {
  try {
    return await getJson(SWEEP_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) as SweepState;
  } catch {
    return null;
  }
}

/** Publish one control value on a device's own topic.
 *
 *  The topic is not this application's to choose freely: server.py accepts only
 *  a topic some generated console already binds as writable, and takes the
 *  retain flag off that same declaration. A 404 here means the control was read
 *  out of a stale list — re-read the devices rather than retrying. */
export async function sendCommand(topic: string, value: number | string | boolean): Promise<any> {
  let response: Response;
  try {
    response = await fetch(COMMAND_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, value }),
    });
  } catch (err) {
    throw new NoBenchServer(`no bench server answered: ${err}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}
