// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// OCR and vectorize as Worker-GRAPHICS_SUITE jobs (SDK audit DS-02): the job,
// the topics (built by the contract), how an answer is read, and — when a
// broker and the worker answer — one real vectorize round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { buildGraphicsJob, graphicsTopics, readGraphicsResult, requestGraphicsJob, GRAPHICS_OPS, ocrApiPath, MAX_WHITELIST_CHARS, readingFromOcrResult, OCR_NO_TEXT } from '../src/graphicsSuiteJob.ts';

const MQTT_JS = new URL('../../../../../WEB.Frontend-Assets/SRC/FrontEnd/vendor/mqtt.min.js', import.meta.url);

test('the ops are the worker\'s and the topics are the contract\'s', () => {
  assert.deepEqual([...GRAPHICS_OPS], ['ocr', 'vectorize']);
  const t = graphicsTopics();
  assert.equal(t.job, 'APK.audio/System/Protocols/graphics_suite/outgoing/job');
  assert.equal(t.result, 'APK.audio/System/Protocols/graphics_suite/incoming/result');
});

test('a job names no path and carries a threshold only for vectorize', () => {
  const j = buildGraphicsJob('j1', 'ocr', 'scans/a/page.png', 'AAAA', 99);
  assert.deepEqual(j, { job_id: 'j1', op: 'ocr', filename: 'page.png', content_b64: 'AAAA' });
  assert.equal(buildGraphicsJob('j2', 'vectorize', 'p.png', 'A', 99).threshold, 99);
  assert.equal(buildGraphicsJob('j3', 'vectorize', 'p.png', 'A', 300).threshold, undefined);
});

test('an ocr job can ask for a code-token reading: psm + whitelist (LOOSE-web-front-ocr-options)', () => {
  const caps = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
  assert.deepEqual(buildGraphicsJob('c1', 'ocr', 'label.png', 'AAAA', { psm: 8, whitelist: caps }),
    { job_id: 'c1', op: 'ocr', filename: 'label.png', content_b64: 'AAAA', psm: 8, whitelist: caps });
  // Options for the other op are not carried.
  assert.deepEqual(buildGraphicsJob('c2', 'vectorize', 'p.png', 'A', { psm: 8, whitelist: caps, threshold: 40 }),
    { job_id: 'c2', op: 'vectorize', filename: 'p.png', content_b64: 'A', threshold: 40 });
  assert.equal(buildGraphicsJob('c3', 'ocr', 'p.png', 'A', { threshold: 40 }).threshold, undefined);
  // Bad values are refused by name, not dropped into a page reading.
  for (const [o, why] of [[{ psm: 14 }, 'psm'], [{ psm: 2.5 }, 'psm'], [{ whitelist: '' }, 'empty'],
    [{ whitelist: 'A\nB' }, 'control'], [{ whitelist: 'A'.repeat(MAX_WHITELIST_CHARS + 1) }, 'longer']]) {
    assert.throws(() => buildGraphicsJob('b', 'ocr', 'p.png', 'A', o), (e) => e instanceof RangeError && e.message.includes(why), why);
  }
  // The micro-API fallback takes the same two as a query.
  assert.equal(ocrApiPath(), '/api/ocr');
  assert.equal(ocrApiPath({ psm: 13, whitelist: 'AB -+' }), '/api/ocr?psm=13&whitelist=AB+-%2B');
});

test('only the answer to this job is read; a refusal carries its error', () => {
  assert.equal(readGraphicsResult('{"job_id":"other","ok":true}', 'mine'), null);
  assert.equal(readGraphicsResult('not json', 'mine'), null);
  assert.deepEqual(readGraphicsResult('{"job_id":"mine","ok":false,"error":"not an image"}', 'mine'), { ok: false, result: null, error: 'not an image' });
  assert.equal(readGraphicsResult('{"job_id":"mine","ok":true,"result":{"path_count":3}}', 'mine').result.path_count, 3);
});

// A 16x16 PNG: black square on white, built by hand (zlib stored blocks).
function probePng() {
  const zlib = require_zlib();
  const rows = [];
  for (let y = 0; y < 16; y++) {
    const row = [0];
    for (let x = 0; x < 16; x++) row.push(x > 3 && x < 12 && y > 3 && y < 12 ? 0 : 255);
    rows.push(...row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}
import * as zlibModule from 'node:zlib';
function require_zlib() { return zlibModule; }

test('live: a vectorize job comes back from Worker-GRAPHICS_SUITE', async (t) => {
  if (!existsSync(MQTT_JS)) { t.skip('no mqtt.min.js in the tree'); return; }
  globalThis.window ??= globalThis;
  globalThis.document ??= {};
  if (!globalThis.mqtt) vm.runInThisContext(readFileSync(MQTT_JS, 'utf8') + '\n;globalThis.mqtt = mqtt;');
  const client = globalThis.mqtt.connect('ws://127.0.0.1:9001', { reconnectPeriod: 0, connectTimeout: 2000, clientId: 'scanalyzer-graphics-test', timerVariant: 'native' });
  const ok = await new Promise(resolve => { client.once('connect', () => resolve(true)); client.once('error', () => resolve(false)); setTimeout(() => resolve(false), 2500); });
  if (!ok) { client.end(true); t.skip('no broker on ws://127.0.0.1:9001'); return; }
  try {
    let result;
    try {
      result = await requestGraphicsJob(client, buildGraphicsJob(`test-${Date.now()}`, 'vectorize', 'square.png', probePng().toString('base64')), 20_000);
    } catch (err) {
      if (/no answer/.test(err.message)) { t.skip(err.message); return; }
      throw err;
    }
    assert.match(result.svg_xml, /<svg/);
    assert.ok(result.path_count >= 1, JSON.stringify(result).slice(0, 200));
  } finally {
    client.end(true);
  }
});

test('an ocr answer is kept as a reading with its confidence (LOOSE-web-front-engine3-shape-only)', () => {
  // The shape of graphics_suite_rs/src/ocr.rs OcrResult: two lines, 0-1 confidences.
  const r = readingFromOcrResult({
    extracted_text: 'OCR probe\n42', line_count: 2, word_count: 3, detected_characters: [],
    word_regions: [
      { text: 'OCR', x: 10, y: 5, width: 40, height: 20, confidence: 0.96 },
      { text: 'probe', x: 60, y: 6, width: 70, height: 22, confidence: 0.90 },
      { text: '42', x: 12, y: 40, width: 20, height: 18, confidence: 0.81 },
    ],
  });
  assert.equal(r.text, 'OCR probe\n42');
  assert.equal(r.confidence, 89); // mean of 96, 90, 81
  assert.equal(r.wordCount, 3);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines[0].bbox, { x0: 10, y0: 5, x1: 130, y1: 28 });
  assert.equal(r.lines[0].confidence, 93);
  assert.deepEqual(r.lines[1].words.map(w => w.text), ['42']);
  assert.deepEqual(r.lines[1].words[0].bbox, { x0: 12, y0: 40, x1: 32, y1: 58 });
});

test('an ocr answer that read nothing has no confidence, not a stand-in', () => {
  const r = readingFromOcrResult({ extracted_text: OCR_NO_TEXT, line_count: 0, word_count: 0, detected_characters: [], word_regions: [] });
  assert.deepEqual(r, { text: '', confidence: null, wordCount: 0, lines: [] });
  assert.equal(readingFromOcrResult(null).confidence, null);
});

test('a low-confidence or one-letter word is read but not counted, as for tesseract.js', () => {
  const r = readingFromOcrResult({ extracted_text: 'a IO-AE zz', word_regions: [
    { text: 'a', x: 0, y: 0, width: 5, height: 5, confidence: 0.9 },
    { text: 'IO-AE', x: 10, y: 0, width: 50, height: 5, confidence: 0.88 },
    { text: 'zz', x: 70, y: 0, width: 10, height: 5, confidence: 0.1 },
  ] });
  assert.equal(r.wordCount, 1);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].words.length, 3);
});

test('live: the worker\'s ocr answer becomes a measured reading (LOOSE-web-front-engine3-shape-only)', async (t) => {
  const PROBE = new URL('../../graphics_suite_rs/src/ocr_fixtures/probe.png', import.meta.url);
  if (!existsSync(MQTT_JS) || !existsSync(PROBE)) { t.skip('no mqtt.min.js or probe.png in the tree'); return; }
  globalThis.window ??= globalThis;
  globalThis.document ??= {};
  if (!globalThis.mqtt) vm.runInThisContext(readFileSync(MQTT_JS, 'utf8') + '\n;globalThis.mqtt = mqtt;');
  const client = globalThis.mqtt.connect('ws://127.0.0.1:9001', { reconnectPeriod: 0, connectTimeout: 2000, clientId: 'scanalyzer-ocr-test', timerVariant: 'native' });
  const ok = await new Promise(resolve => { client.once('connect', () => resolve(true)); client.once('error', () => resolve(false)); setTimeout(() => resolve(false), 2500); });
  if (!ok) { client.end(true); t.skip('no broker on ws://127.0.0.1:9001'); return; }
  try {
    let result;
    try {
      result = await requestGraphicsJob(client, buildGraphicsJob(`test-${Date.now()}`, 'ocr', 'probe.png', readFileSync(PROBE).toString('base64')), 20_000);
    } catch (err) {
      if (/no answer/.test(err.message)) { t.skip(err.message); return; }
      throw err;
    }
    const r = readingFromOcrResult(result);
    assert.equal(r.text, 'OCR probe 42', JSON.stringify(result).slice(0, 300));
    assert.ok(r.confidence !== null && r.confidence > 50, `confidence ${r.confidence}`);
    assert.equal(r.lines.length, 1);
    assert.deepEqual(r.lines[0].words.map(w => w.text), ['OCR', 'probe', '42']);
  } finally {
    client.end(true);
  }
});
