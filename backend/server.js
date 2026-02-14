const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`PatriotAI backend running on port ${config.port}`);
});
