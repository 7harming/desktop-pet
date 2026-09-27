import { protocol } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { contentType, parseRange, resolveAppPath, type AppRoots } from './app-protocol-core';

export const SCHEME = 'app';
export const APP_ORIGIN = 'app://local';

/** Pages and pack videos share one origin, so the pet window may read video pixels for hit-testing. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function handleAppProtocol(roots: AppRoots): void {
  protocol.handle(SCHEME, req => {
    const file = resolveAppPath(new URL(req.url).pathname, roots);
    if (!file) return new Response('not found', { status: 404 });
    let size: number;
    try {
      const st = statSync(file);
      if (!st.isFile()) return new Response('not found', { status: 404 });
      size = st.size;
    } catch {
      return new Response('not found', { status: 404 });
    }
    const headers: Record<string, string> = { 'Content-Type': contentType(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = parseRange(req.headers.get('range'), size);
    if (range) {
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      headers['Content-Length'] = String(range.end - range.start + 1);
      return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, { status: 206, headers });
    }
    headers['Content-Length'] = String(size);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
  });
}
