// Petit serveur statique pour essayer le jeu, sur cet ordinateur ou depuis un iPad du même
// réseau Wi-Fi. Aucune dépendance : uniquement les modules livrés avec Node.
//
//   node tools/serve.js [port]

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  // `normalize` puis vérification du préfixe : interdit de remonter au-dessus du dossier servi.
  const target = join(root, normalize(path).replace(/^([/\\])+/, ''));
  if (!target.startsWith(root)) {
    response.writeHead(403).end('Interdit');
    return;
  }

  let info;
  try {
    info = statSync(target);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
    return;
  }
  if (info.isDirectory()) {
    response.writeHead(302, { location: `${path}/` }).end();
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    // Pendant la mise au point, on veut toujours la dernière version des fichiers.
    'cache-control': 'no-store',
    'service-worker-allowed': '/',
  });
  createReadStream(target).pipe(response);
});

server.listen(port, () => {
  console.log(`Rumiks servi depuis ${root}`);
  console.log(`  ordinateur : http://localhost:${port}/`);
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`  ${name} : http://${address.address}:${port}/`);
      }
    }
  }
  console.log('\nCtrl+C pour arrêter.');
});
