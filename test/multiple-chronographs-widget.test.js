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
		scope.$broadcast = (name, ...values) => scopes.forEach(child => {
			if (child.events[name]) child.events[name]({}, ...values);
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
	return { parent, children, listeners, requests, intervals, homey, get ready() { return ready; }, failRoute: route => { failedRoute = route; } };
}

describe('Multiple Chronographs widget', () => {
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
		assert.strictEqual(manifest.settings.length, 83);
		assert.deepStrictEqual(manifest.settings[0].values.map(value => value.id), ['1', '2', '3']);
		assert.deepStrictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').values.map(value => value.id),
			['none', 'cards', 'line']);
		assert.strictEqual(manifest.settings.find(setting => setting.id === 'rowSeparator').value, 'none');
		for (let slot = 1; slot <= 10; slot++) {
			for (const suffix of ['', 'ColumnSpan', 'AlternativeName', 'DesignStyle', 'ColorScheme', 'Layout', 'Icon', 'ShowMilliseconds']) {
				const setting = manifest.settings.find(item => item.id === 'chronograph' + slot + suffix);
				assert.ok(setting);
				assert.ok(!Object.prototype.hasOwnProperty.call(setting, 'value'));
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

	it('uses the full transparent frame and Homey background only for card separation', () => {
		const html = fs.readFileSync(path.join(root, 'widgets', 'multiple_chronographs', 'public', 'index.html'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'assets', 'css', 'multiple-chronographs-widget.css'), 'utf8');
		assert.match(html, /<body[^>]*ng-attr-data-separator="\{\{ rowSeparator \}\}"/);
		assert.match(css, /body\[data-separator="cards"\]\s*\{[^}]*padding:\s*0;[^}]*background-color:\s*transparent/s);
		assert.match(css, /\[data-separator="cards"\] \.multiple-chronographs-grid[^}]*padding:\s*var\(--homey-su-4,\s*16px\)[^}]*background:\s*var\(--homey-background-color,\s*#fff\)/s);
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
		const beforeStart = widget.requests.length;
		widget.children[1].start();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(widget.requests.find(request => request.method === 'POST'), {
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
