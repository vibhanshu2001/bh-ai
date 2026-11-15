import path from 'node:path';
import fs from 'node:fs';

export const FIXTURES_DIR = path.join(__dirname, '../../dist/fixtures');

export function ensureFixtures(): void {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // 1. Normal Foreground Echo Server
  fs.writeFileSync(path.join(FIXTURES_DIR, 'echo_server.js'), `
    const http = require('node:http');
    const port = parseInt(process.env.FIXTURE_PORT || '8888', 10);
    const delayMs = parseInt(process.env.READY_DELAY_MS || '0', 10);

    setTimeout(() => {
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pid: process.pid, time: Date.now() }));
      });

      server.listen(port, '127.0.0.1', () => {
        console.log('READY port=' + port + ' pid=' + process.pid);
      });

      process.on('SIGTERM', () => {
        console.log('SIGTERM received by echo_server, shutting down cleanly');
        server.close(() => {
          process.exit(0);
        });
      });
    }, delayMs);
  `);

  // 2. Child + Grandchild Process Tree
  fs.writeFileSync(path.join(FIXTURES_DIR, 'tree_parent.js'), `
    const { spawn } = require('node:child_process');
    const path = require('node:path');

    console.log('TREE_PARENT_STARTED pid=' + process.pid);
    const child = spawn(process.execPath, [
      '-e',
      \`
        const { spawn } = require('node:child_process');
        console.log('TREE_CHILD_STARTED pid=' + process.pid);
        const grandchild = spawn(process.execPath, ['-e', 'console.log("TREE_GRANDCHILD_STARTED pid=" + process.pid); setInterval(() => {}, 1000);']);
        grandchild.stdout.pipe(process.stdout);
        setInterval(() => {}, 1000);
      \`
    ]);

    child.stdout.pipe(process.stdout);
    setInterval(() => {}, 1000);
  `);

  // 3. SIGTERM Resistant Process
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sigterm_resistant.js'), `
    let sigtermCount = 0;
    console.log('RESISTANT_STARTED pid=' + process.pid);

    process.on('SIGTERM', () => {
      sigtermCount++;
      console.log('SIGTERM_IGNORED count=' + sigtermCount + ' pid=' + process.pid);
      if (sigtermCount >= 3) {
        console.log('RESISTANT_EXITING after 3 signals');
        process.exit(0);
      }
    });

    setInterval(() => {}, 1000);
  `);

  // 4. Output Flood Process (testing buffer caps)
  fs.writeFileSync(path.join(FIXTURES_DIR, 'flood_process.js'), `
    console.log('FLOOD_STARTED pid=' + process.pid);
    const count = parseInt(process.env.FLOOD_LINES || '5000', 10);
    for (let i = 0; i < count; i++) {
      console.log('LOG_FLOOD_LINE_' + i + ' ' + 'X'.repeat(80));
    }
    console.log('FLOOD_DONE pid=' + process.pid);
    setTimeout(() => process.exit(0), 100);
  `);

  // 5. Port Listener (for testing collision)
  fs.writeFileSync(path.join(FIXTURES_DIR, 'port_listener.js'), `
    const net = require('node:net');
    const port = parseInt(process.argv[2] || '9999', 10);
    const server = net.createServer().listen(port, '127.0.0.1', () => {
      console.log('PORT_HELD port=' + port + ' pid=' + process.pid);
    });
    process.on('SIGTERM', () => {
      server.close(() => process.exit(0));
    });
  `);
}
