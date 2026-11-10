'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Utils, ChronographType } = require('../lib/utils.js');

describe('Widget chronograph autocomplete', () => {
	it('sorts filtered names without changing the configured order or item data', async () => {
		const module = { exports: {} };
		const script = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
		vm.runInNewContext(script, {
			module,
			require: id => {
				if (id === 'homey') return { App: class {} };
				if (id === './lib/utils.js') return require('../lib/utils.js');
				return {};
			}
		});
		const listeners = {};
		const chronographs = {};
		for (const type of ['timer', 'stopwatch', 'transition']) {
			chronographs[type] = [{ name: 'zebra' }, 'Alpha 10', { name: 'alpha 2' }, { name: 'Beta' }];
		}
		const app = {
			chronographs,
			homey: {
				dashboards: {
					getWidget: type => ({
						registerSettingAutocompleteListener: (setting, listener) => {
							listeners[type + ':' + setting] = listener;
						}
					})
				}
			}
		};
		module.exports.prototype._registerChronographWidgetAutocomplete.call(app);
		for (const type of ['timer', 'stopwatch', 'transition']) {
			const results = await listeners[type + ':chronograph']('');
			assert.deepStrictEqual(Array.from(results, item => item.name), ['alpha 2', 'Alpha 10', 'Beta', 'zebra']);
			assert.deepStrictEqual(Array.from(await listeners[type + ':chronograph']('ALPHA'), item => item.name), ['alpha 2', 'Alpha 10']);
			assert.strictEqual(results[0].id, Utils.generateId(ChronographType[type.toUpperCase()], 'alpha 2'));
			assert.strictEqual(results[0].type, type);
			assert.strictEqual(results[0].data.name, 'alpha 2');
			assert.deepStrictEqual(chronographs[type].map(item => typeof item === 'string' ? item : item.name), ['zebra', 'Alpha 10', 'alpha 2', 'Beta']);
		}
	});
});
