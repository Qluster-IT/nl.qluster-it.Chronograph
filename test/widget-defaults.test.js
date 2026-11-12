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
	const requests = [];
	let invalidInput = null;
	const state = { active: false, running: false, defaults };
	const module = { controller: (name, definition) => { controller = definition[definition.length - 1]; } };
	const scope = { $on() {}, $applyAsync(callback) { callback(); } };
	const homey = {
		getSettings: () => Object.assign({ chronograph: { id: 'test', name: 'test' } }, settings),
		__: key => key,
		ready() {},
		on: (name, callback) => { listeners[name] = callback; },
		api: (method, url) => {
			requests.push({ method, url });
			return Promise.resolve(url === '/widget-styles' ? widgetStyles : Object.assign({}, state));
		}
	};
	const context = {
		angular: { module: () => module, bootstrap() {} },
		document: {
			body: { getAttribute: () => type },
			querySelector: () => invalidInput
		},
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
	return { scope, listeners, state, requests, setInvalidInput: input => { invalidInput = input; } };
}

describe('Widget duration defaults', () => {
	it('refreshes for changed Flow values of the selected chronograph only', async () => {
		const widget = await loadWidget('timer', {}, { time: 5, unit: 'seconds' });
		const initialRequests = widget.requests.length;
		widget.state.defaults = { time: 20, unit: 'seconds' };
		await widget.listeners.chronograph_flow_values_changed({ type: 'Timer', name: 'other' });
		await widget.listeners.chronograph_flow_values_changed({ type: 'Transition', name: 'test' });
		await widget.listeners.chronograph_flow_values_changed({ name: 'test' });
		assert.strictEqual(widget.requests.length, initialRequests);
		await widget.listeners.chronograph_flow_values_changed({ type: 'Timer', name: 'test' });
		assert.strictEqual(widget.requests.length, initialRequests + 1);
		assert.strictEqual(widget.scope.selectedChronograph.defaults.time, 20);
	});

	it('requests the selected chronograph using its encoded name', async () => {
		const widget = await loadWidget('timer', {
			chronograph: { id: 'legacy-id', name: 'Kitchen / lamp' }
		}, {}, { version: 2, styles: [], colorSchemes: [] });
		assert.ok(widget.requests.some(request => request.method === 'GET'
			&& request.url === '/timer/Kitchen%20%2F%20lamp'));
	});

	it('uses the shared spanning layout in actual and measured widget layers', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.currentDesign();
		design.id = 'spanning';
		design.groups.normal.elements.progress = { row: 1, group: 2, order: 1 };
		design.rowColumns.normal[1] = 2;
		design.columnSpans.normal[1] = [3, 1];
		design.columnRowSpans = { normal: { 1: [1, 5] } };
		for (const type of ['timer', 'transition', 'stopwatch']) {
			const widget = await loadWidget(type, { layout: 'normal', designStyle: { id: design.id } }, {}, {
				version: 2, styles: [design], colorSchemes: []
			});
			widget.state.active = true;
			widget.state.running = true;
			await widget.listeners.chronograph_event_multi();
			assert.strictEqual(widget.scope.designLayers[0].spanning, type !== 'stopwatch');
			assert.ok(widget.scope.designLayers.some(layer => layer.measure));
			for (const layer of widget.scope.designLayers.filter(layer => layer.spanning)) {
				assert.ok(layer.tracks);
				const progress = layer.rows.flatMap(row => row.groups).find(group => group.elements.includes('progress'));
				assert.ok(progress.gridColumn && progress.gridRow);
			}
		}
	});

	it('uses per-size field row overrides in timer and transition widgets', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.currentDesign();
		design.id = 'field-rows';
		design.inputFieldRows = { compact: { timer: 2, transition: 3 }, large: { transition: 1 } };
		for (const type of ['timer', 'transition']) {
			for (const layout of ['compact', 'normal', 'large']) {
				const widget = await loadWidget(type, { layout, designStyle: { id: design.id } }, {}, {
					version: 2, styles: [design], colorSchemes: []
				});
				const actual = widget.scope.designFieldLayout();
				const expected = runtime.inputFieldLayout(design, layout, type);
				assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
			}
		}
	});

	it('resolves design sizes independently and preserves legacy defaults', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		assert.strictEqual(runtime.defaultElementSize('compact', 'duration'), 14);
		assert.strictEqual(runtime.defaultElementSize('normal', 'duration'), 20);
		assert.strictEqual(runtime.defaultElementSize('large', 'duration'), 32);
		for (const layout of ['compact', 'normal', 'large']) {
			const widget = await loadWidget('timer', { layout }, {});
			for (const element of ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop', 'fields', 'cancel', 'start', 'progress']) {
				assert.strictEqual(widget.scope.designElementSize(element), runtime.elementSize(null, layout, element), layout + ' ' + element);
			}
			assert.strictEqual(widget.scope.designAllowShrink(), true);
		}
		const design = runtime.currentDesign();
		design.id = 'sizes';
		design.elementSizes = {
			base: { icon: 25 },
			overrides: { compact: {}, normal: {}, large: { icon: 38 } }
		};
		design.allowShrink = false;
		for (const [layout, size] of [['compact', 25], ['normal', 25], ['large', 38]]) {
			const widget = await loadWidget('timer', { layout, designStyle: { id: design.id } }, {}, { version: 2, styles: [design] });
			assert.strictEqual(widget.scope.designElementSize('icon'), size);
			assert.strictEqual(widget.scope.designAllowShrink(), false);
		}
		design.elementSizes = { overrides: { compact: { icon: 21 }, normal: {}, large: { icon: 38 } } };
		for (const [layout, size] of [['compact', 21], ['normal', 16], ['large', 38]]) {
			const widget = await loadWidget('timer', { layout, designStyle: { id: design.id } }, {}, { version: 2, styles: [design] });
			assert.strictEqual(widget.scope.designElementSize('icon'), size);
		}
	});

	it('shows markers for the active transition steps in each default layout', async () => {
		for (const layout of ['compact', 'normal', 'large']) {
			const widget = await loadWidget('transition', { layout }, { steps: 12 });
			assert.deepStrictEqual(Array.from(widget.scope.designProgressMarkers()), []);
			widget.state.active = true;
			widget.state.running = true;
			widget.state.steps = 4;
			await widget.listeners.chronograph_event_multi();
			assert.deepStrictEqual(Array.from(widget.scope.designProgressMarkers()), [25, 50, 75], layout);
			widget.state.running = false;
			widget.state.steps = 2;
			await widget.listeners.chronograph_event_multi();
			assert.deepStrictEqual(Array.from(widget.scope.designProgressMarkers()), [50], layout);
			widget.state.steps = 101;
			await widget.listeners.chronograph_event_multi();
			assert.deepStrictEqual(Array.from(widget.scope.designProgressMarkers()), [], layout);
		}
	});

	it('uses the built-in design and scheme for empty settings across widget types and layouts', async () => {
		for (const type of ['timer', 'stopwatch', 'transition']) {
			for (const layout of ['compact', 'normal', 'large']) {
				const empty = await loadWidget(type, { layout, iconColor: 'red' }, {});
				const explicit = await loadWidget(type, {
					layout, designStyle: { id: 'builtin:current' }, colorScheme: { id: 'builtin:current' }
				}, {});
				assert.strictEqual(empty.scope.designEnabled, true, type + ' ' + layout);
				assert.deepStrictEqual(JSON.parse(JSON.stringify(empty.scope.designRows)), JSON.parse(JSON.stringify(explicit.scope.designRows)));
				assert.strictEqual(empty.scope.iconColor, 'blue');
				assert.ok(!empty.requests.some(request => request.url === '/widget-styles'));
				empty.state.active = true;
				empty.state.running = true;
				await empty.listeners.chronograph_event_multi();
				assert.strictEqual(empty.scope.designState, 'running');
				assert.strictEqual(empty.scope.designElementStyle('duration').color, 'var(--homey-color-blue, #2f8df6)');
				assert.strictEqual(empty.scope.designRows.some(row => row.groups.some(group => group.elements.includes('pause'))), true);
				assert.strictEqual(empty.scope.designRows.some(row => row.groups.some(group => group.elements.includes('progress'))), type !== 'stopwatch');
			}
		}
	});

	it('uses the default design and selected scheme independently', async () => {
		const collection = { version: 2, styles: [], colorSchemes: [{ id: 'scheme-a', colors: { icon: 'red', name: 'green' } }] };
		const icon = 'data:image/svg+xml;base64,PHN2Zy8+';
		const { scope, requests } = await loadWidget('timer', { colorScheme: { id: 'scheme-a' }, icon: { image: icon } }, {}, collection);
		assert.strictEqual(scope.designEnabled, true);
		assert.deepStrictEqual(Array.from(scope.designRows, row => row.id), [1, 2, 4]);
		assert.strictEqual(scope.iconColor, 'red');
		assert.strictEqual(scope.iconMask, 'url("' + icon + '")');
		assert.strictEqual(scope.designElementStyle('name').color, 'var(--homey-color-green, #71d51b)');
		assert.strictEqual(requests.filter(request => request.url === '/widget-styles').length, 1);
	});

	it('renders built-in designs independently across types, sizes and states', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const preset of runtime.builtInDesignDefinitions) {
			for (const type of ['timer', 'stopwatch', 'transition']) {
				for (const layout of ['compact', 'normal', 'large']) {
					const widget = await loadWidget(type, { layout, designStyle: { id: preset.id }, colorScheme: { id: 'builtin:ocean' } }, {});
					assert.strictEqual(widget.scope.designEnabled, true, preset.id + ' ' + type + ' ' + layout);
					assert.ok(!widget.requests.some(request => request.url === '/widget-styles'));
					assert.strictEqual(widget.scope.designElementSize('duration'), runtime.elementSize(runtime.builtInDesign(preset.id), layout, 'duration'));
					for (const running of [true, false]) {
						widget.state.active = true;
						widget.state.running = running;
						await widget.listeners.chronograph_event_multi();
						const elements = Array.from(widget.scope.designRows).flatMap(row => Array.from(row.groups).flatMap(group => Array.from(group.elements)));
						assert.ok(elements.includes('duration'), preset.id + ' ' + type + ' ' + layout);
						assert.ok(elements.includes(running ? 'pause' : 'play'));
						assert.ok(elements.includes('stop'));
						assert.strictEqual(elements.includes('progress'), type !== 'stopwatch');
					}
				}
			}
			const widget = await loadWidget('timer', { designStyle: { id: preset.id }, colorScheme: { id: 'custom' } }, {}, {
				version: 2, styles: [], colorSchemes: [{ id: 'custom', colors: { icon: 'red' } }]
			});
			assert.strictEqual(widget.scope.designEnabled, true);
			assert.strictEqual(widget.scope.iconColor, 'red');
			assert.strictEqual(widget.requests.filter(request => request.url === '/widget-styles').length, 1);
		}
	});

	it('renders built-in color schemes across widget types and sizes without loading saved styles', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const preset of runtime.builtInSchemeDefinitions) {
			for (const type of ['timer', 'stopwatch', 'transition']) {
				for (const layout of ['compact', 'normal', 'large']) {
					const widget = await loadWidget(type, { layout, colorScheme: { id: preset.id } }, {});
					assert.strictEqual(widget.scope.designEnabled, true);
					assert.strictEqual(widget.scope.iconColor, preset.accent);
					assert.strictEqual(widget.scope.designProgressForeground(), runtime.valueColor(preset.accent));
					assert.ok(!widget.requests.some(request => request.url === '/widget-styles'));
					widget.state.active = true;
					widget.state.running = true;
					await widget.listeners.chronograph_event_multi();
					assert.strictEqual(widget.scope.designElementStyle('duration').color, runtime.valueColor(preset.accent));
				}
			}
			const design = runtime.currentDesign();
			design.id = 'custom-design';
			const widget = await loadWidget('timer', { designStyle: { id: design.id }, colorScheme: { id: preset.id } }, {}, {
				version: 2, styles: [design], colorSchemes: []
			});
			assert.strictEqual(widget.scope.iconColor, preset.accent);
			assert.strictEqual(widget.requests.filter(request => request.url === '/widget-styles').length, 1);
		}
	});

	it('uses the selected design and default scheme independently', async () => {
		const design = {
			id: 'design-a',
			groups: { normal: { elements: { name: { row: 1, group: 1, order: 1 } }, overrides: {} } },
			rowColumns: { normal: { 1: 1 } }
		};
		const { scope } = await loadWidget('timer', { designStyle: { id: 'design-a' }, iconColor: 'red' }, {}, {
			version: 2, styles: [design], colorSchemes: []
		});
		assert.strictEqual(scope.designEnabled, true);
		assert.deepStrictEqual(Array.from(scope.designRows, row => row.id), [1]);
		assert.strictEqual(scope.iconColor, 'blue');
		assert.strictEqual(scope.designScheme.colors.stop, 'red');
	});

	it('builds the selected height mode measurement scenarios without changing the visible layout', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const mode of ['auto', 'minimum', 'minimum-without-inputs']) {
			const design = runtime.currentDesign();
			design.id = 'height-test';
			design.heightModes.normal = mode;
			const { scope, state, listeners } = await loadWidget('transition', {
				designStyle: { id: design.id }, layout: 'normal'
			}, {}, { version: 2, styles: [design] });
			assert.strictEqual(scope.designLayers[0].rows, scope.designRows);
			const layers = scope.designLayers.slice(1);
			assert.deepStrictEqual(Array.from(layers, layer => layer.id), mode === 'auto' ? []
				: mode === 'minimum' ? ['inactive', 'paused', 'running', 'starting'] : ['inactive', 'paused', 'running']);
			const containsFields = layer => layer.rows.some(row => row.groups.some(group => group.elements.includes('fields')));
			assert.strictEqual(layers.some(containsFields), mode === 'minimum');
			assert.ok(layers.every(layer => layer.measure));
			state.active = true;
			state.running = true;
			await listeners.chronograph_event_multi();
			assert.strictEqual(scope.designLayers[0].state, 'running');
			assert.strictEqual(scope.designLayers.length, layers.length + 1);
		}
	});

	it('uses built-in height modes for each size', async () => {
		for (const [layout, count] of [['compact', 3], ['normal', 4], ['large', 4]]) {
			const { scope } = await loadWidget('timer', { layout }, {});
			assert.strictEqual(scope.designLayers.length, count + 1, layout);
		}
	});

	it('reports invalid start fields without sending a start request', async () => {
		const widget = await loadWidget('timer', {}, {});
		let reported = false;
		widget.setInvalidInput({ reportValidity() { reported = true; } });
		widget.scope.start();
		assert.strictEqual(reported, true);
		assert.strictEqual(widget.requests.some(request => request.method === 'POST'), false);
		widget.setInvalidInput(null);
		widget.scope.start();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.some(request => request.method === 'POST'), true);
	});

	it('reports an unavailable selected design or scheme instead of treating it as Default', async () => {
		for (const settings of [{ designStyle: { id: 'missing' } }, { colorScheme: { id: 'missing' } }]) {
			const { scope } = await loadWidget('timer', settings, {}, { version: 2, styles: [], colorSchemes: [] });
			assert.match(scope.error, /selected widget (design|color scheme) is no longer available/);
		}
	});

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
