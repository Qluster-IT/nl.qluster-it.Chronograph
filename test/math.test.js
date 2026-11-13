const assert = require('assert');
const { Utils } = require('../lib/utils.js');

describe('Math', () => {
	it('math evaluate should handle basic math', function() {
		assert.equal(Utils.evalTime('   2 *    5'), 10, 'multiply should work properly');
		assert.equal(Utils.evalTime('   15 /   3'), 5, 'divide should work properly');
		assert.equal(Utils.evalTime('   15 %  10'), 5, 'modulo should work properly');
		assert.equal(Utils.evalTime('   1.5 + 10'), 11.5, 'add should work properly');
		assert.equal(Utils.evalTime('  9999 -  9998'), 1, 'subtract should work properly');
	});

	it('math evaluate should handle random functionality', function() {
		for (var i = 1; i <= 500; i++) {
			let random = Utils.evalTime(' RaNdOm( 10,     40) ');
			assert.ok(random >= 10, 'random number should be higher than or equal to 10');
			assert.ok(random < 40, 'random number should be lower than 40');
		}
		for (var i = 1; i <= 500; i++) {
			let random = Utils.evalTime('PICK(10,40,99)');
			assert.ok(random == 10 || random == 40 || random == 99, 'random number should be 10, 40 or 99');
		}
	});

	it('math evaluate should handle other functions', function() {
		assert.equal(Utils.evalTime('min(1, 10)'), 1, 'minimum should be 1');
		assert.equal(Utils.evalTime('max(1.9, 10.4)'), 10.4, 'maximum should be 10.4');
		assert.equal(Utils.evalTime('floor(1.9)'), 1, 'floor should be 1');
		assert.equal(Utils.evalTime('abs(-10)'), 10, 'abs should be 10');
	});

	it('plain numbers are parsed without loading mathjs, which loads only for expressions', function() {
		const mathFile = require.resolve('../lib/math.js');
		const fs = require('fs');
		const Module = require('module');
		const filename = require.resolve('../lib/utils.js');
		const m = new Module(filename, module);
		m.filename = filename;
		m.paths = module.paths;
		const loaded = [];
		m.require = id => { loaded.push(id); return Module.prototype.require.call(m, id); };
		m._compile(fs.readFileSync(filename, 'utf8'), filename);
		const { Utils: FreshUtils } = m.exports;
		for (const [input, expected] of [[5, 5], [' 007 ', 7], ['1,5', 1.5], ['-2.25', -2.25], ['10.0', 10], ['-0', 0]]) {
			assert.strictEqual(FreshUtils.evalTime(input), expected, String(input));
		}
		assert.strictEqual(FreshUtils.evalTime('5#'), false);
		assert.ok(!loaded.includes('./math.js'));
		assert.strictEqual(FreshUtils.evalTime('2 * 5'), 10);
		assert.strictEqual(FreshUtils.evalTime('abc'), false);
		assert.ok(loaded.includes('./math.js') && require.cache[mathFile]);
	});
});

