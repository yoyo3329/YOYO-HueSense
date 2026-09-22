
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const RESULTS = path.join(DATA, 'results');
const HISTORY = path.join(DATA, 'analysis_history.jsonl');
const LATEST = path.join(DATA, 'latest.json');

fs.mkdirSync(RESULTS, { recursive: true });

function send(res, status, body, contentType='application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function safeStaticPath(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) return null;
  return full;
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  })[ext] || 'application/octet-stream';
}

function saveAnalysis(payload) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const id = crypto.randomBytes(4).toString('hex');
  const record = {
    save_schema: 'YOYO_PHYSICAL_AUDIT_SAVE_V1',
    saved_at: now.toISOString(),
    save_id: id,
    ...payload
  };
  const filename = `${stamp}_${id}.json`;
  const filepath = path.join(RESULTS, filename);
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf8');
  fs.writeFileSync(LATEST, JSON.stringify(record, null, 2), 'utf8');
  fs.appendFileSync(HISTORY, JSON.stringify(record) + '\n', 'utf8');
  return { ok: true, filename, save_id: id, saved_at: record.saved_at };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, port: PORT, data_dir: DATA }));
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    let rows = [];
    if (fs.existsSync(HISTORY)) {
      const lines = fs.readFileSync(HISTORY, 'utf8').split(/\r?\n/).filter(Boolean);
      rows = lines.slice(-100).reverse().map(line => {
        try {
          const r = JSON.parse(line);
          return {
            save_id: r.save_id,
            saved_at: r.saved_at,
            analysis_id: r.analysis_id,
            profile_name: r.profile_name,
            engine_version: r.engine_version,
            summary: r.summary
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
    return send(res, 200, JSON.stringify({ ok: true, rows }, null, 2));
  }

  if (req.method === 'POST' && url.pathname === '/api/save-analysis') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(raw || '{}');
        const result = saveAnalysis(payload);
        send(res, 200, JSON.stringify(result, null, 2));
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    const file = safeStaticPath(url.pathname);
    if (!file) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log('');
  console.log('YOYO Physical Audit Lab is running.');
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`Auto-save folder: ${RESULTS}`);
  console.log('Press Ctrl+C to stop.');
  console.log('');
});
