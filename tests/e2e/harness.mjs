// Loads the unpacked extension into Chromium and points every hostname at a
// local server, so tests can "visit" youtube.com etc. without the internet.
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const { chromium } = createRequire(import.meta.url)('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function startServer() {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/framed')) {
      // Mimics Notion/Todoist: refuses to be framed by anyone.
      res.writeHead(200, {
        'content-type': 'text/html',
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
      });
      res.end(
        `<!doctype html><title>Embed</title><body style="font:16px sans-serif;padding:24px">
         <h1 id="marker">EMBED_OK ${url.pathname}</h1>
         <a id="next" href="/framed-next">next page</a>
         <script>window.__inFrame = window.top !== window; document.body.dataset.top = String(window.__inFrame);</script>
         </body>`
      );
      return;
    }
    if (url.pathname === '/embedder') {
      // A normal web page trying to frame the protected page: must stay blocked.
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><iframe id="f" src="${url.searchParams.get('src')}"></iframe>`);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<!doctype html><title>${host}</title><body style="font:16px sans-serif;padding:24px"><h1 id="site">${host}${url.pathname}</h1></body>`
    );
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launch({ colorScheme = 'light', viewport = { width: 1440, height: 900 } } = {}) {
  const server = await startServer();
  const port = server.address().port;
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'redirectory-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // full Chromium (new headless) supports extensions
    headless: true,
    colorScheme,
    viewport,
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost',
      '--no-proxy-server',
    ],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = new URL(sw.url()).host;

  const site = (host, p = '/') => `http://${host}:${port}${p}`;
  const ext = (p) => `chrome-extension://${extensionId}/src/pages/${p}`;

  async function storage(values) {
    if (values) await sw.evaluate((v) => chrome.storage.local.set(v), values);
    return sw.evaluate(() => chrome.storage.local.get(null));
  }

  // An extension page we can use to message the background worker
  // (a worker can't message itself).
  let bridge;
  async function msg(type, payload = {}) {
    if (!bridge || bridge.isClosed()) {
      bridge = await context.newPage();
      await bridge.goto(ext('popup.html'));
    }
    return bridge.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, ...p }), [type, payload]);
  }

  /** Wait until the background worker has rebuilt rules for the current state. */
  async function synced() {
    await msg('sync');
    return sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  }

  async function close() {
    await context.close();
    server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }

  return { context, sw, extensionId, port, site, ext, storage, synced, msg, close };
}
