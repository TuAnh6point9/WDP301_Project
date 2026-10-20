import { connect } from 'node:net';

// The API listens only after loading modules and connecting to MongoDB, so a web server started
// alongside it would proxy the first page's /api calls into ECONNREFUSED. Same target as vite.config.ts.
const { hostname, port } = new URL(process.env.API_PROXY_URL || 'http://127.0.0.1:5000');
console.log(`Waiting for the API on ${hostname}:${port} before starting the web server...`);
const probe = () => connect(Number(port) || 80, hostname)
  .once('connect', function () { this.destroy(); process.exit(0); })
  .once('error', () => setTimeout(probe, 250));
probe();
