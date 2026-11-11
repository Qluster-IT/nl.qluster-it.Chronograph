'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Utils, ChronographType } = require('../lib/utils.js');

describe('Widget chronograph autocomplete', () => {
	it('offers localized built-in color schemes and filters them without affecting designs', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => id === 'homey' ? { App: class {} }
				: id === './assets/js/chronograph-widget-style.js' ? runtime : {}
		});
		const listeners = {};
		const names = {
			'settings.style_current': 'Default',
			'settings.style_scheme_ocean': 'Ocean',
			'settings.style_scheme_forest': 'Forest',
			'settings.style_scheme_sunset': 'Sunset',
			'settings.style_scheme_twilight': 'Twilight',
			'settings.style_scheme_blossom': 'Blossom',
			'settings.style_scheme_sky': 'Sky',
			'settings.style_scheme_amber': 'Amber',
			'settings.style_builtin_label': 'Built-in'
		};
		const app = { homey: {
			__: key => names[key],
			settings: { get: () => ({ version: 2, styles: [{ id: 'design', name: 'A design' }], colorSchemes: [
				{ id: 'custom', name: 'A custom' }, { id: 'ocean-copy', name: 'Ocean' }
			] }) },
			dashboards: { getWidget: type => ({
				registerSettingAutocompleteListener: (setting, listener) => { listeners[type + ':' + setting] = listener; }
			}) }
		} };
		module.exports.prototype._registerChronographWidgetAutocomplete.call(app);
		for (const type of ['timer', 'stopwatch', 'transition']) {
			const results = await listeners[type + ':colorScheme']('');
			assert.deepStrictEqual(Array.from(results, item => item.id), [
				'builtin:amber', 'builtin:blossom', 'builtin:current', 'builtin:forest', 'builtin:ocean',
				'builtin:sky', 'builtin:sunset', 'builtin:twilight', 'custom', 'ocean-copy'
			]);
			assert.strictEqual(results.find(item => item.id === 'builtin:ocean').name, 'Ocean (Built-in)');
			assert.strictEqual(results.find(item => item.id === 'ocean-copy').name, 'Ocean');
			assert.strictEqual(results.find(item => item.id === 'builtin:ocean').data.id, 'builtin:ocean');
			assert.deepStrictEqual(Array.from(await listeners[type + ':colorScheme']('OCE'), item => item.id), ['builtin:ocean', 'ocean-copy']);
			const designs = await listeners[type + ':designStyle']('');
			assert.deepStrictEqual(Array.from(designs, item => item.id), ['builtin:current', 'design']);
			assert.strictEqual(designs[0].name, 'Default (Built-in)');
			assert.strictEqual(designs[1].name, 'A design');
		}
	});

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

	it('preserves last Flow values when Flow card names are refreshed', async () => {
		const module = { exports: {} };
		const script = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
		vm.runInNewContext(script, {
			module,
			require: id => id === 'homey' ? { App: class {} } : {}
		});
		const prototype = module.exports.prototype;
		for (const type of ['timer', 'transition']) {
			const values = { time: 12, unit: 'minutes', from: 0, to: 80, steps: 4 };
			const card = { getArgumentValues: async () => [{ name: 'Example' }] };
			const app = {
				chronographs: { [type]: [{ name: 'Example', flowValues: values }] },
				chronographsCards: { [type]: [{ card }] },
				homey: { settings: { set() {} }, error(...args) { throw new Error(args.join(' ')); } },
				setArgumentNamesCard: prototype.setArgumentNamesCard
			};
			await prototype.setArgumentNames.call(app, card, { id: type + '_start' }, false);
			assert.strictEqual(app.chronographs[type][0].flowValues, values);
		}
	});

	it('retains saved Flow or API chronographs even without a matching Flow card on startup', async () => {
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => id === 'homey' ? { App: class {} } : {}
		});
		const values = { time: 12, unit: 'minutes' };
		const app = {
			homey: {
				settings: { get: () => ({ timer: [{ name: 'API timer', flowValues: values }, { name: 'old name' }] }) },
				manifest: { flow: {} }
			}
		};
		await module.exports.prototype._initializeChronographsFromFlowArguments.call(app);
		assert.strictEqual(app.chronographs.timer.length, 1);
		assert.strictEqual(app.chronographs.timer[0].name, 'API timer');
		assert.strictEqual(app.chronographs.timer[0].flowValues, values);
	});
});
