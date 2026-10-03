import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const portal = 'https://sidequest-browser-arcade.friedsocrates.chatgpt.site';
const secrets = ['fixture-user', 'fixture-password', 'fixture-tmdb', 'fixture-groq'];
async function withServer(run) {
  const port = 20100 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['--import', new URL('./providers.mjs', import.meta.url).href, 'server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {...process.env, HOST:'0.0.0.0', PORT:String(port), SERVICE_USER:secrets[0], SERVICE_PASSWORD:secrets[1], TMDB_TOKEN:secrets[2], GROQ_API_KEY:secrets[3], GROQ_MODEL:''},
    stdio:['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => {logs += data;});
  child.stderr.on('data', data => {logs += data;});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Startup timeout')), 10000);
      child.once('exit', code => {clearTimeout(timer); reject(Error('Server exited ' + code));});
      child.stdout.on('data', data => {if (String(data).includes('listening')) {clearTimeout(timer); resolve();}});
    });
    const request = async (route, options = {}) => {
      const r = await fetch(base + route, options);
      const text = await r.clone().text();
      for (const secret of secrets) assert.ok(!text.includes(secret), 'Public response must not expose secrets');
      assert.equal(r.headers.get('www-authenticate'), null, 'Public AI must not challenge for credentials');
      return r;
    };
    const ai = (body, headers = {}) => request('/api/ai', {method:'POST', headers:{Origin:base,'Content-Type':'application/json', ...headers}, body:JSON.stringify(body)});
    await run({base, request, ai});
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit',resolve));
    for (const secret of secrets) assert.ok(!logs.includes(secret), 'Logs must not contain secrets');
  }
}

test('public AI page, anonymous JSON prompts, origin CORS and schema boundaries', {timeout:60000}, async t => {
  await t.test('page, replies, redaction and maximum-length prompt', () => withServer(async ({request, ai}) => {
    assert.equal((await request('/ai.html')).status, 200);
    const r = await ai({message:'first independent prompt'});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), {text:'Fixture reply <script>window.injected=1</script>'});
    assert.deepEqual(await (await ai({message:'echo-secrets'})).json(), {text:'[redacted] [redacted] [redacted] [redacted]'});
    assert.equal((await ai({message:'x'.repeat(2000)})).status, 200);
  }));
  await t.test('forwarded headers and fake credentials cannot evade rate limit', () => withServer(async ({ai}) => {
    for (let i=0;i<3;i++) assert.equal((await ai({message:'test'}, {'X-Forwarded-For':'203.0.113.'+i,'X-Real-IP':'198.51.100.'+i, Authorization:'Basic fake'})).status, 200);
    const r = await ai({message:'blocked'}, {'X-Forwarded-For':'203.0.113.99', Forwarded:'for=203.0.113.99'});
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  }));
  await t.test('strict methods, content types and origins', () => withServer(async ({request, ai}) => {
    for (const method of ['GET','PUT','DELETE']) assert.equal((await request('/api/ai',{method})).status, 405);
    for (const type of ['text/plain','application/x-www-form-urlencoded','application/json; charset=iso-8859-1'])
      assert.equal((await ai({message:'test'},{'Content-Type':type})).status, 415);
    for (const origin of ['https://evil.example', portal+'.evil.example','null','http://sidequest-browser-arcade.friedsocrates.chatgpt.site','']) {
      const r = await ai({message:'test'},{Origin:origin});
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
    const preflight = await request('/api/ai',{method:'OPTIONS',headers:{Origin:portal,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),portal);
    assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
    assert.equal((await request('/api/ai',{method:'OPTIONS',headers:{Origin:portal,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'}})).status,403);
    const r = await ai({message:'portal prompt'},{Origin:portal});
    assert.equal(r.status,200);
    assert.equal(r.headers.get('access-control-allow-origin'),portal);
    assert.equal(r.headers.get('access-control-allow-credentials'),null);
  }));
  for (const body of [null,[],{}, {message:7}, {message:''}, {message:' '}, {message:'x'.repeat(2001)}, {message:'test',history:[]}])
    await t.test('invalid schema '+JSON.stringify(body).slice(0,35), () => withServer(async ({ai}) => {
      assert.equal((await ai(body)).status,400);
    }));
  await t.test('body limit and generic malformed JSON', () => withServer(async ({base,request}) => {
    const options={method:'POST',headers:{Origin:base,'Content-Type':'application/json'}};
    assert.equal((await request('/api/ai',{...options,body:JSON.stringify({message:'x'.repeat(9000)})})).status,413);
    assert.equal((await request('/api/ai',{...options,body:'{"message": "sensitive-input'})).status,400);
  }));
  await t.test('maximum two concurrent provider calls', () => withServer(async ({ai}) => {
    const calls = [ai({message:'slow-reply'}), ai({message:'slow-reply'})];
    await new Promise(resolve => setTimeout(resolve,50));
    assert.equal((await ai({message:'busy'})).status,429);
    for (const response of await Promise.all(calls)) assert.equal(response.status,200);
  }));
});
