// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDevices, fetchSweep, requestSweep, sendCommand, NoBenchServer,
         type Device, type DeviceControl, type DevicesReport, type SweepState } from '../../devices';

/* DEVICES — the other half of what this application scans.
 *
 * Every other screen here reads a corpus off a disk. This one reads the bench:
 * what answered on the wire, and which of it will take an instruction. The two
 * belong in one window because they are two halves of the same session — the
 * speaker a sample is being auditioned on is a discovered device, and until now
 * driving it meant leaving this app for the shell.
 *
 * NOTHING IS DISCOVERED HERE. `APK:OS/discovery_sweep.py` re-asks the bench on a
 * cadence and the protocol agents own the wire; this is a reader and a set of
 * buttons. See src/devices.ts for where each answer comes from and what happens
 * when there is no server to ask.
 *
 * A CONTROL THAT CANNOT REPORT ITS OWN RESULT IS A LIE. Every press says what
 * it published, or says why it did not — a button that silently does nothing is
 * the failure this tab exists to make impossible, because the thing on the
 * other end is in another room. */

/* IS THAT THING THERE: three colours, and every word that means one.
 *
 * The word list and the three hexes are `contracts/tokens/state.json`, which is
 * where they are DECIDED; this is this app's copy, because Web_Front has no
 * dependency on the contracts package and a status colour is not worth adding
 * one for. `check.sh statewords` fails when the two disagree.
 *
 * WHAT THIS REPLACED, because it looked deliberate and was the bug. `identified`
 * was BLUE — a fourth colour, meaning neither there nor not-there — and every
 * word the map did not list fell through to muted grey. So `declared` (a claim
 * somebody wrote down) and `unknown` (nobody has looked) were drawn in the same
 * colour as the furniture around them, on a list where 81 of the rows were one
 * of the two. `identified` IS there: the scan reached it and knows what it is.
 * A word this map does not know is amber, never grey — an unrecognised state is
 * exactly "nobody can say", and that is worth a look rather than a shrug.
 *
 * AND `#FF3131` IN THIS FILE IS NOT ONE OF THE THREE, THOUGH IT MEASURES LIKE
 * ONE. It is 15.54 dE from the token's `dead` — inside the 17-unit near-miss
 * radius `check_state_words.py` measures — so it reads as the state without
 * being it. It draws two things and neither is liveness: the tab's own "the
 * bench could not be read" error, and the ok/not-ok of a control command the
 * operator just pressed, beside a `#3DDC4A` that is 32.10 dE from `good` and
 * not a near miss at all. A command that failed is not a device that did not
 * answer — the same ruling ScanActivity's log severity got. A row's state comes
 * from `statusColor()` below and from nowhere else. PLAN-626.01 took the
 * ruling; PLAN-734.01 wrote it here rather than leaving it in a dict only the
 * gate reads. */
const STATE_TONE: Record<string, string> = {
  good: '#2ea043', dead: '#f85149', kinda: '#d29922',
};
const STATE_WORDS: Record<string, string> = {
  online: 'good', identified: 'good', live: 'good', up: 'good', discovered: 'good',
  offline: 'dead', fault: 'dead', down: 'dead', unresponsive: 'dead', removed: 'dead',
  degraded: 'dead',
  ok: 'good', locked: 'good',
  'no connection': 'dead', 'lost clock': 'dead',
  unknown: 'kinda', declared: 'kinda', unasked: 'kinda',
  stale: 'kinda', quiet: 'kinda', pending: 'kinda',
  starting: 'kinda', stopping: 'kinda', stub: 'kinda',
  listening: 'good', unavailable: 'dead', partial: 'kinda', under_test: 'kinda', cleared: 'kinda',
};
const STATE_DEFAULT = 'kinda';
const statusColor = (status: string) =>
  STATE_TONE[STATE_WORDS[String(status || '').trim().toLowerCase()] || STATE_DEFAULT];

/* The emoji is the protocol, not the device: what a thing speaks is what
   decides whether this desk can drive it, and it is the one field every row
   agrees on. */
const PROTOCOL_ICON: Record<string, string> = {
  chromecast: '📺', appletv: '🍎', dnssd: '📡', visa: '🔬', printers: '🖨️',
  ptp: '⏱️', ravenna: '🎚️', sap: '🎚️', nmos: '🎛️', avb: '🔊', midi: '🎹',
};

const AGE_UNITS: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']];

/** "3m ago" out of a `YYYY-MM-DD HH:MM:SS` stamp, and the raw text otherwise —
 *  some families write "since 21:52 (7s)" instead, and reformatting prose is
 *  how a timestamp becomes a lie. */
function ago(lastSeen: string): string {
  const parsed = Date.parse(lastSeen.replace(' ', 'T'));
  if (Number.isNaN(parsed)) return lastSeen;
  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  for (const [size, suffix] of AGE_UNITS) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${suffix} ago`;
  }
  return 'just now';
}

interface ResultLine { ok: boolean; text: string }

export default function DevicesTab() {
  const [report, setReport] = useState<DevicesReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sweep, setSweep] = useState<SweepState | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyControllable, setOnlyControllable] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /* Keyed by device prefix: what the last press on that device did. */
  const [results, setResults] = useState<Record<string, ResultLine>>({});
  /* Fader positions and text fields, keyed by topic. Held locally because the
     device's own state comes back on a topic this app does not subscribe to —
     so this is what was last sent from here, and it is labelled as such. */
  const [values, setValues] = useState<Record<string, number | string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchDevices());
      setError('');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* The countdown, re-read every ten seconds. Cheap, and it is the only thing
     on screen that says whether the list is being kept current at all. */
  useEffect(() => {
    let alive = true;
    const tick = async () => { const state = await fetchSweep(); if (alive) setSweep(state); };
    tick();
    const timer = window.setInterval(tick, 10000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  /* A finished sweep is the one moment the list is known to be stale. */
  const lastSweep = useRef<number | null>(null);
  useEffect(() => {
    if (!sweep || typeof sweep.sweep !== 'number') return;
    if (lastSweep.current !== null && sweep.sweep !== lastSweep.current) load();
    lastSweep.current = sweep.sweep;
  }, [sweep, load]);

  const devices = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (report?.devices || []).filter(device => {
      if (onlyControllable && !device.controls.length) return false;
      if (!query) return true;
      /* `heard_by`, not `protocol`: a device folded out of two sightings is
         drawn under one of them, and typing the other must still find it —
         `ravenna` returns Desk preMO even though the row says sap. */
      return `${device.name} ${device.heard_by.join(' ')} ${device.category} ${device.key} ${device.address} ${device.status}`
        .toLowerCase().includes(query);
    });
  }, [report, filter, onlyControllable]);

  const byProtocol = useMemo(() => {
    const groups = new Map<string, Device[]>();
    for (const device of devices) {
      const list = groups.get(device.protocol) || [];
      list.push(device);
      groups.set(device.protocol, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (b.controls.length ? 1 : 0) - (a.controls.length ? 1 : 0)
        || a.name.localeCompare(b.name));
    }
    /* What can be driven comes first. A protocol with 35 dnssd rows and no
       console is the biggest group on the bench and the least use to somebody
       who came here to press something. */
    const drivable = (list: Device[]) => list.filter(device => device.controls.length).length;
    return Array.from(groups.entries()).sort((a, b) =>
      drivable(b[1]) - drivable(a[1]) || b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [devices]);

  const live = report?.source === 'server';

  const fire = useCallback(async (device: Device, control: DeviceControl, value: number | string | boolean) => {
    try {
      const answer = await sendCommand(control.topic, value);
      setResults(prev => ({ ...prev, [device.prefix]: {
        ok: true,
        text: `${control.label} → ${String(value)}${answer.retained ? ' (held)' : ''}`,
      } }));
    } catch (err) {
      setResults(prev => ({ ...prev, [device.prefix]: {
        ok: false,
        text: err instanceof NoBenchServer
          ? 'no bench server is answering — nothing was sent'
          : `not sent: ${err instanceof Error ? err.message : String(err)}`,
      } }));
    }
  }, []);

  /* A dragged fader is one gesture, not forty commands. The value on screen
     follows the finger; the publish trails it by a beat. */
  const faderTimers = useRef<Record<string, number>>({});
  const slide = (device: Device, control: DeviceControl, value: number) => {
    setValues(prev => ({ ...prev, [control.topic]: value }));
    window.clearTimeout(faderTimers.current[control.topic]);
    faderTimers.current[control.topic] = window.setTimeout(() => fire(device, control, value), 120);
  };
  useEffect(() => () => { for (const id of Object.values(faderTimers.current)) window.clearTimeout(id); }, []);

  const btn: React.CSSProperties = {
    padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '3px',
    border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.06)',
    color: 'var(--text-primary)', cursor: 'pointer',
  };

  const renderControl = (device: Device, control: DeviceControl) => {
    if (control.kind === 'fader') {
      const min = control.min ?? 0;
      const max = control.max ?? 100;
      const current = Number(values[control.topic] ?? control.default ?? min);
      return (
        <label key={control.topic} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {control.label}
          <input type="range" min={min} max={max} value={current} disabled={!live}
                 onChange={event => slide(device, control, Number(event.target.value))}
                 style={{ width: '110px' }} aria-label={`${device.name} ${control.label}`} />
          <span style={{ minWidth: '2.2rem', textAlign: 'right', color: 'var(--text-primary)' }}>{current}</span>
        </label>
      );
    }
    if (control.kind === 'text') {
      const current = String(values[control.topic] ?? control.default ?? '');
      return (
        <label key={control.topic} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {control.label}
          <input type="text" value={current} disabled={!live}
                 onChange={event => setValues(prev => ({ ...prev, [control.topic]: event.target.value }))}
                 onBlur={() => fire(device, control, current)}
                 style={{ width: '9rem', fontSize: '0.7rem', padding: '0.15rem 0.3rem',
                          background: 'rgba(0,0,0,0.35)', color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)', borderRadius: '3px' }}
                 aria-label={`${device.name} ${control.label}`} />
        </label>
      );
    }
    /* A press. `1` is the truthy value the agents test for — see control.rs. */
    return (
      <button key={control.topic} style={btn} disabled={!live}
              title={live ? control.topic : 'read from the committed snapshot — nothing is listening'}
              onClick={() => fire(device, control, 1)}>
        {control.label}
      </button>
    );
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem 1rem' }}>
      {/* What this list is, and how old */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '3px',
                       border: `1px solid ${live ? '#3DDC4A' : 'var(--accent-primary)'}`,
                       color: live ? '#3DDC4A' : 'var(--accent-primary)' }}>
          {live ? 'LIVE' : 'SNAPSHOT'}
        </span>
        <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
          {report ? `${report.count} discovered · ${report.controllable} controllable` : 'reading the bench…'}
        </span>
        {/* WHAT THE FOLD DID, on the line that states the count. A number that
            shrank between two readings with no explanation beside it is the
            thing a person distrusts; this says the rows are still there and
            what happened to them. `sightings` is every row the trees hold. */}
        {report && report.folded > 0 && (
          <span className="text-secondary" style={{ fontSize: '0.72rem' }}
                title={`${report.sightings} rows across the discovery trees. ${report.folded} of them were a second sighting of a device already listed — the same stream announced twice, or an nmos-bridge re-export. Open a device to see which.`}>
            · from {report.sightings} sightings, {report.folded} folded
          </span>
        )}
        {sweep && (
          <span className="text-secondary" style={{ fontSize: '0.72rem' }}>
            sweep {sweep.state}
            {typeof sweep.seconds_to_next === 'number' ? ` · next in ${sweep.seconds_to_next}s` : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input type="text" value={filter} onChange={event => setFilter(event.target.value)}
               placeholder="filter devices" aria-label="Filter devices"
               style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', background: 'rgba(0,0,0,0.35)',
                        color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '3px' }} />
        <label className="text-secondary" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <input type="checkbox" checked={onlyControllable} onChange={event => setOnlyControllable(event.target.checked)} />
          controllable only
        </label>
        <button style={btn} onClick={load} disabled={loading}>{loading ? '…' : '⟳ Re-read'}</button>
        <button style={btn} disabled={!live} title={live ? 'ask the sweep to run now' : 'no bench server to ask'}
                onClick={async () => { setSweep(await requestSweep()); }}>
          Sweep now
        </button>
      </div>

      {!live && report && (
        <p className="text-secondary" style={{ fontSize: '0.72rem', margin: '0 0 0.75rem' }}>
          Read from the committed discovery snapshot — this is a photograph of the bench, and
          nothing here can be driven. Start the shell's server and re-read to get the controls.
          {/* The whole checkout path, because this one is meant to be pasted:
              APK:OS has not been at the repository root since the DOCKERS reorg,
              and `python3 "APK:OS/server.py"` fails on paste from it. PLAN-333.01. */}
          {' '}<code>python3 "APK:PODS/APK:audio:WebPortal/SRC/APK:OS/server.py"</code>
        </p>
      )}

      {error && (
        <p style={{ color: '#FF3131', fontSize: '0.78rem' }}>
          The bench could not be read: {error}
        </p>
      )}

      {report && !devices.length && !error && (
        <p className="text-secondary" style={{ fontSize: '0.78rem' }}>
          Nothing matches. {report.skipped > 0 && `${report.skipped} rows in the discovery tree name no topic of their own and are not devices — they are the roll-up panels.`}
        </p>
      )}

      {byProtocol.map(([protocol, list]) => (
        <section key={protocol} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', margin: '0 0 0.35rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {PROTOCOL_ICON[protocol] || '🔌'} {protocol || 'unfiled'} <span className="text-secondary" style={{ textTransform: 'none', letterSpacing: 0 }}>({list.length})</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {list.map(device => {
              const open = expanded === device.prefix;
              const result = results[device.prefix];
              return (
                <div key={device.prefix} style={{ border: '1px solid var(--border-color)', borderRadius: '4px',
                                                  background: 'var(--bg-surface)', padding: '0.4rem 0.55rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span title={device.status || 'unknown'} style={{ width: '8px', height: '8px', borderRadius: '50%',
                                   background: statusColor(device.status), flexShrink: 0 }} />
                    <button onClick={() => setExpanded(open ? null : device.prefix)}
                            aria-expanded={open}
                            style={{ ...btn, background: 'none', border: 'none', padding: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                      {device.name}
                    </button>
                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>
                      {[device.category, device.address].filter(Boolean).join(' · ')}
                    </span>
                    {/* The WORD, in the dot's colour. The dot alone said it in a
                        place a person reads last; the word is what they read
                        first, and it was the same grey as the category. */}
                    <span style={{ fontSize: '0.68rem', color: statusColor(device.status), fontWeight: 600 }}>
                      {device.status}<span className="text-secondary" style={{ fontWeight: 400 }}>{device.last_seen ? ` · ${ago(device.last_seen)}` : ''}</span>
                    </span>
                    {/* THE OTHER THINGS THAT HEARD IT. One device, and the
                        protocols it answered on — which is the interop question
                        `Discovery:sap/src/lib.rs` says the two topic trees exist
                        to answer, kept on the face of the row rather than
                        traded away for a shorter list. */}
                    {device.heard_by.length > 1 && (
                      <span style={{ fontSize: '0.66rem', padding: '0.05rem 0.35rem', borderRadius: '2px',
                                     border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                            title={device.sightings.map(s => `${s.protocol} · ${s.via} · ${s.prefix}`).join('\n')}>
                        heard by {device.heard_by.join(' + ')}
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {!device.controls.length && (
                      <span className="text-secondary" style={{ fontSize: '0.68rem' }}>no console binds this device</span>)}
                  </div>

                  {/* The surface, on its own line. Inline beside the name it sat
                      wherever the name's length left it, so no two devices'
                      PLAY buttons landed in the same place down a column of
                      eleven — which is the one thing a rack of transports has
                      to get right. */}
                  {device.controls.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      {device.controls.map(control => renderControl(device, control))}
                    </div>
                  )}

                  {result && (
                    <div style={{ fontSize: '0.68rem', marginTop: '0.3rem', color: result.ok ? '#3DDC4A' : '#FF3131' }}>
                      {result.text}
                    </div>
                  )}

                  {open && (
                    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.1rem 0.6rem',
                                 fontSize: '0.68rem', margin: '0.45rem 0 0' }}>
                      <dt className="text-secondary">topic</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{device.prefix}</dd>
                      {/* EVERY ROW THAT WENT INTO THIS DEVICE, with the topic it
                          is still published on. The fold shortens a list; it
                          does not decide an observation did not happen, and
                          nothing here can be checked from a count alone. */}
                      {device.sightings.length > 1 && (<>
                        <dt className="text-secondary">heard by</dt>
                        <dd style={{ margin: 0 }}>
                          {device.sightings.map(sighting => (
                            <div key={sighting.prefix} style={{ wordBreak: 'break-all', marginBottom: '0.1rem' }}>
                              <span style={{ color: 'var(--accent-primary)' }}>{sighting.protocol}</span>
                              <span className="text-secondary">{' · '}{sighting.via}{sighting.status ? ` · ${sighting.status}` : ''}{sighting.last_seen ? ` · ${ago(sighting.last_seen)}` : ''}</span>
                              <div className="text-secondary" style={{ fontSize: '0.64rem' }}>{sighting.prefix}</div>
                            </div>
                          ))}
                        </dd>
                      </>)}
                      {device.console && (<><dt className="text-secondary">console</dt><dd style={{ margin: 0 }}>{device.console}</dd></>)}
                      {device.panel && (<><dt className="text-secondary">found in</dt><dd style={{ margin: 0 }}>{device.panel}</dd></>)}
                      {Object.entries(device.fields).map(([key, value]) => (
                        <div key={key} style={{ display: 'contents' }}>
                          <dt className="text-secondary">{key}</dt>
                          <dd style={{ margin: 0, wordBreak: 'break-word' }}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
