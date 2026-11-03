const fs = require('fs');
eval(fs.readFileSync(require('path').join(__dirname, 'calc.js'), 'utf8'));
const assert = require('assert');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

near(ohqosParse('500m').value, 0.5, '500m cpu');
near(ohqosParse('2').value, 2, '2 cores');
near(ohqosParse('0.25').value, 0.25, '0.25');
near(ohqosParse('.5').value, 0.5, '.5');
near(ohqosParse('512Mi').value, 536870912, '512Mi');
near(ohqosParse('1Gi').value, 1073741824, '1Gi');
near(ohqosParse('512M').value, 512e6, '512M');
near(ohqosParse('129e6').value, 129e6, 'exponent');
near(ohqosParse('128974848000m').value, 128974848, 'milli bytes (k8s docs example)');
near(ohqosParse('1k').value, 1000, 'k');
assert.ok(ohqosParse('1K').error, 'uppercase K is invalid');
assert.ok(ohqosParse('1gb').error && ohqosParse('abc').error && ohqosParse('-1').error);
assert.strictEqual(ohqosParse(''), null);

const C = (o) => Object.assign({ name: 'app', cpuReq: '', cpuLim: '', memReq: '', memLim: '' }, o);
assert.strictEqual(ohqosPod([C({})]).qos, 'BestEffort');
assert.strictEqual(ohqosPod([C({ cpuReq: '1', cpuLim: '1', memReq: '1Gi', memLim: '1Gi' })]).qos, 'Guaranteed');
assert.strictEqual(ohqosPod([C({ cpuReq: '1000m', cpuLim: '1', memReq: '1024Mi', memLim: '1Gi' })]).qos, 'Guaranteed', 'equal after unit conversion');
assert.strictEqual(ohqosPod([C({ cpuLim: '500m', memLim: '256Mi' })]).qos, 'Guaranteed', 'limits only -> requests default');
assert.strictEqual(ohqosPod([C({ cpuReq: '250m', cpuLim: '500m', memReq: '256Mi', memLim: '256Mi' })]).qos, 'Burstable');
assert.strictEqual(ohqosPod([C({ cpuReq: '1', memReq: '1Gi', memLim: '1Gi' })]).qos, 'Burstable', 'no cpu limit');
// one container guaranteed, one best-effort -> Burstable
assert.strictEqual(ohqosPod([C({ cpuReq: '1', cpuLim: '1', memReq: '1Gi', memLim: '1Gi' }), C({ name: 'sidecar' })]).qos, 'Burstable');
assert.strictEqual(ohqosPod([C({ cpuReq: '1', cpuLim: '1', memReq: '1Gi', memLim: '1Gi' })]).oomScoreAdj, '-997');

let c = ohqosContainer(C({ memReq: '512m', memLim: '512m' }));
assert.ok(c.issues.some(i => i.level === 'error' && /milli/.test(i.msg)), 'lowercase m memory flagged');
c = ohqosContainer(C({ cpuReq: '2', cpuLim: '1' }));
assert.ok(c.issues.some(i => /larger than the CPU limit/.test(i.msg)));
c = ohqosContainer(C({ memReq: '2Gi', memLim: '1Gi' }));
assert.ok(c.issues.some(i => /larger than the memory limit/.test(i.msg)));
c = ohqosContainer(C({ cpuReq: '0.0005' }));
assert.ok(c.issues.some(i => /finer than 1m/.test(i.msg)));
c = ohqosContainer(C({ memReq: '512M', memLim: '512M' }));
assert.ok(c.issues.some(i => i.level === 'info' && /488.28 Mi/.test(i.msg)), 'decimal M note');
c = ohqosContainer(C({ cpuReq: '100m', memReq: '128Mi' }));
assert.ok(c.issues.some(i => /No memory limit/.test(i.msg)));
assert.strictEqual(ohqosContainer(C({ cpuReq: '1x' })).issues[0].level, 'error');

let p = ohqosPod([C({ cpuReq: '250m', memReq: '256Mi', memLim: '512Mi' }), C({ cpuReq: '100m', memReq: '64Mi', memLim: '64Mi' })]);
near(p.totals.cpuReq, 0.35, 'total cpu'); near(p.totals.memReq, 320 * 1048576, 'total mem');
assert.strictEqual(ohqosFmtBytes(536870912), '512 Mi');
assert.strictEqual(ohqosFmtBytes(512e6), '488.28 Mi');
assert.strictEqual(ohqosFmtCpu(0.25), '250m');
assert.strictEqual(ohqosFmtCpu(1.5), '1.5 cores');
near(ohqosConvert('1Gi').Mi, 1024, 'convert'); near(ohqosConvert('1500m').millicores, 1500, 'convert m');
console.log('all qos calc tests passed');
