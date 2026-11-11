'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget.js'), 'utf8');
const styleScript = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget-style.js'), 'utf8');

async function loadWidget(type, settings, defaults, widgetStyles) {
	let controller;
	const listeners = {};
	const state = { active: false, running: false, defaults };
	const module = { controller: (name, definition) => { controller = definition[definition.length - 1]; } };
	const scope = { $on() {}, $applyAsync(callback) { callback(); } };
	const homey = {
		getSettings: () => Object.assign({ chronograph: { id: 'test' } }, settings),
		__: key => key,
		ready() {},
		on: (name, callback) => { listeners[name] = callback; },
		api: (method, url) => Promise.resolve(url === '/widget-styles'
			? widgetStyles
			: Object.assign({}, state))
	};
	const context = {
		angular: { module: () => module, bootstrap() {} },
		document: { body: { getAttribute: () => type } },
		window: {},
		Promise,
		Date
	};
	vm.runInNewContext(styleScript, context);
	vm.runInNewContext(script, context);
	context.onHomeyReady(homey);
	const timeout = () => {};
	timeout.cancel = () => {};
	controller(scope, () => {}, timeout);
	await new Promise(resolve => setImmediate(resolve));
	return { scope, listeners, state };
}

describe('Widget duration defaults', () => {
	it('loads the selected saved design and color scheme', async () => {
		const design = {
			id: 'design-a',
			name: 'Design A',
			startFieldsVisibility: { compact: 'play', normal: 'inactive', large: 'inactive' },
			groups: {
				compact: { elements: {}, overrides: {} },
				normal: {
					elements: {
						name: { row: 1, group: 1, order: 1 },
						fields: { row: 2, group: 1, order: 1 },
						start: { row: 2, group: 2, order: 1 }
					},
					overrides: {}
				},
				large: { elements: {}, overrides: {} }
			},
			rowColumns: { normal: { 1: 1, 2: 2 } },
			rowVisibility: { normal: {
				1: { states: ['inactive'], startForm: true },
				2: { states: [], startForm: true }
			} }
		};
		const scheme = {
			id: 'scheme-a',
			name: 'Scheme A',
			colors: { icon: 'red', name: 'green', start: 'orange', inactive: 'none' }
		};
		const { scope } = await loadWidget('timer', {
			designStyle: { id: 'design-a' },
			colorScheme: { data: { id: 'scheme-a' } },
			layout: 'normal'
		}, {}, { version: 2, styles: [design], colorSchemes: [scheme] });
		assert.strictEqual(scope.designEnabled, true);
		assert.deepStrictEqual(Array.from(scope.designRows, row => row.id), [1, 2]);
		assert.strictEqual(scope.designRows[1].groups[1].elements.includes('start'), true);
		assert.strictEqual(scope.iconColor, 'red');
		assert.strictEqual(scope.playColor, 'blue');
		assert.strictEqual(scope.schemeElementStyle('name').color, 'var(--homey-color-green, #71d51b)');
	});

	for (const type of ['timer', 'transition']) {
		it('uses saved duration and unit when ' + type + ' settings are empty', async () => {
			const { scope } = await loadWidget(type, { defaultDuration: null, defaultDurationUnit: 'auto' }, {
				time: 5, unit: 'seconds'
			});
			assert.strictEqual(scope.startValues.time, 5);
			assert.strictEqual(scope.startValues.unit, 'seconds');
		});

		it('uses saved duration and unit for a zero ' + type + ' setting', async () => {
			for (const value of [0, '0']) {
				const { scope } = await loadWidget(type, { defaultDuration: value, defaultDurationUnit: 'hours' }, {
					time: 5, unit: 'seconds'
				});
				assert.strictEqual(scope.startValues.time, 5);
				assert.strictEqual(scope.startValues.unit, 'seconds');
			}
		});

		it('converts saved numeric strings for ' + type + ' number inputs', async () => {
			const { scope } = await loadWidget(type, { defaultDuration: 0 }, { time: '1,5', unit: 'seconds' });
			assert.strictEqual(scope.startValues.time, 1.5);
		});

		it('leaves duration empty and uses minutes without saved values for a zero ' + type + ' setting', async () => {
			const { scope } = await loadWidget(type, { defaultDuration: 0, defaultDurationUnit: 'auto' }, {});
			assert.strictEqual(scope.startValues.time, null);
			assert.strictEqual(scope.startValues.unit, 'minutes');
		});

		it('refreshes saved defaults for a zero ' + type + ' setting', async () => {
			const defaults = { time: 5, unit: 'seconds' };
			const { scope, listeners } = await loadWidget(type, { defaultDuration: 0, defaultDurationUnit: 'auto' }, defaults);
			defaults.time = 8;
			defaults.unit = 'hours';
			await listeners.chronograph_event_multi();
			assert.strictEqual(scope.startValues.time, 8);
			assert.strictEqual(scope.startValues.unit, 'hours');
		});

		it('restores saved defaults after ' + type + ' stops or finishes without resetting edits during inactivity', async () => {
			const { scope, listeners, state } = await loadWidget(type, { defaultDuration: 0 }, { time: 5, unit: 'seconds' });
			scope.startValues.time = 9;
			await listeners.chronograph_event_multi();
			assert.strictEqual(scope.startValues.time, 9);
			state.active = true;
			await listeners.chronograph_event_multi();
			state.active = false;
			await listeners.chronograph_event_multi();
			assert.strictEqual(scope.startValues.time, 5);
			state.active = true;
			await listeners.chronograph_event_multi();
			scope.startValues.time = 7;
			scope.stop();
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(scope.startValues.time, 5);
		});

		it('converts text duration to a number and uses the selected unit for ' + type, async () => {
			const { scope } = await loadWidget(type, { defaultDuration: '1,5', defaultDurationUnit: 'hours' }, {
				time: 5, unit: 'seconds'
			});
			assert.strictEqual(scope.startValues.time, 1.5);
			assert.strictEqual(scope.startValues.unit, 'hours');
		});

		it('uses a saved or fallback unit with a configured duration and automatic unit for ' + type, async () => {
			const saved = await loadWidget(type, { defaultDuration: '3', defaultDurationUnit: 'auto' }, {
				time: 5, unit: 'seconds'
			});
			assert.strictEqual(saved.scope.startValues.time, 3);
			assert.strictEqual(saved.scope.startValues.unit, 'seconds');
			const missing = await loadWidget(type, { defaultDuration: '3', defaultDurationUnit: 'auto' }, {});
			assert.strictEqual(missing.scope.startValues.time, 3);
			assert.strictEqual(missing.scope.startValues.unit, 'minutes');
		});

		it('preserves existing numeric duration settings for ' + type, async () => {
			const { scope } = await loadWidget(type, { defaultDuration: 2, defaultDurationUnit: 'days' }, {});
			assert.strictEqual(scope.startValues.time, 2);
			assert.strictEqual(scope.startValues.unit, 'days');
		});
	}

	it('uses saved transition values for null or zero settings, including saved zero values', async () => {
		const { scope } = await loadWidget('transition', {
			defaultTransitionFrom: 0,
			defaultTransitionTo: '0',
			defaultTransitionSteps: null
		}, { time: '5', unit: 'seconds', from: '0', to: '75.5', steps: '10' });
		assert.strictEqual(scope.startValues.from, 0);
		assert.strictEqual(scope.startValues.to, 75.5);
		assert.strictEqual(scope.startValues.steps, 10);
	});

	it('keeps nonzero transition settings instead of saved values', async () => {
		const { scope } = await loadWidget('transition', {
			defaultTransitionFrom: 4,
			defaultTransitionTo: 9,
			defaultTransitionSteps: 3
		}, { from: 0, to: 50, steps: 10 });
		assert.strictEqual(scope.startValues.from, 4);
		assert.strictEqual(scope.startValues.to, 9);
		assert.strictEqual(scope.startValues.steps, 3);
	});
});
