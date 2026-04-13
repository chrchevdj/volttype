const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('autocannon');

async function main() {
  const worker = (await import('../../backend/cloudflare-worker/src/index.js')).default;
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({
        id: 'perf-user',
        email: 'perf@example.com',
        role: 'authenticated',
      }), { status: 200 });
    }

    if (target.includes('/rest/v1/rpc/volttype_get_plan')) {
      return new Response(JSON.stringify('basic'), { status: 200 });
    }

    if (target.includes('/rest/v1/rpc/volttype_get_daily_usage')) {
      return new Response(JSON.stringify(60), { status: 200 });
    }

    if (target.includes('/rest/v1/rpc/volttype_log_usage')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return originalFetch(url, options);
  };

  const env = {
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_KEY: 'service-key',
  };

  const server = http.createServer(createNodeRequestListener(worker, env));
  await new Promise((resolve) => server.listen(4299, '127.0.0.1', resolve));

  try {
    const healthResult = await runScenario({
      title: 'health-smoke',
      url: 'http://127.0.0.1:4299/v1/health',
      connections: 10,
      duration: 5,
    });
    const usageResult = await runScenario({
      title: 'usage-authenticated',
      url: 'http://127.0.0.1:4299/v1/usage',
      connections: 15,
      duration: 5,
      headers: { Authorization: 'Bearer perf-token' },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      scenarios: [healthResult, usageResult],
    };

    const outputDir = path.resolve(process.cwd(), 'performance-results');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(report, null, 2));

    console.log('Performance scenarios completed:');
    report.scenarios.forEach((scenario) => {
      console.log(
        `- ${scenario.title}: avg=${scenario.latency.average}ms p95=${scenario.latency.p95}ms throughput=${scenario.requests.average}/s errors=${scenario.errors}`
      );
    });

    const failedScenario = report.scenarios.find((scenario) => scenario.errors > 0 || scenario.non2xx > 0);
    if (failedScenario) {
      throw new Error(`Performance scenario failed: ${failedScenario.title}`);
    }
  } finally {
    global.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  }
}

function createNodeRequestListener(worker, env) {
  return async (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const bodyBuffer = Buffer.concat(chunks);
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((entry) => headers.append(key, entry));
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      });

      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers,
        body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
        duplex: 'half',
      });

      const response = await worker.fetch(request, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    });
  };
}

function runScenario(options) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: options.url,
      connections: options.connections,
      duration: options.duration,
      headers: options.headers,
    }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        title: options.title,
        latency: {
          average: result.latency.average,
          p95: result.latency.p95,
          max: result.latency.max,
        },
        requests: {
          average: result.requests.average,
        },
        throughputBytes: result.throughput.average,
        errors: result.errors,
        non2xx: result.non2xx,
      });
    });

    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
