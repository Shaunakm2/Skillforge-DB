const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
require('../public/js/core/unzip.js');
const f = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
test('reads a SCORM 1.2 package and finds the launch file', async () => {
  const files = await Unzip.read(f('scorm12.zip'));
  assert.deepStrictEqual(files.map(x => x.name).sort(), ['content/app.js', 'content/img/logo.png', 'content/index.html', 'imsmanifest.xml']);
  assert.ok(new TextDecoder().decode(files.find(x => x.name === 'content/app.js').data).startsWith('var API'));
  assert.deepStrictEqual(Unzip.scormLaunch(files), { launch: 'content/index.html', version: '1.2', title: 'Fire safety' });
});
test('rejects ZIPs without a manifest, and unsafe paths', async () => {
  assert.throws(() => Unzip.scormLaunch([{ name: 'readme.txt', data: new Uint8Array() }]), /imsmanifest/);
  await assert.rejects(Unzip.read(f('evil.zip')), /Unsafe path/);
  await assert.rejects(Unzip.read(Buffer.from('not a zip at all, definitely not')), /Not a ZIP/);
});
