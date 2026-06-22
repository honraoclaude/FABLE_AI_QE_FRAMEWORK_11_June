import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, Repo } from './db.js';
import { buildRouter } from './routes.js';
import { buildPoRouter } from './po-routes.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(dbFile?: string): express.Express {
  const db = openDb(dbFile);
  const repo = new Repo(db);
  if (process.env.QE_SEED !== '0') seedIfEmpty(repo);

  const app = express();
  app.use(express.json());
  app.use('/api', buildRouter(repo));
  app.use('/api/po', buildPoRouter());

  // Serve the built React dashboard when present.
  const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'), (err) => {
      if (err) res.status(404).send('Dashboard not built yet — run: npm run build --workspace=web');
    });
  });

  return app;
}
