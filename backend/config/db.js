// DB connection — wire up your client (e.g. mongoose, pg) here.
// Call connect() from server.js on startup if needed.

let client = null;

async function connect() {
  // TODO: initialize and return DB client
  return client;
}

function getClient() {
  return client;
}

module.exports = { connect, getClient };
