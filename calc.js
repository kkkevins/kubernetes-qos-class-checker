// Kubernetes resource.Quantity parsing: binary suffixes (Ki..Ei), decimal suffixes (n, u, m, k, M..E)
// and exponent notation (1e3). Returns the value in base units (cores or bytes), or null if invalid.
var OHQOS_SUFFIX = {
  '': 1, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  Ki: 1024, Mi: Math.pow(1024, 2), Gi: Math.pow(1024, 3), Ti: Math.pow(1024, 4), Pi: Math.pow(1024, 5), Ei: Math.pow(1024, 6)
};

function ohqosParse(s) {
  if (s === undefined || s === null) return null;
  s = String(s).trim();
  if (s === '') return null;
  var m = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:([eE][+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E)?)$/.exec(s);
  if (!m) return { error: 'not a valid quantity' };
  var n = parseFloat(m[1] + (m[2] || ''));
  var suffix = m[3] || '';
  if (n < 0) return { error: 'must not be negative' };
  return { value: n * OHQOS_SUFFIX[suffix], suffix: suffix, raw: s };
}

// One container: { name, cpuReq, cpuLim, memReq, memLim } as quantity strings ('' = unset).
// Mirrors the API defaulting rule: a limit without a request sets the request to the limit.
function ohqosContainer(c) {
  var f = {}, issues = [];
  ['cpuReq', 'cpuLim', 'memReq', 'memLim'].forEach(function (k) {
    var q = ohqosParse(c[k]);
    if (q && q.error) { issues.push({ level: 'error', field: k, msg: '"' + c[k] + '" is ' + q.error + '.' }); q = null; }
    f[k] = q;
  });
  var cpuReq = f.cpuReq ? f.cpuReq.value : (f.cpuLim ? f.cpuLim.value : null);
  var memReq = f.memReq ? f.memReq.value : (f.memLim ? f.memLim.value : null);
  var cpuLim = f.cpuLim ? f.cpuLim.value : null, memLim = f.memLim ? f.memLim.value : null;
  var defaulted = { cpu: !f.cpuReq && !!f.cpuLim, mem: !f.memReq && !!f.memLim };

  if (cpuLim !== null && cpuReq > cpuLim) issues.push({ level: 'error', field: 'cpuReq', msg: 'CPU request is larger than the CPU limit; the API server rejects this.' });
  if (memLim !== null && memReq > memLim) issues.push({ level: 'error', field: 'memReq', msg: 'Memory request is larger than the memory limit; the API server rejects this.' });
  ['cpuReq', 'cpuLim'].forEach(function (k) {
    var q = f[k];
    if (q && q.value > 0 && Math.abs(q.value * 1000 - Math.round(q.value * 1000)) > 1e-9)
      issues.push({ level: 'warn', field: k, msg: 'CPU "' + q.raw + '" is finer than 1m (0.001 cores); Kubernetes does not allow that precision.' });
  });
  ['memReq', 'memLim'].forEach(function (k) {
    var q = f[k];
    if (!q) return;
    if (q.suffix === 'm') issues.push({ level: 'error', field: k, msg: 'Memory "' + q.raw + '" uses a lowercase m, which means milli: ' + q.value + ' bytes. You probably meant "' + q.raw.slice(0, -1) + 'Mi".' });
    else if (q.value > 0 && q.value < 4 * 1048576) issues.push({ level: 'warn', field: k, msg: 'Memory "' + q.raw + '" is under 4 MiB, which is too small for almost any container. Check the unit.' });
    if (q.suffix === 'M' || q.suffix === 'G') issues.push({ level: 'info', field: k, msg: '"' + q.raw + '" is decimal: ' + ohqosFmtBytes(q.value) + '. Use ' + q.suffix + 'i if you meant powers of 1024.' });
  });
  if (memLim === null && (cpuReq !== null || memReq !== null)) issues.push({ level: 'warn', field: 'memLim', msg: 'No memory limit: the container can use memory until the node runs short, and is then among the first evicted once it exceeds its request.' });

  return {
    name: c.name, cpuReq: cpuReq, cpuLim: cpuLim, memReq: memReq, memLim: memLim, defaulted: defaulted, issues: issues,
    any: cpuReq !== null || cpuLim !== null || memReq !== null || memLim !== null,
    guaranteed: cpuLim !== null && memLim !== null && cpuReq === cpuLim && memReq === memLim
  };
}

// Pod QoS class from its containers (init containers count the same way).
function ohqosPod(containers) {
  var cs = containers.map(ohqosContainer);
  var qos = cs.every(function (c) { return !c.any; }) ? 'BestEffort'
    : cs.every(function (c) { return c.guaranteed; }) ? 'Guaranteed' : 'Burstable';
  var sum = function (k) { return cs.reduce(function (a, c) { return a + (c[k] || 0); }, 0); };
  return {
    containers: cs, qos: qos,
    oomScoreAdj: qos === 'Guaranteed' ? '-997' : qos === 'BestEffort' ? '1000' : '2 to 999',
    totals: { cpuReq: sum('cpuReq'), cpuLim: sum('cpuLim'), memReq: sum('memReq'), memLim: sum('memLim') },
    errors: cs.reduce(function (a, c) { return a + c.issues.filter(function (i) { return i.level === 'error'; }).length; }, 0)
  };
}

function ohqosFmtBytes(b) {
  if (b === null || b === undefined) return '-';
  var units = [['Ti', Math.pow(1024, 4)], ['Gi', Math.pow(1024, 3)], ['Mi', 1048576], ['Ki', 1024]];
  for (var i = 0; i < units.length; i++) if (b >= units[i][1]) return parseFloat((b / units[i][1]).toFixed(2)) + ' ' + units[i][0];
  return parseFloat(b.toFixed(3)) + ' bytes';
}

function ohqosFmtCpu(c) {
  if (c === null || c === undefined) return '-';
  return c < 1 ? Math.round(c * 1000) + 'm' : parseFloat(c.toFixed(3)) + (c === 1 ? ' core' : ' cores');
}

// Convert any quantity into the common unit spellings.
function ohqosConvert(s) {
  var q = ohqosParse(s);
  if (!q || q.error) return q;
  var v = q.value;
  return {
    value: v, cores: v, millicores: v * 1000, bytes: v,
    Ki: v / 1024, Mi: v / 1048576, Gi: v / Math.pow(1024, 3), k: v / 1e3, M: v / 1e6, G: v / 1e9
  };
}
