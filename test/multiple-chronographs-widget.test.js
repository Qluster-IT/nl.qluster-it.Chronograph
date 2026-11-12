'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const manifest = require('../widgets/multiple_chronographs/widget.compose.json');
const api = require('../widgets/multiple_chronographs/api.js');

async function loadWidget(settings, states) {
	const controllers = {};
	const intervals = [];
	const listeners = {};
	const requests = [];
	const scopes = [];
	let ready = 0;
	let failedRoute;
	const interval = (fn, delay) => { const task = { fn, delay }; intervals.push(task); return task; };
	interval.cancel = () => {};
	const timeout = () => {};
	timeout.cancel = () => {};
	const makeScope = parent => {
		const scope = Object.create(parent || null);
		const events = {};
		scope.$on = (name, fn) => { events[name] = fn; };
		scope.$broadcast = (name, value) => scopes.forEach(child => {
			if (child.events[name]) child.events[name]({}, value);
		});
		scope.$applyAsync = fn => fn();
		scope.$evalAsync = fn => fn();
		scopes.push({ scope, events });
		return scope;
	};
	const module = { controller: (name, definition) => { controllers[name] = definition[definition.length - 1]; } };
	const context = {
		angular: { module: () => module, bootstrap() {} }, window: {}, Promise, Date, console,
		document: { body: { getAttribute: () => null }, querySelector: () => null }
	};
	for (const file of ['chronograph-widget-style.js', 'chronograph-errors.js', 'chronograph-widget.js', 'multiple-chronographs-widget.js']) {
		vm.runInNewContext(fs.readFileSync(path.join(root, 'assets', 'js', file), 'utf8'), context);
	}
	const homey = {
		getSettings: () => settings,
		__: key => key,
		ready: () => { ready++; },
		on: (name, fn) => { listeners[name] = fn; },
		api: (method, url, body) => {
			requests.push({ method, url, body: body && JSON.parse(JSON.stringify(body)) });
			if (url === failedRoute) return Promise.reject(new Error('Failed operation'));
			if (url === '/widget-styles') return Promise.resolve({ version: 2, styles: [], colorSchemes: [] });
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
	return { parent, children, listeners, requests, intervals, get ready() { return ready; }, failRoute: route => { failedRoute = route; } };
}

describe('Multiple Chronographs widget', () => {
	it('defines ten independently configured slots and only the required scoped routes', () => {
		const { id, ...generated } = require('../app.json').widgets.multiple_chronographs;
		if (id !== undefined) assert.strictEqual(id, 'multiple_chronographs');
		assert.deepStrictEqual(generated, manifest);
		assert.strictEqual(manifest.settings.length, 83);
		assert.deepStrictEqual(manifest.settings[0].values.map(value => value.id), ['1', '2', '3']);
		assert.deepStrictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').values.map(value => value.id),
			['none', 'cards', 'line']);
		assert.strictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').value, 'none');
		for (let slot = 1; slot <= 10; slot++) {
			for (const suffix of ['', 'ColumnSpan', 'AlternativeName', 'DesignStyle', 'ColorScheme', 'Layout', 'Icon', 'ShowMilliseconds']) {
				const setting = manifest.settings.find(item => item.id === 'chronograph' + slot + suffix);
				assert.ok(setting);
				if (suffix) {
					for (const title of Object.values(setting.title)) {
						assert.ok(title.startsWith('↳ ' + slot + ' · '));
					}
				}
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
			assert.strictEqual(separator.values.find(item => item.id === 'cards').title[language], locale.multiple_separator_cards);
			assert.strictEqual(separator.values.find(item => item.id === 'line').title[language], locale.multiple_separator_line);
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
		widget.children[1].start();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.find(request => request.method === 'POST'), {
			method: 'POST', url: '/transition/Same/start', body: { time: 8, unit: 'minutes', from: 0, to: 10, steps: 3 }
		});
		assert.strictEqual(widget.children[0].selectedChronograph.active, false);
		assert.strictEqual(widget.children[1].selectedChronograph.active, true);
		widget.children[2].toggle();
		await new Promise(resolve => setImmediate(resolve));
		assert.ok(widget.requests.some(request => request.method === 'PUT' && request.url === '/stopwatches/Last' && request.body.running === false));
		widget.children[2].stop();
		await new Promise(resolve => setImmediate(resolve));
		assert.ok(widget.requests.some(request => request.method === 'DELETE' && request.url === '/stopwatches/Last'));
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
