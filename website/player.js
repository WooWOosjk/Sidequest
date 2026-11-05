'use strict';
const game = GAMES.find((entry) => entry.id === new URLSearchParams(location.search).get('id'));
const stage = document.querySelector('#stage');
const state = document.querySelector('#player-state');
const checks = window.LaunchCheck || { failureReason() { return ''; }, loaderUrl() { return ''; } };
let timer;
let frame;
let controller;
let generation = 0;

function message(title, body) {
  state.hidden = false;
  state.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = body;
  state.append(heading, copy);
}

function fail(text, ticket) {
  if (ticket !== undefined && ticket !== generation) return;
  clearTimeout(timer);
  controller?.abort();
  frame?.remove();
  frame = undefined;
  message('This game couldn’t load.', text);
  const actions = document.createElement('div');
  actions.className = 'player-fail-actions';
  const back = document.createElement('a');
  back.className = 'button';
  back.href = 'index.html';
  back.textContent = 'Back to games';
  const random = document.createElement('button');
  random.type = 'button';
  random.className = 'button';
  random.textContent = 'Random game';
  random.addEventListener('click', () => Arcade.goRandom(game && game.id));
  actions.append(back, random);
  state.append(actions);
  document.querySelector('#player-notice').textContent = 'This title is still in the library. Go back, or try a different game.';
  const fullscreen = document.querySelector('#fullscreen');
  if (fullscreen) fullscreen.disabled = true;
}

function favorite() {
  const saved = Arcade.read('favorites').includes(game.id);
  const button = document.querySelector('#favorite');
  button.textContent = saved ? '♥ Favorited' : '♡ Favorite';
  button.setAttribute('aria-pressed', saved);
}

async function readPrefix(response) {
  const reader = response.body && response.body.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  const limit = 65536;
  while (size < limit) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    size += step.value.byteLength;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buf.length - offset);
    buf.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

async function loaderBlocked(html, pageUrl, signal) {
  const loader = checks.loaderUrl(html, pageUrl);
  if (!loader) return '';
  try {
    const response = await fetch(loader, { method: 'GET', signal, cache: 'no-store' });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 403) {
      return 'The game loader returned HTTP ' + response.status + '.';
    }
  } catch (error) {
    if (error.name === 'AbortError') throw error;
  }
  return '';
}

async function load() {
  const ticket = ++generation;
  clearTimeout(timer);
  controller?.abort();
  controller = new AbortController();
  frame?.remove();
  frame = undefined;
  message('Loading game…', '');
  document.querySelector('#player-notice').textContent = '';
  const fullscreen = document.querySelector('#fullscreen');
  if (fullscreen) fullscreen.disabled = false;
  try {
    const url = Arcade.source(game);
    if (game.broken) {
      fail(game.brokenReason || 'This game is marked unavailable.', ticket);
      return;
    }
    if (game.type === 'external') {
      message('Open game link', 'This game opens in a new tab.');
      const link = document.createElement('a');
      link.className = 'button primary';
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open ' + game.title;
      link.onclick = () => Arcade.recent(game.id);
      state.append(link);
      if (fullscreen) fullscreen.disabled = true;
      return;
    }
    if (!['local', 'iframe'].includes(game.type)) throw Error('Unsupported game type');
    if (game.type === 'local' && location.protocol !== 'file:') {
      const response = await fetch(url, { signal: controller.signal });
      if (ticket !== generation) return;
      if (!response.ok) throw Error('The local game file is missing or unavailable (' + response.status + ').');
      if (!response.headers.get('content-type')?.includes('text/html')) throw Error('The source is not an HTML game.');
      const html = await readPrefix(response);
      if (ticket !== generation) return;
      const reason = checks.failureReason(html);
      if (reason) {
        fail(reason, ticket);
        return;
      }
      if (/<base\s+href=/i.test(html)) {
        const blocked = await loaderBlocked(html, url.href, controller.signal);
        if (ticket !== generation) return;
        if (blocked) {
          fail(blocked, ticket);
          return;
        }
      }
    }
    timer = setTimeout(() => fail('The game did not finish loading. Its loader may be missing, blocked, or still downloading.', ticket), 15000);
    frame = document.createElement('iframe');
    frame.title = game.title;
    frame.allow = 'fullscreen';
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.onload = () => {
      if (ticket !== generation) return;
      clearTimeout(timer);
      let reason = '';
      try {
        const sample = frame.contentDocument?.documentElement?.outerHTML.slice(0, 8000) || '';
        reason = sample ? checks.failureReason(sample) : '';
      } catch { /* cross-origin frames stay unreadable */ }
      if (reason) {
        fail(reason, ticket);
        return;
      }
      state.hidden = true;
      Arcade.recent(game.id);
      if (game.type === 'iframe') {
        document.querySelector('#player-notice').textContent = 'Blank player? The provider may block embedding. Use the official source link below.';
      }
    };
    frame.onerror = () => fail('Check the game source and embedding permissions.', ticket);
    frame.src = url.href;
    stage.append(frame);
    if (game.type === 'iframe') {
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open official game source';
      document.querySelector('#license').append(' · ', link);
    }
  } catch (error) {
    if (error.name !== 'AbortError') fail(error.message, ticket);
  }
}

if (!game) {
  message('Game not found', 'Choose a game from the library.');
  document.querySelector('#game-title').textContent = 'Unknown game';
  document.querySelectorAll('#favorite,#reload,#fullscreen').forEach((button) => { button.disabled = true; });
} else {
  document.title = game.title + ' — Sidequest';
  document.querySelector('#game-title').textContent = game.title;
  document.querySelector('#category').textContent = game.category + (game.demo ? ' / ORIGINAL DEMO' : '') + (game.broken ? ' / UNAVAILABLE' : '');
  document.querySelector('#controls').textContent = game.controls || 'See in-game instructions';
  document.querySelector('#description').textContent = game.description || '';
  document.querySelector('#license').textContent = game.license || '';
  favorite();
  document.querySelector('#favorite').onclick = () => { Arcade.favorite(game.id); favorite(); };
  document.querySelector('#reload').onclick = load;
  load();
}

document.querySelector('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (stage.requestFullscreen) await stage.requestFullscreen();
    else Arcade.toast('Fullscreen is unavailable in this browser.');
  } catch {
    Arcade.toast('Fullscreen was blocked by your browser.');
  }
};
document.addEventListener('fullscreenchange', () => {
  document.querySelector('#fullscreen').textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
});
