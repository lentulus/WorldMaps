// Entrypoint for `npm start`. Reads PORT from env (default 8787) and runs
// the service forever. Tests import ./server.js directly to avoid starting
// a listener on module load.

import { createService } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const service = createService();
service.listen(port).then(({ baseUrl }) => {
  console.log(`worldmaps service listening on ${baseUrl}`);
});
