#!/usr/bin/env node

const path = require('node:path');
const fs = require('node:fs/promises');
const net = require('node:net');
const dns = require('node:dns').promises;
const { spawn, spawnSync } = require('node:child_process');
const stations = require('../stations.json');

const projectRoot = path.resolve(__dirname, '..');

function printHelp() {
  process.stdout.write(`
Lofi Radio 电台网络测速

用法:
  node scripts/station-network-benchmark.js [选项]

选项:
  --mode <auto|direct|proxy>  网络模式，默认 auto
  --proxy <url>               proxy 模式使用的代理地址
  --attempts <number>         每个电台测试次数，默认 3
  --seconds <number>          每次流媒体观察秒数，默认 6
  --concurrency <number>      最大并发数，默认 3
  --output-dir <path>         报告目录，默认 benchmark-results
  --help                      显示帮助
`);
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是大于 0 的整数`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    mode: 'auto',
    proxy: '',
    attempts: 3,
    seconds: 6,
    concurrency: 3,
    outputDir: path.join(projectRoot, 'benchmark-results'),
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--help') {
      options.help = true;
      continue;
    }
    if (argument === '--mode') {
      if (!['auto', 'direct', 'proxy'].includes(value)) {
        throw new Error('--mode 必须是 auto、direct 或 proxy');
      }
      options.mode = value;
      index += 1;
      continue;
    }
    if (argument === '--proxy') {
      if (!value) throw new Error('--proxy 缺少地址');
      options.proxy = value;
      index += 1;
      continue;
    }
    if (argument === '--attempts') {
      options.attempts = parsePositiveInteger(value, 'attempts');
      index += 1;
      continue;
    }
    if (argument === '--seconds') {
      options.seconds = parsePositiveInteger(value, 'seconds');
      index += 1;
      continue;
    }
    if (argument === '--concurrency') {
      options.concurrency = parsePositiveInteger(value, 'concurrency');
      index += 1;
      continue;
    }
    if (argument === '--output-dir') {
      if (!value) throw new Error('--output-dir 缺少路径');
      options.outputDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  return options;
}

function parseProxyServer(value) {
  if (!value) return '';
  const entries = String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const keyed = new Map();

  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator > 0) {
      keyed.set(entry.slice(0, separator).toLowerCase(), entry.slice(separator + 1));
    }
  }

  return keyed.get('https') || keyed.get('http') || entries[0].replace(/^[^=]+=/, '');
}

function normalizeProxyUrl(value) {
  if (!value) return '';
  return /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
}

function selectNetworkMode({
  requestedMode,
  proxyEnabled,
  proxyAddress,
  proxyReachable,
  mihomoRunning
}) {
  const warnings = [];
  const proxyUrl = normalizeProxyUrl(proxyAddress);

  if (requestedMode === 'direct') {
    if (mihomoRunning) {
      warnings.push('检测到 verge-mihomo 仍在运行，TUN 模式可能继续接管“直连”流量。');
    }
    return { mode: 'direct', proxyUrl: '', warnings };
  }

  if (requestedMode === 'proxy') {
    if (!proxyUrl || !proxyReachable) {
      throw new Error('代理不可用，请确认代理地址和 VPN 客户端状态');
    }
    return { mode: 'proxy', proxyUrl, warnings };
  }

  if (proxyEnabled) {
    if (!proxyUrl || !proxyReachable) {
      throw new Error('Windows 系统代理已开启，但代理不可用；请关闭失效代理或重新启动 VPN');
    }
    return { mode: 'proxy', proxyUrl, warnings };
  }

  if (mihomoRunning) {
    warnings.push('检测到 verge-mihomo 仍在运行，TUN 模式可能继续接管“直连”流量。');
  }
  return { mode: 'direct', proxyUrl: '', warnings };
}

function buildCurlRoutingArgs({ mode, proxyUrl }) {
  return mode === 'proxy'
    ? ['--proxy', proxyUrl]
    : ['--noproxy', '*'];
}

function classifyStation({ successCount, attemptCount, medianTtfbMs }) {
  if (successCount < attemptCount || !Number.isFinite(medianTtfbMs)) return '不稳定';
  if (medianTtfbMs <= 2000) return '友好';
  if (medianTtfbMs <= 3000) return '一般';
  return '较慢';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalTimestamp(date) {
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad(absoluteOffset % 60);
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
    sign,
    offsetHours,
    ':',
    offsetRemainder
  ].join('');
}

function createReportPaths(outputDir, date, mode) {
  const prefix = `${formatLocalTimestamp(date)}-${mode}`;
  return {
    json: path.join(outputDir, `${prefix}.json`),
    markdown: path.join(outputDir, `${prefix}.md`)
  };
}

function displayMode(mode) {
  return mode === 'proxy' ? '代理' : '直连';
}

function formatNumber(value, digits = 0) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
}

function renderMarkdown(report) {
  const lines = [
    '# Lofi Radio 电台网络测速',
    '',
    `- 测试时间：${report.measuredAt}`,
    `- 网络模式：${displayMode(report.network.mode)}`,
    `- 代理地址：${report.network.proxyUrl || '无'}`,
    `- Mihomo 进程：${report.network.mihomoRunning ? '运行中' : '未运行'}`,
    `- DNS 探测结果：${report.network.dnsProbe || '未知'}`,
    `- 测试参数：每个电台 ${report.settings.attempts} 次，每次 ${report.settings.seconds} 秒，最大并发 ${report.settings.concurrency}`,
    ''
  ];

  for (const warning of report.network.warnings || []) {
    lines.push(`> 警告：${warning}`, '');
  }

  lines.push(
    '| 电台 | 类型 | 成功率 | 首字节中位数 | 平均接收速率 | 结论 |',
    '|---|---:|---:|---:|---:|---|'
  );

  for (const station of report.stations) {
    lines.push(
      `| ${station.name} | ${station.type} | ${station.successCount}/${station.attemptCount} | ${formatNumber(station.medianTtfbMs)} ms | ${formatNumber(station.medianKbps)} kbps | ${station.rating} |`
    );
  }

  lines.push(
    '',
    '## 说明',
    '',
    '- 首字节越低，通常表示开始播放越快。',
    '- HLS 的首字节时间包含主清单、媒体清单和首个音频分片的连续请求。',
    '- 短时测速只能判断连接和初始传输，不能证明长时间播放绝不卡顿。',
    '- 代理模式结果只代表当前代理节点；直连模式若仍有 TUN 接管，也不等于纯粹的运营商直连。',
    ''
  );

  return lines.join('\n');
}

function responseFailure(response, fallback) {
  return {
    ok: false,
    ttfbMs: null,
    kbps: null,
    httpCode: response?.httpCode || 0,
    bytes: response?.bytes || 0,
    error: response?.error || fallback
  };
}

function streamResult(response, startupMs = response?.ttfbMs) {
  if (!response?.ok || !Number.isFinite(startupMs)) {
    return responseFailure(response, '流媒体请求失败');
  }
  return {
    ok: true,
    ttfbMs: startupMs,
    kbps: Number((response.speedBytesPerSecond * 8 / 1000).toFixed(3)),
    httpCode: response.httpCode,
    bytes: response.bytes,
    error: ''
  };
}

function playlistEntries(body) {
  return String(body || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function resolveUrl(baseUrl, value) {
  return new URL(value, baseUrl).href;
}

async function measureHls(station, context, request) {
  const master = await request(station.url, {
    captureBody: true,
    maxTimeSeconds: Math.max(context.seconds, 10)
  });
  if (!master.ok) return responseFailure(master, 'HLS 主清单请求失败');

  let media = master;
  let mediaUrl = station.url;
  let playlistTotalMs = master.totalMs;

  if (String(master.body).includes('#EXT-X-STREAM-INF')) {
    const variant = playlistEntries(master.body)[0];
    if (!variant) return responseFailure(master, 'HLS 主清单没有媒体地址');
    mediaUrl = resolveUrl(station.url, variant);
    media = await request(mediaUrl, {
      captureBody: true,
      maxTimeSeconds: Math.max(context.seconds, 10)
    });
    if (!media.ok) return responseFailure(media, 'HLS 媒体清单请求失败');
    playlistTotalMs += media.totalMs;
  }

  const segments = playlistEntries(media.body);
  const segment = segments.at(-1);
  if (!segment) return responseFailure(media, 'HLS 媒体清单没有音频分片');

  const segmentResponse = await request(resolveUrl(mediaUrl, segment), {
    captureBody: false,
    maxTimeSeconds: Math.max(context.seconds + 4, 10)
  });
  return streamResult(segmentResponse, playlistTotalMs + segmentResponse.ttfbMs);
}

function bilibiliRoomId(url) {
  const match = new URL(url).pathname.match(/\/(\d+)/);
  return match?.[1] || '';
}

async function measureBilibili(station, context, request) {
  const roomId = bilibiliRoomId(station.url);
  if (!roomId) return responseFailure(null, '无法识别 Bilibili 直播间号');

  const apiUrl = `https://api.live.bilibili.com/room/v1/Room/playUrl?cid=${roomId}&quality=0&platform=web`;
  const apiResponse = await request(apiUrl, {
    captureBody: true,
    maxTimeSeconds: Math.max(context.seconds, 10)
  });
  if (!apiResponse.ok) return responseFailure(apiResponse, 'Bilibili 播放地址解析失败');

  let payload;
  try {
    payload = JSON.parse(apiResponse.body);
  } catch {
    return responseFailure(apiResponse, 'Bilibili 播放地址返回了无效 JSON');
  }

  const streamUrl = payload?.data?.durl?.[0]?.url;
  if (!streamUrl) return responseFailure(apiResponse, 'Bilibili 当前没有可用直播流');

  const stream = await request(streamUrl, {
    captureBody: false,
    maxTimeSeconds: context.seconds,
    headers: [
      'Referer: https://live.bilibili.com/',
      'User-Agent: Mozilla/5.0'
    ]
  });
  return streamResult(stream, apiResponse.totalMs + stream.ttfbMs);
}

async function measureStationAttempt(station, context, request) {
  if (station.type === 'm3u8') {
    return measureHls(station, context, request);
  }
  if (station.type === 'bilibili') {
    return measureBilibili(station, context, request);
  }

  const response = await request(station.url, {
    captureBody: false,
    maxTimeSeconds: context.seconds,
    headers: ['Icy-MetaData: 1']
  });
  if (response.bytes < 16000) {
    return responseFailure(response, '观察期间收到的音频数据不足');
  }
  return streamResult(response);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeStation(station, runs) {
  const successful = runs.filter((run) => run.ok);
  const summary = {
    name: station.name,
    type: station.type,
    url: station.url,
    successCount: successful.length,
    attemptCount: runs.length,
    medianTtfbMs: median(successful.map((run) => run.ttfbMs)),
    medianKbps: median(successful.map((run) => run.kbps)),
    runs
  };
  summary.rating = classifyStation(summary);
  return summary;
}

function parseRegistryValue(output) {
  const match = String(output || '').match(/REG_(?:DWORD|SZ)\s+(.+)\s*$/im);
  return match?.[1]?.trim() || '';
}

function queryRegistryValue(name) {
  if (process.platform !== 'win32') return '';
  const result = spawnSync(
    'reg.exe',
    [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      name
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  return result.status === 0 ? parseRegistryValue(result.stdout) : '';
}

function detectSystemProxy() {
  if (process.platform === 'win32') {
    const enabledValue = queryRegistryValue('ProxyEnable');
    return {
      enabled: Number.parseInt(enabledValue, 16) === 1 || enabledValue === '1',
      address: parseProxyServer(queryRegistryValue('ProxyServer'))
    };
  }

  const address = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  return { enabled: Boolean(address), address: parseProxyServer(address) };
}

function detectMihomoProcess() {
  if (process.platform !== 'win32') return false;
  const result = spawnSync(
    'tasklist.exe',
    ['/FI', 'IMAGENAME eq verge-mihomo.exe', '/NH'],
    { encoding: 'utf8', windowsHide: true }
  );
  return result.status === 0 && /verge-mihomo\.exe/i.test(result.stdout);
}

function proxyEndpoint(proxyAddress) {
  if (!proxyAddress) return null;
  try {
    const parsed = new URL(normalizeProxyUrl(proxyAddress));
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    };
  } catch {
    return null;
  }
}

function isEndpointReachable(endpoint, timeoutMs = 1000) {
  if (!endpoint) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function detectDnsProbe() {
  try {
    const result = await dns.lookup('boxradio-edge-00.streamafrica.net');
    return result.address;
  } catch {
    return '';
  }
}

function isClashFakeIp(address) {
  const parts = String(address || '').split('.').map(Number);
  return parts.length === 4 && parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19;
}

function curlCommand() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

function assertCurlAvailable() {
  const result = spawnSync(curlCommand(), ['--version'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error('没有找到 curl。Windows 10/11 通常自带 curl.exe，请确认系统 PATH。');
  }
}

function runCurl(url, options, network) {
  return new Promise((resolve) => {
    const marker = '__LOFI_BENCH_METRICS__';
    const writeOut = `\\n${marker}%{http_code}\\t%{time_starttransfer}\\t%{time_total}\\t%{size_download}\\t%{speed_download}`;
    const args = [
      '--silent',
      '--show-error',
      '--location',
      ...buildCurlRoutingArgs(network),
      '--connect-timeout',
      '4',
      '--max-time',
      String(options.maxTimeSeconds),
      '--write-out',
      writeOut
    ];

    for (const header of options.headers || []) {
      args.push('--header', header);
    }
    if (!options.captureBody) {
      args.push('--output', process.platform === 'win32' ? 'NUL' : '/dev/null');
    }
    args.push(url);

    const child = spawn(curlCommand(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      resolve({
        ok: false,
        httpCode: 0,
        ttfbMs: null,
        totalMs: null,
        bytes: 0,
        speedBytesPerSecond: 0,
        body: '',
        error: error.message
      });
    });
    child.on('close', () => {
      const markerIndex = stdout.lastIndexOf(marker);
      const body = markerIndex >= 0
        ? stdout.slice(0, markerIndex).replace(/\r?\n$/, '')
        : stdout;
      const metrics = markerIndex >= 0
        ? stdout.slice(markerIndex + marker.length).trim().split('\t')
        : [];
      const httpCode = Number(metrics[0]) || 0;
      const ttfbMs = Number(metrics[1]) * 1000;
      const totalMs = Number(metrics[2]) * 1000;
      const bytes = Number(metrics[3]) || 0;
      const speedBytesPerSecond = Number(metrics[4]) || 0;
      resolve({
        ok: httpCode >= 200 && httpCode < 400 && Number.isFinite(ttfbMs) && ttfbMs > 0,
        httpCode,
        ttfbMs: Number.isFinite(ttfbMs) ? ttfbMs : null,
        totalMs: Number.isFinite(totalMs) ? totalMs : null,
        bytes,
        speedBytesPerSecond,
        body: options.captureBody ? body : '',
        error: stderr.trim()
      });
    });
  });
}

async function runQueue(jobs, concurrency, worker) {
  const queue = [...jobs];
  async function consume() {
    while (queue.length > 0) {
      const job = queue.shift();
      await worker(job);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, consume));
}

async function writeReports(report, paths) {
  await fs.mkdir(path.dirname(paths.json), { recursive: true });
  await Promise.all([
    fs.writeFile(paths.json, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(paths.markdown, renderMarkdown(report), 'utf8')
  ]);
}

async function benchmark(options, dependencies = {}) {
  const systemProxy = dependencies.systemProxy || detectSystemProxy();
  const mihomoRunning = dependencies.mihomoRunning ?? detectMihomoProcess();
  const requestedProxy = options.proxy || systemProxy.address;
  const proxyReachable = requestedProxy
    ? await (dependencies.isEndpointReachable || isEndpointReachable)(proxyEndpoint(requestedProxy))
    : false;
  const selected = selectNetworkMode({
    requestedMode: options.mode,
    proxyEnabled: options.proxy ? true : systemProxy.enabled,
    proxyAddress: requestedProxy,
    proxyReachable,
    mihomoRunning
  });
  const dnsProbe = dependencies.dnsProbe ?? await detectDnsProbe();
  if (selected.mode === 'direct' && isClashFakeIp(dnsProbe)) {
    selected.warnings.push(`DNS 返回 Clash fake-IP ${dnsProbe}，当前“直连”仍可能经过 Mihomo。`);
  }

  const network = {
    ...selected,
    mihomoRunning,
    dnsProbe,
    systemProxyEnabled: systemProxy.enabled,
    systemProxyAddress: systemProxy.address
  };
  const request = dependencies.request || ((url, requestOptions) => runCurl(url, requestOptions, network));
  const runs = new Map(stations.map((station) => [station.name, []]));
  const jobs = [];
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    for (const station of stations) jobs.push({ station, attempt });
  }

  let completed = 0;
  await runQueue(jobs, options.concurrency, async ({ station, attempt }) => {
    const result = await measureStationAttempt(station, options, request);
    runs.get(station.name).push({ attempt, ...result });
    completed += 1;
    if (!dependencies.silent) {
      const status = result.ok ? `${Math.round(result.ttfbMs)} ms` : `失败：${result.error}`;
      process.stdout.write(`[${completed}/${jobs.length}] ${station.name} #${attempt} ${status}\n`);
    }
  });

  const now = dependencies.now || new Date();
  const report = {
    measuredAt: formatLocalIso(now),
    network,
    settings: {
      attempts: options.attempts,
      seconds: options.seconds,
      concurrency: options.concurrency
    },
    stations: stations.map((station) => summarizeStation(station, runs.get(station.name)))
  };
  const paths = createReportPaths(options.outputDir, now, network.mode);
  await (dependencies.writeReports || writeReports)(report, paths);
  return { report, paths };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  assertCurlAvailable();
  process.stdout.write('正在检测代理环境并测速，请勿在测速过程中切换 VPN 状态。\n');
  const { report, paths } = await benchmark(options);
  process.stdout.write('\n测速完成：\n');
  for (const station of report.stations) {
    process.stdout.write(
      `- ${station.name}: ${station.successCount}/${station.attemptCount}, ${formatNumber(station.medianTtfbMs)} ms, ${station.rating}\n`
    );
  }
  process.stdout.write(`\nMarkdown：${paths.markdown}\nJSON：${paths.json}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`测速失败：${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  printHelp,
  parseArgs,
  parseProxyServer,
  selectNetworkMode,
  buildCurlRoutingArgs,
  classifyStation,
  createReportPaths,
  renderMarkdown,
  measureStationAttempt,
  summarizeStation,
  parseRegistryValue,
  detectSystemProxy,
  proxyEndpoint,
  isClashFakeIp,
  runCurl,
  benchmark,
  writeReports
};
