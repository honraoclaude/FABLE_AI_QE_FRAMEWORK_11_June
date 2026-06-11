// Loads a .env file (repo root or server/) into process.env before any other
// module reads configuration. Real environment variables take precedence over
// file values. Zero-dependency — simple KEY=VALUE lines, # comments allowed.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  process.env.QE_ENV_FILE,
  path.join(__dirname, '..', '.env'), // server/.env
  path.join(__dirname, '..', '..', '.env'), // repo root .env
].filter((p): p is string => Boolean(p));

for (const file of candidates) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  break; // first file found wins
}
