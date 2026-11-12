// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The Song Analyzer's YouTube link: the job it sends to Worker-YOUTUBE_AUDIO and
// how it reads the answer (src/youtubeAudioJob.ts, imported directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { looksLikeYoutube, buildYoutubeJob, readYoutubeAnswer, requestYoutubeAudio } from '../src/youtubeAudioJob.ts';

test('YouTube links are recognised, others are not', () => {
  for (const u of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', ' https://music.youtube.com/watch?v=x ',
                   'https://m.youtube.com/shorts/x', 'http://youtube.com']) assert.ok(looksLikeYoutube(u), u);
  for (const u of ['https://evilyoutube.com/x', 'youtube.com/watch?v=x', 'https://youtube.com.evil.net/', 'ftp://youtu.be/x', ''])
    assert.ok(!looksLikeYoutube(u), u);
});

test('the job is op fetch with the trimmed link', () => {
  assert.deepEqual(buildYoutubeJob('j1', '  https://youtu.be/a '), { job_id: 'j1', op: 'fetch', url: 'https://youtu.be/a' });
});

test('only this job\'s answer is read', () => {
  assert.equal(readYoutubeAnswer('{"job_id":"other","ok":true}', 'j1'), null);
  assert.equal(readYoutubeAnswer('nope', 'j1'), null);
  const ok = readYoutubeAnswer(JSON.stringify({ job_id: 'j1', ok: true, result: { url: '/api/files/youtube_audio/j1.m4a', title: 'T' } }), 'j1');
  assert.equal(ok.ok, true);
  assert.equal(ok.result.url, '/api/files/youtube_audio/j1.m4a');
  const bad = readYoutubeAnswer(JSON.stringify({ job_id: 'j1', ok: false, error: 'Video unavailable', problem: 'youtube_audio_failed' }), 'j1');
  assert.deepEqual([bad.ok, bad.error, bad.problem], [false, 'Video unavailable', 'youtube_audio_failed']);
});

test('the request subscribes, publishes, and resolves on the worker\'s answer', async () => {
  const client = new EventEmitter();
  const sent = [];
  client.subscribe = (_t, _o, cb) => cb(null);
  client.unsubscribe = () => {};
  client.publish = (topic, payload, _o, cb) => {
    sent.push([topic, JSON.parse(payload)]);
    const job = JSON.parse(payload);
    setImmediate(() => client.emit('message', topic.replace('outgoing/job', 'incoming/result'),
      new TextEncoder().encode(JSON.stringify({ job_id: job.job_id, ok: true, result: { url: '/api/files/youtube_audio/x.m4a', title: 'Song' } }))));
    cb();
  };
  const answer = await requestYoutubeAudio(client, 'https://youtu.be/abc', 2000);
  assert.equal(answer.ok, true);
  assert.equal(answer.result.title, 'Song');
  assert.match(sent[0][0], /youtube_audio\/outgoing\/job$/);
  assert.equal(sent[0][1].url, 'https://youtu.be/abc');
});
