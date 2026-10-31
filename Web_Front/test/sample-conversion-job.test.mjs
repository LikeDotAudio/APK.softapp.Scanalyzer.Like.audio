// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The inspector's ⚙️ CONVERT card (LOOSE-processor-sampleconversion-nothing-in-the):
// the job it sends to Worker-SAMPLE_CONVERSION and how it reads the answer.
//
// Rung 1 imports src/sampleConversionJob.ts directly (node strips the types).
// The last test is the real conversation: when a broker answers on
// ws://127.0.0.1:9001 and the shell's mqtt.min.js is in the tree, one WAV goes
// to the running worker and must come back as FLAC. With no broker it skips
// and says so — the rules above it still run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import {
  buildConversionJob, bytesToBase64, base64ToBytes, canConvert, conversionTopics,
  readConversionResult, refuseBeforeSending, requestConversion, sanitizeOptions,
} from '../src/sampleConversionJob.ts';

test('only containers the worker reads are offered', () => {
  for (const name of ['kick.wav', 'Loops/pad.AIFF', 'a.flac', 'b.m4a', 'c.caf', 'd.mp3']) assert.ok(canConvert(name), name);
  for (const name of ['photo.png', 'notes.txt', 'wav', 'list.m3u', 'kick.PEAK']) assert.ok(!canConvert(name), name);
});

test('a file is refused before sending when the worker would refuse it', () => {
  assert.equal(refuseBeforeSending('a.wav', 1000), null);
  assert.match(refuseBeforeSending('a.png', 1000), /not an audio container/);
  assert.match(refuseBeforeSending('a.wav', 33 * 1024 * 1024), /at most/);
  assert.match(refuseBeforeSending('a.wav', 0), /empty/);
});

test('options outside the worker\'s values fall back, never reach the bus', () => {
  assert.deepEqual(
    sanitizeOptions({ target_format: 'MP3', target_channels: '-ac 9', target_sample_rate: '48000', target_bit_depth: '24' }),
    { target_format: 'FLAC', target_channels: 'Preserve', target_sample_rate: '48000', target_bit_depth: '24' },
  );
});

test('the job names a leaf, never the folder the sample sits in', () => {
  const job = buildConversionJob('j1', 'Library/Drums/kick.wav', 'AAAA', sanitizeOptions({ target_format: 'WAV' }));
  assert.equal(job.filename, 'kick.wav');
  assert.equal(job.job_id, 'j1');
  assert.equal(job.target_format, 'WAV');
  assert.ok(!JSON.stringify(job).includes('Library'));
});

test('topics are the worker\'s job and result leaves', () => {
  const t = conversionTopics();
  assert.equal(t.job, 'APK.audio/System/Protocols/sample_conversion/outgoing/job');
  assert.equal(t.result, 'APK.audio/System/Protocols/sample_conversion/incoming/result');
});

test('base64 round-trips bytes larger than one slice', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 0xff);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('an answer to someone else\'s job is ignored; a refusal carries its error', () => {
  assert.equal(readConversionResult('{"job_id":"other","ok":true}', 'mine'), null);
  assert.equal(readConversionResult('not json', 'mine'), null);
  const refused = readConversionResult('{"job_id":"mine","ok":false,"error":"target_format \\"MP3\\" is not one this worker takes"}', 'mine');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /MP3/);
  const done = readConversionResult('{"job_id":"mine","ok":true,"elapsed_ms":12,"result":{"filename":"k.flac","format":"FLAC","bytes":3,"content_b64":"AAAA"}}', 'mine');
  assert.equal(done.ok, true);
  assert.equal(done.filename, 'k.flac');
  assert.equal(done.elapsedMs, 12);
});

/** A one-channel 16-bit 44.1 kHz WAV of a sine, built here so the test needs no fixture. */
function sineWav(seconds = 0.25, rate = 44100) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return new Uint8Array(buf);
}

const MQTT_JS = new URL('../../../../../WEB.Frontend-Assets/SRC/FrontEnd/vendor/mqtt.min.js', import.meta.url);

async function liveClient() {
  if (!existsSync(MQTT_JS)) return { skip: 'no mqtt.min.js in the tree' };
  // The browser build, run in this context: node 24 has WebSocket, AbortController
  // and the rest of what it reaches for, so it connects exactly as a page does.
  // It takes the native-WebSocket path only where it sees a window with a
  // document, so it is shown one; nothing else in this file reads them.
  globalThis.window ??= globalThis;
  globalThis.document ??= {};
  if (!globalThis.mqtt) vm.runInThisContext(readFileSync(MQTT_JS, 'utf8') + '\n;globalThis.mqtt = mqtt;');
  const client = globalThis.mqtt.connect('ws://127.0.0.1:9001', { reconnectPeriod: 0, connectTimeout: 2000, clientId: 'scanalyzer-convert-test', timerVariant: 'native' });
  const ok = await new Promise(resolve => {
    client.once('connect', () => resolve(true));
    client.once('error', () => resolve(false));
    setTimeout(() => resolve(false), 2500);
  });
  if (!ok) { client.end(true); return { skip: 'no broker on ws://127.0.0.1:9001' }; }
  return { client };
}

test('live: a WAV sent to Worker-SAMPLE_CONVERSION comes back as FLAC', async (t) => {
  const { client, skip } = await liveClient();
  if (skip) { t.skip(skip); return; }
  try {
    const job = buildConversionJob(`test-${Date.now()}`, 'Bench/tone.wav', bytesToBase64(sineWav()),
      sanitizeOptions({ target_format: 'FLAC', target_sample_rate: '48000', target_channels: 'Stereo', target_bit_depth: '16' }));
    let result;
    try {
      result = await requestConversion(client, job, 20_000);
    } catch (err) {
      // No worker on this bench is not a defect in the card.
      if (/no answer|says it is/.test(err.message)) { t.skip(err.message); return; }
      throw err;
    }
    assert.equal(result.ok, true, result.error);
    assert.equal(result.filename, 'tone.flac');
    assert.equal(result.format, 'FLAC');
    const bytes = base64ToBytes(result.contentB64);
    assert.equal(bytes.length, result.bytes);
    assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('latin1'), 'fLaC');
  } finally {
    client.end(true);
  }
});
