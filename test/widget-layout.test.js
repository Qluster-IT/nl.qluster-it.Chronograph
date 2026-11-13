'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'chronograph-widget.css'), 'utf8');
const previewCss = fs.readFileSync(path.join(root, 'settings', 'assets', 'styles.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'assets', 'templates', 'chronograph-widget-design.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'settings', 'index.html'), 'utf8');

describe('Widget asset bundles', () => {
	it('ships up-to-date shared assets and caches the design template', () => {
		const bundles = require('../tools/development/build-widget-assets.js')();
		for (const [file, content] of Object.entries(bundles)) {
			assert.strictEqual(fs.readFileSync(path.join(root, ...file.split('/')), 'utf8').replace(/\r\n/g, '\n'), content,
				file + ' is stale; run npm run build:widget-assets');
		}
		const angular = fs.readFileSync(path.join(root, 'assets', 'js', 'angular.min.js'), 'utf8')
			.replace(/\r\n/g, '\n')
			.replace(/^\/\/# sourceMappingURL=.*\r?\n?/m, '');
		const script = bundles['assets/js/widget-bundle.js'];
		assert.ok(script.startsWith(angular));
		const controllers = [];
		const cache = {};
		const module = {
			controller(name) { controllers.push(name); return module; },
			directive() { return module; },
			run(definition) { definition[definition.length - 1]({ put: (key, value) => { cache[key] = value; } }); return module; }
		};
		const context = { window: {}, document: {}, angular: { module: () => module, bootstrap() {} } };
		vm.runInNewContext(script.slice(angular.length), context);
		assert.strictEqual(cache['../../assets/templates/chronograph-widget-design.html'], template.replace(/\r\n/g, '\n'));
		context.onHomeyReady({});
		assert.deepStrictEqual(controllers, ['ChronographWidgetController', 'MultipleChronographsController']);
	});

	it('loads one shared script and stylesheet in each widget', () => {
		for (const widget of ['timer', 'stopwatch', 'transition', 'multiple_chronographs']) {
			const html = fs.readFileSync(path.join(root, 'widgets', widget, 'public', 'index.html'), 'utf8');
			assert.deepStrictEqual(Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), match => match[1]),
				['../../assets/js/widget-bundle.js']);
			assert.deepStrictEqual(Array.from(html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g), match => match[1]),
				['../../assets/css/widget-bundle.css']);
		}
	});
});

describe('Widget input layout', () => {
	it('shows a localized focus tooltip above the field and keeps it within the widget', () => {
		const script = fs.readFileSync(path.join(root, 'assets', 'js', 'chronograph-widget.js'), 'utf8');
		let directive;
		let destroy;
		let tooltip;
		const listeners = {};
		const windowListeners = {};
		let rect = { left: 80, top: 60, bottom: 92, width: 40 };
		const field = {
			getBoundingClientRect: () => rect,
			addEventListener: (event, fn) => { listeners[event] = fn; },
			removeEventListener: event => { delete listeners[event]; }
		};
		const label = { textContent: 'From' };
		const module = {
			controller() {},
			directive(name, factory) { if (name === 'chronographFieldTooltip') directive = factory(); }
		};
		const window = {
			innerWidth: 120, innerHeight: 100,
			addEventListener: (event, fn) => { windowListeners[event] = fn; },
			removeEventListener: event => { delete windowListeners[event]; }
		};
		const document = {
			body: { appendChild(node) { tooltip = node; } },
			createElement: () => ({
				style: {},
				setAttribute(name, value) { this[name] = value; },
				getBoundingClientRect: () => ({ width: 50, height: 20 }),
				remove() { this.removed = true; }
			})
		};
		const context = { angular: { module: () => module, bootstrap() {} }, window, document };
		vm.runInNewContext(script, context);
		context.onHomeyReady({});
		directive.link({ $on(name, callback) { if (name === '$destroy') destroy = callback; } }, [{
			querySelector: selector => selector === 'label' ? label : field
		}]);
		listeners.focus();
		assert.strictEqual(tooltip.textContent, 'From');
		assert.strictEqual(tooltip['aria-hidden'], 'true');
		assert.strictEqual(tooltip.style.left, '66px');
		assert.strictEqual(tooltip.style.top, '36px');
		rect = { left: 0, top: 2, bottom: 34, width: 40 };
		windowListeners.resize();
		assert.strictEqual(tooltip.style.left, '4px');
		assert.strictEqual(tooltip.style.top, '38px');
		listeners.blur();
		assert.strictEqual(tooltip.removed, true);
		destroy();
		assert.deepStrictEqual(listeners, {});
		assert.deepStrictEqual(windowListeners, {});
		assert.strictEqual((template.match(/chronograph-field-tooltip ng-style/g) || []).length, 5);
		for (const [widget, count] of [['timer', 2], ['transition', 5], ['multiple_chronographs', 5]]) {
			const html = fs.readFileSync(path.join(root, 'widgets', widget, 'public', 'index.html'), 'utf8');
			assert.strictEqual((html.match(/chronograph-field-tooltip/g) || []).length, count, widget);
		}
	});

	it('keeps spanning column gaps without padding the right edge in widgets or previews', () => {
		for (const markup of [template, preview]) {
			assert.ok(markup.includes('ng-attr-data-grid-last="{{ group.gridEnd >= 0.999999999'));
		}
		for (const sheet of [css, previewCss]) {
			assert.match(sheet, /\[data-row-spanning="true"\][^{]*:not\(\[data-grid-last="true"\]\)\s*\{[^}]*padding-right:\s*8px/s);
		}
	});

	it('keeps text elements together unless the column is stretched', () => {
		assert.match(css, /\.chronograph-design-element-name,\s*\.chronograph-design-element-status,\s*\.chronograph-design-element-duration\s*\{[^}]*flex:\s*0 1 auto/s);
		assert.match(css, /\.chronograph-design-element-icon\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*hidden/s);
		assert.match(previewCss, /\.style-widget-icon\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*hidden/s);
		assert.match(css, /\.chronograph-design \.chronograph-icon\s*\{[^}]*margin-right:\s*0/s);
		for (const sheet of [css, previewCss]) {
			assert.match(sheet, /\[data-alignment="center"\][^{]*\{[^}]*justify-content:\s*safe center/s);
			assert.match(sheet, /\[data-alignment="right"\][^{]*\{[^}]*justify-content:\s*safe flex-end/s);
			assert.match(sheet, /\[data-direction="horizontal"\]\[data-alignment="stretch"\][^{]*\{[^}]*flex:\s*1 1 0/s);
			assert.match(sheet, /\[data-direction="vertical"\]\[data-alignment="stretch"\][^{]*\{[^}]*align-items:\s*stretch/s);
			assert.match(sheet, /\[data-alignment="stretch"\][^{]*action[^{]*\{[^}]*width:\s*100%/s);
		}
	});

	it('keeps form labels accessible but out of the grid', () => {
		assert.match(css, /\.chronograph-widget \.visually-hidden\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
		for (const id of ['design-duration', 'design-duration-unit', 'design-transition-from', 'design-transition-to', 'design-transition-steps']) {
			assert.ok(template.includes("designLayer.measure ? undefined : widgetInputPrefix + '" + id + "'"), id);
		}
	});

	it('uses the same fixed field grid in widget and designer', () => {
		assert.ok(template.includes('designFieldLayout().columns'));
		assert.ok(css.includes('.chronograph-design-fields .chronograph-transition-fields'));
		assert.match(previewCss, /\.style-widget-field-row\s*\{\s*display:\s*contents;/);
		assert.match(css, /\.chronograph-design-element-fields,\s*\.chronograph-design-element-progress\s*\{[^}]*width:\s*100%/s);
		assert.match(css, /\.chronograph-widget \.form-control,\s*\.chronograph-widget \.form-select\s*\{[^}]*width:\s*100%/s);
	});

	it('sizes large icons and gives the progress bar and fill space in both directions', () => {
		assert.match(css, /\.chronograph-layout-large \.chronograph-design-element-icon\s*\{[^}]*font-size:\s*var\(--homey-font-size-large,\s*20px\)/s);
		assert.match(css, /\.chronograph-design-element-progress\s*\{[^}]*flex:\s*1 1 0;[^}]*width:\s*100%/s);
		assert.match(css, /\.chronograph-design-progress-fill\s*\{[^}]*height:\s*100%/s);
		assert.match(css, /\.chronograph-design-progress\[data-direction="top-bottom"\] \.chronograph-design-progress-fill\s*\{[^}]*width:\s*100%/s);
	});

	it('uses a thinner progress bar in compact layouts in both orientations', () => {
		assert.match(css, /\.chronograph-design-progress\s*\{[^}]*height:\s*8px/s);
		assert.match(css, /\.chronograph-layout-compact \.chronograph-design-progress\s*\{[^}]*height:\s*6px/s);
		assert.match(css, /\.chronograph-design-progress\[data-direction="top-bottom"\]\s*\{[^}]*width:\s*8px/s);
		assert.match(css, /\.chronograph-layout-compact \.chronograph-design-progress\[data-direction="top-bottom"\]\s*\{[^}]*width:\s*6px;[^}]*height:\s*100%/s);
	});
});
