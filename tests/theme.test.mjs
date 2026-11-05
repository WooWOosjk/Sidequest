import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const banned = ['#aafa8a', '#c5a0ff', '#d2ef79', '#ffb16d', '#6cb657', '#c0ffa9'];

test('the hub and the services copy share the silver and black tokens', () => {
  const site = readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/public/styles.css', import.meta.url), 'utf8');
  assert.equal(site, service);
  assert.match(site, /--bg:\s*#07080a/);
  assert.match(site, /--accent:\s*#d7dee8/);
  for (const file of [
    '../website/styles.css',
    '../website/gamer.css',
    '../website/chat.css',
    '../website/services.css',
    '../services/public/styles.css',
    '../services/public/gamer.css',
    '../services/public/services.css',
  ]) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8').toLowerCase();
    for (const color of banned) assert.equal(css.includes(color), false, file + ' still uses ' + color);
  }
  assert.equal(readFileSync(new URL('../website/gamer.css', import.meta.url), 'utf8'), readFileSync(new URL('../services/public/gamer.css', import.meta.url), 'utf8'));
});

test('the library has a featured row and movies lead with the overview and watch link', () => {
  const index = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
  assert.match(index, /id="featured"/);
  assert.match(index, /id="search"/);
  assert.match(index, /data-view="favorites"/);
  assert.match(index, /data-view="recent"/);
  for (const file of ['../website/media.html', '../services/public/media.html']) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8');
    const overview = html.indexOf('id="media-overview"');
    const watch = html.indexOf('id="watch-link"');
    const player = html.indexOf('id="media-player"');
    assert.ok(overview > 0 && watch > overview && player > watch, file);
  }
  for (const file of ['../website/services.js', '../services/public/services.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /media-overview/);
    assert.match(source, /watch\.classList\.toggle\("primary", !data\.embed\)/);
  }
});
