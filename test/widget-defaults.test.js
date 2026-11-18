'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const widgetScripts = ['chronograph-widget-style.js', 'chronograph-errors.js', 'chronograph-widget.js'].map(file => {
	const filename = path.join(__dirname, '..', 'assets', 'js', file);
	return new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
});

async function loadWidget(type, settings, defaults, widgetStyles, hidden = false) {
	let controller;
	const listeners = {};
	const documentListeners = {};
	const scopeListeners = {};
	const requests = [];
	const intervals = [];
	let ready = 0;
	let now;
	class Clock extends Date {
		static now() { return now === undefined ? Date.now() : now; }
	}
	let invalidInput = null;
	const state = { active: false, running: false, defaults };
	const module = { controller: (name, definition) => { controller = definition[definition.length - 1]; }, directive() {} };
	const scope = { $on(name, callback) { scopeListeners[name] = callback; }, $applyAsync(callback) { callback(); } };
	const homey = {
		getSettings: () => Object.assign({ chronograph: { id: 'test', name: 'test' } }, settings),
		__: key => key,
		ready() { ready++; },
		on: (name, callback) => { listeners[name] = callback; },
		api: (method, url) => {
			requests.push({ method, url });
			return Promise.resolve(url === '/widget-styles' ? widgetStyles : Object.assign({}, state));
		}
	};
	const context = vm.createContext({
		angular: { module: () => module, bootstrap() {} },
		document: {
			hidden,
			addEventListener: (name, callback) => { documentListeners[name] = callback; },
			removeEventListener: name => { delete documentListeners[name]; },
			body: { getAttribute: () => type },
			querySelector: () => invalidInput
		},
		window: {},
		Promise,
		Date: Clock
	});
	for (const script of widgetScripts) script.runInContext(context);
	const styleCalls = {};
	for (const name of ['elementStyle', 'elementSize', 'buttonText', 'buttonShapeStyle', 'buttonColor', 'backgroundStyle', 'valueColor', 'resolveColor']) {
		styleCalls[name] = 0;
		const original = context.window.ChronographWidgetStyle[name];
		context.window.ChronographWidgetStyle[name] = (...args) => { styleCalls[name]++; return original(...args); };
	}
	context.onHomeyReady(homey);
	const timeout = () => {};
	timeout.cancel = () => {};
	const interval = (fn, delay) => {
		const task = { fn, delay };
		intervals.push(task);
		return task;
	};
	interval.cancel = task => { if (task) task.cancelled = true; };
	controller(scope, interval, timeout);
	await new Promise(resolve => setImmediate(resolve));
	return { scope, listeners, state, requests, intervals, homey, styleCalls, documentListeners,
		get ready() { return ready; }, setNow: value => { now = value; },
		destroy: () => scopeListeners.$destroy(),
		setHidden(value) { context.document.hidden = value; if (documentListeners.visibilitychange) documentListeners.visibilitychange(); },
		setInvalidInput: input => { invalidInput = input; } };
}

describe('Widget duration defaults', () => {
	it('paints running gradients across the single frame without repeating them inside the design', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.builtInDesign('builtin:widgetkeeper');
		design.id = 'padded';
		design.widgetPadding = { large: { top: 0, right: 12, bottom: 4, left: 8 } };
		const { scope, state, listeners } = await loadWidget('timer', {
			layout: 'large', designStyle: design.id, colorTheme: 'builtin:widgetkeeper'
		}, {}, { version: 3, styles: [design], themes: [] });
		assert.strictEqual(scope.widgetFrameStyle().paddingTop, '0px');
		assert.strictEqual(scope.widgetFrameStyle().backgroundImage, undefined);
		state.active = state.running = true;
		await listeners.chronograph_event_multi();
		assert.match(scope.widgetFrameStyle().backgroundImage, /^linear-gradient/);
		assert.strictEqual(scope.designBackgroundStyle().backgroundImage, undefined);
		assert.strictEqual(scope.designBackgroundStyle().backgroundColor, 'transparent');
		state.running = false;
		await listeners.chronograph_event_multi();
		assert.strictEqual(scope.widgetFrameStyle().backgroundImage, undefined);
		assert.strictEqual(scope.widgetFrameStyle().paddingRight, '12px');
	});

	it('applies saved widget outline widths and updates their color when the chronograph pauses', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = Object.assign(runtime.currentDesign(), { id: 'outlined', borderWidths: { normal: 3 } });
		const theme = Object.assign(runtime.currentScheme(), {
			id: 'outlined-theme', borderColors: { background: 'blue' },
			borderOverrides: { paused: { background: 'red' } }
		});
		const widget = await loadWidget('timer', { designStyle: design.id, colorTheme: theme.id }, {}, {
			version: 3, styles: [design], themes: [theme]
		});
		assert.strictEqual(widget.scope.designBackgroundStyle().border, '3px solid ' + runtime.valueColor('blue'));
		Object.assign(widget.state, { active: true, running: false, duration: 1000, targetDuration: 10000 });
		await widget.listeners.chronograph_event_multi();
		assert.strictEqual(widget.scope.designBackgroundStyle().border, '3px solid ' + runtime.valueColor('red'));
	});

	it('loads appearance and state in parallel without rendering early or losing elapsed loading time', async () => {
		let resolveStyles;
		const styles = new Promise(resolve => { resolveStyles = resolve; });
		const widget = await loadWidget('timer', { designStyle: 'pending' }, {}, styles, true);
		assert.deepStrictEqual(widget.requests.map(request => request.url), ['/widget-styles', '/timer/test']);
		assert.strictEqual(widget.scope.selectedChronograph, null);
		assert.strictEqual(widget.ready, 0);
		widget.setNow(1000);
		Object.assign(widget.state, { type: 'Timer', active: true, running: true, duration: 1000, targetDuration: 10000 });
		widget.setHidden(false);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.scope.loading, true);
		assert.strictEqual(widget.scope.selectedChronograph, null);
		assert.strictEqual(widget.ready, 0);
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'pending';
		widget.setNow(6000);
		resolveStyles({ version: 3, styles: [design], themes: [] });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.scope.loading, false);
		assert.strictEqual(widget.scope.designEnabled, true);
		assert.strictEqual(widget.requests.length, 3);
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.scope.formatDuration(widget.scope.selectedChronograph), '00:00:04');
		assert.strictEqual(widget.scope.formatDuration(widget.scope.selectedChronograph, true), '00:00:06');
	});

	it('waits for appearance before reporting an overlapping state request failure', async () => {
		let resolveStyles;
		const widget = await loadWidget('timer', { designStyle: 'pending' }, {},
			new Promise(resolve => { resolveStyles = resolve; }));
		widget.homey.api = () => Promise.reject(new Error('State unavailable'));
		const refresh = widget.listeners.chronograph_event_multi();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.scope.error, null);
		assert.strictEqual(widget.ready, 0);
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'pending';
		resolveStyles({ version: 3, styles: [design], themes: [] });
		await refresh;
		assert.strictEqual(widget.scope.error, 'State unavailable');
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.scope.loading, false);
	});

	it('caches stable presentation and markers without freezing live progress or state changes', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.builtInDesign('builtin:vertical');
		design.id = 'cached-design';
		design.progressSettings.normal = { showSteps: true, direction: 'left-right' };
		design.progressSettings.large = { showSteps: true, direction: 'top-bottom' };
		const theme = runtime.currentScheme();
		theme.id = 'cached-theme';
		theme.foregroundOverrides = { running: { duration: 'green' }, paused: { duration: 'red' } };
		const widget = await loadWidget('transition', { designStyle: design.id, colorTheme: theme.id }, {}, {
			version: 3, styles: [design], themes: [theme]
		});
		Object.assign(widget.state, { type: 'Transition', active: true, running: true, duration: 1000, targetDuration: 10000, steps: 5 });
		await widget.listeners.chronograph_event_multi();
		const scope = widget.scope;
		const methods = [
			['designElementStyle', 'duration'], ['designButtonStyle', 'pause'], ['designButtonColor', 'pause'],
			['designElementSize', 'duration'], ['designButtonText', 'pause'], ['designBackgroundStyle'],
			['schemeElementStyle', 'pause'], ['designProgressBackground'], ['designProgressForeground'],
			['designProgressMarkers'], ['designProgressMarkerStyle', 50], ['getWidgetColor']
		];
		const results = methods.map(([method, argument]) => scope[method](argument));
		const calls = Object.assign({}, widget.styleCalls);
		for (let repeat = 0; repeat < 20; repeat++) {
			methods.forEach(([method, argument], index) => assert.strictEqual(scope[method](argument), results[index], method));
		}
		assert.deepStrictEqual(widget.styleCalls, calls);
		assert.strictEqual(scope.designElementStyle('duration').color, runtime.valueColor('green'));
		assert.deepStrictEqual(Array.from(scope.designProgressMarkers()), [20, 40, 60, 80]);
		const progress = scope.designProgressFillStyle().width;
		scope.clock += 1000;
		assert.notStrictEqual(scope.designProgressFillStyle().width, progress);
		widget.state.running = false;
		widget.state.steps = 3;
		await widget.listeners.chronograph_event_multi();
		assert.strictEqual(scope.designElementStyle('duration').color, runtime.valueColor('red'));
		assert.deepStrictEqual(Array.from(scope.designProgressMarkers()), [100 / 3, 200 / 3]);
		scope.layout = 'large';
		assert.deepStrictEqual(JSON.parse(JSON.stringify(scope.designProgressMarkerStyle(50))), { top: '50%' });
		for (const steps of [0, 101, 'invalid']) {
			widget.state.steps = steps;
			await widget.listeners.chronograph_event_multi();
			const markers = scope.designProgressMarkers();
			assert.deepStrictEqual(Array.from(markers), []);
			assert.strictEqual(scope.designProgressMarkers(), markers);
		}
	});

	it('suspends hidden single widgets, resynchronizes on return, and cleans up visibility listeners', async () => {
		for (const type of ['timer', 'stopwatch', 'transition']) {
			for (const hidden of [false, true]) {
				const widget = await loadWidget(type, {}, {}, undefined, hidden);
				const activeIntervals = delay => widget.intervals.filter(task => !task.cancelled && (!delay || task.delay === delay));
				assert.strictEqual(widget.scope.loading, false);
				assert.strictEqual(activeIntervals(5000).length, hidden ? 0 : 1);
				Object.assign(widget.state, { active: true, running: true, duration: 1000 });
				await widget.listeners.chronograph_event_multi();
				assert.strictEqual(activeIntervals(250).length, hidden ? 0 : 1);
				widget.setHidden(true);
				assert.strictEqual(activeIntervals().length, 0);
				const requests = widget.requests.length;
				widget.state.running = false;
				widget.state.duration = 2000;
				await widget.listeners.chronograph_event_multi();
				await widget.listeners.chronograph_flow_values_changed({ name: 'test', type });
				assert.strictEqual(widget.requests.length, requests);
				widget.scope.clock = 0;
				widget.setHidden(false);
				await new Promise(resolve => setImmediate(resolve));
				assert.strictEqual(widget.requests.length, requests + 1);
				assert.strictEqual(widget.scope.selectedChronograph.duration, 2000);
				assert.ok(widget.scope.clock > 0);
				assert.strictEqual(activeIntervals(5000).length, 1);
				assert.strictEqual(activeIntervals(250).length, 0);
				widget.setHidden(true);
				widget.state.running = true;
				widget.setHidden(false);
				await new Promise(resolve => setImmediate(resolve));
				assert.strictEqual(activeIntervals(5000).length, 1);
				assert.strictEqual(activeIntervals(250).length, 1);
				widget.destroy();
				assert.deepStrictEqual(widget.documentListeners, {});
				assert.strictEqual(activeIntervals().length, 0);
				const afterDestroy = widget.requests.length;
				widget.setHidden(true);
				widget.setHidden(false);
				await widget.listeners.chronograph_event_multi();
				assert.strictEqual(widget.requests.length, afterDestroy);
			}
		}
	});

	it('counts down timers and transitions by default and swaps both displays when reversed', async () => {
		for (const type of ['timer', 'transition', 'stopwatch']) {
			for (const reverseTime of [undefined, false, true]) {
				const { scope } = await loadWidget(type, { reverseTime, showMilliseconds: true }, {});
				const chronograph = {
					type: type[0].toUpperCase() + type.slice(1),
					duration: 1234, targetDuration: 10000, running: true, updatedAt: 1000
				};
				const countdown = type !== 'stopwatch' && !reverseTime;
				scope.clock = 3000;
				assert.strictEqual(scope.formatDuration(chronograph), countdown ? '00:00:06.766' : '00:00:03.234');
				assert.strictEqual(scope.formatDuration(chronograph, true),
					type !== 'stopwatch' && reverseTime ? '00:00:06.766' : '00:00:03.234');
				if (type !== 'stopwatch') assert.strictEqual(scope.formatTotalDuration(chronograph), '00:00:10.000');
				chronograph.running = false;
				assert.strictEqual(scope.formatDuration(chronograph), countdown ? '00:00:08.766' : '00:00:01.234');
				assert.strictEqual(scope.formatDuration(chronograph, true),
					type !== 'stopwatch' && reverseTime ? '00:00:08.766' : '00:00:01.234');
				if (type !== 'stopwatch') assert.strictEqual(scope.formatTotalDuration(chronograph), '00:00:10.000');
				chronograph.running = true;
				scope.clock = 20000;
				assert.strictEqual(scope.formatDuration(chronograph), countdown ? '00:00:00.000' : '00:00:20.234');
				assert.strictEqual(scope.formatDuration(chronograph, true),
					type !== 'stopwatch' && reverseTime ? '00:00:00.000' : '00:00:20.234');
				if (type !== 'stopwatch') assert.strictEqual(scope.formatTotalDuration(chronograph), '00:00:10.000');
			}
		}
	});

	it('formats total time with the same day and millisecond preferences as duration', async () => {
		const { scope } = await loadWidget('transition', {}, {});
		const chronograph = { targetDuration: 90061234 };
		assert.strictEqual(scope.formatTotalDuration(chronograph), '1settings.days_abbreviation 01:01:01');
		scope.showMilliseconds = true;
		assert.strictEqual(scope.formatTotalDuration(chronograph), '1settings.days_abbreviation 01:01:01.234');
	});

	it('uses per-type design icon references in single widgets, including None', async () => {
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'custom-icons';
		design.defaultIcons = { timer: 'far:clock', stopwatch: 'fab:github', transition: 'chronograph:transition' };
		const collection = { version: 3, styles: [design], themes: [] };
		for (const [type, expected] of [['timer', 'fa-regular fa-clock'], ['stopwatch', 'fa-brands fa-github'],
			['transition', 'fa-solid fa-chronograph-transition']]) {
			const widget = await loadWidget(type, { designStyle: design.id }, {}, collection);
			assert.strictEqual(widget.scope.iconClass, expected);
			assert.strictEqual(widget.scope.iconImage, '');
		}
		design.defaultIcons.timer = 'none';
		const widget = await loadWidget('timer', { designStyle: design.id }, {}, collection);
		assert.strictEqual(widget.scope.iconClass, '');
		assert.strictEqual(widget.scope.iconImage, '');
		for (const layer of widget.scope.designLayers) {
			assert.ok(layer.rows.some(row => row.groups.some(group => group.placeholders.includes('icon'))));
		}
	});

	it('preserves explicit widget icon overrides instead of replacing them with design defaults', async () => {
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'custom-icons';
		design.defaultIcons = { timer: 'far:clock' };
		const collection = { version: 3, styles: [design], themes: [] };
		const image = 'data:image/png;base64,cG5n';
		for (const [icon, expectedClass, expectedImage] of [
			[{ id: 'fas:bell' }, 'fa-solid fa-bell', ''],
			[{ id: 'none' }, '', ''],
			[{ id: 'fab:github', image }, '', image],
			['stopwatch', 'fa-solid fa-stopwatch', ''],
			['none', '', ''],
			['', '', '']
		]) {
			const widget = await loadWidget('timer', { designStyle: design.id, icon }, {}, collection);
			assert.strictEqual(widget.scope.iconClass, expectedClass);
			assert.strictEqual(widget.scope.iconImage, expectedImage);
		}
	});

	it('reserves icon space when None is selected, including measurement layers', async () => {
		const widget = await loadWidget('timer', { icon: { id: 'none' } }, {});
		assert.strictEqual(widget.scope.iconClass, '');
		assert.strictEqual(widget.scope.iconImage, '');
		for (const layer of widget.scope.designLayers) {
			assert.ok(layer.rows.some(row => row.groups.some(group => group.placeholders.includes('icon'))));
		}
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'no-icon-reservation';
		design.reservedElements.normal.icon = false;
		const collapsed = await loadWidget('timer', {
			icon: { id: 'none' }, layout: 'normal', designStyle: { id: design.id }
		}, {}, { version: 2, styles: [design] });
		for (const layer of collapsed.scope.designLayers) {
			assert.ok(!layer.rows.some(row => row.groups.some(group => group.renderElements.includes('icon'))));
		}
	});

	it('updates the display clock only while the selected chronograph is running', async () => {
		const widget = await loadWidget('timer', {}, {});
		const activeClocks = () => widget.intervals.filter(interval => interval.delay === 250 && !interval.cancelled);
		assert.strictEqual(activeClocks().length, 0);
		widget.state.active = true;
		widget.state.running = true;
		await widget.listeners.chronograph_event({ name: 'test', data: { type: 'Timer' } });
		assert.strictEqual(activeClocks().length, 1);
		widget.state.running = false;
		await widget.listeners.chronograph_event({ name: 'test', data: { type: 'Timer' } });
		assert.strictEqual(activeClocks().length, 0);
	});

	it('localizes known operation errors and preserves unknown errors', async () => {
		const widget = await loadWidget('timer', {}, {});
		for (const [message, expected] of [
			['A duration is required', 'settings.error_duration_required'],
			['Chronograph not found in app configuration', 'settings.error_not_configured'],
			['Chronograph is not active', 'settings.error_not_active'],
			['Chronograph is already active', 'settings.error_already_active'],
			['Chronograph name conflicts with an active instance', 'settings.error_name_conflict'],
			['Invalid transition steps', 'invalid_transition settings.widget_steps'],
			['Unexpected external failure', 'Unexpected external failure']
		]) {
			widget.homey.api = () => Promise.reject(new Error(message));
			widget.scope.start();
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(widget.scope.error, expected);
		}
	});

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

	it('ignores realtime updates for other chronographs and types', async () => {
		const widget = await loadWidget('timer', {}, { time: 5, unit: 'seconds' });
		const before = widget.requests.length;
		await widget.listeners.chronograph_event_multi([
			{ name: 'other', data: { type: 'Timer' } },
			{ name: 'test', data: { type: 'Transition' } }
		]);
		assert.strictEqual(widget.requests.length, before);
		await widget.listeners.chronograph_event_multi([{ name: 'test', data: { type: 'Timer' } }]);
		assert.strictEqual(widget.requests.length, before + 1);
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

	it('uses custom and default button texts independently for every size', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.currentDesign();
		design.id = 'button-text';
		design.buttonTexts = { compact: { start: '', pause: 'Hold' }, normal: { start: 'Begin' }, large: { start: null } };
		for (const [layout, start, pause] of [
			['compact', '', 'Hold'], ['normal', 'Begin', ''], ['large', 'settings.widget_start', '']
		]) {
			const widget = await loadWidget('timer', { layout, designStyle: { id: design.id } }, {}, {
				version: 2, styles: [design], colorSchemes: []
			});
			assert.strictEqual(widget.scope.designButtonText('start'), start);
			assert.strictEqual(widget.scope.designButtonText('pause'), pause);
		}
		for (const preset of ['builtin:current', ...runtime.builtInDesignDefinitions.map(item => item.id)]) {
			for (const size of ['compact', 'normal', 'large']) {
				const builtIn = runtime.builtInDesign(preset);
				assert.strictEqual(runtime.buttonText(builtIn, size, 'start', 'Localized start'), 'Localized start');
				for (const action of ['play', 'pause', 'stop', 'cancel']) assert.strictEqual(runtime.buttonText(builtIn, size, action, 'Localized start'), '');
			}
		}
		assert.strictEqual(runtime.buttonText({}, 'normal', 'start', 'Localized start'), 'Localized start');
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
					layout, designStyle: { id: 'builtin:current' }, colorTheme: { id: 'builtin:current' }
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
		const { scope, requests } = await loadWidget('timer', { colorTheme: { id: 'scheme-a' }, icon: { image: icon } }, {}, collection);
		assert.strictEqual(scope.designEnabled, true);
		assert.deepStrictEqual(Array.from(scope.designRows, row => row.id), [1, 2, 4]);
		assert.strictEqual(scope.iconColor, 'red');
		assert.strictEqual(scope.iconMask, 'url("' + icon + '")');
		assert.strictEqual(scope.designElementStyle('name').color, 'var(--homey-color-green, #71d51b)');
		assert.strictEqual(requests.filter(request => request.url === '/widget-styles').length, 1);
	});

	it('uses the renamed theme setting and falls back to the legacy setting only when absent', async () => {
		const collection = { version: 3, styles: [], themes: [{ id: 'legacy', colors: { icon: 'red' } }] };
		const legacy = await loadWidget('timer', { colorScheme: { id: 'legacy' } }, {}, collection);
		assert.strictEqual(legacy.scope.iconColor, 'red');
		const cleared = await loadWidget('timer', { colorTheme: null, colorScheme: { id: 'legacy' } }, {}, collection);
		assert.notStrictEqual(cleared.scope.iconColor, 'red');
	});

	it('renders built-in designs independently across types, sizes and states', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const preset of runtime.builtInDesignDefinitions) {
			for (const type of ['timer', 'stopwatch', 'transition']) {
				for (const layout of ['compact', 'normal', 'large']) {
					const widget = await loadWidget(type, { layout, designStyle: { id: preset.id }, colorTheme: { id: 'builtin:ocean' } }, {});
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
						const hasProgress = preset.id !== 'builtin:settings'
							&& (preset.id !== 'builtin:widgetkeeper' || layout === 'large');
						assert.strictEqual(elements.includes('progress'), type !== 'stopwatch' && hasProgress);
					}
				}
			}
			const widget = await loadWidget('timer', { designStyle: { id: preset.id }, colorTheme: { id: 'custom' } }, {}, {
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
			if (preset.id === 'builtin:settings') continue;
			for (const type of ['timer', 'stopwatch', 'transition']) {
				for (const layout of ['compact', 'normal', 'large']) {
					const widget = await loadWidget(type, { layout, colorTheme: { id: preset.id } }, {});
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
			const widget = await loadWidget('timer', { designStyle: { id: design.id }, colorTheme: { id: preset.id } }, {}, {
				version: 2, styles: [design], colorSchemes: []
			});
			assert.strictEqual(widget.scope.iconColor, preset.accent);
			assert.strictEqual(widget.requests.filter(request => request.url === '/widget-styles').length, 1);
		}
	});

	it('applies the Settings preset buttons in widgets without loading saved styles', async () => {
		for (const type of ['timer', 'stopwatch', 'transition']) {
			for (const layout of ['compact', 'normal', 'large']) {
				const widget = await loadWidget(type, { layout, designStyle: { id: 'builtin:settings' }, colorTheme: { id: 'builtin:settings' } }, {});
				assert.strictEqual(widget.scope.designEnabled, true);
				const button = widget.scope.designButtonStyle('pause');
				assert.strictEqual(button.borderRadius, '4px');
				assert.strictEqual(button.backgroundColor, 'transparent');
				assert.strictEqual(button.border, '1px solid var(--homey-color-mono-500, #9a9ca6)');
				assert.ok(!widget.requests.some(request => request.url === '/widget-styles'));
			}
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
			function assertMeasurementCoverage() {
				const signature = (state, layout) => state + ':' + JSON.stringify(layout);
				const actual = Array.from(scope.designLayers, layer => signature(layer.state, {
					rows: layer.rows, spanning: layer.spanning, tracks: layer.tracks, rowTracks: layer.rowTracks
				}));
				const expected = [signature(scope.designState, runtime.layoutSpanningRows(scope.designRows))];
				const states = mode === 'auto' ? [] : mode === 'minimum'
					? ['inactive', 'paused', 'running', 'starting'] : ['inactive', 'paused', 'running'];
				for (const scenario of states) {
					const showForm = scenario === 'inactive' || scenario === 'starting';
					const scenarioState = scenario === 'inactive' ? 'starting' : scenario;
					expected.push(signature(scenarioState, runtime.layoutSpanningRows(runtime.buildRows(
						design, 'normal', scenarioState, 'transition', showForm, mode === 'minimum-without-inputs', true))));
				}
				assert.deepStrictEqual([...new Set(actual)].sort(), [...new Set(expected)].sort());
				assert.strictEqual(actual.length, new Set(actual).size, 'Duplicate measurement layout');
				assert.ok(scope.designLayers.slice(1).every(layer => layer.measure));
			}
			assertMeasurementCoverage();
			state.active = true;
			state.running = true;
			await listeners.chronograph_event_multi();
			assert.strictEqual(scope.designLayers[0].state, 'running');
			assertMeasurementCoverage();
		}
	});

	it('uses built-in height modes for each size', async () => {
		for (const layout of ['compact', 'normal', 'large']) {
			const { scope } = await loadWidget('timer', { layout }, {});
			assert.strictEqual(scope.designLayers.length, 3, layout);
		}
	});

	it('includes start fields in the normal and large minimum heights of Small and Tiny', async () => {
		for (const id of ['builtin:small', 'builtin:tiny']) {
			for (const type of ['timer', 'transition']) {
				for (const layout of ['compact', 'normal', 'large']) {
					const { scope, state, listeners } = await loadWidget(type, { layout, designStyle: { id } }, {});
					for (const active of [false, true]) {
						if (active) {
							state.active = true;
							state.running = true;
							await listeners.chronograph_event_multi();
						}
						const layers = scope.designLayers;
						const hasFields = layers.some(layer => layer.rows.some(row =>
							row.groups.some(group => group.elements.includes('fields'))));
						assert.strictEqual(hasFields, layout !== 'compact', `${id} ${type} ${layout} active=${active}`);
					}
				}
			}
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
		for (const [settings, expected] of [
			[{ designStyle: { id: 'missing' } }, 'settings.widget_design_unavailable'],
			[{ colorTheme: { id: 'missing' } }, 'settings.widget_scheme_unavailable']
		]) {
			const { scope } = await loadWidget('timer', settings, {}, { version: 2, styles: [], colorSchemes: [] });
			assert.strictEqual(scope.error, expected);
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
		for (const collection of [
			{ version: 2, styles: [design], colorSchemes: [scheme] },
			{ version: 3, styles: [design], themes: [scheme] }
		]) {
			const { scope } = await loadWidget('timer', {
				designStyle: { id: 'design-a' },
				colorTheme: { data: { id: 'scheme-a' } },
				layout: 'normal'
			}, {}, collection);
			assert.strictEqual(scope.designEnabled, true);
			assert.deepStrictEqual(Array.from(scope.designRows, row => row.id), [1, 2]);
			assert.strictEqual(scope.designRows[1].groups[1].elements.includes('start'), true);
			assert.strictEqual(scope.iconColor, 'red');
			assert.strictEqual(scope.playColor, 'blue');
			assert.strictEqual(scope.schemeElementStyle('name').color, 'var(--homey-color-green, #71d51b)');
		}
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
