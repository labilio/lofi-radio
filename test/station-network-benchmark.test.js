const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(projectRoot, 'scripts', 'station-network-benchmark.js');
const {
  parseArgs,
  parseProxyServer,
  selectNetworkMode,
  buildCurlRoutingArgs,
  classifyStation,
  createReportPaths,
  renderMarkdown,
  measureStationAttempt,
  summarizeStation,
  benchmark
} = require(scriptPath);

test('benchmark CLI exposes a runnable help entry point', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--help'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--mode <auto\|direct\|proxy>/);
  assert.match(result.stdout, /benchmark-results/);
});

test('Windows double-click launcher forwards CLI options to the benchmark', () => {
  if (process.platform !== 'win32') return;
  const launcherPath = path.join(projectRoot, 'benchmark-stations.cmd');
  const result = spawnSync('cmd.exe', ['/d', '/c', launcherPath, '--help'], {
    cwd: projectRoot,
    env: { ...process.env, LOFI_BENCHMARK_NO_PAUSE: '1' },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--mode <auto\|direct\|proxy>/);
});

test('auto mode follows a live Windows proxy and otherwise measures direct', () => {
  assert.deepEqual(
    selectNetworkMode({
      requestedMode: 'auto',
      proxyEnabled: true,
      proxyAddress: '127.0.0.1:7897',
      proxyReachable: true,
      mihomoRunning: true
    }),
    {
      mode: 'proxy',
      proxyUrl: 'http://127.0.0.1:7897',
      warnings: []
    }
  );

  assert.deepEqual(
    selectNetworkMode({
      requestedMode: 'auto',
      proxyEnabled: false,
      proxyAddress: '',
      proxyReachable: false,
      mihomoRunning: false
    }),
    {
      mode: 'direct',
      proxyUrl: '',
      warnings: []
    }
  );
});

test('direct mode records a TUN warning while proxy mode requires a reachable proxy', () => {
  assert.deepEqual(
    selectNetworkMode({
      requestedMode: 'direct',
      proxyEnabled: false,
      proxyAddress: '',
      proxyReachable: false,
      mihomoRunning: true
    }),
    {
      mode: 'direct',
      proxyUrl: '',
      warnings: ['检测到 verge-mihomo 仍在运行，TUN 模式可能继续接管“直连”流量。']
    }
  );

  assert.throws(
    () => selectNetworkMode({
      requestedMode: 'proxy',
      proxyEnabled: true,
      proxyAddress: '127.0.0.1:7897',
      proxyReachable: false,
      mihomoRunning: true
    }),
    /代理不可用/
  );
});

test('proxy parsing and curl routing support common Windows proxy formats', () => {
  assert.equal(parseProxyServer('127.0.0.1:7897'), '127.0.0.1:7897');
  assert.equal(
    parseProxyServer('http=127.0.0.1:7897;https=127.0.0.1:7898'),
    '127.0.0.1:7898'
  );
  assert.deepEqual(
    buildCurlRoutingArgs({ mode: 'proxy', proxyUrl: 'http://127.0.0.1:7897' }),
    ['--proxy', 'http://127.0.0.1:7897']
  );
  assert.deepEqual(buildCurlRoutingArgs({ mode: 'direct', proxyUrl: '' }), ['--noproxy', '*']);
});

test('CLI arguments are bounded and keep auto mode as the double-click default', () => {
  assert.deepEqual(parseArgs([]), {
    mode: 'auto',
    proxy: '',
    attempts: 3,
    seconds: 6,
    concurrency: 3,
    outputDir: path.join(projectRoot, 'benchmark-results'),
    help: false
  });

  assert.equal(parseArgs(['--mode', 'direct', '--attempts', '5']).mode, 'direct');
  assert.equal(parseArgs(['--mode', 'direct', '--attempts', '5']).attempts, 5);
  assert.throws(() => parseArgs(['--mode', 'invalid']), /auto、direct 或 proxy/);
  assert.throws(() => parseArgs(['--attempts', '0']), /attempts/);
});

test('station rating combines failure rate with median startup time', () => {
  assert.equal(classifyStation({ successCount: 2, attemptCount: 3, medianTtfbMs: 500 }), '不稳定');
  assert.equal(classifyStation({ successCount: 3, attemptCount: 3, medianTtfbMs: 1500 }), '友好');
  assert.equal(classifyStation({ successCount: 3, attemptCount: 3, medianTtfbMs: 2500 }), '一般');
  assert.equal(classifyStation({ successCount: 3, attemptCount: 3, medianTtfbMs: 3500 }), '较慢');
});

test('report paths stay in benchmark-results and Markdown records network provenance', () => {
  const paths = createReportPaths(
    path.join(projectRoot, 'benchmark-results'),
    new Date('2026-07-28T12:30:45.000Z'),
    'proxy'
  );

  assert.equal(path.dirname(paths.json), path.join(projectRoot, 'benchmark-results'));
  assert.match(path.basename(paths.json), /^2026-07-28_203045-proxy\.json$/);
  assert.match(path.basename(paths.markdown), /^2026-07-28_203045-proxy\.md$/);

  const markdown = renderMarkdown({
    measuredAt: '2026-07-28T20:30:45+08:00',
    network: {
      mode: 'proxy',
      proxyUrl: 'http://127.0.0.1:7897',
      mihomoRunning: true,
      dnsProbe: '198.18.0.217',
      warnings: []
    },
    settings: { attempts: 3, seconds: 6, concurrency: 3 },
    stations: [
      {
        name: 'Lofi Girl',
        type: 'bilibili',
        successCount: 3,
        attemptCount: 3,
        medianTtfbMs: 350,
        medianKbps: 820,
        rating: '友好'
      }
    ]
  });

  assert.match(markdown, /网络模式：代理/);
  assert.match(markdown, /127\.0\.0\.1:7897/);
  assert.match(markdown, /Lofi Girl/);
  assert.match(markdown, /350 ms/);
});

test('MP3 measurement reports the first audio byte and short transfer rate', async () => {
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      httpCode: 200,
      ttfbMs: 1250,
      totalMs: 6000,
      bytes: 96000,
      speedBytesPerSecond: 16000,
      body: ''
    };
  };

  const result = await measureStationAttempt(
    { name: 'Lofi Box', type: 'mp3', url: 'https://radio.example/stream' },
    { seconds: 6 },
    request
  );

  assert.equal(result.ok, true);
  assert.equal(result.ttfbMs, 1250);
  assert.equal(result.kbps, 128);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.captureBody, false);
});

test('HLS measurement includes both playlists before the first media byte', async () => {
  const responses = [
    {
      ok: true,
      httpCode: 200,
      ttfbMs: 80,
      totalMs: 100,
      bytes: 80,
      speedBytesPerSecond: 800,
      body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=96000\nmedia/audio.m3u8\n'
    },
    {
      ok: true,
      httpCode: 200,
      ttfbMs: 150,
      totalMs: 200,
      bytes: 120,
      speedBytesPerSecond: 600,
      body: '#EXTM3U\n#EXTINF:6.4,\nsegment-1.ts\n#EXTINF:6.4,\nsegment-2.ts\n'
    },
    {
      ok: true,
      httpCode: 200,
      ttfbMs: 300,
      totalMs: 700,
      bytes: 81920,
      speedBytesPerSecond: 117028,
      body: ''
    }
  ];
  const urls = [];

  const result = await measureStationAttempt(
    { name: 'BBC 3', type: 'm3u8', url: 'https://bbc.example/live/master.m3u8' },
    { seconds: 6 },
    async (url) => {
      urls.push(url);
      return responses.shift();
    }
  );

  assert.deepEqual(urls, [
    'https://bbc.example/live/master.m3u8',
    'https://bbc.example/live/media/audio.m3u8',
    'https://bbc.example/live/media/segment-2.ts'
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.ttfbMs, 600);
  assert.equal(result.kbps, 936.224);
});

test('Bilibili measurement resolves and tests the real live stream', async () => {
  const urls = [];
  const responses = [
    {
      ok: true,
      httpCode: 200,
      ttfbMs: 60,
      totalMs: 120,
      bytes: 300,
      speedBytesPerSecond: 2500,
      body: JSON.stringify({
        code: 0,
        data: { durl: [{ url: 'https://bilivideo.example/live.flv' }] }
      })
    },
    {
      ok: true,
      httpCode: 200,
      ttfbMs: 90,
      totalMs: 6000,
      bytes: 600000,
      speedBytesPerSecond: 100000,
      body: ''
    }
  ];

  const result = await measureStationAttempt(
    { name: 'Lofi Girl', type: 'bilibili', url: 'https://live.bilibili.com/27519423' },
    { seconds: 6 },
    async (url) => {
      urls.push(url);
      return responses.shift();
    }
  );

  assert.match(urls[0], /api\.live\.bilibili\.com/);
  assert.equal(urls[1], 'https://bilivideo.example/live.flv');
  assert.equal(result.ok, true);
  assert.equal(result.ttfbMs, 210);
  assert.equal(result.kbps, 800);
});

test('station summary uses successful runs for medians and preserves failures', () => {
  const summary = summarizeStation(
    { name: 'Example', type: 'mp3', url: 'https://example.com/stream' },
    [
      { ok: true, ttfbMs: 1000, kbps: 128 },
      { ok: false, ttfbMs: null, kbps: null, error: 'timeout' },
      { ok: true, ttfbMs: 2000, kbps: 192 }
    ]
  );

  assert.equal(summary.successCount, 2);
  assert.equal(summary.attemptCount, 3);
  assert.equal(summary.medianTtfbMs, 1500);
  assert.equal(summary.medianKbps, 160);
  assert.equal(summary.rating, '不稳定');
  assert.equal(summary.runs.length, 3);
});

test('benchmark orchestrates all shipped stations and writes a mode-specific report', async () => {
  let written;
  const request = async (url, options) => {
    if (url.includes('api.live.bilibili.com')) {
      return {
        ok: true,
        httpCode: 200,
        ttfbMs: 40,
        totalMs: 80,
        bytes: 200,
        speedBytesPerSecond: 2500,
        body: JSON.stringify({
          code: 0,
          data: { durl: [{ url: 'https://bilivideo.example/live.flv' }] }
        }),
        error: ''
      };
    }
    if (url.includes('bbc_radio_three.m3u8') && url.includes('a.files.bbci.co.uk')) {
      return {
        ok: true,
        httpCode: 200,
        ttfbMs: 50,
        totalMs: 100,
        bytes: 100,
        speedBytesPerSecond: 1000,
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=96000\nhttps://bbc.example/media.m3u8\n',
        error: ''
      };
    }
    if (url === 'https://bbc.example/media.m3u8') {
      return {
        ok: true,
        httpCode: 200,
        ttfbMs: 50,
        totalMs: 100,
        bytes: 100,
        speedBytesPerSecond: 1000,
        body: '#EXTM3U\n#EXTINF:6.4,\nsegment.ts\n',
        error: ''
      };
    }
    return {
      ok: true,
      httpCode: 200,
      ttfbMs: 100,
      totalMs: 1000,
      bytes: 32000,
      speedBytesPerSecond: 16000,
      body: options.captureBody ? '#EXTM3U\n#EXTINF:6.4,\nsegment.ts\n' : '',
      error: ''
    };
  };

  const result = await benchmark(
    {
      mode: 'auto',
      proxy: '',
      attempts: 1,
      seconds: 1,
      concurrency: 2,
      outputDir: path.join(projectRoot, 'benchmark-results'),
      help: false
    },
    {
      systemProxy: { enabled: false, address: '' },
      mihomoRunning: false,
      dnsProbe: '203.0.113.10',
      request,
      now: new Date('2026-07-28T12:30:45.000Z'),
      silent: true,
      writeReports: async (report, paths) => {
        written = { report, paths };
      }
    }
  );

  assert.equal(result.report.network.mode, 'direct');
  assert.equal(result.report.stations.length, 21);
  assert.equal(result.report.stations.every((station) => station.successCount === 1), true);
  assert.match(written.paths.markdown, /203045-direct\.md$/);
  assert.equal(written.report, result.report);
});
