const app = require('./app');
const config = require('./config');
const db = require('./config/db');

async function start() {
  await db.connect();
  app.listen(config.port, () => {
    console.log(`PatriotAI backend running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
