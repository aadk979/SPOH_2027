/**
 * PM2 process definitions.
 *
 * The line that matters is `exec_mode: 'cluster'` on the API. The previous
 * deployment ran fork mode — one Node process on one core — which made every
 * instance upgrade a no-op: a 16-core box would have served exactly as much
 * traffic as a 2-core one. Cluster mode gives one worker per core and lets
 * PM2 restart a worker without dropping the listener.
 *
 * Next.js is NOT clustered. `next start` manages its own workers and running
 * two of them on one port fights over the same build output.
 */
module.exports = {
  apps: [
    {
      name: 'spoh-server',
      cwd: '/home/ubuntu/app/server',
      script: 'dist/index.js',
      exec_mode: 'cluster',
      instances: 'max',
      // A worker that dies on boot is a configuration error, not a blip.
      // Ten restarts in a row means stop and read the log rather than
      // hammering a database that is probably the reason.
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 2000,
      // 2 GB box, 2 workers. A worker past this is leaking, and taking the
      // database down with it is the failure mode worth spending a restart on.
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      out_file: '/home/ubuntu/.pm2/logs/spoh-server-out.log',
      error_file: '/home/ubuntu/.pm2/logs/spoh-server-err.log',
      // The server already emits newline-delimited JSON with its own
      // timestamps; PM2 adding a second one makes the log unparseable.
      time: false,
    },
    {
      name: 'spoh-client',
      cwd: '/home/ubuntu/app/client',
      script: 'npm',
      args: 'run start',
      exec_mode: 'fork',
      instances: 1,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production', PORT: '3000' },
      time: false,
    },
  ],
};
