'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Utils, ChronographType } = require('../lib/utils.js');

describe('Widget chronograph autocomplete', () => {
	it('offers all types with distinct identities and appearance selectors in each multiple-widget slot', async () => {
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => id === 'homey' ? { App: class {} }
				: id === './lib/utils.js' ? require('../lib/utils.js')
					: id === './assets/js/chronograph-widget-style.js' ? require('../assets/js/chronograph-widget-style.js') : {}
		});
		const listeners = {};
		const app = {
			chronographs: { timer: [{ name: 'Same' }], transition: [{ name: 'Same' }], stopwatch: [{ name: 'Other' }] },
			homey: {
				__: key => key, settings: { get: () => ({}) },
				dashboards: { getWidget: id => ({ registerSettingAutocompleteListener: (setting, listener) => {
					listeners[id + ':' + setting] = listener;
				} }) }
			}
		};
		module.exports.prototype._registerChronographWidgetAutocomplete.call(app);
		for (const slot of [1, 10]) {
			const prefix = 'multiple_chronographs:chronograph' + slot;
			const matches = await listeners[prefix]('same');
			assert.deepStrictEqual(Array.from(matches, item => item.type), ['timer', 'transition']);
			assert.notStrictEqual(matches[0].id, matches[1].id);
			assert.strictEqual(matches[0].chronographName, 'Same');
			assert.strictEqual(matches[1].data.name, 'Same');
			assert.strictEqual(matches[0].description, 'settings.widget_type_timer');
			assert.strictEqual((await listeners[prefix + 'DesignStyle'](''))[0].id, 'builtin:current');
			assert.strictEqual((await listeners[prefix + 'ColorTheme'](''))[0].id, 'builtin:current');
			assert.strictEqual(typeof listeners[prefix + 'Icon'], 'function');
		}
	});

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
			'settings.style_preset_settings': 'Settings',
			'settings.style_scheme_ocean': 'Ocean',
			'settings.style_scheme_forest': 'Forest',
			'settings.style_scheme_sunset': 'Sunset',
			'settings.style_scheme_twilight': 'Twilight',
			'settings.style_scheme_blossom': 'Blossom',
			'settings.style_scheme_sky': 'Sky',
			'settings.style_scheme_amber': 'Amber',
			'settings.style_design_centered': 'Centered',
			'settings.style_design_dashboard': 'Dashboard',
			'settings.style_design_focus': 'Focus',
			'settings.style_design_vertical': 'Vertical',
			'settings.style_design_small': 'Small',
			'settings.style_design_tiny': 'Tiny',
			'settings.style_builtin_label': 'Built-in',
			'settings.style_custom_label': 'Custom'
		};
		let collection = { version: 2, styles: [{ id: 'design', name: 'A design' }], colorSchemes: [
			{ id: 'custom', name: 'A custom' }, { id: 'ocean-copy', name: 'Ocean' }
		] };
		const app = { homey: {
			__: key => names[key],
			settings: { get: () => collection },
			dashboards: { getWidget: type => ({
				registerSettingAutocompleteListener: (setting, listener) => { listeners[type + ':' + setting] = listener; }
			}) }
		} };
		module.exports.prototype._registerChronographWidgetAutocomplete.call(app);
		assert.ok((await listeners['timer:colorTheme']('')).some(item => item.id === 'custom'));
		collection = { version: 3, styles: collection.styles, themes: collection.colorSchemes };
		const englishNames = Object.assign({}, names);
		for (const type of ['timer', 'stopwatch', 'transition']) {
			Object.assign(names, englishNames);
			const results = await listeners[type + ':colorTheme']('');
			assert.deepStrictEqual(Array.from(results, item => item.id), [
				'builtin:current', 'builtin:amber', 'builtin:blossom', 'builtin:forest', 'builtin:ocean',
				'builtin:settings', 'builtin:sky', 'builtin:sunset', 'builtin:twilight', 'custom', 'ocean-copy'
			]);
			assert.strictEqual(results.find(item => item.id === 'builtin:ocean').name, 'Ocean');
			assert.strictEqual(results.find(item => item.id === 'builtin:ocean').description, 'Built-in');
			assert.strictEqual(results.find(item => item.id === 'ocean-copy').name, 'Ocean');
			assert.strictEqual(results.find(item => item.id === 'ocean-copy').description, 'Custom');
			assert.strictEqual(results.find(item => item.id === 'builtin:ocean').data.id, 'builtin:ocean');
			assert.deepStrictEqual(Array.from(await listeners[type + ':colorTheme']('OCE'), item => item.id), ['builtin:ocean', 'ocean-copy']);
			assert.deepStrictEqual(Array.from(await listeners[type + ':colorTheme']('ocean (built-in)'), item => item.id), ['builtin:ocean']);
			const designs = await listeners[type + ':designStyle']('');
			assert.deepStrictEqual(Array.from(designs, item => item.id), ['builtin:current', 'builtin:centered', 'builtin:dashboard', 'builtin:focus', 'builtin:settings', 'builtin:small', 'builtin:tiny', 'builtin:vertical', 'design']);
			assert.strictEqual(designs[0].name, 'Default');
			assert.strictEqual(designs[0].description, 'Built-in');
			assert.strictEqual(designs[8].name, 'A design');
			assert.strictEqual(designs[8].description, 'Custom');
			assert.deepStrictEqual(Array.from(await listeners[type + ':designStyle']('dash'), item => item.id), ['builtin:dashboard']);
			names['settings.style_current'] = 'Zzz';
			assert.strictEqual((await listeners[type + ':designStyle'](''))[0].id, 'builtin:current');
			assert.strictEqual((await listeners[type + ':colorTheme'](''))[0].id, 'builtin:current');
			const localeDir = path.join(__dirname, '..', '.homeycompose', 'locales');
			for (const file of fs.readdirSync(localeDir).filter(file => file.endsWith('.settings.json'))) {
				const translations = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
				for (const key of Object.keys(names)) names[key] = translations[key.replace('settings.', '')];
				assert.strictEqual((await listeners[type + ':designStyle'](''))[0].id, 'builtin:current', file);
				assert.strictEqual((await listeners[type + ':colorTheme'](''))[0].id, 'builtin:current', file);
			}
			Object.assign(names, {
				'settings.style_scheme_ocean': 'Ocean', 'settings.style_scheme_forest': 'Forest',
				'settings.style_scheme_sunset': 'Sunset', 'settings.style_scheme_twilight': 'Twilight',
				'settings.style_scheme_blossom': 'Blossom', 'settings.style_scheme_sky': 'Sky',
				'settings.style_scheme_amber': 'Amber', 'settings.style_design_centered': 'Centered',
				'settings.style_design_dashboard': 'Dashboard', 'settings.style_design_focus': 'Focus',
				'settings.style_design_vertical': 'Vertical',
				'settings.style_design_small': 'Small', 'settings.style_design_tiny': 'Tiny',
				'settings.style_builtin_label': 'Built-in', 'settings.style_custom_label': 'Custom'
			});
			names['settings.style_current'] = 'Default';
		}
	});

	it('loads the widget icon and style modules only when their autocomplete is used', async () => {
		const lazy = ['./lib/widget-icons.js', './assets/js/chronograph-widget-style.js'];
		const loaded = [];
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => {
				if (lazy.includes(id)) loaded.push(id);
				if (id === 'homey') return { App: class {} };
				if (id === './lib/widget-icons.js') return { searchIcons: (query, noneLabel) => [{ id: 'none', name: noneLabel }] };
				if (id === './assets/js/chronograph-widget-style.js') return require('../assets/js/chronograph-widget-style.js');
				return {};
			}
		});
		const listeners = {};
		const app = { homey: {
			__: key => key, settings: { get: () => ({}) },
			dashboards: { getWidget: type => ({
				registerSettingAutocompleteListener: (setting, listener) => { listeners[type + ':' + setting] = listener; }
			}) }
		} };
		module.exports.prototype._registerChronographWidgetAutocomplete.call(app);
		assert.deepStrictEqual(loaded, []);
		assert.deepStrictEqual(await listeners['timer:icon']('clock'), [{ id: 'none', name: 'settings.widget_icon_none' }]);
		assert.ok((await listeners['timer:colorTheme']('')).some(item => item.id === 'builtin:ocean'));
		assert.ok((await listeners['stopwatch:designStyle']('')).some(item => item.id === 'builtin:dashboard'));
		assert.deepStrictEqual([...new Set(loaded)], lazy);
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
			assert.strictEqual(results[0].id, 'alpha 2');
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
