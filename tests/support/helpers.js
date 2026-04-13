import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

export function createTempDir(prefix = 'volttype-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
    text: vi.fn(async () => JSON.stringify(data)),
  };
}

export function createTextResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => JSON.parse(text)),
    text: vi.fn(async () => text),
  };
}

export function createNodeRequestListener(worker, env) {
  return async (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const bodyBuffer = Buffer.concat(chunks);
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((entry) => headers.append(key, entry));
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      });

      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers,
        body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
        duplex: 'half',
      });

      const response = await worker.fetch(request, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    });
  };
}
