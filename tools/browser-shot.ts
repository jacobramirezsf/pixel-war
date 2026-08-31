// Drive headless Chrome over the DevTools protocol with no dependencies.
// Usage: node tools/browser-shot.ts <url> <out.png> [width] [height] [script.js]
// The optional script runs in the page before the screenshot and may return a promise.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [url, out, wArg, hArg, scriptPath] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node tools/browser-shot.ts <url> <out.png> [width] [height] [script.js]'); process.exit(2); }
const width = +(wArg || 390), height = +(hArg || 844);
const port = 9222 + Math.floor(Math.random() * 500);

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + port, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/pw-chrome-' + port, '--allow-file-access-from-files', '--hide-scrollbars',
  `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });

async function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function getTarget(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = (await res.json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(200);
  }
  throw new Error('chrome did not start');
}

async function main(): Promise<void> {
  const ws = new WebSocket(await getTarget());
  await new Promise<void>((r) => { ws.onopen = () => r(); });
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  const logs: string[] = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as { id?: number; method?: string; result?: unknown; error?: unknown; params?: { args?: { value?: unknown }[]; exceptionDetails?: { text: string; exception?: { description?: string } } } };
    if (m.id != null) { pending.get(m.id)?.(m.error ? { error: m.error } : m.result); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push('console: ' + (m.params?.args || []).map((a) => String(a.value)).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text));
  };
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url });
  await wait(800);
  if (scriptPath) {
    const expr = readFileSync(scriptPath, 'utf8');
    const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })) as { result?: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
    if (r.exceptionDetails) logs.push('SCRIPT EXCEPTION: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    else if (r.result?.value !== undefined) logs.push('script returned: ' + JSON.stringify(r.result.value));
    await wait(300);
  }
  const shot = (await send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  for (const l of logs) console.log(l);
  console.log('wrote', out);
  ws.close();
  chrome.kill();
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
