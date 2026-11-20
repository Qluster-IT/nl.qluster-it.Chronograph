'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { searchIcons } = require('../lib/widget-icons.js');
const { optimizePng } = require('../tools/icon-previews/optimize-icon-previews');

describe('Widget icon autocomplete', () => {
	it('losslessly recompresses split PNG image data and preserves metadata before and after it', () => {
		const previews = JSON.parse(zlib.gunzipSync(fs.readFileSync(
			path.join(__dirname, '..', 'assets', 'fontawesome-previews.json.gz')
		)));
		function chunks(png) {
			const result = [];
			for (let offset = 8; offset < png.length;) {
				const end = offset + png.readUInt32BE(offset) + 12;
				result.push(png.subarray(offset, end));
				offset = end;
			}
			return result;
		}
		function chunk(type, data) {
			const result = Buffer.alloc(data.length + 12);
			result.writeUInt32BE(data.length);
			result.write(type, 4, 'ascii');
			data.copy(result, 8);
			let crc = 0xffffffff;
			for (const byte of result.subarray(4, -4)) {
				crc ^= byte;
				for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
			}
			result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
			return result;
		}
		const icon = Buffer.from(previews['fas:stopwatch'], 'base64');
		const originals = chunks(icon);
		const type = value => value.toString('ascii', 4, 8);
		const imageData = values => zlib.inflateSync(Buffer.concat(
			values.filter(value => type(value) === 'IDAT').map(value => value.subarray(8, -4))
		));
		const scanlines = imageData(originals);
		const uncompressed = zlib.deflateSync(scanlines, { level: 0 });
		const split = Math.floor(uncompressed.length / 2);
		const fixture = Buffer.concat([
			icon.subarray(0, 8), originals[0],
			chunk('tEXt', Buffer.from('Description\0Preserved before image data')),
			chunk('IDAT', uncompressed.subarray(0, split)),
			chunk('IDAT', uncompressed.subarray(split)),
			chunk('tEXt', Buffer.from('Author\0Preserved after image data')),
			originals[originals.length - 1]
		]);
		const optimized = optimizePng(fixture);
		const result = chunks(optimized);
		assert.ok(optimized.length < fixture.length);
		assert.deepStrictEqual(imageData(result), scanlines);
		assert.deepStrictEqual(result.filter(value => type(value) !== 'IDAT'),
			chunks(fixture).filter(value => type(value) !== 'IDAT'));
		for (const value of result) assert.deepStrictEqual(value, chunk(type(value), value.subarray(8, -4)));
		assert.deepStrictEqual(optimizePng(optimized), optimized);
	});

	it('rejects invalid PNG input instead of saving a damaged preview', () => {
		const previews = JSON.parse(zlib.gunzipSync(fs.readFileSync(
			path.join(__dirname, '..', 'assets', 'fontawesome-previews.json.gz')
		)));
		const png = Buffer.from(previews['fas:stopwatch'], 'base64');
		assert.throws(() => optimizePng(Buffer.from('not a PNG')), /Invalid PNG signature/);
		assert.throws(() => optimizePng(png.subarray(0, 20)), /Invalid PNG chunk length/);
		png[png.length - 1] ^= 1;
		assert.throws(() => optimizePng(png), /Invalid PNG chunk checksum/);
	});

	it('loads icon files only on the first autocomplete search', () => {
		let reads = 0;
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'widget-icons.js'), 'utf8'), {
			module,
			Buffer,
			__dirname: path.join(__dirname, '..', 'lib'),
			require: id => id === 'fs'
				? { readFileSync: (...args) => { reads++; return fs.readFileSync(...args); } }
				: require(id)
		});
		assert.strictEqual(reads, 0);
		assert.ok(module.exports.searchIcons('stopwatch', 'None').length);
		assert.strictEqual(reads, 3);
		module.exports.searchIcons('clock', 'None');
		assert.strictEqual(reads, 3);
	});

	it('puts None and the three defaults first', () => {
		const results = searchIcons('', 'Geen');
		assert.deepStrictEqual(results.slice(0, 4).map(item => item.id), [
			'none', 'fas:stopwatch', 'fas:hourglass-half', 'chronograph:transition'
		]);
		assert.deepStrictEqual(results.slice(1, 4).map(item => item.name), [
			'Stopwatch', 'Timer', 'Transition'
		]);
		assert.deepStrictEqual(results.slice(1, 4).map(item => item.description), ['App', 'App', 'App']);
		assert.strictEqual(results[0].name, 'Geen');
		assert.strictEqual(results.length, 2165);
		assert.strictEqual(new Set(results.map(item => item.id)).size, 2165);
		assert.strictEqual(searchIcons('stopwatch', 'Stopwatch none')[0].id, 'none');
	});

	it('orders remaining icons by regular, solid, then brands, alphabetically within each style', () => {
		const results = searchIcons('', 'None').slice(4);
		const styles = ['far', 'fas', 'fab'];
		let previousStyle = -1;
		let previousName = '';
		for (const item of results) {
			const [style, name] = item.id.split(':');
			const index = styles.indexOf(style);
			assert.ok(index >= previousStyle && index !== -1, item.id);
			if (index === previousStyle) assert.ok(previousName.localeCompare(name) <= 0, item.id);
			previousStyle = index;
			previousName = name;
		}
	});

	it('searches names and aliases across all bundled free styles', () => {
		assert.ok(searchIcons('hourglass half', 'None').some(item => item.id === 'fas:hourglass-half'));
		assert.ok(searchIcons('github', 'None').some(item => item.id === 'fab:github'));
		assert.ok(searchIcons('clock', 'None').some(item => item.id === 'far:clock'));
		assert.ok(searchIcons('random', 'None').some(item => item.id === 'fas:shuffle'));
		assert.ok(searchIcons('timer', 'None').some(item => item.id === 'fas:hourglass-half'));
		assert.ok(searchIcons('transition', 'None').some(item => item.id === 'chronograph:transition'));
		assert.ok(searchIcons('transitie', 'None').some(item => item.id === 'chronograph:transition'));
		assert.ok(searchIcons('sliders', 'None').some(item => item.id === 'fas:sliders'));
		assert.strictEqual(searchIcons('ge', 'Geen')[0].id, 'none');
	});

	it('filters by style alone or combined with an icon name or alias', () => {
		for (const [style, prefix, count] of [['solid', 'fas:', 1422], ['regular', 'far:', 169], ['brands', 'fab:', 572]]) {
			const results = searchIcons(style.toUpperCase(), 'None');
			assert.strictEqual(results.length, count);
			assert.ok(results.every(item => item.id.startsWith(prefix)));
		}
		assert.ok(searchIcons('brand', 'None').some(item => item.id === 'fab:github'));
		const regularClocks = searchIcons('regular clock', 'None');
		assert.ok(regularClocks.some(item => item.id === 'far:clock'));
		assert.ok(regularClocks.every(item => item.id.startsWith('far:')));
		assert.ok(searchIcons('clock solid', 'None').some(item => item.id === 'fas:clock'));
		assert.ok(searchIcons('brands github', 'None').some(item => item.id === 'fab:github'));
		assert.ok(searchIcons('solid random', 'None').some(item => item.id === 'fas:shuffle'));
		assert.deepStrictEqual(searchIcons('regular solid clock', 'None'), []);
		assert.deepStrictEqual(searchIcons('brands none', 'None'), []);
	});

	it('provides standalone PNG preview images', () => {
		const icon = searchIcons('stopwatch', 'None')[0];
		assert.ok(icon.image.startsWith('data:image/png;base64,'));
		const png = Buffer.from(icon.image.split(',')[1], 'base64');
		assert.deepStrictEqual(png.slice(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	});

	it('serves the complete icon catalog to the settings designer without preview images', async () => {
		const api = require('../api.js');
		const homey = { __: () => 'None' };
		const results = await api.searchWidgetIcons({ homey, body: { query: '' } });
		assert.strictEqual(results.length, searchIcons('', 'None').length);
		assert.ok(results.length > 2000);
		assert.strictEqual(results[0].id, 'none');
		assert.ok(results.every(item => !Object.prototype.hasOwnProperty.call(item, 'image')));
		const transitions = await api.searchWidgetIcons({ homey, body: { query: 'transitie' } });
		assert.strictEqual(transitions[0].id, 'chronograph:transition');
		await assert.rejects(api.searchWidgetIcons({ homey, body: { query: 'a'.repeat(101) } }), /Invalid icon search/);
	});

	it('uses the bold app transition artwork for autocomplete and the widget default', () => {
		const result = searchIcons('transition', 'None')[0];
		assert.strictEqual(result.id, 'chronograph:transition');
		assert.strictEqual(result.description, 'App');
		assert.ok(result.image.startsWith('data:image/png;base64,'));
		const png = Buffer.from(result.image.split(',')[1], 'base64');
		assert.deepStrictEqual(png.slice(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		assert.deepStrictEqual(png, fs.readFileSync(path.join(__dirname, '..', 'assets', 'transition-solid-preview.png')));
		const artwork = fs.readFileSync(path.join(__dirname, '..', 'assets', 'transition-solid.svg'), 'utf8');
		const paths = [...artwork.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
		const indicators = paths[1];
		assert.strictEqual((indicators.match(/M/g) || []).length, 3);
		const needle = paths[2];
		assert.strictEqual(needle.match(/L[\d.]+\s+[\d.]+$/)[0], indicators.match(/L[\d.]+\s+[\d.]+$/)[0]);
		const iconCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'chronograph-icons.css'), 'utf8');
		assert.match(iconCss, /mask:\s*url\("\.\.\/transition-solid\.svg"\)/);
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
		const resultIds = new Set(searchIcons('', 'None').map(item => item.id));
		for (const [style, name] of catalog) {
			assert.ok(resultIds.has(style + ':' + name), style + ':' + name);
		}
		const previews = JSON.parse(zlib.gunzipSync(fs.readFileSync(
			path.join(__dirname, '..', 'assets', 'fontawesome-previews.json.gz')
		)));
		assert.strictEqual(Object.keys(previews).length, catalog.length);
		for (const [style, name] of catalog) {
			assert.ok(previews[style + ':' + name], style + ':' + name);
		}
		const css = ['fontawesome.min.css', 'brands.min.css'].map(file =>
			fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', file), 'utf8')
		).join('');
		for (const [style, name] of catalog) {
			assert.ok(new RegExp('\\.fa-' + name + '(?=[,{:])').test(css), style + ':' + name);
		}
	});

	it('renders autocomplete selections, None and legacy dropdown values', () => {
		const styleScript = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget-style.js'), 'utf8');
		const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget.js'), 'utf8');
		function render(icon, type = 'timer', iconColor) {
			let controller;
			const module = { controller: (name, definition) => { controller = definition[definition.length - 1]; }, directive() {} };
			const scope = { $on() {}, $applyAsync(callback) { callback(); } };
			const homey = { getSettings: () => ({ icon, iconColor }), __: key => key, ready() {}, on() {} };
			const context = {
				angular: { module: () => module, bootstrap() {} },
				document: { body: { getAttribute: () => type }, addEventListener() {}, removeEventListener() {} },
				window: {},
				Promise,
				Date
			};
			vm.runInNewContext(styleScript, context);
			vm.runInNewContext(script, context);
			context.onHomeyReady(homey);
			controller(scope, () => {}, () => {});
			return scope;
		}

		const selected = searchIcons('github', 'None').find(item => item.id === 'fab:github');
		assert.strictEqual(render(selected).iconClass, '');
		assert.strictEqual(render(selected).iconImage, selected.image);
		assert.strictEqual(render(searchIcons('clock', 'None').find(item => item.id === 'far:clock')).iconClass, '');
		assert.strictEqual(render({ id: 'fab:github' }).iconClass, 'fa-brands fa-github');
		for (const [type, name] of [['timer', 'hourglass-half'], ['stopwatch', 'stopwatch']]) {
			assert.strictEqual(render({ id: 'fas:' + name }, type).iconClass, render(undefined, type).iconClass);
		}
		const transition = searchIcons('transition', 'None')[0];
		assert.strictEqual(render(transition, 'transition').iconClass, 'fa-solid fa-chronograph-transition');
		assert.strictEqual(render({ id: 'chronograph:transition', image: 'data:image/svg+xml;base64,PHN2Zy8+' }, 'transition').iconClass, 'fa-solid fa-chronograph-transition');
		assert.strictEqual(render({ id: 'chronograph:transition' }, 'transition').iconClass, 'fa-solid fa-chronograph-transition');
		assert.strictEqual(render(undefined, 'transition').iconClass, 'fa-solid fa-chronograph-transition');
		assert.strictEqual(render({ id: 'fas:sliders' }, 'transition').iconClass, 'fa-solid fa-sliders');
		const legacySvg = 'data:image/svg+xml;base64,PHN2Zy8+';
		assert.strictEqual(render({ image: legacySvg }).iconImage, legacySvg);
		assert.strictEqual(render({ id: 'none' }).iconImage, '');
		assert.strictEqual(render({ id: 'none' }).iconClass, '');
		assert.strictEqual(render('bell').iconClass, 'fa-solid fa-bell');
		assert.strictEqual(render(undefined).iconClass, 'fa-solid fa-hourglass-half');
		assert.strictEqual(render('clock', 'timer').iconClass, 'fa-solid fa-clock');
		assert.strictEqual(render({ id: 'fas:shuffle' }, 'transition').iconClass, 'fa-solid fa-shuffle');
		assert.strictEqual(render(undefined).iconColor, 'blue');
		assert.strictEqual(render(selected, 'timer', 'red').iconColor, 'blue');
		assert.strictEqual(render(selected, 'timer', 'invalid').iconColor, 'blue');
		assert.strictEqual(render({ image: legacySvg }, 'timer', 'blue').iconMask, '');
		assert.strictEqual(render({ image: legacySvg + '")' }, 'timer', 'red').iconMask, '');
	});

	it('defines the same design selectors and legacy color styling for each widget', () => {
		const colors = ['blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'];
		const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'chronograph-widget.css'), 'utf8');
		for (const type of ['timer', 'stopwatch', 'transition']) {
			const compose = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'widgets', type, 'widget.compose.json'), 'utf8'));
			const ids = compose.settings.map(setting => setting.id);
			assert.strictEqual(ids.indexOf('icon'), ids.indexOf('layout') + 1);
			assert.strictEqual(ids.indexOf('designStyle'), ids.indexOf('alternativeName') + 1);
			assert.strictEqual(ids.indexOf('colorTheme'), ids.indexOf('designStyle') + 1);
			assert.strictEqual(ids.indexOf('layout'), ids.indexOf('colorTheme') + 1);
			assert.deepStrictEqual(ids.filter(id => /color/i.test(id)), ['colorTheme']);
			assert.strictEqual(compose.settings.find(item => item.id === 'designStyle').type, 'autocomplete');
			assert.strictEqual(compose.settings.find(item => item.id === 'colorTheme').type, 'autocomplete');
			const html = fs.readFileSync(path.join(__dirname, '..', 'widgets', type, 'public', 'index.html'), 'utf8');
			assert.ok(!html.includes('assets/css/bootstrap.min.css'));
			assert.ok(html.includes('ng-attr-data-button-color="{{ iconColor }}"'));
			assert.ok(html.includes("'mask-image': iconMask"));
			for (const color of colors) assert.ok(css.includes('[data-button-color="' + color + '"]'));
		}
	});

	it('explains where to create designs and color schemes in every widget', () => {
		for (const type of ['timer', 'stopwatch', 'transition']) {
			const compose = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'widgets', type, 'widget.compose.json'), 'utf8'));
			for (const id of ['designStyle', 'colorTheme']) {
				const hint = compose.settings.find(setting => setting.id === id).hint;
				assert.match(hint.en, /Create your own in Chronograph App Settings under Widgets\./);
				assert.match(hint.nl, /Maak je eigen .+ in de Chronograph-appinstellingen onder Widgets\./);
			}
		}
	});

	it('loads the font styles for every widget type', () => {
		for (const type of ['timer', 'stopwatch', 'transition', 'multiple_chronographs']) {
			const html = fs.readFileSync(path.join(__dirname, '..', 'widgets', type, 'public', 'index.html'), 'utf8');
			assert.ok(html.includes('assets/css/widget-bundle.css'), type);
		}
		const bundle = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'widget-bundle.css'), 'utf8');
		for (const font of ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'fa-brands-400.woff2']) {
			assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'webfonts', font)), font);
			assert.ok(bundle.includes('../webfonts/' + font), font);
		}
	});
});
