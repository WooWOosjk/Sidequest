import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('portal links leave AI and Browser on the services origin', () => {
  const expected = ['index.html', 'web.html', 'chat.html', 'credits.html'];
  for (const file of ['website/services.js', 'services/public/services.js']) {
    const source = read(file);
    const match = source.match(/const PORTAL_PAGES = (\[[^\]]+\]);/);
    assert.ok(match, file + ' is missing PORTAL_PAGES');
    assert.deepEqual(JSON.parse(match[1].replace(/;$/, '')), expected);
    assert.equal(source.includes("'ai.html'"), false, file);
    assert.equal(source.includes("'proxy.html'"), false, file);
  }
});

test('static Browser page explains the operator password before continuing', () => {
  for (const file of ['website/proxy.html', 'services/public/proxy.html']) {
    const html = read(file);
    assert.match(html, /Browser requires the operator password/);
    assert.match(html, /does not store or send the password/);
    assert.match(html, /Continue to Browser/);
    assert.equal(html.includes('target="_blank"'), false, file);
  }
});

test('confirmed dead launchers stay in the catalog and are marked unavailable', () => {
  const context = { window: {}, URL };
  vm.createContext(context);
  vm.runInContext(read('website/games.js'), context);
  const games = context.window.GAMES;
  assert.equal(games.length, 696);
  const expected = {
    'collection-0-peak': /404/,
    'collection-31-spaceflight-simulator': /missing-file/,
    'collection-344-ovo': /missing-file/,
    'collection-174-jelly-drift': /403/,
    'collection-253-bloodmoney': /403/,
    'collection-295-generic-fighter-maybe': /403/,
    'collection-328-webfishing': /403/,
    'collection-347-flappy-bird': /403/,
  };
  const broken = games.filter((game) => game.broken);
  assert.equal(broken.map((game) => game.id).sort().join('|'), Object.keys(expected).sort().join('|'));
  for (const game of broken) {
    assert.equal(typeof game.brokenReason, 'string');
    assert.match(game.brokenReason, expected[game.id]);
    assert.ok(games.some((entry) => entry.id === game.id && entry.source));
  }
});

test('launch check recognizes missing-file notices and loader URLs', () => {
  const context = { window: {}, URL };
  vm.createContext(context);
  vm.runInContext(read('website/launch-check.js'), context);
  const { failureReason, loaderUrl } = context.window.LaunchCheck;
  assert.match(failureReason(read('website/games/collection/241.html')), /missing-file/);
  assert.match(failureReason(read('website/games/collection/446.html')), /missing-file/);
  assert.equal(failureReason('<!doctype html><canvas id="c"></canvas><script>start()</script>'), '');
  const flappy = loaderUrl(read('website/games/collection/239.html'), 'http://127.0.0.1/games/collection/239.html');
  assert.equal(flappy, 'https://cdn.jsdelivr.net/gh/gn-math/assets@main/129/Build/V0.1.loader.js');
  assert.equal(loaderUrl('<!doctype html><script src="local.js"></script>', 'http://127.0.0.1/games/demo.html'), 'http://127.0.0.1/games/local.js');
});
