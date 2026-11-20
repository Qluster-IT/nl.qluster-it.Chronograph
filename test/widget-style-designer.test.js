'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const runtimeScript = fs.readFileSync(path.join(root, 'assets', 'js', 'chronograph-widget-style.js'), 'utf8');
const errorScript = fs.readFileSync(path.join(root, 'assets', 'js', 'chronograph-errors.js'), 'utf8');
const editorScript = fs.readFileSync(path.join(root, 'settings', 'assets', 'widget-style-editor.js'), 'utf8');
const settingsScript = fs.readFileSync(path.join(root, 'settings', 'assets', 'settings.js'), 'utf8');
const compiledSettingsScripts = [runtimeScript, errorScript, editorScript, settingsScript].map(source => new vm.Script(source));
const html = fs.readFileSync(path.join(root, 'settings', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'settings', 'assets', 'styles.css'), 'utf8');

function loadSettings(widgetStyles, confirm, set, preview, previewBuiltIns, extras, noSelection, helpPreference, renderExport, previewsPreference, catalogOrderPreference) {
	let editor;
	let controller;
	const directives = {};
	const module = {
		factory(name, factory) { if (name === 'widgetStyleEditor') editor = factory(); return this; },
		directive(name, factory) { directives[name] = factory; return this; },
		controller(name, definition) { controller = definition[definition.length - 1]; return this; }
	};
	const angular = {
		module: () => module,
		copy: value => value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
		equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
		toJson: JSON.stringify
	};
	const listeners = {};
	const context = vm.createContext({ angular, window: {
		chronographSettingsPreview: preview,
		addEventListener(name, callback) { listeners[name] = callback; },
		removeEventListener(name) { delete listeners[name]; }
	} });
	if (extras) Object.assign(context, extras);
	for (const script of compiledSettingsScripts) script.runInContext(context);
	const watches = [];
	const scopeEvents = {};
	const scope = {
		$on(name, callback) { scopeEvents[name] = callback; },
		$watchGroup() {},
		$watch(get, callback) { watches.push({ get, callback }); },
		$digest() {
			for (const watch of watches) {
				const value = watch.get();
				if (!angular.equals(value, watch.value)) {
					watch.value = angular.copy(value);
					watch.callback(value);
				}
			}
		},
		$applyAsync(callback) { if (callback) callback(); }
	};
	const writes = [];
	const homey = {
		__: key => key,
		get(key, callback) {
			callback(null, key === 'roundOfDurationsFlowcards' ? 2 : key === 'widgetStyles' ? widgetStyles
				: key === 'previewBuiltIns' ? previewBuiltIns : key === 'widgetDesignerHelpExpanded' ? helpPreference
					: key === 'widgetTemplateShowPreviews' ? previewsPreference
						: key === 'widgetTemplateCatalogSort' ? catalogOrderPreference : null);
		},
		set: set || ((key, value, callback) => { writes.push({ key, value }); callback(null); }),
		api(method, url, data, callback) { callback(null, []); },
		on() {},
		ready() {},
		alert() {},
		confirm: confirm || ((message, type, callback) => {
			assert.strictEqual(type, 'warning');
			callback(null, true);
		})
	};
	const timers = [];
	const timeout = (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; };
	timeout.cancel = timer => { timer.cancelled = true; };
	controller(scope, () => {}, timeout, editor);
	scope.initialize(homey);
	if (!renderExport) scope.prepareTemplateImage = () => {};
	if (!noSelection) scope.selectVisibilityRow(1);
	return { scope, writes, timers, editor, homey, listeners, scopeEvents, directives, window: context.window };
}

function stubPreviewPaintDelay(window) {
	// Canvas is mocked, so yield without waiting for a browser paint. Keep capture deadlines real.
	window.setTimeout = (callback, delay) => delay === 20 ? setImmediate(callback) : setTimeout(callback, delay);
	window.clearTimeout = clearTimeout;
}

describe('Widget style designer preview', () => {
	it('matches native wrapping and narrow start controls without changing the saved design', () => {
		const { scope } = loadSettings();
		const runtime = require('../assets/js/chronograph-widget-style.js');
		let narrowGroups = 0;
		for (const preset of ['builtin:small', 'builtin:tiny']) {
			scope.editor.selectedStyleId = preset;
			scope.editor.editStatus = true;
			scope.editor.previewType = 'timer';
			scope.editor.previewState = 'starting';
			const design = scope.getSelectedStyle();
			const before = JSON.stringify(design);
			for (const size of ['compact', 'normal', 'large']) {
				scope.editor.previewSize = size;
				const native = runtime.buildRows(design, size, 'starting', 'timer', true);
				for (const row of scope.groupedRows(true)) {
					for (const group of row.groups.filter(item => item.elements.length)) {
						const expected = native.find(item => item.id === row.id).groups.find(item => item.id === group.id);
						assert.strictEqual(group.narrowStart, expected.narrowStart, preset + ':' + size);
						assert.strictEqual(group.wrap, expected.wrap, preset + ':' + size);
						if (group.narrowStart) narrowGroups++;
					}
				}
			}
			assert.strictEqual(JSON.stringify(design), before);
		}
		assert.ok(narrowGroups > 0);
	});

	it('distinguishes explicit borderless frames from native defaults and legacy zero widths', () => {
		const { scope, editor, writes } = loadSettings();
		for (const design of scope.builtInDesigns) {
			scope.editor.selectedStyleId = design.id;
			assert.strictEqual(scope.widgetBorderWidth(), null, design.id);
			assert.strictEqual(scope.previewTileStyle().boxShadow, undefined, design.id);
		}
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		design.borderWidths = { normal: 0 };
		assert.strictEqual(scope.widgetBorderWidth(), null);
		assert.strictEqual(scope.previewTileStyle().boxShadow, undefined);
		scope.widgetBorderWidth(0);
		assert.strictEqual(scope.widgetBorderWidth(), 0);
		assert.strictEqual(scope.previewTileStyle().boxShadow, 'none');
		scope.editor.previewColumns = '2';
		scope.editor.previewSeparator = 'rows';
		assert.strictEqual(scope.previewCardRowStyle().boxShadow, 'none');
		scope.editor.previewColumns = 'single';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		assert.strictEqual(writes.find(write => write.key === 'widgetStyles').value.styles[0].borderlessFrames.normal, true);
		scope.widgetBorderWidth(null);
		assert.strictEqual(scope.widgetBorderWidth(), null);
		assert.strictEqual(design.borderlessFrames, undefined);
		assert.strictEqual(scope.previewTileStyle().boxShadow, undefined);
		scope.widgetBorderWidth(3);
		assert.strictEqual(scope.widgetBorderWidth(), 3);
		assert.strictEqual(scope.previewTileStyle().boxShadow, undefined);
	});

	it('saves independent frame padding and keeps generic geometry valid through column changes', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		const padding = side => scope.widgetPaddingControls.find(control => control.side === side);
		padding('top').value(0);
		padding('right').value(12);
		assert.strictEqual(padding('bottom').value(), null);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(padding('top').value(), null);
		padding('left').value(4);
		scope.editor.previewSize = 'normal';
		scope.editor.selectedRow = 1;
		scope.rowColumnGap(16);
		scope.editor.selectedColumn = { row: 1, group: 1 };
		scope.columnElementGap(0);
		editor.setRowColumns(design, 'normal', 1, 2);
		editor.moveColumn(design, 'normal', 1, 1, 2);
		assert.deepStrictEqual(Array.from(editor.columnElementGaps(design, 'normal', 1)), [8, 0]);
		editor.setColumnSpan(design, 'normal', 1, 2, 4);
		assert.deepStrictEqual(Array.from(editor.columnElementGaps(design, 'normal', 1)), [0]);
		scope.editor.selectedElement = 'name';
		scope.elementLineHeight(24);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const saved = writes.find(write => write.key === 'widgetStyles').value;
		assert.deepStrictEqual(JSON.parse(JSON.stringify(saved.styles[0].widgetPadding)), { normal: { top: 0, right: 12 }, compact: { left: 4 } });
		for (const value of [-1, 101, 2.5, '4']) {
			design.widgetPadding.normal.top = value;
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		}
		padding('top').value(null);
		padding('right').value(null);
		scope.editor.previewSize = 'compact';
		padding('left').value(null);
		assert.strictEqual(design.widgetPadding, undefined);
	});

	it('puts padding and borderless styling on the selected row or individual-card frame', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		design.widgetPadding = { normal: { top: 3, left: 0 } };
		design.borderlessFrames = { normal: true };
		for (const columns of ['1', '2', '3']) {
			scope.editor.previewColumns = columns;
			for (const separator of ['rows', 'rows-small', 'rows-tiny', 'cards', 'cards-small', 'cards-tiny']) {
				scope.editor.previewSeparator = separator;
				const rows = separator.startsWith('rows');
				assert.strictEqual(scope.previewSeparatorLayout(), rows ? 'rows' : 'cards');
				assert.strictEqual(scope.previewCardRowStyle().paddingTop, rows ? '3px' : undefined);
				assert.strictEqual(scope.previewTileStyle().paddingTop, rows ? undefined : '3px');
				assert.strictEqual(scope.previewTileStyle().paddingLeft, rows ? undefined : '0px');
				assert.strictEqual(scope.previewPaddingStyle('frame').boxShadow, undefined);
				assert.strictEqual((rows ? scope.previewCardRowStyle() : scope.previewTileStyle()).boxShadow, 'none');
			}
		}
	});

	it('offers every named color in line, element, background, and border selectors', () => {
		const { scope } = loadSettings();
		const options = require('../widgets/multiple_chronographs/widget.compose.json').settings
			.find(setting => setting.id === 'rowSeparatorColor').values;
		assert.deepStrictEqual(options.map(option => option.id), Array.from(scope.colorOptions, option => option.id));
		const named = Array.from(scope.colorOptions, option => option.id).filter(id => id !== 'default');
		for (const key of ['foregroundOptions', 'elementColorOptions', 'backgroundOptions', 'buttonBackgroundOptions', 'borderOptions', 'baseBorderOptions']) {
			for (const id of named) assert.ok(scope[key].some(option => option.id === id), key + ': ' + id);
		}
	});

	it('appends shared palette colors and round trips them in every theme channel', async () => {
		const { scope, editor } = loadSettings();
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { encodeTemplate, decodeTemplate } = require('../lib/widget-template.js');
		const additions = { 'red-soft': '#FF453A', 'red-dark': '#8B0000',
			'grey-light': '#D1D5DB', 'grey-dark': '#4B5563', navy: '#1E3A5F' };
		const existing = ['default', 'blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal',
			'cyan', 'indigo', 'pink', 'brown', 'grey', 'black', 'black-light', 'white'];
		assert.deepStrictEqual(Array.from(editor.colorIds), existing.concat(Object.keys(additions)));
		scope.selectEditorMode('color');
		scope.createStyle(true);
		for (const [id, hex] of Object.entries(additions)) {
			for (const key of ['colorOptions', 'foregroundOptions', 'elementColorOptions', 'backgroundOptions',
				'buttonBackgroundOptions', 'borderOptions', 'baseBorderOptions']) {
				assert.ok(scope[key].some(option => option.id === id), key + ': ' + id);
			}
			const theme = scope.getSelectedScheme();
			theme.colors.name = id;
			theme.colors.inactive = id;
			theme.colors.pause = id;
			theme.colorOverrides = { running: { background: id } };
			theme.foregroundColors = { pause: id };
			theme.foregroundOverrides = { paused: { pause: id } };
			theme.borderColors = { background: id, pause: id };
			theme.borderOverrides = { paused: { background: id } };
			theme.progressColors = { normal: { foreground: id, background: id } };
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true, id);
			const decoded = await decodeTemplate(await encodeTemplate({ theme }));
			const expected = JSON.parse(JSON.stringify(theme));
			delete expected.id;
			assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded.theme)), expected);
			const reloaded = loadSettings({ version: 3, styles: [], themes: [{ ...decoded.theme, id: 'palette' }] });
			assert.strictEqual(reloaded.editor.isValidCollection(reloaded.scope.widgetStyles), true, id);
			assert.strictEqual(runtime.valueColor(id), hex);
			assert.strictEqual(runtime.backgroundStyle(decoded.theme, 'running').backgroundColor, hex);
			const button = runtime.elementStyle(decoded.theme, 'paused', 'pause');
			assert.strictEqual(button.backgroundColor, hex);
			assert.strictEqual(button.color, hex);
			assert.strictEqual(runtime.elementStyle(decoded.theme, 'inactive', 'name').color, hex);
		}
		const localeDirectory = path.join(root, '.homeycompose', 'locales');
		for (const file of fs.readdirSync(localeDirectory).filter(name => name.endsWith('.settings.json'))) {
			const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'));
			for (const id of Object.keys(additions)) {
				assert.ok(locale['style_color_' + id], file + ': ' + id);
				assert.doesNotMatch(locale['style_color_' + id], /[?\uFFFD]/);
			}
		}
	});

	it('uses real Homey fallbacks and preserves fixed named palette values', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const expected = {
			default: 'inherit', none: 'transparent', blue: 'var(--homey-color-blue, var(--chronograph-fallback-blue, #0082fa))',
			red: 'var(--homey-color-red, #d81c1d)', orange: 'var(--homey-color-orange, #ff8400)',
			yellow: '#f5c518', green: 'var(--homey-color-green, #3fc700)', purple: '#9033fc',
			teal: '#1fc7b0', cyan: '#2cc3e8', indigo: '#7c83f7', pink: '#f2549e',
			brown: '#b9875a', grey: 'var(--homey-color-mono-500, var(--chronograph-fallback-grey, #7a7a7f))', black: '#000',
			'black-light': '#2B2C36', white: 'var(--homey-color-white, #fff)'
		};
		for (const [id, value] of Object.entries(expected)) assert.strictEqual(runtime.valueColor(id), value, id);
	});

	it('validates HEX values in every theme channel and keeps gradients out of designs', () => {
		const { scope, editor } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const theme = scope.getSelectedScheme();
		theme.colors.pause = '#123456';
		theme.foregroundColors = { name: '#ABCDEF' };
		theme.foregroundOverrides = { running: { status: '#098765' } };
		theme.borderColors = { background: 'black-light', pause: '#111111' };
		theme.borderOverrides = { paused: { background: '#222222' } };
		theme.progressColors = { normal: { background: '#333333', foreground: '#444444' } };
		scope.editor.colorValues.background = '#2B2C36';
		scope.editor.previewState = 'inactive';
		scope.updateColorOverride('background');
		scope.backgroundGradient(true);
		scope.editor.previewState = 'paused';
		scope.backgroundGradient(false);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		assert.strictEqual(require('../assets/js/chronograph-widget-style.js').resolveColor(theme, 'paused', 'background'), '#2B2C36');
		assert.strictEqual(scope.previewTileStyle('paused').backgroundColor, '#2B2C36');
		for (const invalid of ['#abc', '#12345678', '#GGGGGG', 'hex']) {
			theme.borderColors.pause = invalid;
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		}
		theme.borderColors.pause = '#111111';
		theme.backgroundGradients.running = 'true';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('keeps invalid HEX drafts out of the model and synchronizes valid picker changes', () => {
		const { directives, scope, window } = loadSettings();
		const controlScope = Object.create(scope);
		controlScope.$watchCollection = (expression, callback) => callback(scope.colorOptions);
		const changes = [], validity = [];
		const model = { $viewValue: '#123456', $setValidity: (key, valid) => validity.push(valid),
			$setViewValue: value => changes.push(value) };
		directives.styleColorSelect().link(controlScope, null,
			{ $observe: (key, callback) => callback('test-color'), colorOptions: 'colorOptions' }, model);
		model.$render();
		const control = controlScope.colorControl;
		assert.strictEqual(control.choice, 'hex');
		control.hex = '#123';
		control.commit();
		assert.strictEqual(control.invalid, true);
		assert.deepStrictEqual(changes, []);
		control.picker = '#ABCDEF';
		control.pick();
		assert.strictEqual(control.hex, '#ABCDEF');
		assert.strictEqual(control.invalid, false);
		assert.strictEqual(changes.at(-1), '#ABCDEF');
		assert.strictEqual(validity.at(-1), true);
		control.choice = 'black-light';
		control.choose();
		assert.strictEqual(changes.at(-1), 'black-light');
		assert.strictEqual(window.ChronographWidgetStyle.valueColor(changes.at(-1)), '#2B2C36');
	});

	it('keeps outline spacing inside the Homey frame in designer and template previews', () => {
		const { directives } = loadSettings();
		for (const markup of [html, directives.templateCatalogPreview().template]) {
			const outlines = markup.match(/<div\b[^>]*ng-style="previewBorderStyle\([^"]*\)"[^>]*>/g);
			assert.ok(outlines && outlines.length);
			for (const outline of outlines) {
				assert.match(outline, /class="style-preview-outline style-preview-height"/);
			}
		}
	});

	it('saves per-size widget outlines and themed state colors without changing built-ins', () => {
		const { scope, writes, editor } = loadSettings();
		scope.widgetBorderWidth(3);
		assert.strictEqual(scope.widgetBorderWidth(), null);
		scope.createStyle(true);
		scope.widgetBorderWidth(3);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.widgetBorderWidth(), null);
		scope.widgetBorderWidth(1);
		scope.editor.previewSize = 'normal';
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.toggleWidgetBackground();
		scope.editor.previewState = 'inactive';
		scope.buttonBorder('blue');
		assert.match(scope.previewBorderStyle().border, /^3px solid var\(--homey-color-blue,/);
		scope.editor.previewState = 'paused';
		scope.buttonBorder('red');
		assert.match(scope.previewBorderStyle().border, /^3px solid var\(--homey-color-red,/);
		scope.editor.previewState = 'running';
		assert.match(scope.previewBorderStyle().border, /^3px solid var\(--homey-color-blue,/);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const saved = writes.filter(write => write.key === 'widgetStyles').at(-1).value;
		const restored = loadSettings(saved).scope;
		restored.editor.selectedStyleId = 'custom:' + saved.styles[0].id;
		restored.editor.selectedSchemeId = 'custom:' + saved.themes[0].id;
		restored.editor.previewState = 'paused';
		assert.strictEqual(restored.widgetBorderWidth(), 3);
		assert.match(restored.previewBorderStyle().border, /^3px solid var\(--homey-color-red,/);
		for (const invalid of [-1, 21, 1.5, '3']) {
			saved.styles[0].borderWidths.normal = invalid;
			assert.strictEqual(editor.isValidCollection(saved), false, String(invalid));
		}
	});

	it('uses the live widget flex layout for preview buttons without baseline spacing', () => {
		const widgetCss = fs.readFileSync(path.join(root, 'assets', 'css', 'chronograph-widget.css'), 'utf8');
		assert.match(widgetCss, /\.chronograph-action\s*\{[^}]*display:\s*flex;/);
		assert.match(css, /\.style-grouped-preview \.style-widget-element \.style-widget-action\s*\{[^}]*display:\s*flex;/);
	});

	it('uses widget button colors for app defaults and overrides in designer and catalog previews', () => {
		const { scope, homey, editor, directives } = loadSettings();
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const theme = scope.getSelectedScheme();
		const design = editor.designFromStyle(scope.getSelectedStyle());
		homey.api = (method, url, data, callback) => callback(null, { design, theme });
		const item = { text: 'template' };
		scope.loadCatalogPreview(item);
		const catalog = {
			preview: item.preview, t: key => key, labels: scope.labels,
			$watch(key, changed) { changed(this.preview); }
		};
		directives.templateCatalogPreview().link(catalog);
		catalog.preview.theme = theme;
		for (const color of ['default', 'blue', 'red-soft', '#123456', 'none']) {
			theme.colors.pause = color;
			theme.foregroundColors = { pause: 'navy' };
			for (const element of ['pause', 'stop', 'cancel', 'start']) {
				const expected = runtime.elementStyle(theme, 'running', element);
				for (const styles of [scope.previewButtonStyle(element, 'running'), catalog.previewButtonStyle(element)]) {
					assert.strictEqual(styles.backgroundColor, expected.backgroundColor, color + ': ' + element);
					assert.strictEqual(styles.color, expected.color, color + ': ' + element);
				}
			}
		}
		theme.colorOverrides.paused = { pause: 'red-dark' };
		theme.foregroundOverrides = { paused: { pause: '#ABCDEF' } };
		const paused = scope.previewButtonStyle('pause', 'paused');
		assert.strictEqual(paused.backgroundColor, runtime.elementStyle(theme, 'paused', 'pause').backgroundColor);
		assert.strictEqual(paused.color, '#ABCDEF');
	});

	it('matches widget text line heights across sizes and narrow layouts', () => {
		const widgetCss = fs.readFileSync(path.join(root, 'assets', 'css', 'chronograph-widget.css'), 'utf8');
		function lineHeights(source, selector) {
			return (source.match(/[^{}]+\{[^{}]*\}/g) || []).filter(rule =>
				rule.slice(0, rule.indexOf('{')).split(',').some(value => value.trim() === selector)
			).map(rule => /(?:\{|;)\s*line-height:\s*([^;]+);/.exec(rule))
				.filter(Boolean).map(match => match[1]);
		}
		for (const size of ['', 'compact', 'large']) {
			for (const element of ['name', 'status', 'duration', 'remaining', 'total']) {
				if (size === 'compact' && ['name', 'status'].includes(element)) continue;
				const widgetSelector = (size ? '.chronograph-layout-' + size + ' ' : '')
					+ '.chronograph-design .chronograph-design-element-' + element
					+ ' .chronograph-' + (['name', 'status'].includes(element) ? element : 'duration');
				const previewSelector = (size ? '.style-preview-' + size + ' ' : '')
					+ '.style-grouped-preview .style-widget-' + element;
				const expected = lineHeights(widgetCss, widgetSelector);
				assert.ok(expected.length, widgetSelector);
				assert.deepStrictEqual(lineHeights(css, previewSelector), expected, previewSelector);
			}
		}
		for (const size of ['normal', 'large']) {
			for (const element of ['duration', 'remaining', 'total']) {
				const expected = lineHeights(widgetCss, '.chronograph-layout-' + size
					+ ' .chronograph-design[data-allow-shrink="true"] .chronograph-design-element-' + element
					+ ' .chronograph-duration');
				assert.ok(expected.length);
				assert.deepStrictEqual(lineHeights(css, '.style-preview-' + size
					+ '[data-allow-shrink="true"] .style-widget-' + element), expected);
			}
		}
	});

	it('uses widget solid and gradient backgrounds instead of a separate muted preview palette', () => {
		const { scope, homey, editor, directives } = loadSettings();
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const theme = scope.getSelectedScheme();
		const design = editor.designFromStyle(scope.getSelectedStyle());
		homey.api = (method, url, data, callback) => callback(null, { design, theme });
		const item = { text: 'template' };
		scope.loadCatalogPreview(item);
		const catalog = {
			preview: item.preview, t: key => key, labels: scope.labels,
			$watch(key, changed) { changed(this.preview); }
		};
		directives.templateCatalogPreview().link(catalog);
		catalog.preview.theme = theme;
		for (const color of ['blue', 'red', 'green', 'purple', 'black-light', '#123456']) {
			theme.colors.inactive = color;
			for (const gradient of [false, true]) {
				theme.backgroundGradients = { inactive: gradient };
				scope.editor.previewState = 'running';
				const expected = runtime.backgroundStyle(theme, 'running');
				for (const style of [scope.previewTileStyle(), scope.templatePaddingStyle(), catalog.templatePaddingStyle()]) {
					assert.strictEqual(style.backgroundColor, expected.backgroundColor, color);
					assert.strictEqual(style.backgroundImage, expected.backgroundImage, color);
					assert.strictEqual(style.color, expected.color, color);
				}
			}
		}
	});

	it('edits and saves timer and transition elapsed duration independently of duration', () => {
		const { scope, writes, editor } = loadSettings();
		assert.strictEqual(scope.styleLabels.remaining, 'settings.widget_elapsed');
		scope.createStyle(true);
		assert.ok(scope.unusedElements().includes('remaining'));
		scope.moveGroupedElement('remaining', 2, 1);
		scope.editor.previewType = 'transition';
		scope.editor.previewState = 'running';
		assert.ok(scope.groupedRows(true).some(row => row.groups.some(group => group.elements.includes('remaining'))));
		scope.editor.previewType = 'timer';
		assert.ok(scope.groupedRows(true).some(row => row.groups.some(group => group.elements.includes('remaining'))));
		scope.editor.previewType = 'stopwatch';
		assert.ok(!scope.groupedRows(true).some(row => row.groups.some(group => group.elements.includes('remaining'))));
		scope.editor.previewType = 'transition';
		scope.editor.previewState = 'paused';
		assert.strictEqual(scope.previewVisible('remaining'), true);
		scope.editor.editStatus = true;
		scope.moveGroupedElement('remaining', 3, 1);
		assert.ok(scope.groupedRows(true).find(row => row.id === 3).groups[0].elements.includes('remaining'));
		assert.strictEqual(scope.getSelectedStyle().groups.normal.elements.remaining.row, 2);
		scope.editor.editStatus = false;
		scope.editor.previewState = 'inactive';
		assert.strictEqual(scope.previewVisible('remaining'), false);
		scope.selectLayoutElement('remaining');
		scope.overrideElementSize(25);
		scope.reserveElementSpace(true);
		assert.ok(scope.groupedRows(true).some(row => row.groups.some(group => group.placeholders.includes('remaining'))));
		assert.strictEqual(scope.elementSize('duration'), 20);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + writes[0].value.styles[0].id;
		assert.strictEqual(reloaded.getSelectedStyle().groups.normal.elements.remaining.row, 2);
		assert.strictEqual(reloaded.getSelectedStyle().groups.normal.overrides.paused.remaining.row, 3);
		assert.strictEqual(reloaded.elementSize('remaining'), 25);
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.normal.remaining, true);
		reloaded.selectEditorMode('color');
		reloaded.createStyle(true);
		reloaded.selectLayoutElement('remaining');
		reloaded.editor.previewState = 'inactive';
		reloaded.editor.foregroundValues.remaining = 'red';
		reloaded.updateForeground('remaining');
		assert.strictEqual(reloaded.getSelectedScheme().foregroundColors.remaining, 'red');
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), true);
	});

	it('edits, previews and saves total time independently per size and theme', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		assert.strictEqual(scope.styleLabels.total, 'settings.widget_total');
		assert.ok(scope.unusedElements().includes('total'));
		scope.moveGroupedElement('total', 2, 1);
		scope.editor.previewState = 'running';
		for (const type of ['timer', 'transition', 'stopwatch']) {
			scope.editor.previewType = type;
			assert.strictEqual(scope.groupedRows(true).some(row => row.groups.some(group => group.elements.includes('total'))),
				type !== 'stopwatch');
		}
		scope.editor.previewType = 'timer';
		scope.selectLayoutElement('total');
		scope.overrideElementSize(25);
		scope.reserveElementSpace(true);
		scope.editor.previewState = 'inactive';
		assert.ok(scope.groupedRows(true).some(row => row.groups.some(group => group.placeholders.includes('total'))));
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const saved = writes[0].value;
		assert.strictEqual(saved.styles[0].groups.compact.elements.total.row, 0);
		assert.strictEqual(saved.styles[0].groups.large.elements.total.row, 0);
		const reloaded = loadSettings(saved).scope;
		reloaded.editor.selectedStyleId = 'custom:' + saved.styles[0].id;
		assert.strictEqual(reloaded.getSelectedStyle().groups.normal.elements.total.row, 2);
		assert.strictEqual(reloaded.elementSize('total'), 25);
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.normal.total, true);
		reloaded.selectEditorMode('color');
		reloaded.createStyle(true);
		reloaded.selectLayoutElement('total');
		reloaded.editor.previewState = 'inactive';
		reloaded.editor.foregroundValues.total = 'red';
		reloaded.updateForeground('total');
		assert.strictEqual(reloaded.getSelectedScheme().foregroundColors.total, 'red');
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), true);
	});

	it('opens older designs and local preview snapshots without making them dirty', () => {
		const initial = loadSettings();
		initial.scope.createStyle(true);
		initial.scope.saveSettings();
		const old = JSON.parse(JSON.stringify(initial.writes[0].value));
		for (const size of ['compact', 'normal', 'large']) {
			delete old.styles[0].groups[size].elements.remaining;
			delete old.styles[0].groups[size].elements.total;
		}
		old.styles[0].elementSizes = {
			base: { icon: 16, name: 14, status: 12, duration: 14, play: 28, pause: 28, stop: 28, fields: 32, cancel: 28, start: 32, progress: 6 },
			overrides: { compact: {}, normal: {}, large: {} }
		};
		const reopened = loadSettings(old);
		assert.strictEqual(reopened.editor.isValidCollection(old), true);
		assert.strictEqual(reopened.scope.isDirty(), false);
		reopened.scope.editor.selectedStyleId = 'custom:' + old.styles[0].id;
		assert.ok(reopened.scope.unusedElements().includes('remaining'));
		assert.ok(reopened.scope.unusedElements().includes('total'));

		const preview = loadSettings(null, null, null, true);
		preview.scope.getSelectedStyle().name = 'Edited';
		preview.scope.saveSettings();
		const snapshot = JSON.parse(JSON.stringify(preview.writes[0].value));
		for (const style of snapshot.styles) {
			for (const size of ['compact', 'normal', 'large']) {
				delete style.groups[size].elements.remaining;
				delete style.groups[size].elements.total;
			}
		}
		const restored = loadSettings(null, null, null, true, snapshot).scope;
		assert.strictEqual(restored.isDirty(), false);
		assert.ok(restored.unusedElements().includes('remaining'));
		assert.ok(restored.unusedElements().includes('total'));
	});

	it('uses the widget default icons in previews and chronograph lists', () => {
		const { scope } = loadSettings();
		for (const [type, icon] of [['stopwatch', 'fa-stopwatch'], ['timer', 'fa-hourglass-half'], ['transition', 'fa-chronograph-transition']]) {
			assert.strictEqual(scope.previewIcon(type), icon);
			assert.strictEqual(scope.sections.find(section => section.key === type).icon, icon);
		}
	});

	it('edits and saves independent default icon references for each chronograph type', () => {
		const { scope, writes, homey, editor } = loadSettings();
		homey.api = (method, url, data, callback) => {
			assert.strictEqual(url, '/widget-icons/search');
			callback(null, [
				{ id: 'fas:clock', name: 'clock' }, { id: 'far:clock', name: 'clock' },
				{ id: 'fab:github', name: 'github' }, { id: 'none', name: 'None' }
			]);
		};
		scope.createStyle(true);
		for (const [type, id] of [['timer', 'far:clock'], ['stopwatch', 'fab:github'], ['transition', 'none']]) {
			scope.toggleIconPicker(type);
			scope.setDefaultIcon(type, id);
		}
		assert.strictEqual(scope.previewIcon('timer'), 'fa-clock');
		assert.strictEqual(scope.previewIconStyle('timer'), 'fa-regular');
		assert.strictEqual(scope.previewIconStyle('stopwatch'), 'fa-brands');
		assert.strictEqual(scope.previewIcon('transition'), undefined);
		assert.strictEqual(scope.previewVisible('icon', 'running', 'transition'), false);
		assert.ok(scope.groupedRows(true, null, 'transition').some(row => row.groups.some(group => group.placeholders.includes('icon'))));
		scope.editor.previewType = 'stopwatch';
		assert.strictEqual(scope.previewIcon(), 'fa-github');
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const saved = writes[0].value;
		assert.deepStrictEqual(JSON.parse(JSON.stringify(saved.styles[0].defaultIcons)), {
			timer: 'far:clock', stopwatch: 'fab:github', transition: 'none'
		});
		const reopened = loadSettings(saved).scope;
		reopened.editor.selectedStyleId = 'custom:' + saved.styles[0].id;
		assert.strictEqual(reopened.previewIcon('timer'), 'fa-clock');
		reopened.toggleIconPicker('timer');
		reopened.setDefaultIcon('timer', null);
		assert.strictEqual(reopened.previewIcon('timer'), 'fa-hourglass-half');
		const invalid = JSON.parse(JSON.stringify(saved));
		invalid.styles[0].defaultIcons.timer = 'fas:bad icon';
		assert.strictEqual(editor.isValidCollection(invalid), false);
		assert.match(html, /ng-repeat="type in \['timer', 'stopwatch', 'transition'\]"/);
	});

	it('ignores stale icon search results', () => {
		const { scope, homey } = loadSettings();
		scope.createStyle(true);
		const pending = [];
		homey.api = (method, url, data, callback) => pending.push(callback);
		scope.toggleIconPicker('timer');
		scope.iconPickers.timer.query = 'clock';
		scope.searchDefaultIcons('timer');
		pending[1](null, [{ id: 'fas:clock', name: 'clock' }]);
		pending[0](null, [{ id: 'none', name: 'None' }]);
		assert.strictEqual(scope.iconPickers.timer.results[0].id, 'fas:clock');
		scope.setDefaultIcon('timer', 'none');
		assert.strictEqual(scope.getSelectedStyle().defaultIcons, undefined);
	});

	it('loads further icon options as the list is scrolled and resets for a new search', () => {
		const { directives } = loadSettings();
		const handlers = {};
		const list = { scrollTop: 0, clientHeight: 200, scrollHeight: 2000 };
		let watch, destroy;
		const picker = { visibleCount: 60, results: Array.from({ length: 135 }) };
		const scope = {
			type: 'timer', iconPickers: { timer: picker },
			$applyAsync: callback => callback(),
			$watch: (getter, callback) => { watch = callback; },
			$on: (name, callback) => { destroy = callback; }
		};
		const element = {
			0: list,
			on: (name, callback) => { handlers[name] = callback; },
			off: name => { delete handlers[name]; }
		};
		directives.iconResultsScroll().link(scope, element);
		handlers.scroll();
		assert.strictEqual(picker.visibleCount, 60);
		list.scrollTop = 1800;
		handlers.scroll();
		assert.strictEqual(picker.visibleCount, 120);
		handlers.scroll();
		assert.strictEqual(picker.visibleCount, 135);
		watch();
		assert.strictEqual(list.scrollTop, 0);
		destroy();
		assert.strictEqual(handlers.scroll, undefined);
	});

	it('preserves icon references in template exports, previews and saved imports', () => {
		const { scope, homey, writes } = loadSettings();
		scope.createStyle(true);
		const icons = { timer: 'far:clock', stopwatch: 'fab:github', transition: 'none' };
		scope.getSelectedStyle().defaultIcons = icons;
		const id = scope.getSelectedStyle().id;
		scope.saveSettings();
		let exported;
		homey.api = (method, url, data, callback) => {
			if (url.endsWith('encode')) { exported = data.design; callback(null, 'encoded'); }
			else callback(null, { design: exported });
		};
		scope.openTemplates();
		scope.templates.designId = id;
		scope.generateWidgetTemplate();
		assert.deepStrictEqual(JSON.parse(JSON.stringify(exported.defaultIcons)), icons);
		assert.strictEqual(scope.previewIcon('timer'), 'fa-clock');
		assert.strictEqual(scope.previewIconStyle('timer'), 'fa-regular');
		assert.strictEqual(scope.previewIcon('stopwatch'), 'fa-github');
		assert.strictEqual(scope.previewIconStyle('stopwatch'), 'fa-brands');
		assert.strictEqual(scope.previewIcon('transition'), undefined);
		scope.selectTemplateSection('import');
		scope.templates.importText = 'encoded';
		scope.readWidgetTemplate();
		assert.strictEqual(scope.previewIcon('timer'), 'fa-clock');
		assert.strictEqual(scope.previewIconStyle('timer'), 'fa-regular');
		assert.strictEqual(scope.previewIcon('transition'), undefined);
		scope.saveWidgetTemplate();
		assert.deepStrictEqual(JSON.parse(JSON.stringify(writes[writes.length - 1].value.styles[1].defaultIcons)), icons);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(scope.widgetStyles.styles[0].defaultIcons)), icons);
	});

	it('rejects duplicate custom names per category while allowing built-in and cross-category matches', () => {
		const { scope, writes, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		scope.createStyle(true);
		scope.getSelectedStyle().name = scope.defaultDesignName();
		scope.saveSettings();
		scope.createStyle(true);
		scope.getSelectedStyle().name = '  ' + scope.defaultDesignName().toUpperCase() + '  ';
		assert.strictEqual(scope.duplicateEditingName(), true);
		scope.saveSettings();
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(alerts[alerts.length - 1], 'settings.style_duplicate_name');
		scope.getSelectedStyle().name = 'Another design';
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.getSelectedScheme().name = scope.defaultDesignName();
		scope.saveSettings();
		assert.strictEqual(writes.length, 3);
		scope.createStyle(true);
		scope.getSelectedScheme().name = ' ' + scope.defaultDesignName().toUpperCase() + ' ';
		assert.strictEqual(scope.duplicateEditingName(), true);
		scope.saveSettings();
		assert.strictEqual(writes.length, 3);
		assert.strictEqual(alerts[alerts.length - 1], 'settings.style_duplicate_name');
	});

	it('places the templates button beside the default styles heading', () => {
		assert.match(html, /class="template-header style-editor-header">[\s\S]*?<h2>\{\{ labels\.widgetStyles \}\}<\/h2>[\s\S]*?ng-click="openTemplates\(\)"[\s\S]*?<\/div>/);
		assert.match(css, /\.settings-page \.btn-outline-primary\s*\{[^}]*--bs-btn-color:\s*var\(--chronograph-primary\);[^}]*--bs-btn-border-color:\s*var\(--chronograph-primary\);/);
	});

	it('remembers the designer help preference without changing the design', () => {
		const { scope, writes } = loadSettings();
		assert.strictEqual(scope.styleHelpExpanded, true);
		assert.strictEqual(scope.styleHelpAvailable, true);
		scope.toggleStyleHelp();
		assert.strictEqual(scope.styleHelpExpanded, false);
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes[0].key, 'widgetDesignerHelpExpanded');
		assert.strictEqual(writes[0].value, false);
		const reopened = loadSettings(null, null, null, false, null, null, false, writes[0].value).scope;
		assert.strictEqual(reopened.styleHelpExpanded, false);
		reopened.toggleStyleHelp();
		assert.strictEqual(reopened.styleHelpExpanded, true);
		assert.match(html, /aria-controls="style-designer-help"/);
		assert.match(html, /ng-show="styleHelpExpanded"/);
	});

	it('reports preference save and load failures without claiming a saved change', () => {
		const { scope, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		homey.set = (key, value, callback) => callback(new Error('Save failed'));
		scope.toggleStyleHelp();
		assert.strictEqual(scope.styleHelpExpanded, true);
		assert.strictEqual(scope.styleHelpSaving, false);
		assert.match(alerts[0], /Save failed/);
		const get = homey.get;
		homey.get = (key, callback) => key === 'widgetDesignerHelpExpanded'
			? callback(new Error('Load failed')) : get(key, callback);
		scope.styleHelpAvailable = false;
		scope.initialize(homey);
		assert.strictEqual(scope.styleHelpAvailable, false);
		assert.match(alerts[1], /Load failed/);
	});

	it('loads, searches, favorites and imports community templates', () => {
		const { scope, homey, writes } = loadSettings();
		const item = { id: '42:0', postId: 42, title: 'Blue', description: 'Dark theme', author: 'Creator', text: 'shared-template' };
		const theme = JSON.parse(JSON.stringify(scope.getSelectedScheme()));
		homey.api = (method, url, data, callback) => {
			if (url === '/widget-templates/catalog') callback(null, [item]);
			else if (url === '/widget-templates/decode') {
				assert.strictEqual(data.text, item.text);
				callback(null, { theme });
			} else throw new Error('Unexpected API request');
		};
		scope.openTemplates();
		scope.selectTemplateSection('catalog');
		assert.strictEqual(scope.templates.catalog.length, 1);
		scope.templates.catalogQuery = 'dark';
		assert.strictEqual(scope.catalogMatches(item), true);
		scope.templates.catalogQuery = 'missing';
		assert.strictEqual(scope.catalogMatches(item), false);
		scope.toggleTemplateFavorite(item);
		assert.strictEqual(item.favorite, true);
		assert.strictEqual(writes[writes.length - 1].value[42], true);
		scope.importCatalogTemplate(item);
		assert.strictEqual(scope.templates.section, 'import');
		assert.strictEqual(scope.templates.review.theme.name, theme.name);
	});

	it('shows list previews only when enabled and saves the preference without changing the catalog', () => {
		const { scope, homey, writes } = loadSettings();
		let requests = 0;
		const item = { id: '42:0', postId: 42, images: ['preview.png'] };
		homey.api = (method, url, data, callback) => { requests++; callback(null, [item]); };
		scope.openTemplates();
		scope.selectTemplateSection('catalog');
		assert.strictEqual(scope.templates.showPreviews, false);
		scope.toggleTemplatePreviews();
		assert.strictEqual(scope.templates.showPreviews, true);
		assert.strictEqual(writes[0].key, 'widgetTemplateShowPreviews');
		assert.strictEqual(writes[0].value, true);
		assert.strictEqual(scope.templates.catalog[0], item);
		assert.strictEqual(requests, 1);
		const reopened = loadSettings(null, null, null, false, null, null, false, null, false, true);
		assert.strictEqual(reopened.scope.templates.showPreviews, true);
		scope.toggleTemplatePreviews();
		assert.strictEqual(scope.templates.showPreviews, false);
		assert.strictEqual(scope.templates.catalog[0], item);
		assert.strictEqual(requests, 1);
		assert.match(html, /ng-if="templates\.showPreviews && templates\.selectedCatalogId !== item\.id" ng-init="loadCatalogPreview\(item\)"/);
		assert.match(html, /template-catalog-preview="item\.preview"/);
		assert.doesNotMatch(html, /ng-src="\{\{ item\.images\[0\] \}\}"/);
		assert.match(html, /ng-repeat="image in item\.images track by \$index"[\s\S]*?ng-click="openTemplateImage\(image, item\.title\)"/);
		assert.match(html, /ng-click="toggleTemplatePreviews\(\)"[\s\S]*?ng-attr-aria-pressed="\{\{ templates\.showPreviews \}\}"[\s\S]*?ng-attr-aria-label="\{\{ t\('settings\.template_show_examples'\) \}\}"/);
		assert.match(html, /templates\.showPreviews \? 'fa-eye' : 'fa-eye-slash'/);
	});

	it('saves and restores the community catalog sort preference', () => {
		const { scope, homey, writes } = loadSettings(null, null, null, false, null, null, false, null, false, null, 'number');
		assert.strictEqual(scope.templates.catalogOrder, 'number');
		assert.strictEqual(scope.templates.catalogOrderReady, true);
		scope.templates.catalogOrder = '-likes';
		scope.saveTemplateCatalogOrder();
		assert.deepStrictEqual(writes[0], { key: 'widgetTemplateCatalogSort', value: '-likes' });
		assert.strictEqual(scope.templates.savedCatalogOrder, '-likes');

		const reopened = loadSettings(null, null, null, false, null, null, false, null, false, null, '-likes').scope;
		assert.strictEqual(reopened.templates.catalogOrder, '-likes');
		assert.match(html, /option value="number">\{\{ t\('settings\.template_catalog_oldest'\) \}\}/);
		assert.match(html, /ng-change="saveTemplateCatalogOrder\(\)"/);

		const errors = [];
		homey.alert = message => errors.push(message);
		homey.set = (key, value, callback) => callback(new Error('Sort save failed'));
		scope.templates.catalogOrder = 'title';
		scope.saveTemplateCatalogOrder();
		assert.strictEqual(scope.templates.catalogOrder, '-likes');
		assert.strictEqual(scope.templates.catalogOrderSaving, false);
		assert.match(errors[0], /Sort save failed/);
	});

	it('decodes each catalog preview once and renders only a normal running timer without changing the designer', () => {
		const { scope, homey, editor, directives } = loadSettings();
		const originalEditor = JSON.stringify(scope.editor);
		const originalStyles = JSON.stringify(scope.widgetStyles);
		const design = editor.designFromStyle(scope.getSelectedStyle());
		design.defaultIcons = { timer: 'fab:github' };
		let callback;
		let requests = 0;
		homey.api = (method, url, data, complete) => {
			requests++;
			assert.strictEqual(url, '/widget-templates/decode');
			assert.strictEqual(data.text, 'template');
			callback = complete;
		};
		const item = { text: 'template', images: [] };
		scope.loadCatalogPreview(item);
		scope.loadCatalogPreview(item);
		assert.strictEqual(requests, 1);
		assert.strictEqual(item.previewLoading, true);
		callback(null, { design });
		scope.loadCatalogPreview(item);
		assert.strictEqual(requests, 1);
		assert.strictEqual(item.previewLoading, false);
		assert.strictEqual(item.preview.icon, 'fa-github');
		assert.strictEqual(item.preview.iconStyle, 'fa-brands');
		const directive = directives.templateCatalogPreview();
		const preview = {
			preview: item.preview, t: key => key, labels: scope.labels,
			$watch(key, changed) { changed(this.preview); }
		};
		directive.link(preview);
		assert.strictEqual(preview.editor.previewType, 'timer');
		assert.strictEqual(preview.editor.previewSize, 'normal');
		assert.strictEqual(preview.previewTileState(), 'running');
		assert.ok(preview.previewRowLayout().rows.length);
		assert.strictEqual(preview.previewIcon(), 'fa-github');
		assert.strictEqual(preview.elementSize('duration'), scope.elementSize('duration'));
		assert.strictEqual(preview.previewColor('background'), scope.previewColor('background'));
		assert.strictEqual(preview.progressPercent(), 25);
		assert.strictEqual(JSON.stringify(scope.editor), originalEditor);
		assert.strictEqual(JSON.stringify(scope.widgetStyles), originalStyles);
	});

	it('previews theme-only and legacy cell templates and reports invalid catalog previews', () => {
		const { scope, homey, editor } = loadSettings();
		const theme = JSON.parse(JSON.stringify(scope.getSelectedScheme()));
		theme.colors.name = 'red';
		homey.api = (method, url, data, callback) => callback(null, { theme });
		const themeItem = { text: 'theme' };
		scope.loadCatalogPreview(themeItem);
		assert.ok(themeItem.preview.design.groups.normal);
		assert.strictEqual(themeItem.preview.theme.colors.name, 'red');
		const design = editor.designFromStyle(editor.create('legacy', 'Legacy'));
		delete design.groups;
		homey.api = (method, url, data, callback) => callback(null, { design });
		const legacyItem = { text: 'legacy' };
		scope.loadCatalogPreview(legacyItem);
		assert.ok(legacyItem.preview.design.groups.normal);
		for (const result of [{}, { design: { name: 'Invalid' } }]) {
			homey.api = (method, url, data, callback) => callback(null, result);
			const item = { text: 'invalid' };
			scope.loadCatalogPreview(item);
			assert.ok(item.previewError);
			assert.strictEqual(item.previewLoading, false);
			assert.strictEqual(item.preview, undefined);
		}
		homey.api = (method, url, data, callback) => callback(new Error('Decode failed'));
		const failed = { text: 'failed' };
		scope.loadCatalogPreview(failed);
		assert.match(failed.previewError, /Decode failed/);
	});

	it('refreshes enabled catalog previews even when entry IDs remain unchanged', () => {
		const { scope, homey, editor } = loadSettings();
		const design = editor.designFromStyle(scope.getSelectedStyle());
		let text = 'first';
		let decodes = 0;
		homey.api = (method, url, data, callback) => {
			if (url === '/widget-templates/catalog') callback(null, [{ id: '42:0', postId: 42, text }]);
			else { decodes++; callback(null, { design }); }
		};
		scope.templates.showPreviews = true;
		scope.refreshTemplateCatalog();
		const preview = scope.templates.catalog[0].preview;
		assert.ok(preview);
		assert.strictEqual(decodes, 1);
		scope.refreshTemplateCatalog();
		assert.strictEqual(scope.templates.catalog[0].preview, preview);
		assert.strictEqual(decodes, 1);
		text = 'updated';
		scope.refreshTemplateCatalog();
		assert.ok(scope.templates.catalog[0].preview);
		assert.notStrictEqual(scope.templates.catalog[0].preview, preview);
		assert.strictEqual(decodes, 2);
	});

	it('opens full template images in a modal with bounded zoom and scrolling', () => {
		let opened = 0, closed = 0;
		const { scope } = loadSettings(null, null, null, false, null, {
			document: { getElementById: () => ({ showModal() { opened++; }, close() { closed++; } }) }
		});
		scope.openTemplateImage('full-preview.png', 'Example');
		assert.strictEqual(opened, 1);
		assert.strictEqual(scope.templates.imageViewer.image, 'full-preview.png');
		assert.strictEqual(scope.templates.imageZoom, 1);
		scope.zoomTemplateImage(0.5);
		assert.strictEqual(scope.templates.imageZoom, 1.5);
		scope.zoomTemplateImage(100);
		assert.strictEqual(scope.templates.imageZoom, 5);
		scope.zoomTemplateImage(-100);
		assert.strictEqual(scope.templates.imageZoom, 1);
		scope.closeTemplateImage();
		assert.strictEqual(closed, 1);
		assert.strictEqual(scope.templates.imageViewer, null);
		scope.openTemplateImage('another.png', 'Another');
		assert.strictEqual(scope.templates.imageZoom, 1);
		assert.match(html, /<dialog id="template-image-dialog"/);
		assert.match(css, /\.template-image-viewport \{[^}]*overflow: auto/);
	});

	it('pinches around the fingers midpoint, clamps zoom, and leaves single-finger scrolling native', () => {
		const { scope, directives } = loadSettings();
		const handlers = {};
		const options = {};
		let destroy;
		let prevented = 0;
		scope.templates.imageZoom = 1;
		scope.$apply = callback => callback();
		scope.$on = (name, callback) => { if (name === '$destroy') destroy = callback; };
		const viewport = {
			scrollLeft: 20, scrollTop: 30,
			getBoundingClientRect: () => ({ left: 10, top: 20 }),
			querySelector: () => ({ getBoundingClientRect: () => ({ width: 400 * scope.templates.imageZoom }) }),
			addEventListener(name, callback, config) { handlers[name] = callback; options[name] = config; },
			removeEventListener(name, callback) { assert.strictEqual(callback, handlers[name]); delete handlers[name]; }
		};
		directives.templateImageGestures().link(scope, [viewport]);
		const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
		const event = touches => ({ touches, cancelable: true, preventDefault() { prevented++; } });
		handlers.touchstart(event([touch(1, 110, 120)]));
		handlers.touchmove(event([touch(1, 120, 130)]));
		assert.strictEqual(prevented, 0);
		assert.strictEqual(scope.templates.imageZoom, 1);
		handlers.touchstart(event([touch(1, 110, 120), touch(2, 210, 120)]));
		handlers.touchmove(event([touch(2, 260, 120), touch(1, 60, 120)]));
		assert.strictEqual(scope.templates.imageZoom, 2);
		assert.strictEqual(viewport.scrollLeft, 190);
		assert.strictEqual(viewport.scrollTop, 160);
		handlers.touchmove(event([touch(1, 80, 140), touch(2, 280, 140)]));
		assert.strictEqual(viewport.scrollLeft, 170);
		assert.strictEqual(viewport.scrollTop, 140);
		handlers.touchmove(event([touch(1, 0, 120), touch(2, 600, 120)]));
		assert.strictEqual(scope.templates.imageZoom, 5);
		handlers.touchmove(event([touch(1, 150, 120), touch(2, 160, 120)]));
		assert.strictEqual(scope.templates.imageZoom, 1);
		handlers.touchend(event([touch(1, 150, 120)]));
		const stopped = prevented;
		handlers.touchmove(event([touch(1, 0, 120), touch(2, 600, 120)]));
		assert.strictEqual(prevented, stopped);
		handlers.touchstart(event([touch(1, 100, 120), touch(2, 100, 120)]));
		handlers.touchmove(event([touch(1, 0, 120), touch(2, 600, 120)]));
		assert.strictEqual(scope.templates.imageZoom, 1);
		assert.strictEqual(options.touchmove.passive, false);
		destroy();
		assert.deepStrictEqual(Object.keys(handlers), []);
	});

	it('zooms around Ctrl-wheel and pans with mouse drag while zoomed', () => {
		const { scope, directives } = loadSettings();
		const handlers = {};
		const captured = new Set();
		let destroy;
		let prevented = 0;
		scope.templates.imageZoom = 2;
		scope.$apply = callback => callback();
		scope.$on = (name, callback) => { if (name === '$destroy') destroy = callback; };
		const classes = new Set();
		const viewport = {
			scrollLeft: 100, scrollTop: 80,
			getBoundingClientRect: () => ({ left: 10, top: 20 }),
			classList: {
				add(name) { classes.add(name); },
				remove(name) { classes.delete(name); }
			},
			setPointerCapture(id) { captured.add(id); },
			hasPointerCapture(id) { return captured.has(id); },
			releasePointerCapture(id) { captured.delete(id); },
			addEventListener(name, callback) { handlers[name] = callback; },
			removeEventListener(name, callback) { assert.strictEqual(callback, handlers[name]); delete handlers[name]; }
		};
		directives.templateImageGestures().link(scope, [viewport]);
		const event = values => Object.assign({
			cancelable: true,
			preventDefault() { prevented++; }
		}, values);
		handlers.wheel(event({ ctrlKey: false, deltaY: -100, clientX: 110, clientY: 120 }));
		assert.strictEqual(scope.templates.imageZoom, 2);
		assert.strictEqual(prevented, 0);
		handlers.wheel(event({ ctrlKey: true, deltaY: -100, clientX: 110, clientY: 120 }));
		const zoomed = 2 * Math.exp(0.15);
		assert.ok(Math.abs(scope.templates.imageZoom - zoomed) < 1e-10);
		assert.ok(Math.abs(viewport.scrollLeft - (200 * zoomed / 2 - 100)) < 1e-10);
		assert.ok(Math.abs(viewport.scrollTop - (180 * zoomed / 2 - 100)) < 1e-10);
		assert.strictEqual(prevented, 1);
		handlers.wheel(event({ ctrlKey: true, deltaY: -10000, clientX: 110, clientY: 120 }));
		assert.strictEqual(scope.templates.imageZoom, 5);
		handlers.wheel(event({ ctrlKey: true, deltaY: 10000, clientX: 110, clientY: 120 }));
		assert.strictEqual(scope.templates.imageZoom, 1);

		scope.templates.imageZoom = 2;
		viewport.scrollLeft = 100;
		viewport.scrollTop = 80;
		handlers.pointerdown(event({ pointerType: 'mouse', pointerId: 7, button: 0, clientX: 100, clientY: 100 }));
		assert.ok(captured.has(7));
		assert.ok(classes.has('template-image-dragging'));
		handlers.pointermove(event({ pointerType: 'mouse', pointerId: 7, clientX: 130, clientY: 85 }));
		assert.strictEqual(viewport.scrollLeft, 70);
		assert.strictEqual(viewport.scrollTop, 95);
		handlers.pointerup(event({ pointerId: 7 }));
		assert.strictEqual(captured.has(7), false);
		assert.strictEqual(classes.has('template-image-dragging'), false);
		handlers.pointermove(event({ pointerId: 7, clientX: 140, clientY: 90 }));
		assert.strictEqual(viewport.scrollLeft, 70);
		assert.strictEqual(viewport.scrollTop, 95);
		assert.match(html, /template-image-gestures/);
		assert.match(css, /\.template-image-viewport\.template-image-zoomed\s*\{[^}]*cursor:\s*grab/);
		destroy();
		assert.deepStrictEqual(Object.keys(handlers), []);
	});

	it('reports preview preference save and load failures', () => {
		const { scope, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		homey.set = (key, value, callback) => callback(new Error('Save failed'));
		scope.toggleTemplatePreviews();
		assert.strictEqual(scope.templates.showPreviews, false);
		assert.strictEqual(scope.templates.previewsSaving, false);
		assert.match(alerts[0], /Save failed/);
		const get = homey.get;
		homey.get = (key, callback) => key === 'widgetTemplateShowPreviews'
			? callback(new Error('Load failed')) : get(key, callback);
		scope.templates.previewsAvailable = false;
		scope.initialize(homey);
		assert.strictEqual(scope.templates.previewsAvailable, false);
		assert.match(alerts[1], /Load failed/);
	});

	it('keeps the previous preview state while a save is pending', () => {
		const { scope, homey } = loadSettings();
		let finish;
		let calls = 0;
		homey.set = (key, value, callback) => { calls++; finish = callback; };
		scope.toggleTemplatePreviews();
		scope.toggleTemplatePreviews();
		assert.strictEqual(calls, 1);
		assert.strictEqual(scope.templates.showPreviews, false);
		assert.strictEqual(scope.templates.previewsSaving, true);
		finish(null);
		assert.strictEqual(scope.templates.showPreviews, true);
		assert.strictEqual(scope.templates.previewsSaving, false);
	});

	it('applies a delayed preview preference to an already loaded catalog', () => {
		const { scope, homey } = loadSettings();
		homey.api = (method, url, data, callback) => callback(null, [{ id: '42:0', postId: 42 }]);
		const get = homey.get;
		let resolvePreference;
		homey.get = (key, callback) => {
			if (key === 'widgetTemplateShowPreviews') resolvePreference = callback;
			else get(key, callback);
		};
		scope.initialize(homey);
		scope.openTemplates();
		scope.selectTemplateSection('catalog');
		assert.strictEqual(scope.templates.catalog.length, 1);
		assert.strictEqual(scope.templates.showPreviews, false);
		resolvePreference(null, true);
		assert.strictEqual(scope.templates.catalog.length, 1);
		assert.strictEqual(scope.templates.showPreviews, true);
	});

	it('reports community catalog and favorite save failures', () => {
		const { scope, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		homey.api = (method, url, data, callback) => callback(new Error('Forum unavailable'));
		scope.openTemplates();
		scope.selectTemplateSection('catalog');
		assert.match(alerts[0], /Forum unavailable/);
		assert.strictEqual(scope.templates.catalog, null);
		assert.strictEqual(scope.templates.busy, false);
		const item = { postId: 42, favorite: false };
		scope.templates.catalog = [item];
		homey.set = (key, value, callback) => callback(new Error('Save failed'));
		scope.toggleTemplateFavorite(item);
		assert.match(alerts[1], /Save failed/);
		assert.strictEqual(item.favorite, false);
		assert.strictEqual(scope.templates.busy, false);
	});

	it('shows selected exports immediately as a normal running timer and restores the previous preview', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		const design = scope.getSelectedStyle();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		const theme = scope.getSelectedScheme();
		scope.editor.previewSize = 'large';
		scope.editor.previewType = 'transition';
		scope.editor.previewState = 'paused';
		scope.openTemplates();
		assert.deepStrictEqual([scope.editor.previewSize, scope.editor.previewType, scope.editor.previewState], ['normal', 'timer', 'running']);
		scope.templates.designId = design.id;
		assert.strictEqual(scope.getSelectedStyle().id, design.id);
		assert.strictEqual(scope.getSelectedScheme().id, 'builtin:current');
		scope.templates.themeId = theme.id;
		assert.strictEqual(scope.getSelectedScheme().id, theme.id);
		scope.templates.designId = '';
		assert.strictEqual(scope.getSelectedStyle().id, 'builtin:current');
		assert.strictEqual(scope.getSelectedScheme().id, theme.id);
		assert.ok(!scope.templates.exportText);
		scope.previewAction('pause');
		assert.strictEqual(scope.editor.previewState, 'running');
		scope.selectTemplateSection('import');
		assert.deepStrictEqual([scope.editor.previewSize, scope.editor.previewType, scope.editor.previewState], ['large', 'transition', 'paused']);
		scope.editor.previewSize = 'compact';
		scope.selectTemplateSection('export');
		assert.deepStrictEqual([scope.editor.previewSize, scope.editor.previewType, scope.editor.previewState], ['normal', 'timer', 'running']);
		scope.closeTemplates();
		assert.deepStrictEqual([scope.editor.previewSize, scope.editor.previewType, scope.editor.previewState], ['compact', 'transition', 'paused']);
		const exportSection = html.split('<section ng-if="templates.section === \'export\'">')[1].split('</section>')[0];
		assert.match(exportSection, /ng-if="templates\.designId \|\| templates\.themeId"/);
		assert.doesNotMatch(exportSection, /id="template-export-(?:size|type|state)"/);
	});

	it('labels only the design and theme included in the exported forum post', () => {
		const { scope, homey } = loadSettings();
		scope.createStyle(true);
		scope.getSelectedStyle().name = 'Control Deck';
		scope.saveSettings();
		const design = scope.getSelectedStyle();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.getSelectedScheme().name = 'Lagoon Pulse';
		scope.saveSettings();
		const theme = scope.getSelectedScheme();
		homey.__ = key => ({
			'settings.style_design': 'Ontwerp',
			'settings.template_theme': 'Thema',
			'settings.template_post_description': 'Beschrijf je sjabloon hier.'
		}[key] || key);
		homey.api = (method, url, data, callback) => callback(null, 'encoded-template');
		scope.openTemplates();
		scope.templates.designId = design.id;
		scope.templates.themeId = theme.id;
		scope.generateWidgetTemplate();
		assert.strictEqual(scope.templateForumPost(), '# Design: Control Deck | Theme: Lagoon Pulse\n\n\n\n```javascript\nencoded-template\n```');
		scope.templates.themeId = '';
		scope.generateWidgetTemplate();
		assert.ok(scope.templateForumPost().startsWith('# Design: Control Deck\n'));
		scope.templates.designId = '';
		scope.templates.themeId = theme.id;
		scope.generateWidgetTemplate();
		assert.ok(scope.templateForumPost().startsWith('# Theme: Lagoon Pulse\n'));
	});

	it('opens the exchange and its posts through the Homey bridge', () => {
		const { scope, homey } = loadSettings();
		const opened = [];
		const alerts = [];
		homey.openURL = url => opened.push(url);
		homey.alert = message => alerts.push(message);
		scope.openWidgetExchange();
		scope.openWidgetExchange(42);
		scope.openWidgetExchange('https://example.com');
		assert.deepStrictEqual(opened, [
			'https://community.homey.app/t/162213',
			'https://community.homey.app/t/162213/42'
		]);
		assert.strictEqual(alerts.length, 1);
		assert.match(html, /ng-click="openWidgetExchange\(\)"/);
		assert.match(html, /ng-click="openWidgetExchange\(item\.number\)"/);
		assert.match(html, /<div class="template-header">[\s\S]*?ng-click="openWidgetExchange\(\)"[\s\S]*?<\/div>/);
	});

	it('defaults the local preview to its light page even when the browser reports a dark preference', () => {
		const browser = {
			chronographSettingsPreview: true,
			matchMedia: () => ({ matches: true })
		};
		browser.parent = browser;
		const { scope, writes } = loadSettings(null, null, null, true, null, { window: browser });
		assert.strictEqual(scope.localPreview, true);
		assert.strictEqual(scope.editor.previewMode, 'light');
		assert.strictEqual(scope.previewCounterInvert, false);
		scope.editor.previewMode = 'dark';
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes.length, 0);
	});

	it('localizes singular preview names to the Homey user language but keeps generated image names English', () => {
		const { scope, homey, writes } = loadSettings();
		for (const language of ['nl', 'de']) {
			const locale = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose', 'locales', language + '.settings.json'), 'utf8'));
			homey.__ = key => locale[key.replace(/^settings\./, '')];
			for (const [type, english] of Object.entries({ stopwatch: 'Stopwatch', timer: 'Timer', transition: 'Transition' })) {
				scope.editor.previewType = type;
				assert.strictEqual(scope.previewName(), locale['widget_type_' + type]);
				assert.strictEqual(scope.previewName('timer'), locale.widget_type_timer);
				scope.templates.generating = true;
				assert.strictEqual(scope.previewName(), english);
				scope.templates.generating = false;
				assert.strictEqual(scope.previewName(), locale['widget_type_' + type]);
			}
		}
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes.length, 0);
	});

	it('defaults preview mode to the browser and permits changes without editing saved styles', () => {
		for (const matches of [false, true]) {
			let changed;
			const query = {
				matches,
				addEventListener(name, callback) { assert.strictEqual(name, 'change'); changed = callback; }
			};
			const browser = { matchMedia: value => {
				assert.strictEqual(value, '(prefers-color-scheme: dark)');
				return query;
			} };
			browser.parent = browser;
			const { scope, writes } = loadSettings(null, null, null, false, null, { window: browser });
			assert.strictEqual(scope.editor.previewMode, matches ? 'dark' : 'light');
			assert.strictEqual(scope.previewCounterInvert, false);
			scope.editor.previewMode = matches ? 'light' : 'dark';
			assert.strictEqual(scope.isDirty(), false);
			assert.strictEqual(writes.length, 0);
			query.matches = !matches;
			changed();
			assert.strictEqual(scope.editor.previewMode, query.matches ? 'dark' : 'light');
			browser.parent = {};
			browser.frameElement = null;
			query.matches = true;
			changed();
			assert.strictEqual(scope.previewCounterInvert, false, 'Dark preference does not prove inversion in an opaque host');
		}
		assert.match(html, /id="preview-mode"[^>]*ng-model="editor\.previewMode"/);
	});

	it('counter-inverts inspectable host filters rather than inferring inversion from browser appearance', () => {
		for (const prefersDark of [false, true]) {
			let hostChanged;
			let disconnected = false;
			const observed = [];
			const hostDocument = { defaultView: { getComputedStyle: element => ({ filter: element.filter }) } };
			const parent = { ownerDocument: hostDocument, filter: 'none', parentElement: null };
			const frame = { ownerDocument: hostDocument, filter: 'none', parentElement: parent };
			const browser = {
				parent: {}, frameElement: frame,
				matchMedia: () => ({ matches: prefersDark }),
				MutationObserver: function (callback) {
					hostChanged = callback;
					this.observe = element => observed.push(element);
					this.disconnect = () => { disconnected = true; };
				}
			};
			const { scope, writes, scopeEvents } = loadSettings(null, null, null, false, null, { window: browser });
			assert.strictEqual(scope.previewCounterInvert, false, 'Uninverted web host');
			assert.deepStrictEqual(observed, [frame, parent]);
			scope.editor.previewMode = 'light';
			parent.filter = 'invert(1) hue-rotate(180deg)';
			hostChanged();
			assert.strictEqual(scope.previewCounterInvert, true, 'Inverted ancestor');
			assert.strictEqual(scope.editor.previewMode, 'light', 'Host changes retain the selected preview mode');
			parent.filter = 'none';
			frame.filter = 'invert(0)';
			hostChanged();
			assert.strictEqual(scope.previewCounterInvert, false, 'Host inversion removed');
			frame.filter = 'invert(1)';
			hostChanged();
			assert.strictEqual(scope.previewCounterInvert, false, 'Other filters are not Homey counter-inversion');
			frame.filter = 'invert(100%) hue-rotate(180deg)';
			hostChanged();
			assert.strictEqual(scope.previewCounterInvert, true, 'Inverted iframe');
			assert.strictEqual(scope.isDirty(), false);
			assert.strictEqual(writes.length, 0);
			scopeEvents.$destroy();
			assert.strictEqual(disconnected, true);
		}
	});

	[false, true].forEach(insecureHttp => it(`copies six light-then-dark previews ${insecureHttp ? 'on a manual HTTP retry' : 'automatically in a secure context'}`, async () => {
		const previews = [];
		const fontRequests = [];
		const labels = [];
		let writeStarted = false;
		let copyHandler;
		const copied = {};
		const canvases = [];
		const field = { focus() {}, select() {} };
		const numberFields = [{ type: 'number', value: '1' }, { type: 'number', value: '' }];
		const preview = {
			style: { width: '80%', boxSizing: 'content-box' },
			querySelectorAll(selector) { assert.strictEqual(selector, 'input[type="number"]'); return numberFields; }
		};
		const document = {
			body: {},
			getElementById: id => id === 'template-forum-post' ? field : preview,
			createElement: () => {
				const canvas = {
					draws: [],
					getContext: () => ({
						fillRect() { canvas.background = this.fillStyle; },
						drawImage(image, x, y) { canvas.draws.push({ image, x, y }); },
						fillText(text) { labels.push(text); canvas.textColor = this.fillStyle; }
					}),
					toDataURL: () => 'data:image/png;base64,' + Buffer.from('panel-' + canvases.indexOf(canvas)).toString('base64')
				};
				canvases.push(canvas);
				return canvas;
			},
			addEventListener(name, handler) { if (name === 'copy') copyHandler = handler; },
			removeEventListener() { copyHandler = null; },
			execCommand() {
				assert.ok(insecureHttp && copyHandler, 'Only the manual HTTP path uses legacy copy');
				copyHandler({ preventDefault() {}, clipboardData: { setData(type, value) { copied[type] = value; } } });
				return true;
			}
		};
		const extras = {
			document, Blob,
			fetch: async url => {
				fontRequests.push(url);
				return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
			},
			btoa: value => Buffer.from(value, 'binary').toString('base64')
		};
		const { scope, homey, window } = loadSettings(null, null, null, false, null, extras, false, null, true);
		scope.editor.previewMode = 'dark';
		window.location = { protocol: 'http:' };
		window.isSecureContext = !insecureHttp;
		window.ClipboardItem = function (formats) { this.formats = formats; };
		window.navigator = { clipboard: { async write([item]) {
			assert.strictEqual(previews.length, 0);
			writeStarted = true;
			for (const [type, blob] of Object.entries(item.formats)) copied[type] = await (await blob).text();
		} } };
		stubPreviewPaintDelay(window);
		window.getComputedStyle = element => element === preview ? {
			getPropertyValue: property => (scope.templates.imageMode === 'dark'
				? { '--homey-background-color': '#181920', '--homey-text-color': '#fff' }
				: { '--homey-background-color': '#fff', '--homey-text-color': '#222' })[property]
		} : { backgroundColor: 'rgb(24, 25, 32)', color: 'rgb(255, 255, 255)' };
		window.htmlToImage = { toCanvas: async (element, options) => {
			assert.strictEqual(scope.templates.generating, true);
			assert.strictEqual(scope.previewName(), { stopwatch: 'Stopwatch', timer: 'Timer', transition: 'Transition' }[scope.editor.previewType]);
			assert.match(options.fontEmbedCSS, /font-family:"Font Awesome 7 Free";font-style:normal;font-weight:400/);
			assert.match(options.fontEmbedCSS, /font-family:"Font Awesome 7 Free";font-style:normal;font-weight:900/);
			assert.match(options.fontEmbedCSS, /font-family:"Font Awesome 7 Brands";font-style:normal;font-weight:400/);
			assert.strictEqual(scope.previewIconStyle(), { timer: 'fa-regular', stopwatch: 'fa-brands', transition: 'fa-solid' }[scope.editor.previewType]);
			assert.strictEqual(preview.style.width, '350px');
			assert.strictEqual(preview.style.boxSizing, 'border-box');
			assert.deepStrictEqual(numberFields.map(field => field.type), ['text', 'text']);
			assert.deepStrictEqual(numberFields.map(field => field.value), ['1', '']);
			previews.push([scope.templates.imageMode, scope.editor.previewType, scope.editor.previewState, scope.editor.previewSize]);
			return {
				width: 350,
				height: 80 + ['stopwatch', 'timer', 'transition'].indexOf(scope.editor.previewType) * 30
					+ ['running', 'paused', 'inactive'].indexOf(scope.editor.previewState) * 10
					+ ['compact', 'normal', 'large'].indexOf(scope.editor.previewSize) * 20,
				type: scope.editor.previewType,
				mode: scope.templates.imageMode
			};
		} };
		scope.createStyle(true);
		scope.getSelectedStyle().name = 'Design <example>';
		scope.getSelectedStyle().defaultIcons = { timer: 'far:clock', stopwatch: 'fab:github', transition: 'chronograph:transition' };
		scope.saveSettings();
		const design = scope.getSelectedStyle();
		homey.api = (method, url, data, callback) => {
			assert.strictEqual(writeStarted, !insecureHttp, 'Only the secure context starts a deferred write');
			assert.strictEqual(scope.templates.generating, true);
			callback(null, 'encoded-template');
		};
		scope.openTemplates();
		scope.templates.designId = design.id;
		scope.generateWidgetTemplate();
		assert.strictEqual(scope.getSelectedStyle().id, design.id);
		assert.strictEqual(scope.getSelectedScheme().id, 'builtin:current');
		await new Promise((resolve, reject) => {
			const deadline = Date.now() + 3000;
			function wait() {
				if (!scope.templates.busy) return resolve();
				if (Date.now() > deadline) return reject(new Error('Image preparation timed out'));
				setTimeout(wait, 10);
			}
			wait();
		});
		if (insecureHttp) {
			assert.strictEqual(scope.templates.copyStatus, 'http');
			assert.deepStrictEqual(copied, {});
			scope.copyTemplateForumPost();
			assert.strictEqual(previews.length, 54, 'Manual copy does not re-render the previews');
		}
		assert.strictEqual(scope.templates.copyStatus, 'copied');
		assert.strictEqual(scope.templates.generating, false);
		assert.deepStrictEqual(fontRequests.sort(), ['fa-brands-400.woff2', 'fa-regular-400.woff2', 'fa-solid-900.woff2']
			.map(file => '../assets/webfonts/' + file));
		assert.deepStrictEqual(previews, ['light', 'dark'].flatMap(mode =>
			['stopwatch', 'timer', 'transition'].flatMap(type =>
				['running', 'paused', 'inactive'].flatMap(state =>
					['compact', 'normal', 'large'].map(size => [mode, type, state, size])))));
		assert.strictEqual(labels.filter(label => label === 'Stopwatch').length, 2);
		assert.strictEqual(labels.filter(label => label === 'Timer').length, 2);
		assert.strictEqual(labels.filter(label => label === 'Transition').length, 2);
		assert.strictEqual(labels.filter(label => label === 'settings.style_compact').length, 6);
		assert.strictEqual(labels.filter(label => label === 'settings.widget_running').length, 6);
		assert.strictEqual(labels.filter(label => label === 'settings.widget_paused').length, 6);
		assert.strictEqual(labels.filter(label => label === 'settings.widget_not_running').length, 6);
		assert.strictEqual(canvases.length, 6);
		assert.deepStrictEqual(canvases.map(canvas => [canvas.width, canvas.height]),
			[[1216, 518], [1216, 608], [1216, 698], [1216, 518], [1216, 608], [1216, 698]]);
		canvases.forEach((canvas, index) => {
			assert.strictEqual(canvas.background, index < 3 ? '#f5f4fa' : '#111217',
				'Outside-widget canvas uses the dashboard backdrop, not the widget surface or editor mode');
			assert.strictEqual(canvas.textColor, index < 3 ? '#222' : '#fff');
			assert.strictEqual(canvas.draws.length, 9);
			assert.ok(canvas.draws.every(draw => draw.image.type === ['stopwatch', 'timer', 'transition'][index % 3]));
			assert.ok(canvas.draws.every(draw => draw.image.mode === (index < 3 ? 'light' : 'dark')));
			assert.ok(canvas.draws.every(draw => draw.x >= 0 && draw.y >= 0
				&& draw.x + draw.image.width <= canvas.width && draw.y + draw.image.height <= canvas.height));
		});
		const imageData = canvases.map(canvas => canvas.toDataURL());
		assert.deepStrictEqual(Array.from(scope.templates.imageData), imageData);
		assert.ok(copied['text/plain'].includes('```javascript\nencoded-template\n```'));
		assert.ok(copied['text/plain'].startsWith('# Design: Design <example>\n\n\n\n```javascript\n'));
		assert.ok(copied['text/html'].includes('<h1>Design: Design &lt;example&gt;</h1>'));
		assert.ok(copied['text/html'].includes('</h1><p><br></p><p><img'));
		assert.ok(!copied['text/html'].includes('Describe your template here.'));
		assert.strictEqual((copied['text/html'].match(/<img /g) || []).length, 6);
		assert.ok(imageData.every((image, index) => !index
			|| copied['text/html'].indexOf(imageData[index - 1]) < copied['text/html'].indexOf(image)));
		imageData.forEach(image => assert.ok(copied['text/html'].includes('<img alt="Widget preview" src="' + image + '">')));
		assert.ok(copied['text/html'].includes('<pre data-params="javascript"><code class="language-javascript">encoded-template</code></pre>'));
		assert.ok(!copied['text/html'].includes('<p>TWF:</p>'));
		assert.strictEqual(scope.editor.previewSize, 'normal');
		assert.strictEqual(scope.templates.imageMode, undefined);
		assert.strictEqual(preview.style.width, '80%');
		assert.strictEqual(preview.style.boxSizing, 'content-box');
		assert.deepStrictEqual(numberFields.map(field => field.type), ['number', 'number']);
		assert.strictEqual(scope.templates.busy, false);
		assert.match(html, /id="template-export-preview" class="[^"]*\bstyle-preview-light\b/);
		scope.clearTemplateExport();
		assert.strictEqual(scope.templates.imageData, null);
		assert.strictEqual(scope.templates.exportText, '');
		assert.strictEqual(scope.templates.copyStatus, null);
		const actions = html.split('<label class="hy-nostyle" for="template-forum-post">')[1].split('</div>')[0];
		assert.strictEqual((actions.match(/<button\b/g) || []).length, 2);
		assert.match(actions, /forum-editor-switch\.png/);
		assert.match(actions, /<strong>\{\{ t\('settings\.template_paste_image_hint'\) \}\}<\/strong> \{\{ t\('settings\.template_paste_image_reason'\) \}\}/);
		assert.match(actions, /<strong>\{\{ t\('settings\.template_paste_edit_description'\) \}\}<\/strong>\{\{ t\('settings\.template_paste_wait_image'\) \}\}/);
		assert.match(actions, /<p class="help-text">\{\{ t\('settings\.template_editor_switch'\) \}\}<\/p>/);
		assert.match(actions, /role="status" ng-if="templates\.copyStatus"/);
		assert.match(actions, /<span ng-if="templates\.copyStatus === 'copied'"><strong>\{\{ t\('settings\.template_copy_copied'\) \}\}<\/strong> \{\{ t\('settings\.template_copy_next'\) \}\}<\/span>/);
		assert.match(actions, /<strong ng-if="templates\.copyStatus === 'retry'">\{\{ t\('settings\.template_copy_retry'\) \}\}<\/strong>/);
		assert.match(actions, /<strong ng-if="templates\.copyStatus === 'http'">\{\{ t\('settings\.template_copy_http'\) \}\}<\/strong>/);
		assert.match(actions, /ng-click="openWidgetExchange\(\)" ng-disabled="templates\.busy \|\| templates\.copyStatus !== 'copied'"/);
	}));

	it('unlocks the editor and cancels the queued copy when TWF encoding fails', async () => {
		const { scope, homey, window } = loadSettings(null, null, null, false, null, { Blob });
		scope.createStyle(true);
		scope.getSelectedStyle().name = 'Encoding failure fixture';
		scope.saveSettings();
		const designId = scope.getSelectedStyle().id;
		scope.openTemplates();
		scope.templates.designId = designId;
		let clipboardData;
		window.ClipboardItem = function (formats) { clipboardData = formats; };
		window.navigator = { clipboard: { write: () => clipboardData['text/html'] } };
		let completeEncode;
		homey.api = (method, url, data, callback) => { completeEncode = callback; };
		let alert;
		homey.alert = message => { alert = message; };

		scope.generateWidgetTemplate();
		assert.strictEqual(scope.templates.generating, true);
		completeEncode(new Error('Encoding failed'));
		await assert.rejects(clipboardData['text/html'], /Encoding failed/);
		assert.match(alert, /Encoding failed/);
		assert.strictEqual(scope.templates.generating, false);
		assert.strictEqual(scope.templates.busy, false);
	});

	it('reports blocked rich clipboard copying without modifying the export', () => {
		const document = {
			getElementById: () => ({ focus() {}, select() {} }),
			addEventListener() {}, removeEventListener() {},
			execCommand: () => false
		};
		const { scope, homey } = loadSettings(null, null, null, false, null, { document });
		let message;
		homey.alert = value => { message = value; };
		scope.templates.exportText = 'encoded-template';
		scope.templates.imageData = ['data:image/png;base64,cG5n'];
		scope.copyTemplateForumPost();
		assert.match(message, /Clipboard copy was blocked/);
		document.execCommand = () => true;
		message = null;
		scope.copyTemplateForumPost();
		assert.match(message, /Clipboard copy was blocked/);
		assert.strictEqual(scope.templates.exportText, 'encoded-template');
		assert.strictEqual(scope.templates.busy, false);
		assert.strictEqual(scope.templates.copyStatus, 'retry');
	});

	it('uses the rich asynchronous clipboard fallback and reports failures', async () => {
		const document = {
			getElementById: () => ({ focus() {}, select() {} }),
			addEventListener() {}, removeEventListener() {},
			execCommand: () => false
		};
		const { scope, window } = loadSettings(null, null, null, false, null, { document, Blob });
		let resolveWrite;
		let item;
		window.ClipboardItem = function (data) { item = data; };
		window.navigator = { clipboard: { write: () => new Promise(resolve => { resolveWrite = resolve; }) } };
		scope.templates.exportText = 'encoded-template';
		scope.templates.imageData = ['data:image/png;base64,cG5n', 'data:image/png;base64,dHdv', 'data:image/png;base64,dGhyZWU='];
		scope.copyTemplateForumPost(true);
		assert.strictEqual(scope.templates.busy, true);
		assert.strictEqual(scope.templates.copyStatus, null);
		const copiedHtml = await item['text/html'].text();
		assert.strictEqual((copiedHtml.match(/<img /g) || []).length, 3);
		scope.templates.imageData.forEach(image => assert.ok(copiedHtml.includes('src="' + image + '"')));
		assert.match(await item['text/plain'].text(), /encoded-template/);
		resolveWrite();
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(scope.templates.copyStatus, 'copied');
		assert.strictEqual(scope.templates.busy, false);
		window.navigator.clipboard.write = () => Promise.reject(new Error('Permission denied'));
		scope.copyTemplateForumPost(true);
		assert.strictEqual(scope.templates.copyStatus, null);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(scope.templates.copyStatus, 'retry');
		assert.strictEqual(scope.templates.busy, false);
	});

	it('keeps exchange translations intact in every settings locale', () => {
		const directory = path.join(root, '.homeycompose', 'locales');
		const keys = ['template_paste_image_hint', 'template_prepare_image_error', 'template_clipboard_image_error',
			'template_editor_switch', 'template_copy_copied', 'template_copy_retry', 'template_copy_http', 'template_generating',
			'template_copy_next', 'template_paste_image_reason',
			'template_paste_edit_description', 'template_paste_wait_image',
			'template_image_zoom_in', 'template_image_zoom_out', 'template_image_close'];
		for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.settings.json'))) {
			const locale = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
			for (const key of keys) {
				assert.ok(locale[key], `${file}: missing ${key}`);
				assert.doesNotMatch(locale[key], /[?\uFFFD]/, `${file}: corrupt ${key}`);
			}
		}
	});

	for (const failedCapture of [1, 28]) {
		it('restores the preview mode and size when capture ' + failedCapture + ' fails', async () => {
			const numberField = { type: 'number', value: '1' };
			let captures = 0;
			const { scope, homey, window } = loadSettings(null, null, null, false, null, {
				document: { body: {}, getElementById: () => ({ style: { width: '' }, querySelectorAll: () => [numberField] }) },
				fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }),
				btoa: value => Buffer.from(value, 'binary').toString('base64')
			}, false, null, true);
			stubPreviewPaintDelay(window);
			window.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
			window.htmlToImage = { toCanvas: async () => {
				assert.strictEqual(numberField.type, 'text');
				if (++captures !== failedCapture) return { width: 350, height: 80 };
				assert.strictEqual(scope.templates.imageMode, failedCapture === 1 ? 'light' : 'dark');
				throw new Error('Render failed');
			} };
			let resolveAlert;
			const alert = new Promise(resolve => { resolveAlert = resolve; });
			homey.alert = resolveAlert;
			scope.templates.exportText = 'encoded-template';
			scope.prepareTemplateImage();
			assert.match(await alert, /Render failed/);
			assert.strictEqual(scope.editor.previewSize, 'normal');
			assert.strictEqual(scope.templates.imageMode, undefined);
			assert.strictEqual(captures, failedCapture);
			assert.strictEqual(scope.templates.busy, false);
			assert.strictEqual(scope.templates.generating, false);
			assert.strictEqual(scope.templates.imageData, null);
			assert.strictEqual(numberField.type, 'number');
			assert.strictEqual(numberField.value, '1');
		});
	}

	it('previews a theme-only export using the default design', () => {
		const { scope, homey } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		const theme = scope.getSelectedScheme();
		homey.api = (method, url, data, callback) => callback(null, 'encoded-template');
		scope.openTemplates();
		scope.templates.themeId = theme.id;
		scope.generateWidgetTemplate();
		assert.strictEqual(scope.getSelectedStyle().id, 'builtin:current');
		assert.strictEqual(scope.getSelectedScheme().id, theme.id);
	});

	it('shows state-specific layouts in template previews even when editing the base layout', () => {
		const { scope, homey } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.groups.normal.overrides.running = { duration: { row: 2, group: 1, order: 2 } };
		scope.saveSettings();
		assert.strictEqual(scope.editor.editStatus, false);
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 3).groups[0].elements.includes('duration'), true);
		homey.api = (method, url, data, callback) => callback(null, 'encoded-template');
		scope.openTemplates();
		scope.templates.designId = style.id;
		scope.generateWidgetTemplate();
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 2).groups[0].elements.includes('duration'), true);
	});

	it('reviews older templates with remaining time in the unused row', () => {
		const { scope, homey, editor } = loadSettings();
		const design = JSON.parse(JSON.stringify(editor.designFromStyle(scope.getSelectedStyle())));
		for (const size of ['compact', 'normal', 'large']) delete design.groups[size].elements.remaining;
		delete design.id;
		homey.api = (method, url, data, callback) => callback(null, { design });
		scope.openTemplates();
		scope.selectTemplateSection('import');
		scope.templates.importText = 'old-template';
		scope.readWidgetTemplate();
		assert.strictEqual(scope.templates.review.design.groups.normal.elements.remaining.row, 0);
		assert.doesNotThrow(() => scope.groupedRows(true));
	});

	it('reviews and selectively saves a shared template without changing existing selections', () => {
		const { scope, homey, writes } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		const design = JSON.parse(JSON.stringify(scope.getSelectedStyle()));
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		const theme = JSON.parse(JSON.stringify(scope.getSelectedScheme()));
		const selectedDesign = scope.editor.selectedStyleId;
		const selectedTheme = scope.editor.selectedSchemeId;
		const calls = [];
		homey.api = (method, url, data, callback) => {
			calls.push({ method, url, data });
			if (url.endsWith('encode')) callback(null, 'encoded');
			else callback(null, { design, theme });
		};
		scope.openTemplates();
		scope.templates.designId = design.id;
		scope.templates.themeId = theme.id;
		scope.generateWidgetTemplate();
		assert.strictEqual(calls[0].data.design.id, design.id);
		assert.strictEqual(scope.templates.exportText, 'encoded');
		scope.selectTemplateSection('import');
		scope.templates.importText = 'encoded';
		scope.readWidgetTemplate();
		assert.strictEqual(scope.templates.designName, design.name + ' (2)');
		assert.strictEqual(scope.templates.themeName, theme.name + ' (2)');
		assert.strictEqual(scope.getSelectedStyle(), scope.templates.review.design);
		scope.templates.includeTheme = false;
		assert.strictEqual(scope.getSelectedScheme().id, 'builtin:current');
		scope.templates.previewThemeId = 'custom:' + theme.id;
		assert.strictEqual(scope.getSelectedScheme().id, theme.id);
		scope.saveWidgetTemplate();
		const collection = writes[writes.length - 1].value;
		assert.strictEqual(collection.styles.length, 2);
		assert.strictEqual(collection.themes.length, 1);
		assert.notStrictEqual(collection.styles[1].id, design.id);
		assert.strictEqual(collection.styles[1].name, design.name + ' (2)');
		assert.strictEqual(scope.editor.selectedStyleId, selectedDesign);
		assert.strictEqual(scope.editor.selectedSchemeId, selectedTheme);
	});

	it('retains the template review when saving fails and refuses invalid imports', () => {
		const { scope, homey } = loadSettings();
		let alerts = 0;
		homey.alert = () => alerts++;
		homey.api = (method, url, data, callback) => callback(null, { design: { name: 'Invalid' } });
		scope.openTemplates();
		scope.selectTemplateSection('import');
		scope.templates.importText = 'invalid';
		scope.readWidgetTemplate();
		assert.strictEqual(scope.templates.review, null);
		assert.strictEqual(alerts, 1);

		homey.api = (method, url, data, callback) => callback(null, {
			design: JSON.parse(JSON.stringify(scope.builtInDesigns[0]))
		});
		scope.readWidgetTemplate();
		assert.ok(scope.templates.review);
		homey.set = (key, value, callback) => callback(new Error('Save failed'));
		scope.saveWidgetTemplate();
		assert.ok(scope.templates.review);
		assert.strictEqual(scope.widgetStyles.styles.length, 0);
		assert.strictEqual(alerts, 2);
	});

	it('starts without an element selected and does not select one when changing modes', () => {
		for (const preview of [false, true]) {
			const { scope } = loadSettings(null, null, null, preview, null, null, true);
			assert.strictEqual(scope.editor.selectedElement, null);
			assert.strictEqual(scope.editor.selectedBackground, false);
			assert.strictEqual(scope.editor.selectedRow, null);
			assert.strictEqual(scope.editor.selectedColumn, null);
			assert.strictEqual(scope.selectedColorKey(), null);
			scope.selectEditorMode('color');
			assert.strictEqual(scope.editor.selectedElement, null);
			scope.selectEditorMode('design');
			assert.strictEqual(scope.editor.selectedElement, null);
		}
	});

	it('loads version 2 schemes as themes without changing saved widget IDs', () => {
		const { scope: original } = loadSettings();
		original.selectEditorMode('color');
		original.createStyle(true);
		const theme = JSON.parse(JSON.stringify(original.getSelectedScheme()));
		const legacy = { version: 2, styles: [], colorSchemes: [theme] };
		const { scope, writes, editor } = loadSettings(legacy);
		assert.strictEqual(scope.widgetStyles.version, 3);
		assert.strictEqual(scope.widgetStyles.themes[0].id, theme.id);
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes.length, 0);
		scope.selectEditorMode('color');
		scope.editor.selectedSchemeId = 'custom:' + theme.id;
		scope.getSelectedScheme().name = 'Updated theme';
		scope.saveSettings();
		assert.strictEqual(writes[0].value.version, 3);
		assert.strictEqual(writes[0].value.themes[0].id, theme.id);
		assert.strictEqual(writes[0].value.colorSchemes, undefined);
		assert.strictEqual(editor.isValidCollection({ version: 3, styles: [], themes: [theme], colorSchemes: [] }), false);
	});

	it('toggles designer selections without changing the design or bypassing validation', () => {
		const { scope, homey, writes } = loadSettings(null, null, null, true, null, null, true);
		const original = JSON.stringify(scope.getSelectedStyle());
		const cases = [
			{ toggle: () => scope.toggleWidgetBackground(), selected: () => scope.editor.selectedBackground },
			{ toggle: () => scope.toggleVisibilityRow(1), selected: () => scope.editor.selectedRow === 1 },
			{ toggle: () => scope.toggleColumn(1, 1), selected: () => !!scope.editor.selectedColumn },
			{ toggle: () => scope.toggleLayoutElement('name'), selected: () => scope.editor.selectedElement === 'name' }
		];
		for (const item of cases) {
			item.toggle();
			assert.strictEqual(item.selected(), true);
			item.toggle();
			assert.strictEqual(item.selected(), false);
			assert.strictEqual(scope.editor.selectedElement, null);
			assert.strictEqual(scope.editor.selectedRow, null);
			assert.strictEqual(scope.editor.selectedColumn, null);
			assert.strictEqual(scope.editor.selectedBackground, false);
			assert.strictEqual(scope.editor.rowRule, null);
		}
		scope.selectEditorMode('color');
		scope.toggleLayoutElement('duration');
		scope.toggleLayoutElement('duration');
		assert.strictEqual(scope.selectedColorKey(), null);
		scope.selectEditorMode('design');
		scope.toggleLayoutElement('name');
		const alerts = [];
		homey.alert = message => alerts.push(message);
		scope.editor.elementSizeForm = { $invalid: true };
		scope.toggleLayoutElement('name');
		assert.strictEqual(scope.editor.selectedElement, 'name');
		assert.deepStrictEqual(alerts, ['settings.style_size_invalid']);
		assert.strictEqual(JSON.stringify(scope.getSelectedStyle()), original);
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes.length, 0);
	});

	it('carries only shared selections between editable Designs and Themes', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectEditorMode('color');
		assert.strictEqual(scope.selectedColorKey(), null);
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectEditorMode('design');

		for (const select of [() => scope.selectVisibilityRow(1), () => scope.selectColumn(1, 1)]) {
			select();
			assert.ok(scope.editor.selectedRow || scope.editor.selectedColumn);
			scope.selectEditorMode('color');
			assert.strictEqual(scope.editor.selectedRow, null);
			assert.strictEqual(scope.editor.selectedColumn, null);
			assert.strictEqual(scope.editor.rowRule, null);
			assert.strictEqual(scope.selectedColorKey(), null);
			scope.selectEditorMode('design');
		}

		scope.selectLayoutElement('name');
		scope.selectEditorMode('color');
		assert.strictEqual(scope.selectedColorKey(), 'name');
		scope.selectEditorMode('design');
		assert.strictEqual(scope.editor.selectedElement, 'name');
		scope.selectWidgetBackground();
		scope.selectEditorMode('color');
		assert.strictEqual(scope.selectedColorKey(), 'background');
		scope.selectEditorMode('design');
		assert.strictEqual(scope.editor.selectedBackground, true);
	});

	it('does not restore a hidden selection after switching to a read-only preset', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectLayoutElement('name');
		scope.selectEditorMode('color');
		assert.strictEqual(scope.isSchemeReadOnly(), true);
		assert.strictEqual(scope.selectedColorKey(), null);
		scope.selectEditorMode('design');
		assert.strictEqual(scope.editor.selectedElement, null);
		const id = scope.editor.selectedStyleId;
		scope.selectWidgetBackground();
		scope.selectEditingStyle('builtin:current');
		scope.selectEditingStyle(id);
		assert.strictEqual(scope.editor.selectedBackground, false);
	});

	it('clears editor highlights after deleting a saved design or an unsaved theme', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectColumn(1, 1);
		assert.ok(scope.editor.selectedColumn);
		scope.deleteStyle();
		assert.strictEqual(scope.isDesignReadOnly(), true);
		assert.strictEqual(scope.editor.selectedColumn, null);
		assert.strictEqual(writes.length, 2);

		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.selectWidgetBackground();
		scope.deleteStyle();
		assert.strictEqual(scope.isSchemeReadOnly(), true);
		assert.strictEqual(scope.editor.selectedBackground, false);
		assert.strictEqual(scope.selectedColorKey(), null);
		assert.strictEqual(writes.length, 2);
	});

	it('keeps moved elements and reordered rows and columns selected', () => {
		const { scope } = loadSettings(null, null, null, true, null, null, true);
		scope.toggleLayoutElement('name');
		scope.moveGroupedElement('name', 2, 1, 0);
		assert.strictEqual(scope.getSelectedStyle().groups.normal.elements.name.row, 2);
		assert.strictEqual(scope.editor.selectedElement, 'name');
		scope.toggleVisibilityRow(1);
		scope.moveDesignerRow(1, 2);
		assert.strictEqual(scope.editor.selectedRow, 2);
		scope.toggleColumn(3, 1);
		scope.moveDesignerColumn(3, 1, 2);
		assert.strictEqual(scope.editor.selectedColumn.row, 3);
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
	});

	it('deselects a legacy cell without interfering with moving it', () => {
		const { scope } = loadSettings(null, null, null, true, null, null, true);
		const cells = scope.getStyleCells();
		const source = cells.findIndex(Boolean);
		const target = cells.findIndex((value, index) => index !== source);
		const element = cells[source];
		scope.selectStyleCell(source);
		scope.selectStyleCell(source);
		assert.strictEqual(scope.editor.selectedElement, null);
		assert.strictEqual(scope.editor.selectedCell, null);
		scope.selectStyleCell(source);
		scope.selectStyleCell(target);
		assert.strictEqual(scope.getStyleCells()[target], element);
		assert.strictEqual(scope.editor.selectedElement, element);
		assert.strictEqual(scope.editor.selectedCell, null);
		scope.selectStyleCell(target);
		assert.strictEqual(scope.editor.selectedElement, null);
	});

	it('switches saved designs without confirmation after changing only preview options', () => {
		const prompts = [];
		const { scope } = loadSettings(null, (message, type, callback) => {
			prompts.push(message);
			callback(null, false);
		}, null, true);
		scope.editor.previewType = 'transition';
		scope.editor.previewState = 'paused';
		scope.editor.previewSize = 'compact';
		scope.editor.previewColumns = '3';
		scope.$digest();
		assert.strictEqual(scope.isDirty(), false);
		for (const id of ['builtin:centered', 'builtin:settings', 'builtin:current']) {
			scope.selectEditingStyle(id);
			scope.$digest();
			assert.strictEqual(scope.editor.selectedStyleId, id);
			assert.strictEqual(scope.isDirty(), false);
		}
		assert.deepStrictEqual(prompts, []);
	});

	it('migrates older preview preset row counts without losing edits or writing automatically', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const initial = loadSettings(null, null, null, true);
		const designs = ['builtin:current', ...runtime.builtInDesignDefinitions.map(item => item.id)]
			.filter(id => id !== 'builtin:transitions')
			.map(id => JSON.parse(JSON.stringify(initial.editor.designFromStyle(id === 'builtin:current'
				? initial.scope.getSelectedStyle() : initial.scope.builtInDesigns.find(item => item.id === id)))));
		designs.forEach(design => { delete design.rowCounts; });
		const vertical = designs.find(design => design.id === 'builtin:vertical');
		vertical.columnRowSpans.compact[1][0] = 5;
		vertical.columnRowSpans.normal[1][0] = 5;
		vertical.columnRowSpans.large[1][0] = 5;
		const centered = designs.find(design => design.id === 'builtin:centered');
		centered.groups.compact.elements.name.row = 5;
		const dashboard = designs.find(design => design.id === 'builtin:dashboard');
		dashboard.rowTopPadding = { compact: { 5: 8 } };
		const snapshot = { version: 2, styles: designs, colorSchemes: [] };
		designs.forEach(design => assert.strictEqual(initial.editor.isValidCollection({ version: 2, styles: [design], colorSchemes: [] }), true, design.id));
		let prompts = 0;
		const { scope, writes } = loadSettings(null, (message, type, callback) => {
			prompts++;
			callback(null, false);
		}, null, true, snapshot);
		assert.strictEqual(writes.length, 0);
		assert.strictEqual(scope.getSelectedStyle().rowCounts.compact, 3);
		assert.strictEqual(scope.builtInDesigns.find(item => item.id === 'builtin:centered').rowCounts.compact, 5);
		assert.strictEqual(scope.builtInDesigns.find(item => item.id === 'builtin:dashboard').rowCounts.compact, 5);
		const migrated = scope.builtInDesigns.find(item => item.id === 'builtin:vertical');
		assert.strictEqual(migrated.rowCounts.compact, 4);
		assert.strictEqual(migrated.columnRowSpans.compact[1][0], 4);
		assert.strictEqual(scope.isDirty(), false);
		scope.editor.previewColumns = '3';
		scope.selectEditingStyle('builtin:centered');
		assert.strictEqual(scope.editor.selectedStyleId, 'builtin:centered');
		assert.strictEqual(prompts, 0);
		scope.getSelectedStyle().name = 'Modified';
		scope.selectEditingStyle('builtin:current');
		assert.strictEqual(scope.editor.selectedStyleId, 'builtin:centered');
		assert.strictEqual(prompts, 1);
		scope.saveSettings();
		assert.strictEqual(writes[0].key, 'previewBuiltIns');
		const reloaded = loadSettings(null, null, null, true, writes[0].value).scope;
		assert.strictEqual(reloaded.getSelectedStyle().rowCounts.compact, 3);
	});

	it('shares button shapes across sizes until a size override is enabled', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		scope.selectLayoutElement('play');
		scope.editButtonShape('square');
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.editButtonShape(), 'square');
		scope.buttonShapeOverride(true);
		scope.editButtonShape('round');
		scope.editor.previewSize = 'normal';
		assert.strictEqual(scope.editButtonShape(), 'square');
		scope.editButtonShape('round');
		scope.editButtonShape('square');
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.editButtonShape(), 'round');
		scope.buttonShapeOverride(false);
		assert.strictEqual(scope.editButtonShape(), 'square');
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		const style = scope.getSelectedStyle();
		style.buttonShapes.base.play = 'invalid';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.buttonShapes.base.play = 'square';
		scope.saveSettings();
		assert.strictEqual(loadSettings(writes[0].value).scope.widgetStyles.styles[0].buttonShapes.base.play, 'square');
	});

	it('saves per-state button borders and transparent backgrounds in a color scheme', () => {
		const { scope, editor, writes } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.selectLayoutElement('play');
		scope.editor.previewState = 'inactive';
		scope.buttonBorder('grey');
		scope.editor.colorValues.play = 'none';
		scope.updateColorOverride('play');
		scope.editor.previewState = 'running';
		assert.strictEqual(scope.buttonBorder(), 'inherit');
		scope.buttonBorder('red');
		assert.strictEqual(scope.getSelectedScheme().borderOverrides.running.play, 'red');
		scope.buttonBorder('inherit');
		assert.strictEqual(scope.buttonBorder(), 'inherit');
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.getSelectedScheme().borderOverrides.running.play = 'invalid';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		delete scope.getSelectedScheme().borderOverrides.running.play;
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		const scheme = reloaded.widgetStyles.themes[0];
		assert.strictEqual(scheme.borderColors.play, 'grey');
		assert.strictEqual(scheme.colors.play, 'none');
	});

	it('adds up to ten rows per size and saves, reloads, reorders and copies their layouts', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectWidgetBackground();
		scope.$digest();
		scope.designRowCount(10);
		scope.$digest();
		assert.strictEqual(scope.groupedRows(false).length, 10);
		scope.moveGroupedElement('name', 10, 1);
		scope.reorderDesigner('row', '10', '9');
		assert.strictEqual(style.groups.normal.elements.name.row, 9);
		scope.selectColumn(1, 1);
		assert.ok(scope.availableColumnRowSpans().includes(10));
		scope.editor.columnRowSpan = 10;
		scope.updateColumnRowSpan();
		assert.strictEqual(style.columnRowSpans.normal[1][0], 10);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.editor.copyLayoutFrom = 'normal';
		scope.editor.previewSize = 'large';
		scope.copySizeLayout();
		assert.strictEqual(scope.designRowCount(), 10);
		assert.strictEqual(style.groups.large.elements.name.row, 9);
		assert.strictEqual(style.rowCounts.compact, 3);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.designRowCount(), 10);
		assert.strictEqual(reloaded.groupedRows(false).length, 10);
	});

	it('confirms reductions, moves affected base and state elements to Unused, and shortens spans', () => {
		let confirmed = false;
		const { scope, editor } = loadSettings(null, (message, type, callback) => callback(null, confirmed));
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectWidgetBackground();
		scope.$digest();
		const style = scope.getSelectedStyle();
		scope.designRowCount(10);
		scope.moveGroupedElement('name', 10, 1);
		style.groups.normal.overrides.paused = { duration: { row: 9, group: 1, order: 1 } };
		editor.setColumnRowSpan(style, 'normal', 1, 1, 10);
		editor.setRowTopPadding(style, 'normal', 10, 20);
		scope.$digest();
		const before = JSON.stringify(style);
		scope.designRowCount(4);
		assert.strictEqual(JSON.stringify(style), before);
		confirmed = true;
		scope.designRowCount(4);
		scope.$digest();
		assert.strictEqual(scope.designRowCount(), 4);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(style.groups.normal.elements.name)), { row: 0, group: 1, order: 1 });
		assert.deepStrictEqual(JSON.parse(JSON.stringify(style.groups.normal.overrides.paused.duration)), { row: 0, group: 1, order: 1 });
		assert.strictEqual(style.columnRowSpans.normal[1][0], 4);
		assert.strictEqual(style.rowTopPadding.normal[10], undefined);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.undoEdit();
		scope.$digest();
		assert.strictEqual(scope.designRowCount(), 10);
		assert.strictEqual(style.groups.normal.elements.name.row, 10);
	});

	it('retains five rows for older designs and rejects positions beyond the configured count', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		delete style.rowCounts;
		assert.strictEqual(scope.designRowCount(), 5);
		style.groups.normal.elements.name.row = 6;
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.rowCounts = { normal: 6 };
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		style.rowCounts.normal = 11;
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('keeps Size and its preview together in a bounded sticky panel after the preview options', () => {
		const options = html.indexOf('id="preview-columns"');
		const tiles = html.indexOf('class="style-preview-tile-controls');
		const size = html.indexOf('class="style-preview-sticky"');
		const preview = html.indexOf('class="style-preview-columns"');
		assert.ok(options !== -1 && options < tiles && tiles < size && size < preview);
		assert.match(html.slice(size, preview), /id="preview-size"[^>]*ng-model="editor\.previewSize"/);
		assert.match(css, /\.style-preview-sticky\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
		assert.match(html.slice(size, preview), /sticky-border/);
		assert.match(css, /\.style-preview-sticky\.is-stuck::after\s*\{[^}]*border-bottom:/);
		assert.match(css, /\.style-preview-sticky\s*\{[^}]*padding-bottom:\s*12px;/);
		assert.match(css, /\.style-preview-sticky\.is-stuck\[data-editable="true"\] \.style-preview-rows\s*\{[^}]*max-height:\s*45vh;[^}]*max-height:\s*45dvh;[^}]*overflow-y:\s*auto;/);
		assert.match(css, /\.style-preview-sticky \.style-preview-columns\s*\{[^}]*flex-shrink:\s*0;/);
		assert.match(css, /\.style-preview-rows,\s*\.style-preview\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*max-width:\s*450px;/);
	});

	it('pins only an editable visible preview after its original position crosses the settings edge', () => {
		let sentinelTop = 100;
		let editable = 'true';
		let visible = true;
		let stuck = false;
		let destroyed;
		let watch;
		let pending;
		let removed = false;
		const events = {};
		const sentinel = {
			setAttribute() {},
			getBoundingClientRect: () => ({ top: sentinelTop }),
			remove() { removed = true; }
		};
		const tabs = { offsetHeight: 58 };
		const settingsPage = {
			querySelector: () => tabs,
			style: { setProperty(name, value) { assert.strictEqual(value, '58px'); } }
		};
		const scroller = {
			parentNode: settingsPage,
			clientHeight: 500,
			getBoundingClientRect: () => ({ top: 0 }),
			addEventListener(name, callback) { events[name] = callback; },
			removeEventListener(name) { delete events[name]; }
		};
		const sticky = {
			closest: () => scroller,
			parentNode: { insertBefore(node) { assert.strictEqual(node, sentinel); } },
			getClientRects: () => visible ? [1] : [],
			getAttribute: () => editable,
			classList: { toggle(name, value) { stuck = value; } }
		};
		const { directives, window } = loadSettings(null, null, null, false, null, {
			document: { createElement: () => sentinel }
		});
		window.setTimeout = callback => { pending = callback; return 1; };
		window.clearTimeout = () => { pending = null; };
		const scope = {
			activeTab: 'widgets',
			$watch(get, callback) { watch = callback; },
			$evalAsync(callback) { callback(); },
			$on(name, callback) { destroyed = callback; }
		};
		directives.stickyBorder().link(scope, [sticky]);
		pending();
		assert.strictEqual(stuck, false);
		sentinelTop = -1;
		events.scroll();
		pending();
		assert.strictEqual(stuck, true);
		editable = 'false';
		watch();
		pending();
		assert.strictEqual(stuck, false);
		editable = 'true';
		visible = false;
		events.scroll();
		pending();
		assert.strictEqual(stuck, false);
		destroyed();
		assert.strictEqual(removed, true);
		assert.strictEqual(events.scroll, undefined);
	});

	it('selects theme elements from the designer without allowing layout changes', () => {
		const { scope } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		const before = JSON.stringify(design);
		const elements = scope.designerRowLayout().rows.flatMap(row => row.groups.flatMap(group => group.elements));
		assert.ok(elements.includes('name') && elements.includes('duration'));
		assert.ok(scope.unusedElements().includes('remaining'));
		scope.toggleLayoutElement('duration');
		assert.strictEqual(scope.selectedColorKey(), 'duration');
		scope.editor.foregroundValues.duration = 'red';
		scope.updateForeground('duration');
		assert.strictEqual(scope.getSelectedScheme().foregroundOverrides.running.duration, 'red');
		scope.moveGroupedElement('duration', 1, 1);
		scope.moveDesignerRow(1, 2);
		scope.moveDesignerColumn(3, 1, 2);
		scope.editor.position = { row: 1, group: 1, order: 1 };
		scope.updateLayoutPosition();
		assert.strictEqual(JSON.stringify(design), before);
		scope.toggleLayoutElement('duration');
		assert.strictEqual(scope.selectedColorKey(), null);
		scope.toggleLayoutElement('remaining');
		assert.strictEqual(scope.selectedColorKey(), 'remaining');
		scope.toggleWidgetBackground();
		assert.strictEqual(scope.selectedColorKey(), 'background');
		assert.ok(html.includes('<div ng-if="getSelectedStyle().groups">'));
		assert.ok(html.includes('ng-if="editor.mode === \'color\' && !getSelectedStyle().groups" class="style-color-elements"'));
	});

	it('offers import and export through Templates without separate JSON-file controls', () => {
		assert.doesNotMatch(html, /exportStyle\(|chooseStyleImport\(|style-import-file/);
		assert.match(html, /ng-click="openTemplates\(\)"/);
		assert.match(html, /ng-click="selectTemplateSection\('export'\)"/);
		assert.match(html, /ng-click="selectTemplateSection\('import'\)"/);
	});

	it('copies only layout settings between sizes after confirmation', () => {
		let confirmed = false;
		const { scope, writes, editor } = loadSettings(null, (message, type, callback) => callback(null, confirmed));
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.buttonTexts.normal.start = 'Keep';
		style.reservedElements = { normal: { duration: true } };
		style.elementSizes.overrides.normal.duration = 37;
		const normal = JSON.stringify(style.groups.normal);
		scope.copySizeLayout();
		assert.strictEqual(JSON.stringify(style.groups.normal), normal);
		confirmed = true;
		scope.copySizeLayout();
		assert.strictEqual(JSON.stringify(style.groups.normal), JSON.stringify(style.groups.compact));
		assert.strictEqual(style.buttonTexts.normal.start, 'Keep');
		assert.strictEqual(style.elementSizes.overrides.normal.duration, 37);
		assert.strictEqual(style.reservedElements.normal.duration, true);
		style.groups.normal.elements.name.order = 9;
		assert.notStrictEqual(style.groups.normal.elements.name.order, style.groups.compact.elements.name.order);
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		assert.strictEqual(writes[0].value.styles[0].buttonTexts.normal.start, 'Keep');
	});

	it('undoes and redoes changes to the current item and discards confirmed switches', () => {
		const savebar = html.match(/<footer class="settings-savebar"[^>]*>[\s\S]*?<\/footer>/)[0];
		assert.ok(savebar.indexOf('ng-click="undoEdit()"') < savebar.indexOf('ng-click="saveSettings()"'));
		assert.ok(savebar.indexOf('ng-click="saveSettings()"') < savebar.indexOf('ng-click="redoEdit()"'));
		assert.match(savebar, /ng-attr-aria-label="\{\{ t\('settings\.style_undo'\) \}\}"><i class="fa-solid fa-rotate-left" aria-hidden="true"><\/i>/);
		assert.match(savebar, /ng-attr-aria-label="\{\{ t\('settings\.style_redo'\) \}\}"><i class="fa-solid fa-rotate-right" aria-hidden="true"><\/i>/);
		assert.match(css, /\.settings-savebar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)/);
		let confirmed = false;
		const { scope } = loadSettings(null, (message, type, callback) => callback(null, confirmed));
		scope.createStyle(true);
		scope.saveSettings();
		const id = scope.editor.selectedStyleId;
		scope.$digest();
		scope.heightMode('auto');
		scope.$digest();
		assert.strictEqual(scope.canUndoEdit(), true);
		scope.undoEdit();
		scope.$digest();
		assert.strictEqual(scope.heightMode(), 'minimum');
		assert.strictEqual(scope.canRedoEdit(), true);
		scope.redoEdit();
		scope.$digest();
		assert.strictEqual(scope.heightMode(), 'auto');
		scope.selectEditingStyle('builtin:current');
		assert.strictEqual(scope.editor.selectedStyleId, id);
		assert.strictEqual(scope.heightMode(), 'auto');
		confirmed = true;
		scope.selectEditingStyle('builtin:current');
		scope.$digest();
		assert.strictEqual(scope.editor.selectedStyleId, 'builtin:current');
		assert.strictEqual(scope.canUndoEdit(), false);
		assert.strictEqual(scope.widgetStyles.styles[0].heightModes.normal, 'minimum');
		scope.selectEditingStyle(id);
		scope.$digest();
		scope.heightMode('auto');
		scope.$digest();
		scope.undoEdit();
		scope.$digest();
		scope.heightMode('minimum-without-inputs');
		scope.$digest();
		assert.strictEqual(scope.canRedoEdit(), false);
		scope.saveSettings();
		scope.selectEditingStyle('builtin:current');
		scope.$digest();
		scope.selectEditingStyle(id);
		scope.$digest();
		assert.strictEqual(scope.canUndoEdit(), true);
	});

	it('warns before leaving with unsaved settings and discards unsaved new items on switching mode', () => {
		const { scope, listeners } = loadSettings();
		let prevented = false;
		const event = { preventDefault() { prevented = true; }, returnValue: undefined };
		listeners.beforeunload(event);
		assert.strictEqual(prevented, false);
		scope.createStyle(true);
		listeners.beforeunload(event);
		assert.strictEqual(prevented, true);
		assert.strictEqual(event.returnValue, '');
		scope.selectEditorMode('color');
		assert.strictEqual(scope.widgetStyles.styles.length, 0);
		assert.strictEqual(scope.editor.mode, 'color');
		assert.strictEqual(scope.editor.selectedStyleId, 'builtin:current');
		scope.createStyle(true);
		scope.selectEditorMode('design');
		assert.strictEqual(scope.widgetStyles.themes.length, 0);
		assert.strictEqual(scope.editor.selectedSchemeId, 'builtin:current');
		assert.ok(scope.getSelectedScheme());
	});

	it('keeps widget and General saves independent, including validation and failures', () => {
		const { scope, writes, homey } = loadSettings();
		scope.createStyle(true);
		scope.roundOfDurationsFlowcards = 3;
		scope.saveSettings();
		assert.deepStrictEqual(writes.map(write => write.key), ['widgetStyles']);
		assert.strictEqual(scope.savedDecimals, 2);
		assert.strictEqual(scope.isWidgetDirty(), false);
		assert.strictEqual(scope.isGeneralDirty(), true);
		scope.getSelectedStyle().name = 'Unsaved design';
		scope.editor.elementSizeForm = { $invalid: true };
		scope.saveGeneralSettings();
		assert.deepStrictEqual(writes.map(write => write.key), ['widgetStyles', 'roundOfDurationsFlowcards']);
		assert.strictEqual(scope.savedDecimals, 3);
		assert.strictEqual(scope.isWidgetDirty(), true);
		assert.strictEqual(scope.isGeneralDirty(), false);
		const alerts = [];
		homey.alert = message => alerts.push(message);
		scope.roundOfDurationsFlowcards = 11;
		scope.saveGeneralSettings();
		assert.deepStrictEqual(alerts, ['settings.invalid_decimals']);
		assert.strictEqual(writes.length, 2);
		scope.roundOfDurationsFlowcards = 4;
		homey.set = (key, value, callback) => callback(new Error('Save failed'));
		scope.saveGeneralSettings();
		assert.strictEqual(scope.savedDecimals, 3);
		assert.strictEqual(scope.isGeneralDirty(), true);
		assert.strictEqual(scope.savingSettings, false);
		assert.match(alerts[1], /Save failed/);
	});

	it('confirms tab exits for designs and themes, cancelling or discarding only editor edits', () => {
		for (const mode of ['design', 'color']) {
			let confirmed = false;
			let prompts = 0;
			const { scope } = loadSettings(null, (message, type, callback) => {
				prompts++;
				callback(null, confirmed);
			}, null, true);
			scope.selectEditorMode(mode);
			scope.createStyle(true);
			scope.saveSettings();
			const item = scope.getEditingItem();
			const name = item.name;
			item.name = 'Edited';
			scope.roundOfDurationsFlowcards = 5;
			scope.selectTab('widgets');
			assert.strictEqual(prompts, 0);
			scope.selectTab('general');
			assert.strictEqual(prompts, 1);
			assert.strictEqual(scope.activeTab, 'widgets');
			assert.strictEqual(item.name, 'Edited');
			confirmed = true;
			scope.selectTab('chronographs');
			assert.strictEqual(prompts, 2);
			assert.strictEqual(scope.activeTab, 'chronographs');
			assert.strictEqual(item.name, name);
			assert.strictEqual(scope.isWidgetDirty(), false);
			assert.strictEqual(scope.isGeneralDirty(), true);
			scope.selectTab('general');
			assert.strictEqual(prompts, 2);
		}
	});

	it('guards template entry but opens external links without discarding editor changes', () => {
		let confirmed = false;
		let prompts = 0;
		const { scope, homey } = loadSettings(null, (message, type, callback) => {
			prompts++;
			callback(null, confirmed);
		}, null, true);
		const urls = [];
		homey.openURL = url => urls.push(url);
		scope.createStyle(true);
		scope.openWidgetExchange();
		assert.strictEqual(prompts, 0);
		assert.strictEqual(urls.length, 1);
		assert.strictEqual(scope.isWidgetDirty(), true);
		scope.openTemplates();
		assert.strictEqual(prompts, 1);
		assert.strictEqual(scope.templates.open, false);
		confirmed = true;
		scope.openTemplates();
		assert.strictEqual(scope.templates.open, true);
		assert.strictEqual(scope.widgetStyles.styles.length, 0);
		scope.selectTab('general');
		assert.strictEqual(scope.activeTab, 'general');
		assert.strictEqual(prompts, 2);
	});

	it('scopes save controls to Widgets and General without history controls on General', () => {
		const widgetFooter = html.match(/<footer class="settings-savebar"[^>]*>[\s\S]*?<\/footer>/)[0];
		assert.ok(widgetFooter.includes('ng-show="activeTab === \'widgets\' && !templates.open"'));
		const generalFooter = html.match(/<footer class="settings-general-savebar"[^>]*>[\s\S]*?<\/footer>/)[0];
		assert.ok(generalFooter.includes('ng-show="activeTab === \'general\'"'));
		assert.ok(generalFooter.includes('ng-click="saveGeneralSettings()"'));
		assert.ok(!generalFooter.includes('undoEdit') && !generalFooter.includes('redoEdit'));
	});

	it('keeps color-scheme history separate and restores unsaved scheme edits on switching', () => {
		const { scope } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		scope.$digest();
		scope.editor.previewState = 'inactive';
		scope.editor.colorValues.icon = 'red';
		scope.updateColorOverride('icon');
		scope.$digest();
		assert.strictEqual(scope.canUndoEdit(), true);
		scope.undoEdit();
		scope.$digest();
		assert.strictEqual(scope.getSelectedScheme().colors.icon, 'blue');
		scope.redoEdit();
		scope.$digest();
		assert.strictEqual(scope.getSelectedScheme().colors.icon, 'red');
		scope.selectEditorMode('design');
		scope.$digest();
		assert.strictEqual(scope.widgetStyles.themes[0].colors.icon, 'blue');
		assert.strictEqual(scope.canUndoEdit(), false);
	});

	it('previews three independently selectable types without changing saved designs', () => {
		const { scope } = loadSettings();
		const original = JSON.stringify(scope.getSelectedStyle());
		scope.editor.previewColumns = '3';
		assert.deepStrictEqual(Array.from(scope.visiblePreviewTiles(), tile => tile.type), ['timer', 'stopwatch', 'transition']);
		const elements = type => scope.groupedRows(true, null, type)
			.flatMap(row => Array.from(row.groups).flatMap(group => Array.from(group.elements)));
		assert.ok(elements('timer').includes('progress'));
		assert.ok(!elements('stopwatch').includes('progress'));
		scope.previewTiles[1].type = 'transition';
		assert.strictEqual(scope.visiblePreviewTiles()[1].type, 'transition');
		scope.editor.previewState = 'starting';
		assert.strictEqual(scope.previewTileState(null, 'stopwatch'), 'inactive');
		assert.strictEqual(scope.previewTileState(null, 'transition'), 'starting');
		assert.strictEqual(JSON.stringify(scope.getSelectedStyle()), original);
		assert.strictEqual(scope.isDirty(), false);
	});

	it('opens hidden start fields before starting timer and transition tiles in multi-widget previews', () => {
		const { scope, writes } = loadSettings();
		scope.editor.previewType = 'stopwatch';
		for (const design of ['builtin:small', 'builtin:tiny']) {
			scope.editor.selectedStyleId = design;
			const original = JSON.stringify(scope.getSelectedStyle());
			for (const columns of ['1', '2', '3']) {
				scope.editor.previewColumns = columns;
				assert.strictEqual(scope.previewCardRowStyle()['grid-template-columns'],
					columns === 'single' ? undefined : 'repeat(' + columns + ', minmax(0, 1fr))');
				for (const size of ['normal', 'large']) {
					scope.editor.previewSize = size;
					for (const type of ['timer', 'transition']) {
						const elements = () => scope.groupedRows(true, null, type)
							.flatMap(row => Array.from(row.groups).flatMap(group => Array.from(group.elements)));
						scope.editor.previewState = 'inactive';
						assert.ok(elements().includes('start'));
						assert.ok(!elements().includes('fields'));
						scope.previewAction('start', type);
						assert.strictEqual(scope.editor.previewState, 'starting');
						assert.ok(elements().includes('fields'));
						scope.previewAction('cancel', type);
						assert.strictEqual(scope.editor.previewState, 'inactive');
						scope.previewAction('start', type);
						scope.previewAction('start', type);
						assert.strictEqual(scope.editor.previewState, 'running');
						assert.ok(!elements().includes('fields'));
						scope.previewAction('pause', type);
						scope.previewAction('play', type);
						assert.strictEqual(scope.editor.previewState, 'running');
						assert.ok(!elements().includes('fields'));
					}
				}
			}
			assert.strictEqual(JSON.stringify(scope.getSelectedStyle()), original);
		}
		scope.editor.previewState = 'inactive';
		scope.previewAction('start', 'stopwatch');
		assert.strictEqual(scope.editor.previewState, 'running');
		assert.strictEqual(writes.length, 0);
		assert.strictEqual(scope.isDirty(), false);
	});

	it('highlights selected visible elements without highlighting placeholders or measurements', () => {
		const grouped = html.slice(html.indexOf('id="grouped-preview.html"'), html.indexOf('id="cell-preview.html"'));
		const legacy = html.slice(html.indexOf('id="cell-preview.html"'), html.indexOf('id="preview-fields.html"'));
		assert.ok(grouped.includes("'style-preview-selected': !previewScenario && editor.selectedElement === element && group.placeholders.indexOf(element) === -1"));
		assert.ok(legacy.includes("'style-preview-selected': !previewScenario && editor.selectedElement === element"));
		assert.ok(legacy.includes("'style-preview-selected': !previewScenario && editor.selectedElement === 'cancel'"));
		assert.ok(html.includes("'style-preview-show-selection': editor.mode === 'design' ? !isDesignReadOnly() : !isSchemeReadOnly()"));
		assert.match(css, /\.style-preview-show-selection \.style-preview-selected\s*\{[^}]*outline:\s*2px solid/);
	});

	it('highlights the selected widget, row or column without affecting spanning-row layout', () => {
		const { scope } = loadSettings();
		scope.editor.selectedStyleId = 'builtin:vertical';
		const layout = scope.previewRowLayout(null, 'timer');
		assert.strictEqual(layout.spanning, true);
		for (const row of layout.rows) {
			const start = Number(row.groups[0].gridRow.split(' / ')[0]);
			assert.strictEqual(scope.previewRowTrack(row), start + ' / ' + (start + 1));
		}
		const grouped = html.slice(html.indexOf('id="grouped-preview.html"'), html.indexOf('id="cell-preview.html"'));
		assert.match(html, /'style-preview-widget-selected': editor\.selectedBackground/);
		assert.match(grouped, /editor\.selectedRow === row\.id/);
		assert.match(grouped, /editor\.selectedColumn\.row === row\.id && editor\.selectedColumn\.group === group\.id/);
		assert.match(grouped, /'grid-row': previewRowTrack\(row\)/);
		assert.match(css, /\.style-preview-row-overlay\s*\{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/);
	});

	it('keeps the multi-widget column preview separate from saved designs', () => {
		const { scope, writes } = loadSettings();
		const originalStyle = JSON.stringify(scope.getSelectedStyle());
		assert.strictEqual(scope.editor.previewColumns, 'single');
		for (const columns of ['1', '2', '3', 'single']) {
			scope.editor.previewColumns = columns;
			assert.strictEqual(scope.isDirty(), false);
			assert.strictEqual(JSON.stringify(scope.getSelectedStyle()), originalStyle);
		}
		assert.strictEqual(writes.length, 0);
		assert.match(html, /id="preview-columns"[^>]*ng-model="editor\.previewColumns"/);
		assert.match(html, /ng-style="previewCardRowStyle\(\)"/);
		assert.match(css, /\.style-preview-columns\s*\{[^}]*gap:\s*8px;/);
	});

	it('previews row separation and colors without changing saved designs', () => {
		const { scope, writes, window } = loadSettings();
		const manifest = require('../widgets/multiple_chronographs/widget.compose.json');
		const separator = manifest.settings.find(setting => setting.id === 'rowSeparator');
		const colors = manifest.settings.find(setting => setting.id === 'rowSeparatorColor');
		assert.strictEqual(scope.editor.previewSeparator, separator.value);
		assert.strictEqual(scope.editor.previewSeparatorColor, colors.value);
		assert.strictEqual(scope.previewSeparatorColor(), 'currentColor');
		for (const [columns, expected] of [['1', [1, 1, 1]], ['2', [2, 1]], ['3', [3]], ['single', [1]]]) {
			scope.editor.previewColumns = columns;
			assert.deepStrictEqual(Array.from(scope.previewRows(), row => row.length), expected);
			assert.strictEqual(scope.previewRows(), scope.previewRows());
		}
		scope.editor.previewColumns = '2';
		scope.previewTiles[1].type = 'timer';
		assert.strictEqual(scope.previewRows()[0][1].type, 'timer');
		for (const color of colors.values) {
			scope.editor.previewSeparatorColor = color.id;
			assert.strictEqual(scope.previewSeparatorColor(), color.id === 'default'
				? 'currentColor' : window.ChronographWidgetStyle.valueColor(color.id));
		}
		scope.editor.previewSeparator = 'line';
		assert.strictEqual(scope.isDirty(), false);
		assert.strictEqual(writes.length, 0);
		assert.match(html, /id="preview-separator"[^>]*ng-model="editor\.previewSeparator"/);
		assert.match(html, /id="preview-separator-color"[^>]*ng-model="editor\.previewSeparatorColor"/);
		assert.match(css, /\.style-preview-frame-multiple\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--chronograph-surface\);[^}]*box-shadow:\s*var\(--chronograph-frame-shadow\)/);
		assert.match(css, /\[data-separator="line"\] \.style-preview-columns \+ \.style-preview-columns/);
		assert.match(css, /\[data-separator\^="rows"\] \.style-preview-columns/);
	});

	it('localizes chronograph operation errors in settings and preserves unknown errors', () => {
		const { scope, homey } = loadSettings();
		const chronograph = { name: 'Test', data: { type: 'Timer' }, running: true };
		let alert;
		homey.alert = message => { alert = message; };
		for (const [message, expected] of [
			['Chronograph is not active', 'settings.error_not_active'],
			['Unexpected external failure', 'Unexpected external failure']
		]) {
			homey.api = (method, url, data, callback) => callback(new Error(message));
			scope.toggleChronograph(chronograph);
			assert.strictEqual(alert, expected);
		}
	});

	it('reserves span units in covered rows and restores them when the span ends', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectColumn(1, 1);
		scope.editor.columnRowSpan = 4;
		scope.updateColumnRowSpan();
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 1)), [3, 1]);
		for (const row of [2, 3, 4]) {
			assert.strictEqual(editor.rowSpanCapacity(style, 'normal', row), 1);
			assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', row)), [1]);
			scope.selectVisibilityRow(row);
			assert.deepStrictEqual(Array.from(scope.availableRowColumns()), [1]);
			scope.selectColumn(row, 1);
			assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1]);
		}
		scope.selectColumn(1, 1);
		scope.editor.columnRowSpan = 1;
		scope.updateColumnRowSpan();
		for (const row of [2, 3, 4]) {
			assert.strictEqual(editor.rowSpanCapacity(style, 'normal', row), 4);
			assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', row)), [4]);
		}
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
	});

	it('reduces row capacity by the width of multiple overlapping spans', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 3);
		editor.setColumnRowSpan(style, 'normal', 1, 1, 3);
		editor.setColumnRowSpan(style, 'normal', 1, 2, 4);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 1)), [2, 1, 1]);
		assert.strictEqual(editor.rowSpanCapacity(style, 'normal', 2), 1);
		assert.strictEqual(editor.rowSpanCapacity(style, 'normal', 4), 3);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 4)), [2, 1]);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('reduces existing multi-unit columns before merging covered-row columns', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 2);
		editor.setRowColumns(style, 'normal', 2, 3);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 1)), [3, 1]);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 2)), [2, 1, 1]);
		scope.selectColumn(1, 2);
		scope.editor.columnRowSpan = 2;
		scope.updateColumnRowSpan();
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 2)), [1, 1, 1]);
		assert.strictEqual(editor.rowColumns(style, 'normal', 2), 3);
		scope.selectVisibilityRow(2);
		assert.deepStrictEqual(Array.from(scope.availableRowColumns()), [1, 2, 3]);
		scope.selectColumn(2, 1);
		assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1, 2, 3]);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + writes[0].value.styles[0].id;
		assert.deepStrictEqual(Array.from(editor.columnSpans(reloaded.getSelectedStyle(), 'normal', 2)), [1, 1, 1]);
	});

	it('updates covered row budgets when the spanning width changes', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 2);
		scope.selectColumn(1, 2);
		scope.editor.columnRowSpan = 3;
		scope.updateColumnRowSpan();
		scope.editor.columnSpan = 2;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 1)), [2, 2]);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 3)), [1, 1]);
		scope.selectVisibilityRow(3);
		assert.deepStrictEqual(Array.from(scope.availableRowColumns()), [1, 2]);
		scope.selectColumn(3, 1);
		assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1, 2]);
		scope.selectColumn(1, 2);
		scope.editor.columnSpan = 1;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 3)), [1, 2]);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('does not offer a row span where all remaining units are reserved', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 2);
		scope.selectColumn(1, 1);
		scope.editor.columnRowSpan = 3;
		scope.updateColumnRowSpan();
		scope.selectColumn(2, 1);
		assert.deepStrictEqual(Array.from(scope.availableColumnRowSpans()), [1]);
	});

	it('normalizes previously saved row widths without writing until settings are saved', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const oldStyle = JSON.parse(JSON.stringify(scope.widgetStyles));
		oldStyle.styles[0].columnRowSpans = { normal: { 1: [2] } };
		const loaded = loadSettings(oldStyle);
		const style = loaded.scope.widgetStyles.styles[0];
		assert.strictEqual(loaded.scope.isDirty(), true);
		assert.strictEqual(loaded.writes.length, 0);
		assert.strictEqual(editor.rowSpanCapacity(style, 'normal', 2), 1);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 2)), [1]);
		loaded.scope.saveSettings();
		assert.strictEqual(loaded.writes.length, 1);
		assert.strictEqual(editor.isValidCollection(loaded.writes[0].value), true);
		const again = loadSettings(loaded.writes[0].value);
		assert.strictEqual(again.scope.isDirty(), false);
	});

	it('persists column row spans independently per size and preserves them on reorder', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewSize = 'normal';
		scope.selectColumn(1, 1);
		assert.deepStrictEqual(Array.from(scope.availableColumnRowSpans()), [1, 2, 3, 4, 5]);
		scope.editor.columnRowSpan = 4;
		scope.updateColumnRowSpan();
		assert.strictEqual(scope.groupedRows(false)[0].groups[0].rowSpan, 4);
		scope.editor.previewSize = 'compact';
		scope.designRowCount(5);
		scope.selectColumn(2, 1);
		scope.editor.columnRowSpan = 3;
		scope.updateColumnRowSpan();
		scope.moveDesignerRow(2, 3);
		assert.strictEqual(scope.groupedRows(false)[2].groups[0].rowSpan, 3);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + writes[0].value.styles[0].id;
		reloaded.editor.previewSize = 'normal';
		reloaded.selectColumn(1, 1);
		assert.strictEqual(reloaded.editor.columnRowSpan, 4);
		reloaded.editor.previewSize = 'compact';
		reloaded.selectColumn(3, 1);
		assert.strictEqual(reloaded.editor.columnRowSpan, 3);
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), true);
		writes[0].value.styles[0].columnRowSpans.normal[1][0] = 6;
		assert.strictEqual(editor.isValidCollection(writes[0].value), false);
	});

	it('keeps row spans with surviving columns and clamps them when rows move', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 3);
		editor.setColumnRowSpan(style, 'normal', 1, 2, 5);
		editor.moveColumn(style, 'normal', 1, 2, 3);
		assert.deepStrictEqual(Array.from(editor.columnRowSpans(style, 'normal', 1)), [1, 1, 5]);
		editor.moveRow(style, 'normal', 1, 4);
		assert.deepStrictEqual(Array.from(editor.columnRowSpans(style, 'normal', 4)), [1, 1, 2]);
		editor.setRowColumns(style, 'normal', 4, 2);
		assert.deepStrictEqual(Array.from(editor.columnRowSpans(style, 'normal', 4)), [1, 1]);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('displays the actual column across all spanned rows', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		scope.selectColumn(1, 1);
		scope.editor.columnRowSpan = 4;
		scope.updateColumnRowSpan();
		const layout = scope.designerRowLayout();
		assert.strictEqual(layout.spanning, true);
		assert.strictEqual(layout.rows[0].groups[0].gridRow, '1 / 5');
		assert.strictEqual(scope.designerRowLayout(), layout);
		assert.ok(!html.includes('class="style-column-row-span"'));
		assert.ok(html.includes('id="style-column-row-span"'));
		assert.ok(!html.includes('class="style-row-span-continuation"'));
		assert.ok(html.includes("'grid-row': group.gridRow"));
	});

	it('requires the selected row, column, element or legacy cell before dragging', () => {
		assert.ok(html.includes("editor.selectedRow === row.id ? 'true' : 'false'"));
		assert.ok(html.includes("editor.selectedColumn.row === row.id && editor.selectedColumn.group === group.id ? 'true' : 'false'"));
		assert.ok(html.includes("editor.selectedElement === element ? 'true' : 'false'"));
		assert.ok(html.includes("element && editor.selectedCell === $index ? 'true' : 'false'"));
		assert.strictEqual((editorScript.match(/getAttribute\('draggable'\) !== 'true'/g) || []).length, 4);
	});

	it('makes the column drag handle span the full width of the column', () => {
		assert.match(css, /\.style-group-number\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*24px;/);
		assert.match(html, /class="hy-nostyle style-group-number"[\s\S]*?style-reorder-drag="column"/);
	});

	it('persists independent timer and transition field rows per design size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		assert.strictEqual(scope.timerInputFieldRows(), 1);
		assert.strictEqual(scope.transitionInputFieldRows(), 2);
		scope.timerInputFieldRows(2);
		scope.transitionInputFieldRows(3);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.timerInputFieldRows(), 1);
		assert.strictEqual(scope.transitionInputFieldRows(), 2);
		scope.transitionInputFieldRows(1);
		scope.editor.previewSize = 'large';
		scope.transitionInputFieldRows(5);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const saved = writes[0].value;
		const reloaded = loadSettings(saved).scope;
		reloaded.editor.selectedStyleId = 'custom:' + saved.styles[0].id;
		for (const [size, timer, transition] of [['normal', 2, 3], ['compact', 1, 1], ['large', 1, 5]]) {
			reloaded.editor.previewSize = size;
			assert.strictEqual(reloaded.timerInputFieldRows(), timer);
			assert.strictEqual(reloaded.transitionInputFieldRows(), transition);
			reloaded.editor.previewType = 'transition';
			assert.strictEqual(new Set(Array.from(reloaded.previewFieldLayout().positions, position => position['grid-row'])).size, transition);
		}
		saved.styles[0].inputFieldRows.normal.timer = 3;
		assert.strictEqual(editor.isValidCollection(saved), false);
		saved.styles[0].inputFieldRows.normal.timer = 1;
		saved.styles[0].inputFieldRows.normal.transition = 0;
		assert.strictEqual(editor.isValidCollection(saved), false);
	});

	it('labels height with the selected size and explains that height is per size', () => {
		assert.ok(html.includes("t('settings.style_height') }} ({{ t('settings.style_' + editor.previewSize)"));
		assert.ok(html.includes('aria-describedby="style-height-hint"'));
		assert.ok(html.includes("t('settings.style_height_size_hint')"));
	});

	it('sorts all design and scheme dropdown groups by displayed name without changing saved order', () => {
		const { scope } = loadSettings();
		const items = [{ name: 'Zulu 2' }, { name: 'alpha 10' }, { name: 'Alpha 2' }];
		assert.deepStrictEqual(Array.from(scope.sortedStyleOptions(items), item => item.name), ['Alpha 2', 'alpha 10', 'Zulu 2']);
		assert.deepStrictEqual(items.map(item => item.name), ['Zulu 2', 'alpha 10', 'Alpha 2']);
		items[0].name = 'Aardvark';
		assert.strictEqual(scope.sortedStyleOptions(items)[0], items[0]);
		for (const source of ['builtInDesigns', 'builtInSchemes', 'widgetStyles.styles', 'widgetStyles.themes']) {
			assert.ok(html.split('sortedStyleOptions(' + source + ')').length - 1 >= 2, source);
		}
	});

	it('saves stretch column alignment independently per size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectColumn(1, 1);
		scope.editor.columnAlignment = 'stretch';
		scope.updateColumnAlignment();
		assert.strictEqual(scope.groupedRows(false).find(row => row.id === 1).groups[0].alignment, 'stretch');
		assert.strictEqual(editor.columnAlignments(style, 'large', 1)[0], 'left');
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const saved = loadSettings(writes[0].value).scope.widgetStyles.styles[0];
		assert.strictEqual(editor.columnAlignments(saved, 'normal', 1)[0], 'stretch');
	});

	it('shows a labeled insertion position before, after, in an empty column and in Unused', () => {
		let insertion;
		const body = { children: [], appendChild(node) { this.children.push(node); } };
		const document = {
			body,
			createElement() {
				return {
					style: {}, children: [],
					appendChild(node) { this.children.push(node); },
					remove() { body.children.splice(body.children.indexOf(this), 1); }
				};
			}
		};
		const module = {
			factory(name, factory) { if (name === 'styleGroupInsertion') insertion = factory(); return this; },
			directive() { return this; }
		};
		vm.runInNewContext(editorScript, { angular: { module: () => module }, window: {}, document });
		const item = (id, label, top) => ({
			textContent: label,
			getAttribute: () => id,
			getBoundingClientRect: () => ({ top, bottom: top + 20, height: 20 })
		});
		const items = [item('icon', 'Icon', 20), item('name', 'Name', 40)];
		const slot = {
			classList: { add() {}, remove() {} },
			getAttribute: () => '1:1',
			querySelectorAll: () => items,
			getBoundingClientRect: () => ({ left: 10, width: 100, top: 0, bottom: 80 })
		};
		const translations = {
			'settings.style_drop_before': 'Before __element__',
			'settings.style_drop_after': 'After __element__',
			'settings.style_drop_empty': 'In empty column',
			'settings.style_drop_unused': 'Move to Unused'
		};
		const t = key => translations[key];
		insertion.start('status');
		assert.strictEqual(insertion.show(slot, 21, t), 0);
		assert.strictEqual(body.children[0].children[0].textContent, 'Before Icon');
		assert.strictEqual(body.children[0].style.top, '20px');
		assert.strictEqual(insertion.show(slot, 55, t), 2);
		assert.strictEqual(body.children[0].children[0].textContent, 'After Name');
		assert.strictEqual(body.children[0].style.top, '60px');
		insertion.start('icon');
		assert.strictEqual(insertion.show(slot, 21, t), 0);
		assert.strictEqual(body.children[0].children[0].textContent, 'Before Name');
		slot.querySelectorAll = () => [];
		assert.strictEqual(insertion.show(slot, 10, t), 0);
		assert.strictEqual(body.children[0].children[0].textContent, 'In empty column');
		slot.getAttribute = () => '0:1';
		assert.strictEqual(insertion.show(slot, 10, t), 0);
		assert.strictEqual(body.children[0].children[0].textContent, 'Move to Unused');
		insertion.clear();
		assert.strictEqual(body.children.length, 0);
	});

	it('edits, previews, moves and persists row top padding independently per size', () => {
		const { scope, writes, editor, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		scope.selectVisibilityRow(1);
		assert.strictEqual(scope.editor.rowTopPadding, 0);
		scope.editor.rowTopPadding = 24;
		scope.updateRowTopPadding();
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).topPadding, 24);
		assert.strictEqual(editor.rowTopPadding(style, 'compact', 1), 0);
		scope.editor.rowPaddingForm = { $invalid: true };
		scope.saveSettings();
		scope.selectVisibilityRow(2);
		assert.strictEqual(scope.editor.selectedRow, 1);
		assert.strictEqual(writes.length, 0);
		assert.deepStrictEqual(alerts, ['settings.style_row_padding_invalid', 'settings.style_row_padding_invalid']);
		scope.editor.rowPaddingForm.$invalid = false;
		scope.moveDesignerRow(1, 3);
		assert.strictEqual(editor.rowTopPadding(style, 'normal', 3), 24);
		assert.strictEqual(editor.rowTopPadding(style, 'normal', 1), 0);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(editor.rowTopPadding(reloaded.getSelectedStyle(), 'normal', 3), 24);
		style.rowTopPadding.normal[3] = 101;
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('edits independent size overrides using immutable app defaults', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		scope.selectLayoutElement('duration');
		assert.strictEqual(scope.defaultElementSize(), 20);
		assert.strictEqual(scope.overrideElementSize(), null);
		scope.overrideElementSize(17);
		assert.strictEqual(scope.elementSize('duration'), 17);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.defaultElementSize(), 14);
		assert.strictEqual(scope.overrideElementSize(), null);
		scope.overrideElementSize(23);
		assert.strictEqual(scope.elementSize('duration'), 23);
		scope.overrideElementSize(101);
		assert.strictEqual(scope.elementSize('duration'), 23);
		assert.strictEqual(scope.overrideElementSize(), 101);
		scope.overrideElementSize(24);
		assert.strictEqual(scope.elementSize('duration'), 24);
		scope.editor.previewSize = 'large';
		assert.strictEqual(scope.elementSize('duration'), 32);
		scope.allowDesignShrink(false);
		assert.strictEqual(style.allowShrink, false);
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.selectLayoutElement('duration');
		assert.strictEqual(reloaded.allowDesignShrink(), false);
		assert.strictEqual(reloaded.overrideElementSize(), 17);
		reloaded.editor.previewSize = 'compact';
		assert.strictEqual(reloaded.elementSize('duration'), 24);
		reloaded.overrideElementSize(null);
		assert.strictEqual(reloaded.overrideElementSize(), null);
		assert.strictEqual(reloaded.elementSize('duration'), 14);
		assert.strictEqual(reloaded.getSelectedStyle().elementSizes.overrides.normal.duration, 17);
		assert.ok(!html.includes('id="style-size-base"'));
		assert.ok(!html.includes('ng-model="hasElementSizeOverride"'));
		assert.match(html, /ng-attr-placeholder="{{ defaultElementSize\(\) }}"/);
	});

	it('edits button text per size, preserves icon-only labels, and restores translated defaults', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		scope.selectLayoutElement('start');
		assert.strictEqual(scope.useDefaultButtonText(), true);
		assert.strictEqual(scope.editButtonText(), '');
		assert.strictEqual(scope.buttonText('start'), 'settings.widget_start');
		scope.useDefaultButtonText(false);
		assert.strictEqual(scope.editButtonText(), '');
		assert.strictEqual(scope.buttonText('start'), '');
		scope.editButtonText('Begin');
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.useDefaultButtonText(), true);
		scope.useDefaultButtonText(false);
		scope.editButtonText(null);
		assert.strictEqual(scope.buttonText('start'), '');
		scope.selectLayoutElement('pause');
		scope.useDefaultButtonText(false);
		scope.editButtonText('Wait');
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.selectLayoutElement('start');
		assert.strictEqual(reloaded.buttonText('start'), 'Begin');
		reloaded.editor.previewSize = 'compact';
		assert.strictEqual(reloaded.buttonText('start'), '');
		assert.strictEqual(reloaded.buttonText('pause'), 'Wait');
		reloaded.useDefaultButtonText(true);
		assert.strictEqual(reloaded.editButtonText(), '');
		assert.strictEqual(reloaded.buttonText('start'), 'settings.widget_start');
		assert.strictEqual(reloaded.useDefaultButtonText(), true);
		reloaded.useDefaultButtonText(false);
		assert.strictEqual(reloaded.editButtonText(), '');
		assert.match(html, /ng-attr-placeholder="{{ useDefaultButtonText\(\) \? buttonText\(editor\.selectedElement\) : '' }}"/);
	});

	it('saves hidden-element space reservations independently per size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		scope.selectLayoutElement('duration');
		assert.strictEqual(scope.reserveElementSpace(), false);
		scope.reserveElementSpace(true);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.reserveElementSpace(), false);
		scope.selectLayoutElement('progress');
		scope.reserveElementSpace(true);
		scope.selectLayoutElement('icon');
		scope.reserveElementSpace(true);
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.selectLayoutElement('duration');
		assert.strictEqual(reloaded.reserveElementSpace(), true);
		reloaded.editor.previewSize = 'compact';
		assert.strictEqual(reloaded.reserveElementSpace(), false);
		reloaded.selectLayoutElement('progress');
		assert.strictEqual(reloaded.reserveElementSpace(), true);
		reloaded.selectLayoutElement('icon');
		assert.strictEqual(reloaded.reserveElementSpace(), true);
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), true);
		reloaded.getSelectedStyle().reservedElements.compact.progress = 'yes';
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), false);
	});

	it('enables icon space reservation in every built-in design and size', () => {
		const { scope } = loadSettings();
		for (const id of ['builtin:current', ...scope.builtInDesigns.map(design => design.id)]) {
			scope.editor.selectedStyleId = id;
			for (const size of ['compact', 'normal', 'large']) {
				scope.editor.previewSize = size;
				scope.selectLayoutElement('icon');
				assert.strictEqual(scope.reserveElementSpace(), true, id + ' ' + size);
			}
		}
		assert.match(html, /editor\.selectedElement === 'icon' \|\| editor\.selectedElement === 'duration'/);
	});

	it('does not reserve icon space when its entire preview row is hidden', () => {
		const { scope } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		const row = style.groups.normal.elements.icon.row;
		style.rowVisibility.normal[row] = { states: [], startForm: false, actions: {} };
		scope.selectLayoutElement('icon');
		scope.reserveElementSpace(true);
		const hasIconPlaceholder = () => scope.groupedRows(true).some(item =>
			item.groups.some(group => group.placeholders.includes('icon')));
		assert.strictEqual(hasIconPlaceholder(), false);
		assert.ok(!scope.groupedRows(true).some(item => item.id === row));
		scope.reserveElementSpace(false);
		assert.strictEqual(hasIconPlaceholder(), false);
	});

	it('excludes hidden padded rows from the current preview but includes them in minimum-height scenarios', () => {
		const { scope } = loadSettings();
		scope.editor.selectedStyleId = 'builtin:widgetkeeper';
		scope.createStyle(true);
		scope.editor.previewSize = 'large';
		scope.editor.previewState = 'inactive';
		scope.getSelectedStyle().rowAlignments.large[4] = 'middle';
		assert.ok(!scope.previewRowLayout().rows.some(row => row.id === 5));
		assert.strictEqual(scope.previewRowLayout().rows.find(row => row.id === 4).alignment, 'middle');
		const running = scope.previewRowLayout(scope.heightScenarios.find(scenario => scenario.state === 'running'));
		assert.strictEqual(running.rows.find(row => row.id === 5).topPadding, 16);
		assert.ok(scope.groupedRows(false).some(row => row.id === 5));
	});

	it('adds reservation defaults to older built-in preview snapshots without replacing edits', () => {
		const { scope, writes } = loadSettings(null, null, null, true);
		scope.editor.selectedStyleId = 'builtin:vertical';
		scope.getSelectedStyle().name = 'Edited Vertical';
		scope.saveSettings();
		const saved = writes[0].value;
		const vertical = saved.styles.find(style => style.id === 'builtin:vertical');
		delete vertical.reservedElements;
		const tiny = saved.styles.find(style => style.id === 'builtin:tiny');
		tiny.reservedElements = { normal: { duration: false, icon: false } };
		const reloaded = loadSettings(null, null, null, true, saved).scope;
		reloaded.editor.selectedStyleId = 'builtin:vertical';
		assert.strictEqual(reloaded.getSelectedStyle().name, 'Edited Vertical');
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.normal.progress, true);
		reloaded.editor.selectedStyleId = 'builtin:tiny';
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.normal.duration, false);
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.normal.icon, false);
		assert.strictEqual(reloaded.getSelectedStyle().reservedElements.compact.icon, true);
	});

	it('rejects invalid button text settings', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		for (const value of [
			{ normal: { start: 5 } }, { normal: { start: 'x'.repeat(81) } },
			{ normal: { name: 'text' } }, { unknown: { start: 'text' } }
		]) {
			style.buttonTexts = value;
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		}
	});

	it('preserves legacy base sizes on migration and resets each size to its app default', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		style.elementSizes = {
			base: { icon: 25, name: 14, status: 12, duration: 14, play: 28, pause: 28, stop: 28, fields: 32, cancel: 28, start: 32, progress: 6 },
			overrides: { compact: {}, normal: { duration: 20 }, large: { icon: 38, duration: 32 } }
		};
		scope.selectLayoutElement('icon');
		assert.strictEqual(scope.overrideElementSize(), 25);
		scope.overrideElementSize(null);
		assert.strictEqual(scope.elementSize('icon'), 16);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		assert.strictEqual(style.elementSizes.base, undefined);
		assert.strictEqual(style.elementSizes.overrides.compact.icon, 25);
		assert.strictEqual(style.elementSizes.overrides.large.icon, 38);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.styles[0].elementSizes.overrides.large.icon, 38);
	});

	it('rejects invalid stored element sizes and shrink options', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(false);
		const style = scope.getSelectedStyle();
		style.elementSizes.overrides.normal.icon = 101;
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.elementSizes.overrides.normal.icon = 20;
		style.allowShrink = 'no';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('blocks saving and changing elements while a size input is invalid', () => {
		const { scope, writes, homey } = loadSettings();
		const alerts = [];
		homey.alert = message => alerts.push(message);
		scope.createStyle(false);
		scope.selectLayoutElement('duration');
		scope.editor.elementSizeForm = { $invalid: true };
		scope.saveSettings();
		scope.selectLayoutElement('name');
		assert.strictEqual(writes.length, 0);
		assert.strictEqual(scope.editor.selectedElement, 'duration');
		assert.deepStrictEqual(alerts, ['settings.style_size_invalid', 'settings.style_size_invalid']);
		scope.editor.elementSizeForm.$invalid = false;
		scope.saveSettings();
		assert.strictEqual(writes.length, 1);
	});

	it('opens Widgets by default only in the local preview', () => {
		const preview = loadSettings(undefined, undefined, undefined, true).scope;
		assert.strictEqual(preview.activeTab, 'widgets');
		preview.selectTab('general');
		assert.strictEqual(preview.activeTab, 'general');
		assert.strictEqual(loadSettings().scope.activeTab, 'chronographs');
	});

	it('uses drag and drop instead of element position controls without hiding progress settings', () => {
		for (const id of ['style-element', 'style-row', 'style-group', 'style-order']) {
			assert.ok(!html.includes(`id="${id}"`), id);
		}
		assert.match(html, /style-group-drop=/);
		assert.match(html, /style-group-element=/);
		assert.match(html, /<fieldset class="hy-nostyle style-progress-controls" ng-if="editor\.mode === 'design' && editor\.selectedElement === 'progress'">/);
	});

	it('shares the built-in design and scheme with widget rendering', () => {
		const { scope } = loadSettings();
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const design = runtime.currentDesign();
		const editorDesign = scope.getSelectedStyle();
		for (const key of Object.keys(design)) {
			assert.deepStrictEqual(JSON.parse(JSON.stringify(editorDesign[key])), design[key], key);
		}
		const editorScheme = scope.getSelectedScheme();
		const scheme = runtime.currentScheme();
		for (const key of Object.keys(scheme)) {
			assert.deepStrictEqual(JSON.parse(JSON.stringify(editorScheme[key])), scheme[key], key);
		}
	});

	it('previews and copies each built-in color scheme without saving the preset', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { scope, writes, editor } = loadSettings();
		for (const preset of runtime.builtInSchemeDefinitions) {
			scope.selectEditorMode('color');
			scope.editor.selectedSchemeId = preset.id;
			const selected = scope.getSelectedScheme();
			assert.strictEqual(scope.isBuiltInStyle(), true);
			assert.strictEqual(selected.name, preset.nameKey);
			assert.deepStrictEqual(JSON.parse(JSON.stringify(selected.colors)), runtime.builtInScheme(preset.id).colors);
			scope.deleteStyle();
			assert.strictEqual(scope.getSelectedScheme(), selected);
			scope.selectEditorMode('design');
			assert.strictEqual(scope.getSelectedScheme(), selected);
			scope.selectEditorMode('color');
			scope.createStyle(true);
			const copy = scope.getSelectedScheme();
			assert.strictEqual(scope.isBuiltInStyle(), false);
			assert.deepStrictEqual(copy.progressColors && JSON.parse(JSON.stringify(copy.progressColors)), runtime.builtInScheme(preset.id).progressColors);
			copy.colors.icon = 'red';
			assert.strictEqual(selected.colors.icon, preset.id === 'builtin:settings' ? 'blue' : preset.accent);
		}
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		assert.strictEqual(reloaded.widgetStyles.themes.length, runtime.builtInSchemeDefinitions.length);
		assert.ok(reloaded.widgetStyles.themes.every(scheme => scheme.colors.icon === 'red'));
	});

	it('previews built-in designs and saves editable, independent copies', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { scope, writes, editor } = loadSettings();
		for (const preset of runtime.builtInDesignDefinitions) {
			scope.selectEditorMode('design');
			scope.editor.selectedStyleId = preset.id;
			const selected = scope.getSelectedStyle();
			assert.strictEqual(scope.isBuiltInStyle(), true);
			assert.strictEqual(scope.isPresetDesign(), true);
			assert.strictEqual(selected.name, preset.nameKey);
			assert.deepStrictEqual(JSON.parse(JSON.stringify(selected.groups)), runtime.builtInDesign(preset.id).groups);
			scope.deleteStyle();
			assert.strictEqual(scope.getSelectedStyle(), selected);
			scope.createStyle(true);
			const copy = scope.getSelectedStyle();
			assert.strictEqual(scope.isBuiltInStyle(), false);
			assert.strictEqual(scope.isPresetDesign(), false);
			copy.elementSizes.overrides.normal.duration = 25;
			assert.notStrictEqual(selected.elementSizes.overrides.normal.duration, 25);
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		}
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		assert.strictEqual(reloaded.widgetStyles.styles.length, runtime.builtInDesignDefinitions.length);
	});

	it('keeps all built-in color schemes read-only while allowing editable copies', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { scope } = loadSettings();
		for (const id of ['builtin:current', ...runtime.builtInSchemeDefinitions.map(preset => preset.id)]) {
			scope.selectEditorMode('color');
			scope.editor.selectedSchemeId = id;
			const before = JSON.stringify(scope.getSelectedScheme());
			for (const state of ['inactive', 'running', 'paused', 'starting']) {
				scope.editor.previewState = state;
				scope.editor.colorValues.play = 'red';
				scope.editor.colorValues.background = 'red';
				scope.editor.foregroundValues.name = 'red';
				scope.updateColorOverride('play');
				scope.updateColorOverride('background');
				scope.updateForeground('name');
				for (const size of ['compact', 'normal', 'large']) {
					scope.editor.previewSize = size;
					scope.progressBackground('red');
					scope.progressForeground('red');
				}
			}
			scope.selectEditorMode('design');
			scope.progressForeground('red');
			assert.strictEqual(JSON.stringify(scope.getSelectedScheme()), before, id);
			scope.selectEditorMode('color');
			scope.createStyle(true);
			scope.editor.previewState = 'inactive';
			scope.editor.colorValues.play = 'red';
			scope.updateColorOverride('play');
			scope.progressForeground('red');
			assert.strictEqual(scope.getSelectedScheme().colors.play, 'red');
			assert.strictEqual(scope.progressForeground(), 'red');
		}
		assert.ok(html.includes('ng-disabled="editor.mode === \'color\' ? isSchemeReadOnly() : isDesignReadOnly()"'));
		assert.ok(html.includes('class="hy-nostyle style-colors" ng-disabled="isSchemeReadOnly()"'));
		assert.ok(html.includes('class="hy-nostyle style-progress-controls" ng-disabled="isSchemeReadOnly()"'));
	});

	it('keeps every built-in design unchanged while preview actions remain interactive', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { scope } = loadSettings();
		for (const id of ['builtin:current', ...runtime.builtInDesignDefinitions.map(preset => preset.id)]) {
			scope.selectEditorMode('design');
			scope.editor.selectedStyleId = id;
			scope.editor.selectedElement = 'duration';
			const before = JSON.stringify(scope.getSelectedStyle());
			for (const size of ['compact', 'normal', 'large']) {
				scope.editor.previewSize = size;
				scope.heightMode('auto');
				scope.allowDesignShrink(false);
				scope.overrideElementSize(99);
				scope.timerInputFieldRows(2);
				scope.transitionInputFieldRows(3);
				scope.progressDirection('top-bottom');
				scope.progressTimerMode('remaining');
				scope.progressShowSteps(true);
				scope.editor.previewType = 'timer';
				scope.editor.previewState = 'starting';
				for (const [action, expected] of [['start', 'running'], ['pause', 'paused'],
					['play', 'running'], ['stop', 'inactive'], ['cancel', 'inactive']]) {
					scope.previewAction(action);
					assert.strictEqual(scope.editor.previewState, expected, `${id} ${size} ${action}`);
				}
			}
			scope.selectEditorMode('color');
			scope.progressDirection('top-bottom');
			assert.strictEqual(JSON.stringify(scope.getSelectedStyle()), before, id);
		}
		assert.ok(html.includes('ng-if="editor.mode === \'design\' ? !isDesignReadOnly() : !isSchemeReadOnly()"'));
		assert.ok(html.includes("'settings.style_design_builtin_hint'"));
		assert.ok(!html.includes("'settings.style_builtin_hint'"));
	});

	it('shows editing-only controls only for editable designs and schemes', () => {
		const { scope } = loadSettings();
		assert.strictEqual(scope.isDesignReadOnly(), true);
		assert.strictEqual(scope.isSchemeReadOnly(), true);
		scope.createStyle(true);
		assert.strictEqual(scope.isDesignReadOnly(), false);
		scope.selectEditorMode('color');
		scope.createStyle(true);
		assert.strictEqual(scope.isSchemeReadOnly(), false);
		const preview = loadSettings(null, null, null, true).scope;
		assert.strictEqual(preview.isDesignReadOnly(), false);
		assert.strictEqual(preview.isSchemeReadOnly(), false);

		const designOnly = 'ng-if="editor.mode === \'design\' && !isDesignReadOnly()"';
		for (const marker of ['settings.style_design', 'for="style-height"',
			'id="style-height"', 'id="style-height-hint"', 'for="style-layout-mode"', 'id="style-layout-mode"']) {
			const tag = html.split('\n').find(line => line.includes(marker) && line.includes(designOnly));
			assert.ok(tag, marker);
		}
		assert.ok(html.includes(designOnly + ' class="hy-nostyle style-progress-full-row"><input'));
		const nameCondition = 'ng-if="editor.mode === \'color\' ? !isSchemeReadOnly() : !isDesignReadOnly()"';
		assert.ok(html.split('\n').some(line => line.includes(nameCondition) && line.includes('for="widget-style-name"')));
		assert.ok(html.split('\n').some(line => line.includes(nameCondition) && line.includes('id="widget-style-name"')));
		assert.ok(html.includes('ng-if="editor.mode === \'design\' ? !isDesignReadOnly() : !isSchemeReadOnly()"'));
		for (const id of ['preview-scheme', 'preview-design', 'preview-type', 'preview-size', 'preview-state']) {
			assert.ok(html.includes('id="' + id + '"'), id);
		}
	});

	it('edits and saves built-in designs and schemes only in the local preview', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		const { scope, writes } = loadSettings(null, null, null, true);
		for (const id of ['builtin:current', ...runtime.builtInDesignDefinitions.map(item => item.id)]) {
			scope.selectEditorMode('design');
			scope.editor.selectedStyleId = id;
			assert.strictEqual(scope.isBuiltInStyle(), true);
			assert.strictEqual(scope.isDesignReadOnly(), false);
			scope.heightMode('auto');
			if (id === 'builtin:current') {
				scope.getSelectedStyle().name = 'Preview default design';
				assert.strictEqual(scope.defaultDesignName(), 'Preview default design');
			}
			scope.selectColumn(1, 1);
			scope.editor.columnRowSpan = 2;
			scope.updateColumnRowSpan();
			assert.strictEqual(scope.getSelectedStyle().columnRowSpans.normal[1][0], 2);
			scope.deleteStyle();
			assert.strictEqual(scope.editor.selectedStyleId, id);
		}
		scope.saveSettings();
		for (const id of ['builtin:current', ...runtime.builtInSchemeDefinitions.map(item => item.id)]) {
			scope.selectEditorMode('color');
			scope.editor.selectedSchemeId = id;
			assert.strictEqual(scope.isSchemeReadOnly(), false);
			scope.editor.previewState = 'inactive';
			scope.editor.colorValues.icon = 'red';
			scope.updateColorOverride('icon');
			if (id === 'builtin:current') {
				scope.getSelectedScheme().name = 'Preview default scheme';
				assert.strictEqual(scope.defaultSchemeName(), 'Preview default scheme');
			}
			assert.strictEqual(scope.getSelectedScheme().colors.icon, 'red');
			scope.deleteStyle();
			assert.strictEqual(scope.editor.selectedSchemeId, id);
		}
		assert.strictEqual(scope.isDirty(), true);
		scope.saveSettings();
		assert.strictEqual(writes.length, 2);
		assert.strictEqual(writes[1].key, 'previewBuiltIns');
		assert.strictEqual(scope.isDirty(), false);
		const reloaded = loadSettings(null, null, null, true, writes[1].value).scope;
		assert.strictEqual(reloaded.defaultDesignName(), 'Preview default design');
		assert.strictEqual(reloaded.defaultSchemeName(), 'Preview default scheme');
		for (const design of writes[1].value.styles) {
			reloaded.editor.selectedStyleId = design.id;
			assert.strictEqual(reloaded.heightMode(), 'auto');
			assert.strictEqual(reloaded.getSelectedStyle().columnRowSpans.normal[1][0], 2);
		}
		for (const scheme of writes[1].value.themes) {
			reloaded.editor.selectedSchemeId = scheme.id;
			assert.strictEqual(reloaded.getSelectedScheme().colors.icon, 'red');
		}
		assert.strictEqual(reloaded.isDirty(), false);
		const homey = loadSettings(null, null, null, false, writes[1].value).scope;
		assert.strictEqual(homey.isDesignReadOnly(), true);
		assert.strictEqual(homey.heightMode(), 'minimum');
		assert.strictEqual(homey.isSchemeReadOnly(), true);
	});

	it('keeps preview edits dirty when saving fails and rejects invalid stored snapshots', () => {
		const failure = loadSettings(null, null, (key, value, callback) => callback(new Error('preview save failed')), true);
		let message;
		failure.homey.alert = value => { message = value; };
		failure.scope.heightMode('auto');
		failure.scope.saveSettings();
		assert.strictEqual(failure.scope.isDirty(), true);
		assert.match(message, /preview save failed/);
		const invalid = loadSettings(null, null, null, true, { version: 1, styles: [] });
		assert.strictEqual(invalid.scope.stylesAvailable, false);
		assert.strictEqual(invalid.scope.isDesignReadOnly(), true);
	});

	it('defaults to the timer preview', () => {
		const { scope } = loadSettings();
		assert.strictEqual(scope.editor.previewType, 'timer');
	});

	it('migrates combined styles into independent designs and schemes without writing until saved', () => {
		const editor = loadSettings().editor;
		const old = editor.create('legacy', 'Legacy');
		old.groups = editor.currentGroups();
		old.progressSettings = { large: { background: 'red', foreground: 'green', direction: 'top-bottom', showSteps: true } };
		old.foregroundColors = { fields: 'white' };
		const { scope, writes } = loadSettings({ version: 1, styles: [old] });
		const design = scope.widgetStyles.styles[0];
		const scheme = scope.widgetStyles.themes[0];
		assert.strictEqual(writes.length, 0);
		assert.strictEqual(scope.isDirty(), true);
		assert.strictEqual(design.id, scheme.id);
		assert.strictEqual(design.colors, undefined);
		assert.strictEqual(design.progressSettings.large.direction, 'top-bottom');
		assert.strictEqual(design.progressSettings.large.background, undefined);
		assert.strictEqual(scheme.progressColors.large.background, 'red');
		assert.strictEqual(scheme.foregroundColors.fields, 'white');
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.version, 3);
		const reloaded = loadSettings(writes[0].value).scope;
		assert.strictEqual(reloaded.widgetStyles.styles[0].progressSettings.large.showSteps, true);
		assert.strictEqual(reloaded.widgetStyles.themes[0].progressColors.large.foreground, 'green');
		assert.strictEqual(reloaded.isDirty(), false);
	});

	it('deletes only the selected collection without saving unrelated edits', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const scheme = scope.getSelectedScheme();
		scope.saveSettings();
		design.name = 'Unsaved design';
		scope.deleteStyle();
		assert.strictEqual(scope.widgetStyles.styles[0].name, 'Unsaved design');
		assert.strictEqual(scope.widgetStyles.themes.length, 0);
		assert.strictEqual(writes[2].value.styles[0].name, writes[1].value.styles[0].name);
		assert.strictEqual(writes[2].value.themes.length, 0);
		assert.strictEqual(scheme.name, writes[1].value.themes[0].name);
	});

	it('rejects malformed or mixed version 2 design and scheme data', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		const mixed = JSON.parse(JSON.stringify(scope.widgetStyles));
		mixed.styles[0].colors = mixed.themes[0].colors;
		assert.strictEqual(editor.isValidCollection(mixed), false);
		const malformed = JSON.parse(JSON.stringify(scope.widgetStyles));
		malformed.themes[0].progressColors = { large: { direction: 'left-right' } };
		assert.strictEqual(editor.isValidCollection(malformed), false);
	});

	it('adds a configurable status bar without changing existing layouts', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const scheme = scope.getSelectedScheme();
		scope.saveSettings();
		scope.selectEditorMode('design');
		assert.strictEqual(style.groups.normal.elements.progress.row, 5);
		scope.moveGroupedElement('progress', 5, 1);
		scope.progressBackground('black');
		scope.progressForeground('green');
		scope.progressDirection('bottom-top');
		scope.progressTimerMode('remaining');
		scope.progressShowSteps(true);
		assert.strictEqual(scope.progressPercent('running'), 75);
		scope.editor.previewType = 'transition';
		assert.strictEqual(scope.progressPercent('running'), 25);
		scope.editor.previewValues.steps = 4;
		assert.deepStrictEqual(Array.from(scope.progressMarkers()), [25, 50, 75]);
		assert.strictEqual(scope.previewVisible('progress'), true);
		scope.editor.previewType = 'stopwatch';
		assert.strictEqual(scope.previewVisible('progress'), false);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[writes.length - 1].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.editor.selectedSchemeId = 'custom:' + scheme.id;
		assert.strictEqual(reloaded.progressDirection(), 'bottom-top');
		assert.strictEqual(reloaded.progressShowSteps(), true);
		assert.strictEqual(reloaded.progressBackground(), 'black');
		assert.strictEqual(reloaded.progressForeground(), 'green');
		reloaded.editor.previewSize = 'compact';
		assert.strictEqual(reloaded.progressDirection(), 'left-right');
		style.progressSettings.normal.direction = 'invalid';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('keeps status bar legends outside the grid and spans the checkbox and hint', () => {
		assert.ok(html.includes('class="hy-nostyle style-progress-controls"'));
		assert.ok(html.includes('class="hy-nostyle style-progress-full-row"'));
		assert.ok(html.includes('class="help-text style-progress-full-row"'));
		assert.ok(css.includes('.style-progress-full-row { grid-column: 1 / -1; }'));
	});

	it('moves rows and their settings and state positions only in the selected size', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.groups.normal.overrides.running = { name: { row: 4, group: 2, order: 1 } };
		const row = JSON.stringify(style.rowVisibility.normal[1]);
		const columns = style.rowColumns.normal[1];
		const large = JSON.stringify(style.groups.large);
		scope.moveDesignerRow(1, 4);
		assert.strictEqual(style.groups.normal.elements.name.row, 4);
		assert.strictEqual(style.groups.normal.overrides.running.name.row, 3);
		assert.strictEqual(style.groups.normal.elements.progress.row, 5);
		assert.strictEqual(JSON.stringify(style.rowVisibility.normal[4]), row);
		assert.strictEqual(style.rowColumns.normal[4], columns);
		assert.strictEqual(JSON.stringify(style.groups.large), large);
		assert.strictEqual(scope.editor.selectedRow, 4);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		assert.strictEqual(loadSettings(writes[0].value).scope.widgetStyles.styles[0].groups.normal.elements.name.row, 4);
	});

	it('reorders columns and all their per-state positions and presentation settings', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.groups.normal.overrides.running = { name: { row: 3, group: 1, order: 1 } };
		scope.moveDesignerColumn(3, 1, 2);
		assert.strictEqual(style.groups.normal.elements.duration.group, 2);
		assert.strictEqual(style.groups.normal.elements.play.group, 1);
		assert.strictEqual(style.groups.normal.overrides.running.name.group, 2);
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[3]), [1, 3]);
		assert.deepStrictEqual(Array.from(style.columnWidths.normal[3]), ['content', 'span']);
		assert.strictEqual(style.groups.large.elements.duration.group, 1);
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		assert.strictEqual(loadSettings(writes[0].value).scope.widgetStyles.styles[0].groups.normal.elements.duration.group, 2);
	});

	it('loads old grouped styles with the status bar unused', () => {
		const { editor } = loadSettings();
		const style = editor.create('legacy', 'Legacy');
		style.groups = editor.currentGroups();
		for (const size of ['compact', 'normal', 'large']) delete style.groups[size].elements.progress;
		const legacy = { version: 1, styles: [style] };
		assert.strictEqual(editor.isValidCollection(legacy), true);
		const reloaded = loadSettings(legacy).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.getSelectedStyle().groups.normal.elements.progress.row, 0);
	});

	it('uses the saved height and row alignment in the Default style', () => {
		const { scope, editor } = loadSettings();
		const style = scope.getSelectedStyle();
		assert.strictEqual(scope.heightMode(), 'minimum');
		assert.strictEqual(editor.rowAlignment(style, 'normal', 3), 'bottom');
		assert.strictEqual(editor.rowAlignment(style, 'large', 3), 'bottom');
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.heightMode(), 'minimum-without-inputs');
		assert.strictEqual(style.rowVisibility.compact[3].hideAfterSeconds, 10);
	});

	it('edits and persists fifth-row positions, visibility, alignment and column settings', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		assert.strictEqual(scope.groupedRows(false).some(row => row.id === 5), true);
		scope.moveGroupedElement('name', 5, 1);
		scope.selectVisibilityRow(5);
		scope.editor.rowColumns = 2;
		scope.updateRowColumns();
		scope.editor.rowAlignment = 'bottom';
		scope.updateRowAlignment();
		scope.editor.rowRule.running = false;
		scope.editor.rowRule.starting = true;
		scope.editor.rowRule.hideAfter = true;
		scope.editor.rowRule.seconds = 5;
		scope.updateRowRule();
		scope.selectColumn(5, 1);
		scope.editor.columnAlignment = 'right';
		scope.updateColumnAlignment();
		scope.editor.columnVerticalAlignment = 'bottom';
		scope.updateColumnVerticalAlignment();
		scope.editor.columnDirection = 'vertical';
		scope.updateColumnDirection();
		scope.editor.columnWidth = 'content';
		scope.updateColumnWidth();
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		scope.editor.editStatus = true;
		scope.editor.previewState = 'paused';
		scope.moveGroupedElement('icon', 5, 2);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		const saved = reloaded.getSelectedStyle();
		assert.strictEqual(saved.groups.normal.elements.name.row, 5);
		assert.strictEqual(saved.groups.normal.overrides.paused.icon.row, 5);
		assert.strictEqual(saved.rowVisibility.normal[5].hideAfterSeconds, 5);
		assert.strictEqual(editor.rowAlignment(saved, 'normal', 5), 'bottom');
		assert.strictEqual(saved.columnSpans.normal[5][0], 3);
		assert.strictEqual(saved.columnAlignments.normal[5][0], 'right');
		assert.strictEqual(saved.columnVerticalAlignments.normal[5][0], 'bottom');
		assert.strictEqual(saved.columnDirections.normal[5][0], 'vertical');
		assert.strictEqual(saved.columnWidths.normal[5][0], 'content');
		saved.groups.normal.elements.name.row = 6;
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), false);
	});

	it('places Design before preview controls in the shared selector grid', () => {
		assert.match(html, /class="style-design-selectors"[\s\S]*settings\.style_design[\s\S]*id="style-height"[\s\S]*id="style-layout-mode"[\s\S]*settings\.style_preview[\s\S]*id="preview-type"[\s\S]*id="preview-state"[\s\S]*<\/div>/);
	});

	it('sizes Large preview fields to match the Large action buttons', () => {
		assert.match(css, /\.style-preview-large \.style-widget-action\s*\{[^}]*height:\s*40px;/);
		assert.match(css, /\.style-preview-large \.style-widget-field\s*\{[^}]*height:\s*40px;[^}]*font-size:\s*16px;/);
		assert.match(css, /\.style-preview-large \.style-preview-chronograph-icon\s*\{[^}]*font-size:\s*20px;/);
	});

	it('stores the height setting separately for each size and validates it on reload', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.heightMode(), 'minimum-without-inputs');
		scope.heightMode('minimum');
		scope.editor.previewSize = 'large';
		assert.strictEqual(scope.heightMode(), 'minimum');
		scope.heightMode('auto');
		scope.saveSettings();
		const saved = writes[0].value;
		assert.strictEqual(saved.styles[0].heightModes.compact, 'minimum');
		assert.strictEqual(saved.styles[0].heightModes.large, 'auto');
		assert.strictEqual(editor.isValidCollection(saved), true);
		saved.styles[0].heightModes.large = 'invalid';
		assert.strictEqual(editor.isValidCollection(saved), false);
	});

	it('measures start form state independently of the current preview', () => {
		const { scope } = loadSettings();
		const starting = scope.heightScenarios.find(item => item.state === 'starting');
		assert.strictEqual(scope.isRowVisible(4, starting), true);
		assert.strictEqual(scope.isRowVisible(3, starting), false);
	});

	it('reserves non-input states separately from the existing input-inclusive minimum', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewSize = 'compact';
		scope.heightMode('minimum-without-inputs');
		const scenarios = scope.measureHeightScenarios();
		assert.deepStrictEqual(Array.from(scenarios, scenario => scenario.state), ['inactive', 'paused', 'running']);
		assert.strictEqual(scenarios.every(scenario => scenario.excludeFields), true);
		scope.editor.previewSize = 'normal';
		const inactive = scenarios[0];
		assert.strictEqual(scope.groupedRows(true, inactive).some(row =>
			row.groups.some(group => group.elements.includes('fields'))), false);
		assert.strictEqual(scope.groupedRows(true, scope.heightScenarios[0]).some(row =>
			row.groups.some(group => group.elements.includes('fields'))), true);
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + scope.getSelectedStyle().id;
		reloaded.editor.previewSize = 'compact';
		assert.strictEqual(reloaded.heightMode(), 'minimum-without-inputs');
		reloaded.heightMode('minimum');
		assert.strictEqual(reloaded.measureHeightScenarios().some(scenario => scenario.state === 'starting'), true);
	});

	it('reduces horizontal and vertical status bars in Compact', () => {
		assert.match(css, /\.style-preview-compact \.style-progress\s*\{\s*height:\s*6px;/);
		assert.match(css, /\.style-preview-compact \.style-progress\[data-direction="top-bottom"\]\s*\{[^}]*height:\s*48px;/);
	});

	it('persists custom style deletion without saving unrelated edits', () => {
		const { scope, writes } = loadSettings();
		scope.deleteStyle();
		assert.strictEqual(scope.isBuiltInStyle(), true);
		scope.createStyle(true);
		scope.saveSettings();
		scope.createStyle(true);
		scope.saveSettings();
		assert.strictEqual(writes[1].value.styles.length, 2);
		scope.widgetStyles.styles[0].name = 'Unsaved name';
		scope.roundOfDurationsFlowcards = 3;
		scope.deleteStyle();
		assert.strictEqual(scope.widgetStyles.styles.length, 1);
		assert.strictEqual(scope.isBuiltInStyle(), true);
		assert.strictEqual(scope.isDirty(), true);
		assert.strictEqual(writes.length, 3);
		assert.strictEqual(writes[2].value.styles.length, 1);
		assert.notStrictEqual(writes[2].value.styles[0].name, 'Unsaved name');
		assert.strictEqual(scope.widgetStyles.styles[0].name, 'Unsaved name');
	});

	it('removes an unsaved style without writing to Homey', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		scope.deleteStyle();
		assert.strictEqual(scope.widgetStyles.styles.length, 0);
		assert.strictEqual(writes.length, 0);
		assert.strictEqual(scope.isDirty(), false);
	});

	it('keeps a saved style and reports an error if deletion fails', () => {
		const { scope, homey } = loadSettings();
		scope.createStyle(true);
		scope.saveSettings();
		const style = scope.getSelectedStyle();
		let message;
		homey.alert = value => { message = value; };
		homey.set = (key, value, callback) => callback(new Error('write failed'));
		scope.deleteStyle();
		assert.strictEqual(scope.getSelectedStyle(), style);
		assert.strictEqual(scope.widgetStyles.styles.length, 1);
		assert.strictEqual(scope.savingSettings, false);
		assert.strictEqual(message, 'write failed');
	});

	it('leaves styles unchanged if deletion is declined', () => {
		const { scope } = loadSettings(undefined, (message, type, callback) => callback(null, false));
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.deleteStyle();
		assert.strictEqual(scope.getSelectedStyle(), style);
		assert.strictEqual(scope.widgetStyles.styles.length, 1);
	});

	it('selects and persists foreground colors for every element independently of button colors', () => {
		const { scope, writes } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		for (const element of scope.styleElements.filter(id => id !== 'progress')) {
			scope.selectLayoutElement(element);
			assert.strictEqual(scope.selectedColorKey(), element);
			scope.editor.previewState = 'inactive';
			scope.editor.foregroundValues[element] = 'white';
			scope.updateForeground(element);
			assert.strictEqual(scope.previewForeground(element), 'white');
		}
		scope.editor.previewState = 'running';
		scope.editor.foregroundValues.start = 'black';
		scope.updateForeground('start');
		assert.strictEqual(scope.previewForeground('start'), 'black');
		assert.strictEqual(scope.previewColor('start'), 'blue');
		assert.strictEqual(scope.stateForegroundOptions('start'), scope.stateForegroundOptions('start'));
		scope.saveSettings();
		assert.strictEqual(writes[0].value.themes[0].foregroundOverrides.running.start, 'black');
		assert.strictEqual(writes[0].value.themes[0].foregroundColors.fields, 'white');
	});

	it('shows one color for non-buttons and two independently configurable colors for every button', () => {
		const { scope } = loadSettings();
		for (const element of ['icon', 'name', 'status', 'duration', 'fields']) {
			assert.strictEqual(scope.isButtonElement(element), false);
		}
		for (const element of ['play', 'pause', 'stop', 'start', 'cancel']) {
			assert.strictEqual(scope.isButtonElement(element), true);
		}
		assert.ok(html.includes('ng-if="isButtonElement(key)"'));
		assert.ok(html.includes("'settings.style_foreground' : 'settings.style_color'"));
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.editor.previewState = 'inactive';
		scope.editor.colorValues.cancel = 'red';
		scope.updateColorOverride('cancel');
		scope.editor.foregroundValues.cancel = 'white';
		scope.updateForeground('cancel');
		assert.strictEqual(scope.previewColor('cancel'), 'red');
		assert.strictEqual(scope.previewForeground('cancel'), 'white');
		assert.strictEqual(scope.isDirty(), true);
	});

	it('offers and saves black and white widget and button backgrounds in every theme state', () => {
		const runtime = require('../assets/js/chronograph-widget-style.js');
		for (const [color, expected] of [['black', '#000'], ['white', 'var(--homey-color-white, #fff)']]) {
			const { scope, writes, editor } = loadSettings();
			scope.selectEditorMode('color');
			scope.createStyle(true);
			const keys = ['background', ...scope.styleElements.filter(element => scope.isButtonElement(element))];
			for (const state of ['inactive', 'running', 'paused', 'starting']) {
				scope.editor.previewState = state;
				for (const key of keys) {
					const options = state !== 'inactive' ? scope.stateColorOptions(key)
						: key === 'background' ? scope.backgroundOptions : scope.buttonBackgroundOptions;
					assert.ok(options.some(option => option.id === color), `${state} ${key} ${color}`);
					scope.editor.colorValues[key] = color;
					scope.updateColorOverride(key);
				}
			}
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
			scope.saveSettings();
			const saved = JSON.parse(JSON.stringify(writes[0].value));
			assert.strictEqual(editor.isValidCollection(saved), true);
			const theme = saved.themes[0];
			for (const state of ['inactive', 'running', 'paused', 'starting']) {
				assert.deepStrictEqual(runtime.backgroundStyle(theme, state), { backgroundColor: expected });
				for (const button of keys.filter(key => key !== 'background')) {
					assert.strictEqual(runtime.elementStyle(theme, state, button).backgroundColor, expected);
				}
			}
		}
	});

	it('keeps Cancel background rules off its non-button layout wrapper', () => {
		const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
			.filter(match => match[1].includes('.style-widget-cancel') && /\bbackground\s*:/.test(match[2]));
		assert.ok(rules.length > 0);
		for (const rule of rules) {
			for (const selector of rule[1].split(',')) {
				assert.match(selector.trim(), /\.style-widget-action\.style-widget-cancel(?:\[|$)/);
			}
		}
	});

	it('preserves legacy state colors when changing a non-button base color', () => {
		const { scope } = loadSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.editor.previewState = 'inactive';
		scope.editor.foregroundValues.duration = 'red';
		scope.updateForeground('duration');
		assert.strictEqual(scope.previewForeground('duration'), 'red');
		scope.editor.previewState = 'running';
		assert.strictEqual(scope.previewForeground('duration'), 'blue');
		scope.editor.foregroundValues.duration = 'inherit';
		scope.updateForeground('duration');
		assert.strictEqual(scope.previewForeground('duration'), 'red');
	});

	it('preserves size and state when changing preview type, including an open start form', () => {
		const typeSelector = html.match(/<select[^>]*id="preview-type"[\s\S]*?<\/select>/)[0];
		assert.ok(!/editor\.preview(?:Size|State)\s*=/.test(typeSelector));
		assert.ok(html.includes('ng-if="editor.previewColumns !== \'single\' || editor.previewType !== \'stopwatch\' || editor.previewState === \'starting\'"'));
	});

	it('uses flexible and content-sized columns for the compact default', () => {
		const { scope } = loadSettings();
		scope.editor.previewSize = 'compact';
		const row = scope.groupedRows(true).find(item => item.id === 1);
		assert.deepStrictEqual(Array.from(row.groups, group => group.span), [2, 1, 1]);
		assert.deepStrictEqual(Array.from(row.groups, group => group.width), ['span', 'content', 'content']);
		assert.strictEqual(row.tracks, 'minmax(0, 2fr) minmax(0, max-content) minmax(0, max-content)');
		assert.strictEqual(row.groups[0].elements.includes('icon'), true);
		assert.strictEqual(row.groups[0].elements.includes('name'), true);
		assert.strictEqual(row.groups[0].elements.includes('status'), true);
		assert.strictEqual(row.groups[1].elements.includes('duration'), true);
		assert.strictEqual(row.groups[2].elements.includes('pause'), true);
		assert.strictEqual(row.groups[2].elements.includes('stop'), true);
	});

	it('uses the configured compact start-form layout as the default in base and starting modes', () => {
		const { scope, editor } = loadSettings();
		const style = scope.getSelectedStyle();
		const layout = style.groups.compact;
		assert.strictEqual(layout.elements.fields.row, 3);
		assert.strictEqual(layout.elements.fields.group, 1);
		assert.strictEqual(layout.elements.start.row, 3);
		assert.strictEqual(layout.elements.start.group, 2);
		assert.strictEqual(layout.elements.cancel.row, 3);
		assert.strictEqual(layout.elements.cancel.group, 2);
		assert.strictEqual(editor.rowColumns(style, 'compact', 3), 2);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'compact', 3)), [3, 1]);
		assert.deepStrictEqual(Array.from(editor.columnWidths(style, 'compact', 3)), ['span', 'content']);
		assert.deepStrictEqual(Array.from(editor.columnAlignments(style, 'compact', 3)), ['left', 'left']);
		assert.deepStrictEqual(Array.from(editor.columnDirections(style, 'compact', 3)), ['horizontal', 'horizontal']);
		assert.strictEqual(style.rowVisibility.compact[3].startForm, true);
		assert.strictEqual(style.rowVisibility.compact[3].hideAfterSeconds, 10);
		assert.strictEqual(editor.resolvedGroups(style, 'compact', 'starting').fields.row, 3);
	});

	it('uses the configured normal layout and start-row columns as the default', () => {
		const { scope, editor } = loadSettings();
		const style = scope.getSelectedStyle();
		const layout = style.groups.normal;
		assert.strictEqual(layout.elements.start.row, 4);
		assert.strictEqual(layout.elements.start.group, 2);
		assert.strictEqual(layout.elements.cancel.row, 0);
		assert.strictEqual(layout.elements.cancel.group, 1);
		assert.strictEqual(editor.rowColumns(style, 'normal', 1), 1);
		assert.strictEqual(editor.rowColumns(style, 'normal', 2), 1);
		assert.strictEqual(editor.rowColumns(style, 'normal', 3), 2);
		assert.strictEqual(editor.rowColumns(style, 'normal', 4), 2);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 3)), [3, 1]);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'normal', 4)), [3, 1]);
		assert.deepStrictEqual(Array.from(editor.columnWidths(style, 'normal', 3)), ['span', 'content']);
		assert.deepStrictEqual(Array.from(editor.columnWidths(style, 'normal', 4)), ['span', 'content']);
		assert.deepStrictEqual(Array.from(editor.columnAlignments(style, 'normal', 4)), ['left', 'left']);
		assert.deepStrictEqual(Array.from(editor.columnDirections(style, 'normal', 4)), ['horizontal', 'horizontal']);
		assert.deepStrictEqual(Array.from(editor.columnVerticalAlignments(style, 'normal', 3)), ['middle', 'middle']);
		assert.deepStrictEqual(Array.from(editor.columnVerticalAlignments(style, 'normal', 4)), ['middle', 'middle']);
	});

	it('uses the configured large layout as the default', () => {
		const { scope, editor } = loadSettings();
		const style = scope.getSelectedStyle();
		const layout = style.groups.large;
		assert.strictEqual(layout.elements.start.row, 4);
		assert.strictEqual(layout.elements.start.group, 2);
		assert.strictEqual(layout.elements.cancel.row, 0);
		assert.deepStrictEqual([1, 2, 3, 4].map(row => editor.rowColumns(style, 'large', row)), [1, 1, 2, 2]);
		assert.deepStrictEqual(Array.from(editor.columnSpans(style, 'large', 4)), [3, 1]);
		assert.deepStrictEqual(Array.from(editor.columnWidths(style, 'large', 4)), ['span', 'content']);
		assert.deepStrictEqual(Array.from(editor.columnVerticalAlignments(style, 'large', 4)), ['middle', 'middle']);
	});

	it('keeps the default design read-only while allowing an editable copy', () => {
		const { scope, writes } = loadSettings();
		const builtIn = scope.getSelectedStyle();
		const before = JSON.stringify(builtIn);
		assert.strictEqual(scope.isPresetDesign(), true);
		scope.heightMode('auto');
		scope.allowDesignShrink(false);
		scope.overrideElementSize(99);
		scope.progressDirection('top-bottom');
		scope.transitionInputFieldRows(3);
		assert.strictEqual(JSON.stringify(builtIn), before);
		assert.strictEqual(scope.isDirty(), false);
		scope.saveSettings();
		assert.strictEqual(writes.length, 0);

		scope.createStyle(true);
		scope.heightMode('auto');
		assert.strictEqual(scope.heightMode(), 'auto');
		scope.saveSettings();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		assert.strictEqual(writes.length, 2);
		assert.strictEqual(writes[1].key, 'widgetStyles');
		assert.strictEqual(writes[1].value.styles.length, 1);
		assert.strictEqual(writes[1].value.styles[0].heightModes.normal, 'auto');
		assert.strictEqual(writes[1].value.themes[0].colors.icon, 'blue');
		assert.notStrictEqual(writes[1].value.styles[0].id, builtIn.id);
		assert.strictEqual(loadSettings().scope.getSelectedScheme().colors.icon, 'blue');
	});

	it('includes start fields in inactive normal and large timer and transition previews', () => {
		const { scope } = loadSettings();
		for (const type of ['timer', 'transition']) {
			for (const size of ['normal', 'large']) {
				scope.editor.previewType = type;
				scope.editor.previewSize = size;
				scope.editor.previewState = 'inactive';
				assert.strictEqual(scope.previewVisible('fields'), true);
				assert.strictEqual(scope.groupedRows(true).some(row =>
					row.groups.some(group => group.elements.includes('fields'))), true);
			}
		}
		scope.editor.previewType = 'stopwatch';
		assert.strictEqual(scope.previewVisible('fields'), false);
	});

	it('places ng-if and ng-include on different preview elements', () => {
		const matches = html.match(/ng-if="element === 'fields'"><span ng-include="'preview-fields\.html'"/g);
		assert.strictEqual(matches.length, 2);
	});

	it('keeps state color option identities stable until the inherited color changes', () => {
		const { scope } = loadSettings();
		scope.editor.previewState = 'running';
		const first = scope.stateColorOptions('duration');
		assert.strictEqual(scope.stateColorOptions('duration'), first);
		assert.strictEqual(first[0].label, 'settings.style_color_inherit (settings.widget_not_running)');
		scope.getSelectedScheme().colors.duration = 'red';
		const updated = scope.stateColorOptions('duration');
		assert.notStrictEqual(updated, first);
		assert.strictEqual(updated[0].label, 'settings.style_color_inherit (settings.widget_not_running)');
		assert.strictEqual(scope.stateColorOptions('duration'), updated);
		const background = scope.stateColorOptions('background');
		assert.strictEqual(scope.stateColorOptions('background'), background);
		assert.strictEqual(scope.stateForegroundOptions('duration')[0].label,
			'settings.style_color_inherit (settings.widget_not_running)');
		scope.getSelectedScheme().foregroundColors = { duration: 'red' };
		assert.strictEqual(scope.stateForegroundOptions('duration')[0].label,
			'settings.style_color_inherit (settings.widget_not_running)');
		scope.editor.selectedBackground = true;
		for (const state of ['running', 'paused', 'starting']) {
			scope.editor.previewState = state;
			assert.strictEqual(scope.stateColorOptions('background')[0].label,
				'settings.style_color_inherit (settings.widget_not_running)');
			assert.strictEqual(scope.stateBorderOptions()[0].label,
				'settings.style_color_inherit (settings.widget_not_running)');
		}
	});

	it('keeps row, element and background selection mutually exclusive during preview actions', () => {
		const { scope } = loadSettings();
		scope.selectVisibilityRow(3);
		assert.strictEqual(scope.editor.selectedElement, null);
		assert.strictEqual(scope.selectedColorKey(), null);
		scope.previewAction('pause');
		assert.strictEqual(scope.editor.selectedRow, 3);
		scope.selectLayoutElement('duration');
		assert.strictEqual(scope.editor.selectedRow, null);
		assert.strictEqual(scope.editor.rowRule, null);
		assert.strictEqual(scope.selectedColorKey(), 'duration');
		scope.selectLayoutElement('fields');
		assert.strictEqual(scope.selectedColorKey(), 'fields');
		scope.selectWidgetBackground();
		assert.strictEqual(scope.editor.selectedElement, null);
		assert.strictEqual(scope.editor.selectedRow, null);
		assert.strictEqual(scope.selectedColorKey(), 'background');
		scope.refreshLayoutElement();
		assert.strictEqual(scope.selectedColorKey(), 'background');
		scope.selectVisibilityRow(1);
		assert.strictEqual(scope.editor.selectedBackground, false);
		assert.strictEqual(scope.editor.selectedRow, 1);
	});

	it('reduces row columns across base and status layouts and saves them per size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 3, 4);
		editor.setRowColumns(style, 'large', 3, 4);
		style.groups.normal.overrides.paused = { duration: { row: 3, group: 4, order: 2 } };
		style.groups.normal.overrides.starting = { fields: { row: 3, group: 3, order: 1 } };
		scope.selectVisibilityRow(3);
		assert.strictEqual(scope.editor.rowColumns, 4);
		scope.editor.rowColumns = 1;
		scope.updateRowColumns();
		assert.strictEqual(style.groups.normal.elements.play.group, 1);
		assert.strictEqual(style.groups.normal.overrides.paused.duration.group, 1);
		assert.strictEqual(style.groups.normal.overrides.starting.fields.group, 1);
		assert.strictEqual(scope.groupedRows(false).find(row => row.id === 3).groups.length, 1);
		scope.editor.previewState = 'paused';
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 3).groups.length, 1);
		scope.editor.previewSize = 'large';
		assert.strictEqual(scope.groupedRows(false).find(row => row.id === 3).groups.length, 4);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.styles[0].rowColumns.normal[3], 1);
	});

	it('clamps moved elements to the new row and rejects invalid stored columns', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 1;
		scope.updateRowColumns();
		scope.selectLayoutElement('pause');
		scope.editor.position.row = 1;
		scope.updatePositionRow();
		assert.strictEqual(scope.getSelectedStyle().groups.normal.elements.pause.group, 1);
		assert.strictEqual(scope.availablePositionGroups().length, 1);
		scope.moveGroupedElement('pause', 1, 4);
		assert.strictEqual(scope.getSelectedStyle().groups.normal.elements.pause.group, 1);
		scope.getSelectedStyle().groups.normal.overrides.running = { pause: { row: 1, group: 2, order: 1 } };
		scope.saveSettings();
		assert.strictEqual(writes.length, 0);
	});

	it('selects columns and redistributes four span units independently per size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewState = 'inactive';
		editor.setRowColumns(scope.getSelectedStyle(), 'large', 4, 4);
		scope.selectVisibilityRow(4);
		scope.editor.rowColumns = 2;
		scope.updateRowColumns();
		scope.selectColumn(4, 1);
		assert.strictEqual(scope.editor.selectedRow, null);
		assert.strictEqual(scope.editor.selectedElement, null);
		assert.strictEqual(scope.selectedColorKey(), null);
		assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1, 2, 3, 4]);
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(scope.getSelectedStyle().columnSpans.normal[4]), [3, 1]);
		assert.deepStrictEqual(Array.from(scope.groupedRows(true).find(row => row.id === 4).groups, g => g.span), [3, 1]);
		assert.deepStrictEqual(Array.from(scope.groupedRows(false).find(row => row.id === 4).groups, g => g.span), [3, 1]);
		scope.editor.previewSize = 'large';
		assert.deepStrictEqual(Array.from(scope.groupedRows(false).find(row => row.id === 4).groups, g => g.span), [1, 1, 1, 1]);
		scope.editor.previewSize = 'normal';
		scope.selectLayoutElement('name');
		assert.strictEqual(scope.editor.selectedColumn, null);
		scope.saveSettings();
		assert.deepStrictEqual(Array.from(writes[0].value.styles[0].columnSpans.normal[4]), [3, 1]);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + scope.getSelectedStyle().id;
		assert.deepStrictEqual(Array.from(reloaded.groupedRows(false).find(row => row.id === 4).groups, g => g.span), [3, 1]);
	});

	it('maintains valid spans when changing column counts and rejects malformed spans', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 2;
		scope.updateRowColumns();
		scope.selectColumn(1, 1);
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 3;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [2, 1, 1]);
		scope.editor.rowColumns = 1;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [4]);
		scope.editor.rowColumns = 4;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [1, 1, 1, 1]);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		for (const invalid of [[1, 1], [1, 1, 1, 0], [1, 1, 1, 2], [1, 1, 1, 1.5]]) {
			style.columnSpans.normal[1] = invalid;
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		}
	});

	it('removes adjacent columns when increasing span and combines overflow in the last column', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		style.groups.normal.elements.name.group = 2;
		style.groups.normal.elements.icon.group = 3;
		style.groups.normal.elements.status.row = 1;
		style.groups.normal.elements.status.group = 4;
		style.groups.normal.overrides.paused = {
			name: { row: 1, group: 3, order: 1 },
			icon: { row: 1, group: 4, order: 1 }
		};
		scope.selectColumn(1, 1);
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [3, 1]);
		assert.strictEqual(style.rowColumns.normal[1], 2);
		assert.strictEqual(style.groups.normal.elements.name.group, 2);
		assert.strictEqual(style.groups.normal.elements.icon.group, 2);
		assert.strictEqual(style.groups.normal.elements.status.group, 2);
		assert.strictEqual(style.groups.normal.overrides.paused.name.group, 2);
		assert.strictEqual(style.groups.normal.overrides.paused.icon.group, 2);
		assert.strictEqual(style.groups.large.elements.name.group, 1);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		assert.strictEqual(loadSettings(writes[0].value).scope.widgetStyles.styles[0].rowColumns.normal[1], 2);
	});

	it('cascades elements into the next column when expanding a span', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		const positions = style.groups.normal.elements;
		positions.icon = { row: 1, group: 1, order: 1 };
		positions.name = { row: 1, group: 2, order: 1 };
		positions.status = { row: 1, group: 3, order: 1 };
		positions.duration = { row: 1, group: 4, order: 1 };
		style.groups.normal.overrides.paused = {
			name: { row: 1, group: 2, order: 1 },
			status: { row: 1, group: 3, order: 1 },
			duration: { row: 1, group: 4, order: 1 }
		};
		scope.selectColumn(1, 1);
		scope.editor.columnSpan = 2;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [2, 1, 1]);
		assert.strictEqual(positions.icon.group, 1);
		assert.strictEqual(positions.name.group, 2);
		assert.strictEqual(positions.status.group, 3);
		assert.strictEqual(positions.duration.group, 3);
		assert.strictEqual(style.groups.normal.overrides.paused.name.group, 2);
		assert.strictEqual(style.groups.normal.overrides.paused.status.group, 3);
		assert.strictEqual(style.groups.normal.overrides.paused.duration.group, 3);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('keeps the selected column when adjacent columns before it are removed', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		style.groups.normal.elements.icon.group = 3;
		style.groups.normal.elements.name.group = 4;
		scope.selectColumn(1, 4);
		assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1, 2, 3, 4]);
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [1, 3]);
		assert.strictEqual(style.groups.normal.elements.name.group, 2);
		assert.strictEqual(style.groups.normal.elements.icon.group, 2);
		scope.editor.columnSpan = 4;
		scope.updateColumnSpan();
		assert.strictEqual(scope.editor.selectedColumn.group, 1);
		assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [4]);
		assert.deepStrictEqual(Array.from(scope.availableColumnSpans()), [1, 2, 3, 4]);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('splits a full-width column into the selected span and empty columns', () => {
		for (const span of [1, 2, 3]) {
			const { scope, editor, writes } = loadSettings();
			scope.createStyle(true);
			const style = scope.getSelectedStyle();
			scope.selectColumn(1, 1);
			scope.editor.columnAlignment = 'right';
			scope.updateColumnAlignment();
			style.groups.normal.overrides.paused = { name: { row: 1, group: 1, order: 1 } };
			const positions = JSON.stringify(style.groups.normal);
			scope.editor.columnSpan = span;
			scope.updateColumnSpan();
			assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), [span, ...Array(4 - span).fill(1)]);
			assert.strictEqual(style.rowColumns.normal[1], 5 - span);
			assert.deepStrictEqual(Array.from(style.columnAlignments.normal[1]), ['right', ...Array(4 - span).fill('left')]);
			assert.strictEqual(JSON.stringify(style.groups.normal), positions);
			assert.strictEqual(scope.editor.selectedColumn.group, 1);
			assert.strictEqual(scope.groupedRows(false).find(row => row.id === 1).groups.slice(1)
				.every(group => group.elements.length === 0), true);
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
			scope.saveSettings();
			const reloaded = loadSettings(writes[0].value).scope.widgetStyles.styles[0];
			assert.deepStrictEqual(Array.from(reloaded.columnSpans.normal[1]), [span, ...Array(4 - span).fill(1)]);
		}
	});

	it('appends empty columns when reducing a span without changing other columns or their contents', () => {
		for (const [initial, selected, newSpan, expected] of [
			[[3, 1], 1, 2, [2, 1, 1]],
			[[3, 1], 1, 1, [1, 1, 1, 1]],
			[[1, 3], 2, 2, [1, 2, 1]],
			[[1, 3], 2, 1, [1, 1, 1, 1]],
			[[2, 2], 1, 1, [1, 2, 1]]
		]) {
			const { scope, editor, writes } = loadSettings();
			scope.createStyle(true);
			const style = scope.getSelectedStyle();
			editor.setRowColumns(style, 'normal', 1, 2);
			style.columnSpans.normal[1] = initial.slice();
			editor.setColumnAlignment(style, 'normal', 1, 1, 'right');
			editor.setColumnAlignment(style, 'normal', 1, 2, 'center');
			editor.setColumnDirection(style, 'normal', 1, 2, 'vertical');
			editor.setColumnVerticalAlignment(style, 'normal', 1, 2, 'bottom');
			editor.setColumnWidth(style, 'normal', 1, 2, 'content');
			editor.setColumnRowSpan(style, 'normal', 1, 2, 3);
			style.groups.normal.elements.name.group = 2;
			style.groups.normal.overrides.paused = { icon: { row: 1, group: 2, order: 1 } };
			const positions = JSON.stringify(style.groups.normal);
			const otherSize = JSON.stringify(style.groups.large);
			scope.selectColumn(1, selected);
			scope.editor.columnSpan = newSpan;
			scope.updateColumnSpan();
			const added = expected.length - initial.length;
			assert.deepStrictEqual(Array.from(style.columnSpans.normal[1]), expected);
			assert.strictEqual(style.rowColumns.normal[1], expected.length);
			assert.strictEqual(scope.editor.selectedColumn.group, selected);
			assert.deepStrictEqual(Array.from(style.columnAlignments.normal[1]), ['right', 'center', ...Array(added).fill('left')]);
			assert.deepStrictEqual(Array.from(style.columnDirections.normal[1]), ['horizontal', 'vertical', ...Array(added).fill('horizontal')]);
			assert.deepStrictEqual(Array.from(style.columnVerticalAlignments.normal[1]), ['middle', 'bottom', ...Array(added).fill('middle')]);
			assert.deepStrictEqual(Array.from(style.columnWidths.normal[1]), ['span', 'content', ...Array(added).fill('span')]);
			assert.deepStrictEqual(Array.from(style.columnRowSpans.normal[1]), [1, 3, ...Array(added).fill(1)]);
			assert.strictEqual(JSON.stringify(style.groups.normal), positions);
			assert.strictEqual(JSON.stringify(style.groups.large), otherSize);
			assert.ok(scope.groupedRows(false).find(row => row.id === 1).groups.slice(2)
				.every(group => group.elements.length === 0));
			assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
			scope.saveSettings();
			const reloaded = loadSettings(writes[0].value).scope.widgetStyles.styles[0];
			assert.deepStrictEqual(Array.from(reloaded.columnSpans.normal[1]), expected);
			assert.strictEqual(JSON.stringify(reloaded.groups.normal), positions);
			assert.deepStrictEqual(Array.from(reloaded.columnRowSpans.normal[1]), [1, 3, ...Array(added).fill(1)]);
		}
	});

	it('keeps drag reordering without row or column move buttons', () => {
		for (const key of ['style_move_up', 'style_move_down', 'style_move_left', 'style_move_right']) {
			assert.ok(!html.includes(key));
		}
		assert.match(html, /style-reorder-drag="row"/);
		assert.match(html, /style-reorder-drag="column"/);
	});

	it('saves column alignment per size and preserves surviving columns when columns change', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		editor.setRowColumns(style, 'large', 1, 4);
		scope.selectColumn(1, 4);
		assert.strictEqual(scope.editor.columnAlignment, 'left');
		scope.editor.columnAlignment = 'right';
		scope.updateColumnAlignment();
		scope.selectColumn(1, 1);
		scope.editor.columnAlignment = 'center';
		scope.updateColumnAlignment();
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).groups[0].alignment, 'center');
		scope.selectColumn(1, 4);
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
		assert.strictEqual(scope.editor.columnAlignment, 'right');
		assert.deepStrictEqual(Array.from(style.columnAlignments.normal[1]), ['center', 'right']);
		assert.strictEqual(scope.groupedRows(false).find(row => row.id === 1).groups[1].alignment, 'right');
		assert.strictEqual(editor.columnAlignments(style, 'large', 1)[0], 'left');
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 3;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnAlignments.normal[1]), ['center', 'right', 'left']);
		scope.editor.rowColumns = 1;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnAlignments.normal[1]), ['center']);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.groupedRows(false).find(row => row.id === 1).groups[0].alignment, 'center');
		style.columnAlignments.normal[1] = ['invalid'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.columnAlignments.normal[1] = ['left', 'right'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('saves vertical alignment and preserves surviving columns across span and count changes', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectVisibilityRow(2);
		scope.editor.rowColumns = 4;
		scope.updateRowColumns();
		scope.selectColumn(2, 1);
		assert.strictEqual(scope.editor.columnVerticalAlignment, 'middle');
		scope.editor.columnVerticalAlignment = 'top';
		scope.updateColumnVerticalAlignment();
		scope.selectColumn(2, 4);
		scope.editor.columnVerticalAlignment = 'bottom';
		scope.updateColumnVerticalAlignment();
		assert.strictEqual(scope.groupedRows(false).find(row => row.id === 2).groups[3].verticalAlignment, 'bottom');
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.deepStrictEqual(Array.from(style.columnVerticalAlignments.normal[2]), ['top', 'bottom']);
		assert.strictEqual(scope.editor.columnVerticalAlignment, 'bottom');
		scope.selectVisibilityRow(2);
		scope.editor.rowColumns = 3;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnVerticalAlignments.normal[2]), ['top', 'bottom', 'middle']);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.groupedRows(false).find(row => row.id === 2).groups[1].verticalAlignment, 'bottom');
		style.columnVerticalAlignments.normal[2][0] = 'invalid';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('stores row alignment per size, defaults to top, and rejects invalid settings', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.editor.previewSize = 'large';
		scope.selectVisibilityRow(3);
		assert.strictEqual(scope.editor.rowAlignment, 'bottom');
		scope.editor.rowAlignment = 'top';
		scope.updateRowAlignment();
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 3).alignment, 'top');
		assert.strictEqual(editor.rowAlignment(style, 'normal', 3), 'bottom');
		assert.strictEqual(editor.rowAlignment(style, 'compact', 3), 'top');
		scope.editor.previewSize = 'normal';
		scope.selectVisibilityRow(3);
		scope.editor.rowAlignment = 'middle';
		scope.updateRowAlignment();
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(editor.rowAlignment(reloaded.getSelectedStyle(), 'large', 3), 'top');
		assert.strictEqual(editor.rowAlignment(reloaded.getSelectedStyle(), 'normal', 3), 'middle');
		style.rowAlignments.large[3] = 'invalid';
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('defaults to horizontal and saves column direction across resizing and reloads', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		editor.setRowColumns(style, 'large', 1, 4);
		scope.selectColumn(1, 4);
		assert.strictEqual(scope.editor.columnDirection, 'horizontal');
		scope.editor.columnDirection = 'vertical';
		scope.updateColumnDirection();
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).groups[3].direction, 'vertical');
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
		assert.strictEqual(scope.editor.columnDirection, 'vertical');
		assert.deepStrictEqual(Array.from(style.columnDirections.normal[1]), ['horizontal', 'vertical']);
		assert.strictEqual(editor.columnDirections(style, 'large', 1)[1], 'horizontal');
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 3;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnDirections.normal[1]), ['horizontal', 'vertical', 'horizontal']);
		scope.editor.rowColumns = 2;
		scope.updateRowColumns();
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.groupedRows(false).find(row => row.id === 1).groups[1].direction, 'vertical');
		style.columnDirections.normal[1] = ['horizontal', 'invalid'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.columnDirections.normal[1] = ['horizontal'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('saves column widths and retains surviving modes when columns are removed', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		editor.setRowColumns(style, 'normal', 1, 4);
		scope.selectColumn(1, 4);
		assert.strictEqual(scope.editor.columnWidth, 'span');
		scope.editor.columnWidth = 'content';
		scope.updateColumnWidth();
		scope.editor.columnSpan = 3;
		scope.updateColumnSpan();
		assert.strictEqual(scope.editor.selectedColumn.group, 2);
		assert.strictEqual(scope.editor.columnWidth, 'content');
		assert.deepStrictEqual(Array.from(style.columnWidths.normal[1]), ['span', 'content']);
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).tracks,
			'minmax(0, 1fr) minmax(0, max-content)');
		scope.selectVisibilityRow(1);
		scope.editor.rowColumns = 3;
		scope.updateRowColumns();
		assert.deepStrictEqual(Array.from(style.columnWidths.normal[1]), ['span', 'content', 'span']);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.groupedRows(false).find(row => row.id === 1).groups[1].width, 'content');
		style.columnWidths.normal[1] = ['span', 'invalid', 'span'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
		style.columnWidths.normal[1] = ['span'];
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('keeps horizontally arranged preview elements on one line', () => {
		assert.match(css, /\.style-preview-group\s*\{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;/);
		assert.match(css, /\.style-preview-group\[data-direction="vertical"\]\s*\{[^}]*flex-direction:\s*column;/);
	});

	it('inserts elements at the chosen position and persists independent state and size layouts', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		const group = () => Array.from(scope.groupedRows(false).find(row => row.id === 1).groups[0].elements);
		assert.deepStrictEqual(group(), ['icon', 'name']);
		scope.moveGroupedElement('name', 1, 1, 0);
		assert.deepStrictEqual(group(), ['name', 'icon']);
		scope.moveGroupedElement('name', 1, 1, 1);
		assert.deepStrictEqual(group(), ['icon', 'name']);
		scope.moveGroupedElement('status', 1, 1, 1);
		assert.deepStrictEqual(group(), ['icon', 'status', 'name']);
		scope.editor.editStatus = true;
		scope.editor.previewState = 'paused';
		scope.moveGroupedElement('name', 1, 1, 0);
		assert.deepStrictEqual(group(), ['name', 'icon', 'status']);
		assert.strictEqual(style.groups.normal.elements.name.order, 3);
		assert.strictEqual(style.groups.normal.overrides.running, undefined);
		scope.editor.previewState = 'running';
		assert.deepStrictEqual(group(), ['icon', 'status', 'name']);
		scope.editor.previewSize = 'large';
		assert.deepStrictEqual(group(), ['icon', 'name']);
		scope.saveSettings();
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.editor.editStatus = true;
		reloaded.editor.previewState = 'paused';
		assert.deepStrictEqual(Array.from(reloaded.groupedRows(false).find(row => row.id === 1).groups[0].elements), ['name', 'icon', 'status']);
	});

	it('supports ordering all elements in one column', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		scope.styleElements.forEach((element, index) => scope.moveGroupedElement(element, 1, 1, index));
		const group = scope.groupedRows(false).find(row => row.id === 1).groups[0];
		assert.deepStrictEqual(Array.from(group.elements), Array.from(scope.styleElements));
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
	});

	it('moves elements to and from the unused row and saves them per size', () => {
		const { scope, writes, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.moveGroupedElement('name', 0, 1);
		assert.strictEqual(scope.unusedElements().includes('name'), true);
		assert.strictEqual(scope.unusedElements(), scope.unusedElements());
		assert.strictEqual(scope.groupedRows(false).some(row =>
			row.groups.some(group => group.elements.includes('name'))), false);
		assert.strictEqual(scope.groupedRows(true).some(row =>
			row.groups.some(group => group.elements.includes('name'))), false);
		assert.strictEqual(style.groups.large.elements.name.row, 1);
		scope.saveSettings();
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(editor.isValidCollection(writes[0].value), true);
		assert.strictEqual(writes[0].value.styles[0].groups.normal.elements.name.row, 0);
		const reloaded = loadSettings(writes[0].value).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		assert.strictEqual(reloaded.unusedElements().includes('name'), true);

		scope.editor.position.row = 2;
		scope.updatePositionRow();
		assert.strictEqual(scope.unusedElements().includes('name'), false);
		assert.strictEqual(style.groups.normal.elements.name.row, 2);
		scope.moveGroupedElement('name', 0, 1);
		scope.moveGroupedElement('name', 1, 2);
		assert.strictEqual(style.groups.normal.elements.name.group, 2);
		assert.strictEqual(scope.unusedElements().includes('name'), false);
	});

	it('supports unused state overrides and inherits them into the start form', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.editor.editStatus = true;
		scope.editor.previewState = 'inactive';
		scope.moveGroupedElement('name', 0, 1);
		assert.strictEqual(style.groups.normal.elements.name.row, 1);
		assert.strictEqual(scope.unusedElements().includes('name'), true);
		scope.editor.previewState = 'starting';
		assert.strictEqual(scope.unusedElements().includes('name'), true);
		assert.strictEqual(scope.groupedRows(true).some(row =>
			row.groups.some(group => group.elements.includes('name'))), false);
		scope.moveGroupedElement('name', 2, 1);
		assert.strictEqual(scope.unusedElements().includes('name'), false);
		scope.editor.previewState = 'running';
		assert.strictEqual(scope.unusedElements().includes('name'), false);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		style.groups.normal.overrides.running = { name: { row: 0, group: 2, order: 1 } };
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), false);
	});

	it('positions and colors Start independently of Play / Resume', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.editor.previewState = 'inactive';
		assert.strictEqual(scope.previewVisible('start'), true);
		assert.strictEqual(scope.previewVisible('play'), false);
		scope.moveGroupedElement('start', 2, 1);
		assert.strictEqual(style.groups.normal.elements.start.row, 2);
		assert.strictEqual(style.groups.normal.elements.play.row, 3);
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.editor.colorValues.start = 'red';
		scope.updateColorOverride('start');
		assert.strictEqual(scope.getSelectedScheme().colors.start, 'red');
		assert.strictEqual(scope.getSelectedScheme().colors.play, 'blue');
		scope.previewAction('start');
		assert.strictEqual(scope.editor.previewState, 'running');
		scope.previewAction('pause');
		assert.strictEqual(scope.previewVisible('play'), true);
		assert.strictEqual(scope.previewVisible('start'), false);
		scope.previewAction('play');
		assert.strictEqual(scope.editor.previewState, 'running');
	});

	it('preserves older grouped positions and colors when adding Start', () => {
		const { editor } = loadSettings();
		const style = editor.create('legacy', 'Legacy');
		style.groups = editor.currentGroups();
		for (const size of ['compact', 'normal', 'large']) {
			delete style.groups[size].elements.start;
			for (const state of Object.keys(style.groups[size].overrides)) {
				delete style.groups[size].overrides[state].start;
			}
		}
		style.groups.normal.overrides.inactive = { play: { row: 4, group: 3, order: 2 } };
		style.groups.normal.overrides.starting = { play: { row: 2, group: 2, order: 1 } };
		delete style.colors.start;
		style.colorOverrides.paused = { play: 'green' };
		const legacy = { version: 1, styles: [style] };
		assert.strictEqual(editor.isValidCollection(legacy), true);
		const reloaded = loadSettings(legacy).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.editor.selectedSchemeId = 'custom:' + style.id;
		const migrated = reloaded.getSelectedStyle();
		assert.strictEqual(migrated.groups.normal.elements.start.row, migrated.groups.normal.elements.play.row);
		assert.strictEqual(migrated.groups.normal.overrides.inactive.start.group, 3);
		assert.strictEqual(migrated.groups.normal.overrides.starting.start.row, 2);
		assert.strictEqual(reloaded.getSelectedScheme().colors.start, reloaded.getSelectedScheme().colors.play);
		assert.strictEqual(reloaded.getSelectedScheme().colorOverrides.paused.start, 'green');
		assert.strictEqual(editor.isValidCollection(reloaded.widgetStyles), true);
	});

	it('adds a separate Start when converting an older cell layout', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		delete style.groups;
		style.overrides.normal.inactive = [{ element: 'play', cell: 8 }];
		scope.upgradeLayout();
		assert.strictEqual(style.groups.normal.elements.start.row, style.groups.normal.elements.play.row);
		assert.strictEqual(style.groups.normal.overrides.inactive.start.row, 3);
		assert.strictEqual(style.groups.normal.overrides.inactive.start.group, 1);
	});

	it('shows base moves in the selected preview state without changing other state overrides', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.groups.normal.overrides.paused = { start: { row: 2, group: 2, order: 1 } };
		scope.editor.previewState = 'inactive';
		scope.moveGroupedElement('start', 1, 2);
		assert.strictEqual(style.groups.normal.elements.start.row, 1);
		assert.strictEqual(style.groups.normal.overrides.inactive.start.row, 1);
		assert.strictEqual(style.groups.normal.overrides.paused.start.row, 2);
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).groups[1].elements.includes('start'), true);

		style.groups.normal.overrides.inactive.start = { row: 4, group: 2, order: 1 };
		scope.editor.previewState = 'starting';
		scope.moveGroupedElement('start', 1, 3);
		assert.strictEqual(style.groups.normal.overrides.inactive.start.row, 4);
		assert.strictEqual(style.groups.normal.overrides.starting.start.group, 3);
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).groups[2].elements.includes('start'), true);

		scope.editor.editStatus = true;
		scope.moveGroupedElement('start', 1, 4);
		assert.strictEqual(style.groups.normal.elements.start.group, 3);
		assert.strictEqual(style.groups.normal.overrides.starting.start.group, 4);
		assert.strictEqual(scope.groupedRows(true).find(row => row.id === 1).groups[3].elements.includes('start'), true);
	});

	it('shows the same element positions in the editor and preview for the selected layout mode', () => {
		const { scope } = loadSettings();
		const style = scope.getSelectedStyle();
		scope.editor.previewSize = 'compact';
		scope.editor.previewState = 'starting';
		scope.resetRowPreview();
		for (const row of [1, 2, 4]) {
			style.rowVisibility.compact[row] = { states: ['inactive'], startForm: true, actions: {} };
		}
		for (const editStatus of [false, true]) {
			scope.editor.editStatus = editStatus;
			const editorRows = scope.groupedRows(false);
			const previewRows = scope.groupedRows(true);
			for (const element of ['start', 'fields', 'cancel']) {
				const find = rows => {
					for (const row of rows) {
						const group = row.groups.find(item => item.elements.includes(element));
						if (group) return [row.id, group.id];
					}
				};
				assert.deepStrictEqual(find(previewRows), find(editorRows));
				assert.ok(find(previewRows));
			}
		}
	});

	it('shows a row in the start form state and preserves size isolation', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewType = 'timer';
		scope.editor.previewSize = 'normal';
		scope.editor.previewState = 'inactive';
		scope.selectVisibilityRow(4);
		scope.editor.rowRule.inactive = false;
		scope.editor.rowRule.paused = false;
		scope.editor.rowRule.running = false;
		scope.editor.rowRule.starting = true;
		scope.updateRowRule();
		assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), false);
		scope.previewAction('play');
		assert.strictEqual(scope.editor.previewState, 'starting');
		assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), true);
		scope.previewAction('cancel');
		assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), false);
		scope.editor.previewSize = 'compact';
		assert.strictEqual(scope.isRowVisible(4), false);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.styles[0].rowVisibility.normal[4].startForm, true);
	});

	it('hides a start-form-only row when Start or Cancel is pressed', () => {
		const { scope } = loadSettings();
		scope.createStyle(true);
		scope.editor.previewType = 'timer';
		scope.editor.previewSize = 'compact';
		scope.editor.previewState = 'inactive';
		const style = scope.getSelectedStyle();
		style.groups.compact.elements.fields = { row: 3, group: 1, order: 1 };
		style.groups.compact.elements.start = { row: 3, group: 2, order: 1 };
		style.rowVisibility.compact[3] = { states: [], startForm: true, actions: {} };
		for (const action of ['start', 'cancel']) {
			scope.editor.previewState = 'inactive';
			scope.resetRowPreview();
			assert.strictEqual(scope.isRowVisible(3), false);
			scope.previewAction('play');
			assert.strictEqual(scope.editor.previewState, 'starting');
			assert.strictEqual(scope.isRowVisible(3), true);
			const row = scope.groupedRows(true).find(item => item.id === 3);
			for (const element of ['fields', 'start', 'cancel']) {
				assert.strictEqual(row.groups.some(group => group.elements.includes(element)), true);
			}
			scope.previewAction(action);
			assert.strictEqual(scope.editor.previewState, action === 'start' ? 'running' : 'inactive');
			assert.strictEqual(scope.isRowVisible(3), false);
		}
	});

	it('does not show start fields after resuming from pause', () => {
		const { scope } = loadSettings();
		for (const type of ['timer', 'transition']) {
			for (const size of ['compact', 'normal', 'large']) {
				scope.editor.previewType = type;
				scope.editor.previewSize = size;
				scope.editor.previewState = 'running';
				const style = scope.getSelectedStyle();
				const row = style.groups[size].elements.fields.row;
				style.rowVisibility[size][row] = { states: ['running'], startForm: true, actions: {} };
				scope.resetRowPreview();
				scope.previewAction('pause');
				assert.strictEqual(scope.editor.previewState, 'paused');
				assert.strictEqual(scope.previewVisible('fields'), false);
				scope.previewAction('play');
				assert.strictEqual(scope.editor.previewState, 'running');
				assert.strictEqual(scope.isRowVisible(row), true);
				assert.strictEqual(scope.previewVisible('fields'), false);
				assert.strictEqual(scope.groupedRows(true).some(item => item.hasFields), false);
			}
		}
	});

	it('returns to the configured status visibility after Start or Cancel', () => {
		const { scope } = loadSettings();
		scope.editor.previewSize = 'compact';
		const rule = scope.getSelectedStyle().rowVisibility.compact[2];
		rule.states = ['inactive', 'running'];
		for (const action of ['start', 'cancel']) {
			scope.editor.previewState = 'starting';
			scope.resetRowPreview();
			scope.previewAction(action);
			assert.strictEqual(scope.isRowVisible(2), true);
		}
	});

	it('loads styles with the former Start rule without applying it', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.rowVisibility.normal[4].states = ['running'];
		style.rowVisibility.normal[4].actions.start = { mode: 'hide' };
		const legacy = { version: 1, styles: [Object.assign(editor.create(style.id, style.name), style)] };
		assert.strictEqual(editor.isValidCollection(legacy), true);
		const reloaded = loadSettings(legacy).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		reloaded.editor.previewState = 'inactive';
		reloaded.selectVisibilityRow(4);
		assert.strictEqual(reloaded.editor.rowRule.starting, true);
		assert.strictEqual(reloaded.getSelectedStyle().rowVisibility.normal[4].actions.start, undefined);
		reloaded.previewAction('start');
		assert.strictEqual(reloaded.isRowVisible(4), true);
		assert.ok(!html.includes('row-trigger-start'));
	});

	it('converts legacy action visibility and timed Play on loading', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		style.rowVisibility.compact[2] = { states: [], actions: {
			play: { mode: 'timed', seconds: 7 }, pause: { mode: 'toggle' }, stop: { mode: 'status' }
		} };
		const legacy = { version: 1, styles: [Object.assign(editor.create(style.id, style.name), style)] };
		const reloaded = loadSettings(legacy).scope;
		reloaded.editor.selectedStyleId = 'custom:' + style.id;
		const rule = reloaded.getSelectedStyle().rowVisibility.compact[2];
		assert.strictEqual(rule.startForm, true);
		assert.strictEqual(rule.hideAfterSeconds, 7);
		assert.deepStrictEqual(Array.from(rule.states), ['paused', 'inactive']);
		assert.deepStrictEqual(Object.keys(rule.actions), []);
	});

	it('closes the compact start form after ten seconds and can reopen it', () => {
		const { scope, timers } = loadSettings();
		scope.editor.previewSize = 'compact';
		scope.editor.previewState = 'inactive';
		scope.previewAction('play');
		assert.strictEqual(scope.isRowVisible(3), true);
		assert.strictEqual(timers[0].delay, 10000);
		timers[0].callback();
		assert.strictEqual(scope.editor.previewState, 'inactive');
		assert.strictEqual(scope.isRowVisible(3), false);
		scope.previewAction('play');
		assert.strictEqual(scope.isRowVisible(3), true);
		assert.strictEqual(timers[1].delay, 10000);
		scope.previewAction('start');
		assert.strictEqual(timers[1].cancelled, true);
	});

	it('rejects invalid timed rules instead of storing them', () => {
		const { scope } = loadSettings();
		scope.selectVisibilityRow(1);
		scope.editor.rowRule.starting = true;
		scope.editor.rowRule.hideAfter = true;
		scope.editor.rowRule.seconds = 0.01;
		scope.updateRowRule();
		assert.strictEqual(scope.editor.invalidRowRule, true);
		assert.strictEqual(scope.getSelectedStyle().rowVisibility.normal[1].hideAfterSeconds, undefined);
		scope.selectLayoutElement('name');
		assert.strictEqual(scope.editor.selectedRow, 1);
		assert.strictEqual(scope.editor.selectedElement, null);
	});

	it('validates all row rules when saving a collection', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		scope.getSelectedStyle().rowVisibility = { normal: { 4: { states: ['inactive'], actions: { play: { mode: 'timed', seconds: -1 } } } } };
		scope.saveSettings();
		assert.strictEqual(writes.length, 0);
	});

	it('defines Default row visibility and start fields for each size and chronograph type', () => {
		const { scope } = loadSettings();
		scope.editor.editStatus = true;
		for (const type of ['timer', 'transition']) {
			scope.editor.previewType = type;
			for (const size of ['normal', 'large']) {
				scope.editor.previewSize = size;
				scope.editor.previewState = 'inactive';
				assert.strictEqual(scope.isRowVisible(3), false);
				assert.strictEqual(scope.isRowVisible(4), true);
				assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), true);
				scope.editor.previewState = 'paused';
				assert.strictEqual(scope.isRowVisible(3), true);
				assert.strictEqual(scope.isRowVisible(4), false);
				assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), false);
				scope.editor.previewState = 'running';
				assert.strictEqual(scope.isRowVisible(3), true);
				assert.strictEqual(scope.isRowVisible(4), false);
			}
			scope.editor.previewSize = 'compact';
			scope.editor.previewState = 'inactive';
			scope.resetRowPreview();
			assert.strictEqual(scope.isRowVisible(3), false);
			assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), false);
			scope.previewAction('play');
			assert.strictEqual(scope.editor.previewState, 'starting');
			assert.strictEqual(scope.isRowVisible(3), true);
			assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), true);
			scope.previewAction('cancel');
			assert.strictEqual(scope.isRowVisible(3), false);
			scope.editor.previewState = 'starting';
			scope.resetRowPreview();
			assert.strictEqual(scope.groupedRows(true).some(row => row.hasFields), true);
		}
	});

	it('exposes and copies the Default row rules without persisting Default edits', () => {
		const { scope, writes } = loadSettings();
		scope.editor.previewSize = 'normal';
		scope.selectVisibilityRow(4);
		assert.strictEqual(scope.editor.rowRule.inactive, true);
		assert.strictEqual(scope.editor.rowRule.paused, false);
		assert.strictEqual(scope.editor.rowRule.running, false);
		scope.editor.previewSize = 'compact';
		scope.selectVisibilityRow(3);
		assert.strictEqual(scope.editor.rowRule.inactive, false);
		assert.strictEqual(scope.editor.rowRule.starting, true);
		assert.strictEqual(scope.editor.rowRule.seconds, 10);
		scope.createStyle(true);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.styles[0].rowVisibility.normal[4].states[0], 'inactive');
		assert.strictEqual(writes[0].value.styles[0].rowVisibility.compact[3].hideAfterSeconds, 10);
	});
});
