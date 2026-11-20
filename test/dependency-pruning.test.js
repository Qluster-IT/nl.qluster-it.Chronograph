'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneDependencies } = require('../tools/prune-dependencies');

describe('Dependency pruning', () => {
	let root;
	let directory;
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronograph-pruning-'));
		directory = path.join(root, 'node_modules', 'betterlogiclibrary');
		fs.mkdirSync(directory, { recursive: true });
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});
	function write(name, data) {
		const target = path.join(directory, name);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, data);
	}
	it('removes non-runtime files without changing runtime code, data, licences or other packages', () => {
		write('package.json', JSON.stringify({ main: 'src/bl.js' }));
		write('src/bl.js', 'module.exports = 42;');
		write('src/data.json', '{"value":42}');
		write('LICENSE.md', 'Licence text');
		for (const name of ['README.md', 'dist/bl.d.ts', 'dist/bl.d.ts.map', 'test/bl.test.js', '.github/workflows/test.yml']) write(name, 'unused');
		const other = path.join(root, 'node_modules', 'another-package');
		fs.mkdirSync(other);
		fs.writeFileSync(path.join(other, 'README.md'), 'untouched');
		const result = pruneDependencies(root);
		assert.strictEqual(result.files, 5);
		assert.strictEqual(result.bytes, 5 * Buffer.byteLength('unused'));
		assert.strictEqual(require(directory), 42);
		assert.strictEqual(fs.readFileSync(path.join(directory, 'src/data.json'), 'utf8'), '{"value":42}');
		assert.strictEqual(fs.readFileSync(path.join(directory, 'LICENSE.md'), 'utf8'), 'Licence text');
		assert.strictEqual(fs.readFileSync(path.join(other, 'README.md'), 'utf8'), 'untouched');
		assert.strictEqual(fs.existsSync(path.join(directory, 'test')), false);
		assert.deepStrictEqual(pruneDependencies(root), { files: 0, bytes: 0 });
	});
	it('preserves main and conditional export targets even inside otherwise removable paths', () => {
		write('package.json', JSON.stringify({ main: 'test/main.js', exports: { '.': { require: './test/entry.js' } } }));
		write('test/main.js', 'module.exports = 1;');
		write('test/entry.js', 'module.exports = 2;');
		write('test/unused.js', 'unused');
		assert.strictEqual(pruneDependencies(root).files, 1);
		assert.strictEqual(fs.readFileSync(path.join(directory, 'test/main.js'), 'utf8'), 'module.exports = 1;');
		assert.strictEqual(fs.readFileSync(path.join(directory, 'test/entry.js'), 'utf8'), 'module.exports = 2;');
	});
});
