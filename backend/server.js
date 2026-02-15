const app = require('./app');
const config = require('./config');
const db = require('./config/db');

const MAX_PORT_ATTEMPTS = 10;

function normalizePort(value, fallback = 3000) {
  const cleaned = String(value ?? fallback).trim().replace(/^['"]|['"]$/g, '');
  const port = Number.parseInt(cleaned, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

async function start() {
  try {
    await db.connect();
  } catch (err) {
    console.warn('MongoDB connection failed — continuing without DB:', err.message);
  }

  const basePort = normalizePort(config.port, 3000);
  // Bind to 0.0.0.0 in production (needed for Digital Ocean / cloud hosting)
  const host = config.nodeEnv === 'production' ? '0.0.0.0' : undefined;
  const tryListen = (p) =>
    new Promise((resolve, reject) => {
      const server = app.listen(p, host, () => resolve(server));
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve(null);
        else reject(err);
      });
    });

  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const p = basePort + i;
    const server = await tryListen(p);
    if (server) {
      app.set('port', p);
      console.log(`PatriotAI backend running on http://localhost:${p}`);
      if (p !== basePort) {
        console.log(`(Port ${basePort} was in use. Use PORT=${p} or free port ${basePort}: lsof -ti:${basePort} | xargs kill -9)`);
      }
      return;
    }
  }
  throw new Error(`No port available in range ${basePort}-${basePort + MAX_PORT_ATTEMPTS - 1}`);
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
