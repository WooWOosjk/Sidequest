import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const port = 8123;
const pages = ['index.html', 'chat.html', 'proxy.html', 'credits.html', 'player.html?id=collection-344-ovo'];
const widths = [1440, 768, 390];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launch() {
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: fileURLToPath(new URL('../website/', import.meta.url)),
    stdio: 'ignore',
  });
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=9344', '--user-data-dir=/tmp/chrome-sq-ui',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9344/json/list')).json();
      page = list.find((target) => target.type === 'page');
      if (page) break;
    } catch { /* chrome is still starting */ }
    await sleep(250);
  }
  if (!page) throw new Error('Chrome did not open a debug port');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('Chrome socket failed')));
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    send,
    async close() {
      ws.close();
      chrome.kill();
      server.kill();
    },
  };
}

test('site tabs fit at 1440, 768, and 390, and dead games show a failed player', { timeout: 90000 }, async () => {
  const browser = await launch();
  try {
    const evalJs = async (expression) => {
      const result = await browser.send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'page error');
      return result.result.value;
    };
    for (const width of widths) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 800,
      });
      for (const page of pages) {
        await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
        let fit;
        for (let attempt = 0; attempt < 30; attempt++) {
          await sleep(200);
          fit = await evalJs(`(() => {
            const tabs = [...document.querySelectorAll('.top-tabs a')];
            if (tabs.length < 6) return null;
            const nav = document.querySelector('.top-tabs');
            return {
              labels: tabs.map((tab) => tab.textContent.trim()),
              boxes: tabs.map((tab) => {
                const box = tab.getBoundingClientRect();
                return { text: tab.textContent.trim(), left: box.left, right: box.right, sw: tab.scrollWidth, cw: tab.clientWidth };
              }),
              navOverflow: nav.scrollWidth - nav.clientWidth,
              docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              width: window.innerWidth,
            };
          })()`);
          if (fit) break;
        }
        assert.ok(fit, page + ' at ' + width + ' did not render six tabs');
        assert.deepEqual(fit.labels, ['Games', 'Web', 'Chat', 'Movies & TV', 'AI', 'Browser']);
        assert.ok(fit.navOverflow <= 1, page + ' tab bar overflows by ' + fit.navOverflow + ' at ' + width);
        assert.ok(fit.docOverflow <= 1, page + ' page overflows by ' + fit.docOverflow + ' at ' + width);
        for (const box of fit.boxes) {
          assert.ok(box.left >= -1 && box.right <= fit.width + 1, box.text + ' is outside the viewport at ' + width);
          assert.ok(box.sw <= box.cw + 1, box.text + ' label is clipped at ' + width);
        }
      }
    }
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/player.html?id=collection-344-ovo` });
    let failure;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(200);
      failure = await evalJs(`(() => {
        const heading = document.querySelector('#player-state h2');
        if (!heading) return null;
        return {
          title: heading.textContent,
          body: document.querySelector('#player-state p')?.textContent || '',
          back: !!document.querySelector('#player-state a[href="index.html"]'),
          random: [...document.querySelectorAll('#player-state button')].some((button) => button.textContent === 'Random game'),
          href: location.href,
        };
      })()`);
      if (failure && failure.title.includes('couldn’t load')) break;
    }
    assert.equal(failure.title, 'This game couldn’t load.');
    assert.match(failure.body, /missing-file/);
    assert.equal(failure.back, true);
    assert.equal(failure.random, true);
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/player.html?id=collection-0-peak` });
    let peak;
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(200);
      peak = await evalJs(`document.querySelector('#player-state p')?.textContent || ''`);
      if (/404/.test(peak)) break;
    }
    assert.match(peak, /404/);
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/proxy.html` });
    let proxy;
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(200);
      proxy = await evalJs(`(() => {
        const button = document.querySelector('#service-launch');
        return {
          href: location.pathname,
          title: document.querySelector('#service-setup-title')?.textContent || '',
          copy: document.querySelector('#service-setup-copy')?.textContent || '',
          button: button ? button.textContent.trim() : '',
          target: button ? button.getAttribute('href') : '',
          hidden: button ? button.hidden : true,
        };
      })()`);
      if (proxy.button === 'Continue to Browser' && proxy.target) break;
    }
    assert.equal(proxy.href, '/proxy.html');
    assert.match(proxy.title, /operator password/);
    assert.match(proxy.copy, /does not store or send the password/);
    assert.equal(proxy.button, 'Continue to Browser');
    assert.equal(proxy.hidden, false);
    assert.equal(proxy.target, 'https://sidequest-services.onrender.com/proxy.html');
  } finally {
    await browser.close();
  }
});
