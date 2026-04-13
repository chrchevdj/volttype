const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..', 'website');
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === '/') {
    relativePath = '/index.html';
  }

  const filePath = path.join(rootDir, relativePath);
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`VoltType website server listening on http://127.0.0.1:${port}`);
});
