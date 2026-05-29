// Entrypoint for `npm start`. Reads PORT from env (default 8787) and runs
// the service forever. Tests import ./server.js directly to avoid starting
// a listener on module load.
//
// Optional flags / env:
//   --worlds-dir <path>   persist worlds under <path>/<worldId>/...; load any
//                         pre-existing worlds at startup. Same env: WORLDS_DIR.
//                         Layout matches the studio zip (decision 35 / 41).

import { createService } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const worldsDir = parseWorldsDir(process.argv.slice(2)) ?? process.env.WORLDS_DIR;

const service = createService(worldsDir ? { worldsDir } : {});
service.listen(port).then(({ baseUrl }) => {
  const persist = worldsDir
    ? `, persisting to ${worldsDir}`
    : ', in-memory only';
  console.log(`worldmaps service listening on ${baseUrl}${persist}`);
});

function parseWorldsDir(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--worlds-dir' && i + 1 < argv.length) return argv[i + 1];
    if (a.startsWith('--worlds-dir=')) return a.slice('--worlds-dir='.length);
  }
  return undefined;
}
