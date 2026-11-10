'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { searchIcons } = require('../lib/widget-icons.js');

describe('Widget icon autocomplete', () => {
	it('puts the three defaults and None first', () => {
		const results = searchIcons('', 'Geen');
		assert.deepStrictEqual(results.slice(0, 4).map(item => item.id), [
			'fas:clock', 'fas:stopwatch', 'fas:shuffle', 'none'
		]);
		assert.deepStrictEqual(results.slice(0, 3).map(item => item.name), [
			'Timer (clock)', 'Stopwatch', 'Transition (shuffle)'
		]);
		assert.strictEqual(results[3].name, 'Geen');
		assert.strictEqual(results.length, 100);
	});

	it('searches names and aliases across all bundled free styles', () => {
		assert.ok(searchIcons('hourglass half', 'None').some(item => item.id === 'fas:hourglass-half'));
		assert.ok(searchIcons('github', 'None').some(item => item.id === 'fab:github'));
		assert.ok(searchIcons('clock', 'None').some(item => item.id === 'far:clock'));
		assert.ok(searchIcons('random', 'None').some(item => item.id === 'fas:shuffle'));
		assert.ok(searchIcons('timer', 'None').some(item => item.id === 'fas:clock'));
		assert.ok(searchIcons('transition', 'None').some(item => item.id === 'fas:shuffle'));
		assert.strictEqual(searchIcons('ge', 'Geen')[0].id, 'none');
	});

	it('provides standalone SVG preview images', () => {
		const icon = searchIcons('stopwatch', 'None')[0];
		assert.ok(icon.image.startsWith('data:image/svg+xml;base64,'));
		const svg = Buffer.from(icon.image.split(',')[1], 'base64').toString('utf8');
		assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
		assert.ok(svg.includes('<path d="'));
	});

	it('contains every icon from the bundled Font Awesome Free 7.3.1 styles', () => {
		const catalog = JSON.parse(zlib.gunzipSync(fs.readFileSync(
			path.join(__dirname, '..', 'assets', 'fontawesome-icons.json.gz')
		)));
		const counts = catalog.reduce((result, icon) => {
			result[icon[0]] = (result[icon[0]] || 0) + 1;
			return result;
		}, {});
		assert.deepStrictEqual(counts, { fas: 1422, far: 169, fab: 572 });
	});

	it('renders autocomplete selections, None and legacy dropdown values', () => {
		const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget.js'), 'utf8');
		function render(icon) {
			let controller;
			const module = { controller: (name, definition) => { controller = definition[definition.length - 1]; } };
			const scope = { $on() {}, $applyAsync(callback) { callback(); } };
			const homey = { getSettings: () => ({ icon }), __: key => key, ready() {}, on() {} };
			const context = {
				angular: { module: () => module, bootstrap() {} },
				document: { body: { getAttribute: () => 'timer' } },
				window: {},
				Promise,
				Date
			};
			vm.runInNewContext(script, context);
			context.onHomeyReady(homey);
			controller(scope, () => {}, () => {});
			return scope;
		}

		const selected = searchIcons('github', 'None').find(item => item.id === 'fab:github');
		assert.strictEqual(render(selected).iconImage, selected.image);
		assert.strictEqual(render({ id: 'none' }).iconImage, '');
		assert.strictEqual(render({ id: 'none' }).iconClass, '');
		assert.strictEqual(render('bell').iconClass, 'fa-bell');
		assert.strictEqual(render(undefined).iconClass, 'fa-clock');
	});
});
