import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('.');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.sql': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = resolve(root, safePath || 'index.html');
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root, 'index.html');
    res.writeHead(200, {
      'Content-Type': types[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Unable to read file');
    });
    stream.pipe(res);
  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }
}).listen(port, () => {
  console.log(`Offline First POS running at http://localhost:${port}`);
});
