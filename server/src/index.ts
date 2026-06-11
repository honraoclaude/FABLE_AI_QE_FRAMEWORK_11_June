import './env.js'; // must be first — loads .env before other modules read config
import { createApp } from './app.js';
import { aiAvailable } from './ai/claude.js';

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`QE Portal API listening on http://localhost:${port}`);
  console.log(`AI assessment: ${aiAvailable() ? 'enabled (Claude API)' : 'disabled — set ANTHROPIC_API_KEY to enable; template fallback active'}`);
});
