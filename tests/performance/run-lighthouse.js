const { spawn } = require('node:child_process');
const path = require('node:path');

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const port = '4273';
  const server = spawn(process.execPath, [path.join(repoRoot, 'tests', 'ui', 'website-server.js')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;

  server.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
      if (text.includes(`VoltType website server listening on http://127.0.0.1:${port}`)) {
        serverReady = true;
      }
  });

  server.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString());
  });

  try {
    await waitForServer(() => serverReady, 15000);
    await runCommand('npx.cmd lhci collect --config=./lighthouserc.json', repoRoot);
    await runCommand('npx.cmd lhci assert --config=./lighthouserc.json', repoRoot);
  } finally {
    server.kill();
  }
}

function waitForServer(isReady, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (isReady()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Timed out waiting for local website server'));
      }
    }, 100);
  });
}

function runCommand(commandLine, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${commandLine} failed with exit code ${code}`));
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
