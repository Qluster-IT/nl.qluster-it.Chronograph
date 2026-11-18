'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const manifest = require('../widgets/multiple_chronographs/widget.compose.json');
const api = require('../widgets/multiple_chronographs/api.js');
const widgetScripts = ['chronograph-widget-style.js', 'chronograph-errors.js', 'chronograph-widget.js', 'multiple-chronographs-widget.js']
	.map(file => {
		const filename = path.join(root, 'assets', 'js', file);
		return new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
	});

async function loadWidget(settings, states, widgetStyles, hidden = false) {
	const controllers = {};
	const intervals = [];
	const listeners = {};
	const requests = [];
	const scopes = [];
	const documentListeners = {};
	let ready = 0;
	let failedRoute;
	const interval = (fn, delay) => { const task = { fn, delay }; intervals.push(task); return task; };
	interval.cancel = task => { if (task) task.cancelled = true; };
	const timeout = () => {};
	timeout.cancel = () => {};
	const makeScope = parent => {
		const scope = Object.create(parent || null);
		const events = {};
		scope.$on = (name, fn) => { events[name] = fn; };
		scope.$broadcast = (name, ...values) => scopes.forEach(child => {
			if (child.events[name]) child.events[name]({}, ...values);
		});
		scope.$applyAsync = fn => fn();
		scope.$evalAsync = fn => fn();
		scopes.push({ scope, events });
		return scope;
	};
	const module = { controller: (name, definition) => { controllers[name] = definition[definition.length - 1]; }, directive() {} };
	const context = vm.createContext({
		angular: { module: () => module, bootstrap() {} }, window: {}, Promise, Date, console,
		document: { hidden, body: { getAttribute: () => null }, querySelector: () => null,
			addEventListener: (name, callback) => { documentListeners[name] = callback; },
			removeEventListener: name => { delete documentListeners[name]; } }
	});
	for (const script of widgetScripts) script.runInContext(context);
	const layoutCalls = { buildRows: 0, layoutSpanningRows: 0, inputFieldLayout: 0 };
	for (const name of Object.keys(layoutCalls)) {
		const original = context.window.ChronographWidgetStyle[name];
		context.window.ChronographWidgetStyle[name] = (...args) => {
			layoutCalls[name]++;
			return original(...args);
		};
	}
	const homey = {
		getSettings: () => settings,
		__: key => key,
		ready: () => { ready++; },
		on: (name, fn) => { listeners[name] = fn; },
		api: (method, url, body) => {
			requests.push({ method, url, body: body && JSON.parse(JSON.stringify(body)) });
			if (url === failedRoute) return Promise.reject(new Error('Failed operation'));
			if (url === '/widget-styles') return widgetStyles instanceof Error ? Promise.reject(widgetStyles)
				: Promise.resolve(widgetStyles || { version: 2, styles: [], colorSchemes: [] });
			if (url === '/chronographs') return Promise.resolve(body.chronographs.map(selection => {
				const state = states[selection.type + ':' + selection.name];
				return state && failedRoute !== '/' + selection.type + '/' + encodeURIComponent(selection.name)
					? { chronograph: Object.assign({}, state) } : { error: 'Not found' };
			}));
			const match = /^\/(timer|stopwatch|transition|timers|stopwatches|transitions)\/([^/]+)(?:\/start)?$/.exec(url);
			if (!match) return Promise.reject(new Error('Unexpected route ' + url));
			const type = { timers: 'timer', stopwatches: 'stopwatch', transitions: 'transition' }[match[1]] || match[1];
			const state = states[type + ':' + decodeURIComponent(match[2])];
			if (!state) return Promise.reject(new Error('Not found'));
			if (method === 'POST') { state.active = true; state.running = true; }
			if (method === 'PUT') state.running = body.running;
			if (method === 'DELETE') { state.active = false; state.running = false; return Promise.resolve(true); }
			return Promise.resolve(Object.assign({}, state));
		}
	};
	context.onHomeyReady(homey);
	const parent = makeScope();
	controllers.MultipleChronographsController(parent, interval);
	const children = parent.entries.map(entry => {
		const scope = makeScope(parent);
		scope.widgetEntry = entry;
		const element = [{ querySelector: () => null }];
		controllers.ChronographWidgetController(scope, interval, timeout, element);
		return scope;
	});
	await new Promise(resolve => setImmediate(resolve));
	return { parent, children, listeners, requests, intervals, homey, layoutCalls, documentListeners,
		setHidden(value) { context.document.hidden = value; if (documentListeners.visibilitychange) documentListeners.visibilitychange(); },
		destroy: () => scopes.forEach(child => { if (child.events.$destroy) child.events.$destroy(); }),
		get ready() { return ready; }, failRoute: route => { failedRoute = route; } };
}

describe('Multiple Chronographs widget', () => {
	it('aggregates requested frame padding while keeping separate-card rows independent', async () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const designs = [runtime.currentDesign(), runtime.currentDesign(), runtime.currentDesign()];
		designs.forEach((design, index) => { design.id = 'padding-' + index; });
		designs[0].widgetPadding = { normal: { top: 4, right: 10, bottom: 2, left: 0 } };
		designs[1].widgetPadding = { normal: { top: 8, right: 0, bottom: 20, left: 9 } };
		designs[0].borderlessFrames = designs[2].borderlessFrames = { normal: true };
		designs[1].borderWidths = { normal: 0 };
		for (const rowSeparator of ['none', 'line', 'rows', 'rows-small', 'rows-tiny', 'cards', 'cards-small', 'cards-tiny']) {
			const settings = { columns: '2', rowSeparator }, states = {};
			for (let slot = 1; slot <= 3; slot++) {
				settings['chronograph' + slot] = { type: 'timer', name: String(slot) };
				settings['chronograph' + slot + 'DesignStyle'] = designs[slot - 1].id;
				settings['chronograph' + slot + 'Layout'] = 'normal';
				states['timer:' + slot] = { name: String(slot), type: 'timer', active: false };
			}
			const { parent, children } = await loadWidget(settings, states, { version: 3, styles: designs, themes: [] });
			assert.strictEqual(parent.error, null, rowSeparator);
			assert.strictEqual(parent.framePaddingStyle.paddingTop, 'max(var(--homey-su-4, 16px), 8px)');
			const first = parent.rowStyle(parent.rows[0]), second = parent.rowStyle(parent.rows[1]);
			const rows = rowSeparator.startsWith('rows'), cards = rowSeparator.startsWith('cards');
			assert.strictEqual(first.paddingTop, rows ? '8px' : undefined);
			assert.strictEqual(first.paddingRight, rows ? '10px' : undefined);
			assert.strictEqual(first.paddingBottom, rows ? '20px' : undefined);
			assert.strictEqual(first.paddingLeft, rows ? '9px' : undefined);
			assert.strictEqual(second.paddingTop, undefined);
			assert.strictEqual(parent.framePaddingStyle.boxShadow, undefined);
			assert.strictEqual(first.boxShadow, undefined);
			assert.strictEqual(second.boxShadow, rows ? 'none' : undefined);
			const tile = parent.entryStyle(parent.entries[0], children[0].widgetFrameStyle());
			assert.strictEqual(tile['grid-column'], 'span 1');
			assert.strictEqual(tile.paddingTop, cards ? '4px' : undefined);
			assert.strictEqual(tile.paddingRight, cards ? '10px' : undefined);
			assert.strictEqual(tile.paddingLeft, cards ? '0px' : undefined);
			assert.strictEqual(tile.boxShadow, cards ? 'none' : undefined);
			const otherTile = parent.entryStyle(parent.entries[1], children[1].widgetFrameStyle());
			assert.strictEqual(otherTile.paddingTop, cards ? '8px' : undefined);
			assert.strictEqual(otherTile.boxShadow, undefined);
			parent.entries.forEach(entry => parent.multipleWidget.setPadding(entry, entry.padding, true));
			assert.strictEqual(parent.framePaddingStyle.boxShadow, 'none');
		}
	});

	it('uses per-tile design icon defaults while preserving explicit icon overrides', async () => {
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'custom-icons';
		design.defaultIcons = { timer: 'far:clock', stopwatch: 'fab:github', transition: 'none' };
		const settings = { columns: '3' };
		const states = {};
		for (let slot = 1; slot <= 6; slot++) {
			const type = ['timer', 'stopwatch', 'transition'][(slot - 1) % 3];
			settings['chronograph' + slot] = { type, name: String(slot) };
			settings['chronograph' + slot + 'DesignStyle'] = design.id;
			states[type + ':' + slot] = { name: String(slot), type, active: false };
		}
		settings.chronograph4Icon = { id: 'none' };
		settings.chronograph5Icon = 'bell';
		settings.chronograph6Icon = { id: 'chronograph:transition' };
		const widget = await loadWidget(settings, states, { version: 3, styles: [design], themes: [] });
		assert.deepStrictEqual(Array.from(widget.children, child => child.iconClass),
			['fa-regular fa-clock', 'fa-brands fa-github', '', '', 'fa-solid fa-bell', 'fa-solid fa-chronograph-transition']);
		assert.ok(widget.children.every(child => child.iconImage === ''));
		assert.strictEqual(widget.requests.filter(request => request.url === '/widget-styles').length, 1);
		assert.strictEqual(widget.requests.filter(request => request.url === '/chronographs').length, 1);
	});

	it('loads ten mixed built-in and custom tiles with one initial batch before appearance finishes', async () => {
		let resolveStyles;
		const styles = new Promise(resolve => { resolveStyles = resolve; });
		const settings = {};
		const states = {};
		for (let slot = 1; slot <= 10; slot++) {
			const type = ['timer', 'stopwatch', 'transition'][(slot - 1) % 3];
			settings['chronograph' + slot] = { type, name: String(slot) };
			if (slot % 2) settings['chronograph' + slot + 'DesignStyle'] = 'pending';
			states[type + ':' + slot] = { name: String(slot), type };
		}
		const widget = await loadWidget(settings, states, styles, true);
		assert.strictEqual(widget.ready, 0);
		assert.deepStrictEqual(widget.requests.map(request => request.url), ['/widget-styles', '/chronographs']);
		assert.strictEqual(widget.children[0].selectedChronograph, null);
		assert.ok(widget.children[1].selectedChronograph);
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'pending';
		resolveStyles({ version: 3, styles: [design], themes: [] });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.requests.length, 2);
		assert.strictEqual(widget.requests[1].url, '/chronographs');
		assert.ok(widget.children.every(child => child.designEnabled && !child.loading));
	});

	it('does not announce readiness until a newer state request waiting on appearance has completed', async () => {
		let resolveStyles;
		const widget = await loadWidget({
			chronograph1: { type: 'timer', name: 'A' }, chronograph1DesignStyle: 'pending',
			chronograph2: { type: 'timer', name: 'B' }, chronograph2DesignStyle: 'pending'
		}, { 'timer:A': { name: 'A', type: 'Timer' }, 'timer:B': { name: 'B', type: 'Timer' } },
		new Promise(resolve => { resolveStyles = resolve; }));
		let resolveNewer;
		widget.homey.api = () => new Promise(resolve => { resolveNewer = resolve; });
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' } });
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'pending';
		resolveStyles({ version: 3, styles: [design], themes: [] });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.ready, 0);
		assert.strictEqual(widget.children[0].selectedChronograph, null);
		resolveNewer({ name: 'A', type: 'Timer', active: true, running: false, duration: 5000 });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.children[0].selectedChronograph.duration, 5000);
	});

	it('does not refetch unchanged periodic snapshots while custom appearances are loading', async () => {
		let resolveStyles;
		const settings = {};
		const states = {};
		const events = [];
		for (let slot = 1; slot <= 10; slot++) {
			settings['chronograph' + slot] = { type: 'timer', name: String(slot) };
			settings['chronograph' + slot + 'DesignStyle'] = 'pending';
			states['timer:' + slot] = { name: String(slot), type: 'Timer', active: true, running: true,
				duration: 1000, targetDuration: 120000 };
			events.push({ name: String(slot), data: { type: 'Timer' }, removed: false, running: true,
				duration: 1000, targetDuration: 120000 });
		}
		const widget = await loadWidget(settings, states, new Promise(resolve => { resolveStyles = resolve; }));
		widget.listeners.chronograph_event_multi(events);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, 2);
		assert.strictEqual(widget.ready, 0);
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'pending';
		resolveStyles({ version: 3, styles: [design], themes: [] });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.requests.length, 2);
	});

	it('suspends hidden multi widgets and resumes ten tiles with one fresh batch and shared clocks', async () => {
		for (const hidden of [false, true]) {
			const settings = {};
			const states = {};
			for (let slot = 1; slot <= 10; slot++) {
				settings['chronograph' + slot] = { type: 'timer', name: String(slot) };
				states['timer:' + slot] = { name: String(slot), type: 'Timer', active: true, running: true, duration: 1000 };
			}
			const widget = await loadWidget(settings, states, undefined, hidden);
			const activeIntervals = delay => widget.intervals.filter(task => !task.cancelled && (!delay || task.delay === delay));
			assert.strictEqual(widget.ready, 1);
			assert.strictEqual(activeIntervals(250).length, hidden ? 0 : 1);
			assert.strictEqual(activeIntervals(5000).length, hidden ? 0 : 1);
			widget.setHidden(true);
			assert.strictEqual(activeIntervals().length, 0);
			const requests = widget.requests.length;
			states['timer:1'].running = false;
			states['timer:2'].duration = 5000;
			widget.listeners.chronograph_event({ name: '1', data: { type: 'Timer' } });
			widget.listeners.chronograph_event_multi();
			widget.listeners.chronograph_flow_values_changed({ name: '2', type: 'timer' });
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(widget.requests.length, requests);
			widget.children[1].clock = 0;
			widget.setHidden(false);
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(widget.requests.length, requests + 1);
			assert.strictEqual(widget.requests[requests].url, '/chronographs');
			assert.strictEqual(widget.children[0].selectedChronograph.running, false);
			assert.strictEqual(widget.children[1].selectedChronograph.duration, 5000);
			assert.ok(widget.children[1].clock > 0);
			assert.strictEqual(activeIntervals(250).length, 1);
			assert.strictEqual(activeIntervals(5000).length, 1);
			widget.setHidden(true);
			for (const state of Object.values(states)) state.running = false;
			widget.failRoute('/timer/3');
			widget.setHidden(false);
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(widget.children[2].error, 'Not found');
			assert.strictEqual(widget.children[1].error, null);
			widget.destroy();
			assert.deepStrictEqual(widget.documentListeners, {});
			assert.strictEqual(activeIntervals().length, 0);
			const afterDestroy = widget.requests.length;
			widget.setHidden(true);
			widget.setHidden(false);
			widget.listeners.chronograph_event_multi();
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(widget.requests.length, afterDestroy);
		}
	});

	it('does not reuse or apply a pre-hide batch when the dashboard becomes visible', async () => {
		const widget = await loadWidget({ chronograph1: { type: 'timer', name: 'A' } }, {
			'timer:A': { name: 'A', type: 'Timer', active: true, running: true }
		});
		let resolveOld;
		let batches = 0;
		widget.homey.api = () => {
			batches++;
			return batches === 1 ? new Promise(resolve => { resolveOld = resolve; })
				: Promise.resolve([{ chronograph: { name: 'A', type: 'Timer', active: true, running: false } }]);
		};
		widget.intervals.find(task => task.delay === 5000).fn();
		widget.setHidden(true);
		widget.setHidden(false);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(batches, 2);
		assert.strictEqual(widget.children[0].selectedChronograph.running, false);
		resolveOld([{ chronograph: { name: 'A', type: 'Timer', active: true, running: true } }]);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].selectedChronograph.running, false);
		assert.strictEqual(widget.intervals.filter(task => task.delay === 250 && !task.cancelled).length, 0);
	});

	it('shares custom appearance loading across ten tiles and reports shared failures per tile', async () => {
		const design = require('../assets/js/chronograph-widget-style.js').currentDesign();
		design.id = 'custom';
		const settings = {};
		const states = {};
		const originalDesign = JSON.stringify(design);
		for (let slot = 1; slot <= 10; slot++) {
			const type = ['timer', 'stopwatch', 'transition'][(slot - 1) % 3];
			settings['chronograph' + slot] = { type, name: String(slot) };
			settings['chronograph' + slot + 'Layout'] = ['compact', 'normal', 'large'][(slot - 1) % 3];
			settings['chronograph' + slot + 'DesignStyle'] = 'custom';
			states[type + ':' + slot] = { name: String(slot), type: type[0].toUpperCase() + type.slice(1), active: false };
		}
		for (const collection of [{ version: 3, styles: [design], themes: [] }, new Error('Styles unavailable')]) {
			const widget = await loadWidget(settings, states, collection);
			assert.strictEqual(widget.requests.filter(request => request.url === '/widget-styles').length, 1);
			assert.strictEqual(widget.ready, 1);
			for (const child of widget.children) {
				assert.strictEqual(child.error, collection instanceof Error ? 'Styles unavailable' : null);
				assert.strictEqual(child.designEnabled, !(collection instanceof Error));
			}
			assert.strictEqual(JSON.stringify(design), originalDesign);
		}
	});

	it('reuses unchanged layouts and field geometry on repeated ten-tile refreshes', async () => {
		const settings = {};
		const states = {};
		for (let slot = 1; slot <= 10; slot++) {
			settings['chronograph' + slot] = { type: 'transition', name: String(slot) };
			states['transition:' + slot] = { name: String(slot), type: 'Transition', active: true, running: true };
		}
		const widget = await loadWidget(settings, states);
		const layers = widget.children.map(child => child.designLayers);
		const builds = widget.layoutCalls.buildRows;
		const spanningLayouts = widget.layoutCalls.layoutSpanningRows;
		const poll = widget.intervals.find(interval => interval.delay === 5000);
		for (let index = 0; index < 3; index++) {
			poll.fn();
			await new Promise(resolve => setImmediate(resolve));
		}
		assert.strictEqual(widget.layoutCalls.buildRows, builds);
		assert.strictEqual(widget.layoutCalls.layoutSpanningRows, spanningLayouts);
		widget.children.forEach((child, index) => {
			assert.strictEqual(child.designLayers, layers[index]);
			const fields = child.designFieldLayout();
			for (let repeat = 0; repeat < 20; repeat++) assert.strictEqual(child.designFieldLayout(), fields);
		});
		assert.strictEqual(widget.layoutCalls.inputFieldLayout, 10);
		states['transition:1'].running = false;
		poll.fn();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].designState, 'paused');
		assert.notStrictEqual(widget.children[0].designLayers, layers[0]);
		states['transition:1'].running = true;
		poll.fn();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].designLayers, layers[0]);
	});

	it('defaults to transition remaining duration with live updates and clamping', async () => {
		const widget = await loadWidget({ chronograph1: { type: 'transition', name: 'A' } }, {
			'transition:A': { name: 'A', type: 'Transition', active: true, running: false, duration: 1234, targetDuration: 10000 }
		});
		const scope = widget.children[0];
		const transition = { type: 'Transition', duration: 1234, targetDuration: 10000, running: true, updatedAt: 1000 };
		scope.clock = 3000;
		assert.strictEqual(scope.formatDuration(transition), '00:00:06');
		assert.strictEqual(scope.formatDuration(transition, true), '00:00:03');
		scope.showMilliseconds = true;
		assert.strictEqual(scope.formatDuration(transition), '00:00:06.766');
		assert.strictEqual(scope.formatDuration(transition, true), '00:00:03.234');
		transition.running = false;
		assert.strictEqual(scope.formatDuration(transition), '00:00:08.766');
		transition.running = true;
		scope.clock = 20000;
		assert.strictEqual(scope.formatDuration(transition), '00:00:00.000');
		assert.strictEqual(scope.formatDuration({ type: 'Timer', duration: 1000, targetDuration: 5000 }), '00:00:04.000');
		assert.strictEqual(scope.formatDuration({ type: 'Stopwatch', duration: 1000 }), '00:00:01.000');
	});

	it('reverses time independently per tile without affecting stopwatches', async () => {
		const settings = {};
		const states = {};
		const cases = [['timer', false], ['timer', true], ['transition', false], ['transition', true], ['stopwatch', true]];
		cases.forEach(([type, reverseTime], index) => {
			const name = String(index);
			settings['chronograph' + (index + 1)] = { type, name };
			settings['chronograph' + (index + 1) + 'ReverseTime'] = reverseTime;
			states[type + ':' + name] = {
				name, type: type[0].toUpperCase() + type.slice(1),
				active: true, running: false, duration: 3000, targetDuration: 10000
			};
		});
		const widget = await loadWidget(settings, states);
		cases.forEach(([type, reverseTime], index) => {
			const scope = widget.children[index];
			assert.strictEqual(scope.formatDuration(scope.selectedChronograph),
				type !== 'stopwatch' && !reverseTime ? '00:00:07' : '00:00:03');
			assert.strictEqual(scope.formatDuration(scope.selectedChronograph, true),
				type !== 'stopwatch' && reverseTime ? '00:00:07' : '00:00:03');
		});
	});

	it('uses each renamed theme setting and supports existing legacy selections', async () => {
		const states = { 'timer:A': { name: 'A', active: false } };
		const selection = { type: 'timer', name: 'A' };
		const legacy = { id: 'builtin:ocean' };
		const theme = { id: 'builtin:forest' };
		for (const [settings, expected] of [
			[{ chronograph1ColorScheme: legacy }, legacy],
			[{ chronograph1ColorScheme: legacy, chronograph1ColorTheme: theme }, theme],
			[{ chronograph1ColorScheme: legacy, chronograph1ColorTheme: null }, null]
		]) {
			const widget = await loadWidget({ chronograph1: selection, ...settings }, states);
			assert.strictEqual(widget.parent.entries[0].settings.colorTheme, expected);
		}
	});

	it('chooses Compact for partial-width entries only when the layout is automatic', async () => {
		const states = { 'timer:A': { name: 'A', active: false } };
		for (const [columns, span, expected] of [
			['1', '1', 'normal'], ['1', '3', 'normal'],
			['2', '1', 'compact'], ['2', '2', 'normal'], ['2', '3', 'normal'],
			['3', '1', 'compact'], ['3', '2', 'compact'], ['3', '3', 'normal']
		]) {
			for (const layout of [undefined, null, '', 'auto']) {
				const widget = await loadWidget({ columns, chronograph1: { type: 'timer', name: 'A' },
					chronograph1ColumnSpan: span, chronograph1Layout: layout }, states);
				assert.strictEqual(widget.children[0].layout, expected);
			}
			for (const layout of ['compact', 'normal', 'large']) {
				const widget = await loadWidget({ columns, chronograph1: { type: 'timer', name: 'A' },
					chronograph1ColumnSpan: span, chronograph1Layout: layout }, states);
				assert.strictEqual(widget.children[0].layout, layout);
			}
		}
	});

	it('uses one column and hides milliseconds when entry settings are unset', async () => {
		for (const span of [undefined, null, '']) {
			const widget = await loadWidget({ columns: '3', chronograph1: { type: 'timer', name: 'A' },
				chronograph1ColumnSpan: span, chronograph1ShowMilliseconds: null }, {
				'timer:A': { name: 'A', active: false }
			});
			assert.strictEqual(widget.parent.entries[0].span, 1);
			assert.strictEqual(widget.children[0].layout, 'compact');
			assert.strictEqual(widget.children[0].showMilliseconds, false);
			assert.strictEqual(widget.parent.error, null);
		}
	});

	it('chooses defaults from each effective span without overriding explicit designs', async () => {
		const states = { 'timer:A': { name: 'A', active: false } };
		for (const [columns, span, expected] of [
			['1', '1', null], ['1', '2', null], ['1', '3', null],
			['2', '1', 'builtin:small'], ['2', '2', null], ['2', '3', null],
			['3', '1', 'builtin:tiny'], ['3', '2', 'builtin:small'], ['3', '3', null]
		]) {
			for (const selection of [undefined, null, '', {}, { id: '' }]) {
				const widget = await loadWidget({ columns, chronograph1: { type: 'timer', name: 'A' },
					chronograph1ColumnSpan: span, chronograph1DesignStyle: selection }, states);
				const actual = widget.parent.entries[0].settings.designStyle;
				assert.strictEqual(actual, expected === null ? selection : expected);
				assert.strictEqual(widget.parent.entries[0].span, Math.min(Number(columns), Number(span)));
			}
			for (const selection of ['builtin:current', 'builtin:tiny', { id: 'builtin:current' }, { data: { id: 'custom' } }]) {
				const widget = await loadWidget({ columns, chronograph1: { type: 'timer', name: 'A' },
					chronograph1ColumnSpan: span, chronograph1DesignStyle: selection }, states);
				assert.strictEqual(widget.parent.entries[0].settings.designStyle, selection);
			}
		}
	});

	it('uses Tiny, Small and Default independently in a three-column widget', async () => {
		const widget = await loadWidget({
			columns: '3',
			chronograph1: { type: 'timer', name: 'A' }, chronograph1ColumnSpan: '1',
			chronograph2: { type: 'timer', name: 'B' }, chronograph2ColumnSpan: '2',
			chronograph3: { type: 'timer', name: 'C' }, chronograph3ColumnSpan: '3'
		}, {
			'timer:A': { name: 'A', type: 'Timer', active: true, running: true },
			'timer:B': { name: 'B', type: 'Timer', active: true, running: true },
			'timer:C': { name: 'C', type: 'Timer', active: true, running: true }
		});
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const [index, id] of ['builtin:tiny', 'builtin:small', 'builtin:current'].entries()) {
			const rows = runtime.buildRows(runtime.builtInDesign(id), 'normal', 'running', 'timer', false);
			assert.deepStrictEqual(JSON.parse(JSON.stringify(widget.children[index].designRows)), rows);
		}
	});

	it('renders the selected narrow default and opens and cancels its compact start form', async () => {
		for (const [columns, expectedDurationRow] of [['2', 2], ['3', 3]]) {
			const state = { name: 'A', type: 'Timer', active: false, defaults: { time: 5, unit: 'minutes' } };
			const widget = await loadWidget({ columns, chronograph1: { type: 'timer', name: 'A' },
				chronograph1Layout: 'compact' }, { 'timer:A': state });
			const child = widget.children[0];
			assert.ok(child.designRows.some(row => row.groups.some(group => group.elements.includes('play'))));
			child.beginStart();
			assert.ok(child.designRows.some(row => row.groups.some(group => group.elements.includes('fields'))));
			assert.ok(child.designRows.some(row => row.groups.some(group => group.elements.includes('cancel'))));
			child.cancelStart();
			assert.ok(!child.designRows.some(row => row.groups.some(group => group.elements.includes('fields'))));
			state.active = true;
			state.running = true;
			widget.listeners.chronograph_event_multi();
			await new Promise(resolve => setImmediate(resolve));
			assert.ok(child.designRows.find(row => row.id === expectedDurationRow)
				.groups.some(group => group.elements.includes('duration')));
			assert.ok(child.designRows.some(row => row.groups.some(group => group.elements.includes('pause'))));
		}
	});

	it('defines ten independently configured slots and only the required scoped routes', () => {
		const { id, ...generated } = require('../app.json').widgets.multiple_chronographs;
		if (id !== undefined) assert.strictEqual(id, 'multiple_chronographs');
		assert.deepStrictEqual(generated, manifest);
		assert.strictEqual(manifest.transparent, true);
		assert.strictEqual(manifest.settings.length, 93);
		assert.deepStrictEqual(manifest.settings[0].values.map(value => value.id), ['1', '2', '3']);
		assert.deepStrictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').values.map(value => value.id),
			['none', 'rows', 'rows-small', 'rows-tiny', 'cards', 'cards-small', 'cards-tiny', 'line']);
		assert.strictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').value, 'none');
		for (let slot = 1; slot <= 10; slot++) {
			for (const suffix of ['', 'ColumnSpan', 'AlternativeName', 'DesignStyle', 'ColorTheme', 'Layout', 'Icon', 'ShowMilliseconds', 'ReverseTime']) {
				const setting = manifest.settings.find(item => item.id === 'chronograph' + slot + suffix);
				assert.ok(setting);
				if (suffix === 'ReverseTime') {
					assert.strictEqual(setting.type, 'checkbox');
					assert.strictEqual(setting.value, false);
				} else {
					assert.ok(!Object.prototype.hasOwnProperty.call(setting, 'value'));
				}
				if (suffix) {
					for (const title of Object.values(setting.title)) {
						assert.match(title, /^\u00a0{3}(?!\d+ · ).+/);
					}
				}
			}
			const layout = manifest.settings.find(item => item.id === 'chronograph' + slot + 'Layout');
			assert.deepStrictEqual(layout.values.map(value => value.id), ['auto', 'compact', 'normal', 'large']);
			for (const language of Object.keys(layout.title)) {
				const locale = require('../.homeycompose/locales/' + language + '.settings.json');
				assert.strictEqual(layout.values[0].title[language], locale.widget_layout_automatic);
			}
		}
		assert.ok(!manifest.settings.some(setting => /defaultDuration|defaultTransition/i.test(setting.id)));
		assert.deepStrictEqual(Object.keys(api).sort(), Object.keys(manifest.api).sort());
		for (const type of ['Timer', 'Stopwatch', 'Transition']) {
			assert.strictEqual(typeof api['get' + type], 'function');
			assert.strictEqual(typeof api['start' + type], 'function');
			assert.strictEqual(typeof api['put' + type], 'function');
			assert.strictEqual(typeof api['delete' + type], 'function');
		}
	});

	it('wraps selected slots into rows without changing their order or spans', async () => {
		const widget = await loadWidget({
			columns: '3',
			chronograph1: { type: 'timer', name: 'A' }, chronograph1ColumnSpan: '2',
			chronograph3: { type: 'stopwatch', name: 'B' }, chronograph3ColumnSpan: '2',
			chronograph4: { type: 'timer', name: 'C' },
			chronograph10: { type: 'transition', name: 'D' }, chronograph10ColumnSpan: '3'
		}, {
			'timer:A': { name: 'A', active: false },
			'stopwatch:B': { name: 'B', active: false },
			'timer:C': { name: 'C', active: false },
			'transition:D': { name: 'D', active: false }
		});
		assert.deepStrictEqual(Array.from(widget.parent.rows, row => Array.from(row, entry => [entry.slot, entry.span])),
			[[[1, 2]], [[3, 2], [4, 1]], [[10, 3]]]);
		assert.strictEqual(widget.parent.rowSeparator, 'none');
		assert.strictEqual(widget.parent.rowSeparatorColor, 'currentColor');
	});

	it('keeps a rounded, shadowed outer card while preserving transparent gaps for card separation', () => {
		const html = fs.readFileSync(path.join(root, 'widgets', 'multiple_chronographs', 'public', 'index.html'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'assets', 'css', 'multiple-chronographs-widget.css'), 'utf8');
		assert.match(html, /<body[^>]*ng-attr-data-separator="\{\{ rowSeparator \}\}"/);
		assert.match(css, /body\[data-separator\]\s*\{[^}]*padding:\s*0;[^}]*background-color:\s*transparent/s);
		assert.match(css, /body\[data-separator="none"\],\s*body\[data-separator="line"\]\s*\{[^}]*padding:\s*4px 6px 8px;/s);
		assert.match(css, /\.multiple-chronographs\s*\{[^}]*padding:\s*var\(--homey-su-4,\s*16px\);[^}]*border-radius:\s*var\(--homey-border-radius-default,\s*16px\);[^}]*background:\s*var\(--chronograph-surface\);[^}]*box-shadow:\s*var\(--chronograph-frame-shadow\)/s);
		assert.match(css, /body\[data-separator\^="cards"\] \.multiple-chronographs\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none/s);
		assert.match(css, /\[data-separator\^="rows"\] \.multiple-chronographs-grid,[^{]*\{[^}]*padding:\s*var\(--homey-su-4,\s*16px\)[^}]*background:\s*var\(--chronograph-surface\)/s);
		assert.match(html, /ng-style="entryStyle\(widgetEntry, widgetFrameStyle\(\)\)"/);
	});

	it('uses the selected separator and validates its color', async () => {
		const line = await loadWidget({ rowSeparator: 'line', rowSeparatorColor: 'red' }, {});
		assert.strictEqual(line.parent.rowSeparator, 'line');
		assert.strictEqual(line.parent.rowSeparatorColor, 'var(--homey-color-red, #f25f5c)');
		for (const option of manifest.settings.find(setting => setting.id === 'rowSeparatorColor').values) {
			const widget = await loadWidget({ rowSeparator: 'line', rowSeparatorColor: option.id }, {});
			assert.strictEqual(widget.parent.error, null, option.id);
			assert.notStrictEqual(widget.parent.rowSeparatorColor, 'inherit', option.id);
		}
		const cards = await loadWidget({ rowSeparator: 'cards' }, {});
		assert.strictEqual(cards.parent.rowSeparator, 'cards');
		const invalid = await loadWidget({ rowSeparator: 'line', rowSeparatorColor: 'invalid' }, {});
		assert.strictEqual(invalid.parent.error, 'settings.multiple_invalid_settings');
		assert.strictEqual(invalid.parent.rowSeparator, 'none');
	});

	it('uses Compose translations for the separator settings and colors', () => {
		const separator = manifest.settings.find(setting => setting.id === 'rowSeparator');
		const color = manifest.settings.find(setting => setting.id === 'rowSeparatorColor');
		for (const language of Object.keys(separator.title)) {
			const locale = require('../.homeycompose/locales/' + language + '.settings.json');
			assert.strictEqual(separator.title[language], locale.multiple_row_separator);
			assert.strictEqual(color.title[language], locale.multiple_separator_color);
			for (const id of ['rows', 'rows-small', 'rows-tiny', 'cards', 'cards-small', 'cards-tiny', 'line']) {
				assert.strictEqual(separator.values.find(item => item.id === id).title[language],
					locale['multiple_separator_' + id.replace(/-/g, '_')]);
			}
			for (const option of color.values) {
				assert.strictEqual(option.title[language], locale['style_color_' + option.id]);
			}
		}
	});

	it('configures mixed, same-named types separately and reuses saved start values', async () => {
		const settings = {
			columns: '2', chronograph1: { type: 'timer', name: 'Same' }, chronograph1ColumnSpan: '3',
			chronograph1AlternativeName: 'Kitchen', chronograph1Layout: 'large', chronograph1ShowMilliseconds: true,
			chronograph2: { data: { type: 'Transition', name: 'Same' } }, chronograph2ColumnSpan: '1',
			chronograph10: { type: 'stopwatch', name: 'Last' }, chronograph11: { type: 'timer', name: 'Ignored' }
		};
		const states = {
			'timer:Same': { name: 'Same', type: 'Timer', active: false, defaults: { time: 5, unit: 'seconds' } },
			'transition:Same': { name: 'Same', type: 'Transition', active: false, defaults: { time: 8, unit: 'minutes', from: 0, to: 10, steps: 3 } },
			'stopwatch:Last': { name: 'Last', type: 'Stopwatch', active: true, running: true, duration: 500 }
		};
		const widget = await loadWidget(settings, states);
		assert.deepStrictEqual(Array.from(widget.parent.entries, entry => [entry.slot, entry.type, entry.span]), [
			[1, 'timer', 2], [2, 'transition', 1], [10, 'stopwatch', 1]
		]);
		assert.strictEqual(widget.ready, 1);
		assert.strictEqual(widget.intervals.length, 2);
		assert.strictEqual(widget.children[0].getDisplayName(states['timer:Same']), 'Kitchen');
		assert.strictEqual(widget.children[0].layout, 'large');
		assert.strictEqual(widget.children[0].showMilliseconds, true);
		assert.strictEqual(widget.children[0].widgetInputPrefix, 'chronograph-1-');
		assert.strictEqual(widget.children[1].widgetInputPrefix, 'chronograph-2-');
		assert.deepStrictEqual(JSON.parse(JSON.stringify(widget.children[1].startValues)), { time: 8, unit: 'minutes', from: 0, to: 10, steps: 3 });
		const beforeStart = widget.requests.length;
		widget.children[1].start();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.find(request => request.url === '/transition/Same/start'), {
			method: 'POST', url: '/transition/Same/start', body: { time: 8, unit: 'minutes', from: 0, to: 10, steps: 3 }
		});
		assert.deepStrictEqual(widget.requests.slice(beforeStart).map(request => request.method), ['POST']);
		assert.strictEqual(widget.children[0].selectedChronograph.active, false);
		assert.strictEqual(widget.children[1].selectedChronograph.active, true);
		widget.children[2].toggle();
		await new Promise(resolve => setImmediate(resolve));
		assert.ok(widget.requests.some(request => request.method === 'PUT' && request.url === '/stopwatches/Last' && request.body.running === false));
		widget.children[2].stop();
		await new Promise(resolve => setImmediate(resolve));
		assert.ok(widget.requests.some(request => request.method === 'DELETE' && request.url === '/stopwatches/Last'));
	});

	it('refreshes only tiles matching realtime chronograph name and type', async () => {
		const states = {
			'timer:Same': { name: 'Same', type: 'Timer', active: true, running: true },
			'transition:Same': { name: 'Same', type: 'Transition', active: true, running: true },
			'timer:Other': { name: 'Other', type: 'Timer', active: true, running: true }
		};
		const widget = await loadWidget({
			chronograph1: { name: 'Same', type: 'timer' },
			chronograph2: { name: 'Same', type: 'transition' },
			chronograph3: { name: 'Other', type: 'timer' }
		}, states);
		let before = widget.requests.length;
		widget.listeners.chronograph_event_multi([
			{ name: 'Same', data: { type: 'Transition' } },
			{ name: 'Unrelated', data: { type: 'Timer' } }
		]);
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.slice(before).map(request => request.url), ['/transition/Same']);

		before = widget.requests.length;
		widget.listeners.chronograph_event({ name: 'Other', data: { type: 'Timer' }, removed: true });
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.slice(before).map(request => request.url), ['/timer/Other']);

		before = widget.requests.length;
		widget.listeners.chronograph_event_multi([{ name: 'Same', data: { type: 'Stopwatch' } }]);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, before);
	});

	it('avoids polling a running tile for unchanged periodic snapshots', async () => {
		const widget = await loadWidget({ chronograph1: { name: 'A', type: 'timer' } }, {
			'timer:A': { name: 'A', type: 'Timer', active: true, running: true, duration: 1000, targetDuration: 10000 }
		});
		const before = widget.requests.length;
		widget.listeners.chronograph_event_multi([
			{ name: 'A', data: { type: 'Timer' }, running: true, removed: false, duration: 1000, targetDuration: 10000 }
		]);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, before);
		widget.listeners.chronograph_event_multi([
			{ name: 'A', data: { type: 'Timer' }, running: true, removed: false, duration: 1000, targetDuration: 20000 }
		]);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, before + 1);
	});

	it('avoids realtime GET requests for ten unchanged running entries', async () => {
		const settings = {}, states = {}, events = [];
		for (let slot = 1; slot <= 10; slot++) {
			const name = 'Timer ' + slot;
			settings['chronograph' + slot] = { name, type: 'timer' };
			states['timer:' + name] = { name, type: 'Timer', active: true, running: true, duration: 1000, targetDuration: 10000 };
			events.push({ name, data: { type: 'Timer' }, running: true, removed: false, duration: 1000, targetDuration: 10000 });
		}
		const widget = await loadWidget(settings, states);
		const before = widget.requests.length;
		widget.listeners.chronograph_event_multi(events);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, before);
		events[4].targetDuration = 20000;
		widget.listeners.chronograph_event_multi(events);
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.slice(before).map(request => request.url), ['/timer/Timer%205']);
	});

	it('batches initial and periodic refreshes for ten selected entries', async () => {
		const settings = {}, states = {};
		for (let slot = 1; slot <= 10; slot++) {
			const name = 'Timer ' + slot;
			settings['chronograph' + slot] = { name, type: 'timer' };
			states['timer:' + name] = { name, type: 'Timer', active: true, running: true };
		}
		const widget = await loadWidget(settings, states);
		assert.strictEqual(widget.requests.filter(request => request.url === '/chronographs').length, 1);
		assert.strictEqual(widget.requests.filter(request => request.method === 'GET').length, 0);
		widget.requests.length = 0;
		widget.intervals.find(interval => interval.delay === 5000).fn();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, 1);
		assert.strictEqual(widget.requests[0].url, '/chronographs');
		assert.strictEqual(widget.requests[0].body.chronographs.length, 10);
	});

	it('isolates errors in a batched refresh', async () => {
		const widget = await loadWidget({
			chronograph1: { name: 'A', type: 'timer' },
			chronograph2: { name: 'B', type: 'timer' }
		}, { 'timer:A': { name: 'A', type: 'Timer', active: false } });
		assert.strictEqual(widget.children[0].error, null);
		assert.strictEqual(widget.children[1].error, 'Not found');
	});

	it('runs one display clock only while at least one tile is running', async () => {
		const states = {
			'timer:A': { name: 'A', type: 'Timer', active: false, running: false },
			'timer:B': { name: 'B', type: 'Timer', active: false, running: false }
		};
		const widget = await loadWidget({
			chronograph1: { name: 'A', type: 'timer' },
			chronograph2: { name: 'B', type: 'timer' }
		}, states);
		const activeClocks = () => widget.intervals.filter(interval => interval.delay === 250 && !interval.cancelled);
		assert.strictEqual(activeClocks().length, 0);
		for (const name of ['A', 'B']) {
			states['timer:' + name].active = true;
			states['timer:' + name].running = true;
			await widget.listeners.chronograph_event({ name, data: { type: 'Timer' } });
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(activeClocks().length, 1);
		}
		states['timer:A'].running = false;
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' } });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(activeClocks().length, 1);
		states['timer:B'].running = false;
		widget.listeners.chronograph_event({ name: 'B', data: { type: 'Timer' } });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(activeClocks().length, 0);
		states['timer:A'].running = true;
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' } });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(activeClocks().length, 1);
	});

	it('does not let an older refresh overwrite a successful start', async () => {
		const widget = await loadWidget({ chronograph1: { name: 'A', type: 'timer' } }, {
			'timer:A': { name: 'A', type: 'Timer', active: false, defaults: { time: 5, unit: 'seconds' } }
		});
		let resolveOld;
		widget.homey.api = (method) => method === 'GET'
			? new Promise(resolve => { resolveOld = resolve; })
			: Promise.resolve({ name: 'A', type: 'Timer', active: true, running: true, duration: 0, targetDuration: 5000 });
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' } });
		widget.children[0].start();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].selectedChronograph.active, true);
		resolveOld({ name: 'A', type: 'Timer', active: false, running: false });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].selectedChronograph.active, true);
	});

	it('invalidates an in-flight batch when a tile starts', async () => {
		const widget = await loadWidget({ chronograph1: { name: 'A', type: 'timer' } }, {
			'timer:A': { name: 'A', type: 'Timer', active: false, defaults: { time: 5, unit: 'seconds' } }
		});
		let resolveOld;
		let batches = 0;
		widget.homey.api = (method, url) => {
			if (url === '/chronographs') {
				batches++;
				if (batches === 1) return new Promise(resolve => { resolveOld = resolve; });
				return Promise.resolve([{ chronograph: { name: 'A', type: 'Timer', active: true, running: true } }]);
			}
			return Promise.resolve({ name: 'A', type: 'Timer', active: true, running: true, duration: 0, targetDuration: 5000 });
		};
		const poll = widget.intervals.find(interval => interval.delay === 5000);
		poll.fn();
		widget.children[0].start();
		await new Promise(resolve => setImmediate(resolve));
		poll.fn();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(batches, 2);
		resolveOld([{ chronograph: { name: 'A', type: 'Timer', active: false, running: false } }]);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].selectedChronograph.active, true);
	});

	it('reconciles conflicting realtime changes that arrive during a start', async () => {
		const widget = await loadWidget({ chronograph1: { name: 'A', type: 'timer' } }, {
			'timer:A': { name: 'A', type: 'Timer', active: false, defaults: { time: 5, unit: 'seconds' } }
		});
		let resolveStart;
		let gets = 0;
		widget.homey.api = method => {
			if (method === 'POST') return new Promise(resolve => { resolveStart = resolve; });
			gets++;
			return Promise.resolve({ name: 'A', type: 'Timer', active: false, running: false });
		};
		widget.children[0].start();
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' }, removed: false, running: true });
		assert.strictEqual(gets, 0);
		widget.listeners.chronograph_event({ name: 'A', data: { type: 'Timer' }, removed: true, running: false });
		resolveStart({ name: 'A', type: 'Timer', active: true, running: true, duration: 0, targetDuration: 5000 });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(gets, 1);
		assert.strictEqual(widget.children[0].selectedChronograph.active, false);
	});

	it('refreshes the matching tile for saved values and isolates errors', async () => {
		const states = {
			'timer:Same': { name: 'Same', type: 'Timer', active: false, defaults: { time: 3 } },
			'transition:Same': { name: 'Same', type: 'Transition', active: false, defaults: { time: 4 } }
		};
		const widget = await loadWidget({
			chronograph1: { name: 'Same', type: 'timer' }, chronograph2: { name: 'Same', type: 'transition' }
		}, states);
		const count = widget.requests.length;
		states['transition:Same'].defaults = { time: 9 };
		widget.listeners.chronograph_flow_values_changed({ type: 'Transition', name: 'Same' });
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, count + 1);
		assert.strictEqual(widget.children[1].startValues.time, 9);
		widget.failRoute('/timer/Same/start');
		widget.children[0].start();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.children[0].error, 'Failed operation');
		assert.strictEqual(widget.children[1].error, null);
		const before = widget.requests.length;
		widget.listeners.chronograph_event_multi();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(widget.requests.length, before + 2);
	});

	it('is ready without selections and reports invalid selections', async () => {
		const empty = await loadWidget({}, {});
		assert.strictEqual(empty.ready, 1);
		assert.strictEqual(empty.parent.entries.length, 0);
		const invalid = await loadWidget({ columns: '4', chronograph1: { type: 'bad', name: 'X' } }, {});
		assert.strictEqual(invalid.ready, 1);
		assert.strictEqual(invalid.parent.error, 'settings.multiple_invalid_settings');
	});
});
