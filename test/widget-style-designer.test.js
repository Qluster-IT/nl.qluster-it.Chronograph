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
const html = fs.readFileSync(path.join(root, 'settings', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'settings', 'assets', 'styles.css'), 'utf8');

function loadSettings(widgetStyles, confirm, set, preview, previewBuiltIns) {
	let editor;
	let controller;
	const module = {
		factory(name, factory) { if (name === 'widgetStyleEditor') editor = factory(); return this; },
		directive() { return this; },
		controller(name, definition) { controller = definition[definition.length - 1]; return this; }
	};
	const angular = {
		module: () => module,
		copy: value => value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
		equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
		toJson: JSON.stringify
	};
	const context = { angular, window: { chronographSettingsPreview: preview } };
	vm.runInNewContext(runtimeScript, context);
	vm.runInNewContext(errorScript, context);
	vm.runInNewContext(editorScript, context);
	vm.runInNewContext(settingsScript, context);
	const scope = {
		$on() {},
		$watchGroup() {},
		$watch() {},
		$applyAsync(callback) { if (callback) callback(); }
	};
	const writes = [];
	const homey = {
		__: key => key,
		get(key, callback) {
			callback(null, key === 'roundOfDurationsFlowcards' ? 2 : key === 'widgetStyles' ? widgetStyles
				: key === 'previewBuiltIns' ? previewBuiltIns : null);
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
	scope.selectVisibilityRow(1);
	return { scope, writes, timers, editor, homey };
}

describe('Widget style designer preview', () => {
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
		for (const source of ['builtInDesigns', 'builtInSchemes', 'widgetStyles.styles', 'widgetStyles.colorSchemes']) {
			assert.strictEqual(html.split('sortedStyleOptions(' + source + ')').length - 1, 2, source);
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
		assert.match(html, /<fieldset class="hy-nostyle style-progress-controls" ng-if="editor\.selectedElement === 'progress'">/);
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
			assert.deepStrictEqual(JSON.parse(JSON.stringify(copy.progressColors)), runtime.builtInScheme(preset.id).progressColors);
			copy.colors.icon = 'red';
			assert.strictEqual(selected.colors.icon, preset.accent);
		}
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		scope.saveSettings();
		const reloaded = loadSettings(writes[0].value).scope;
		assert.strictEqual(reloaded.widgetStyles.colorSchemes.length, runtime.builtInSchemeDefinitions.length);
		assert.ok(reloaded.widgetStyles.colorSchemes.every(scheme => scheme.colors.icon === 'red'));
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
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(writes[0].key, 'previewBuiltIns');
		assert.strictEqual(scope.isDirty(), false);
		const reloaded = loadSettings(null, null, null, true, writes[0].value).scope;
		assert.strictEqual(reloaded.defaultDesignName(), 'Preview default design');
		assert.strictEqual(reloaded.defaultSchemeName(), 'Preview default scheme');
		for (const design of writes[0].value.styles) {
			reloaded.editor.selectedStyleId = design.id;
			assert.strictEqual(reloaded.heightMode(), 'auto');
			assert.strictEqual(reloaded.getSelectedStyle().columnRowSpans.normal[1][0], 2);
		}
		for (const scheme of writes[0].value.colorSchemes) {
			reloaded.editor.selectedSchemeId = scheme.id;
			assert.strictEqual(reloaded.getSelectedScheme().colors.icon, 'red');
		}
		assert.strictEqual(reloaded.isDirty(), false);
		const homey = loadSettings(null, null, null, false, writes[0].value).scope;
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
		const scheme = scope.widgetStyles.colorSchemes[0];
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
		assert.strictEqual(writes[0].value.version, 2);
		const reloaded = loadSettings(writes[0].value).scope;
		assert.strictEqual(reloaded.widgetStyles.styles[0].progressSettings.large.showSteps, true);
		assert.strictEqual(reloaded.widgetStyles.colorSchemes[0].progressColors.large.foreground, 'green');
		assert.strictEqual(reloaded.isDirty(), false);
	});

	it('deletes only the selected collection without saving unrelated edits', () => {
		const { scope, writes } = loadSettings();
		scope.createStyle(true);
		const design = scope.getSelectedStyle();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const scheme = scope.getSelectedScheme();
		scope.saveSettings();
		design.name = 'Unsaved design';
		scope.deleteStyle();
		assert.strictEqual(scope.widgetStyles.styles[0].name, 'Unsaved design');
		assert.strictEqual(scope.widgetStyles.colorSchemes.length, 0);
		assert.strictEqual(writes[1].value.styles[0].name, writes[0].value.styles[0].name);
		assert.strictEqual(writes[1].value.colorSchemes.length, 0);
		assert.strictEqual(scheme.name, writes[0].value.colorSchemes[0].name);
	});

	it('rejects malformed or mixed version 2 design and scheme data', () => {
		const { scope, editor } = loadSettings();
		scope.createStyle(true);
		scope.selectEditorMode('color');
		scope.createStyle(true);
		assert.strictEqual(editor.isValidCollection(scope.widgetStyles), true);
		const mixed = JSON.parse(JSON.stringify(scope.widgetStyles));
		mixed.styles[0].colors = mixed.colorSchemes[0].colors;
		assert.strictEqual(editor.isValidCollection(mixed), false);
		const malformed = JSON.parse(JSON.stringify(scope.widgetStyles));
		malformed.colorSchemes[0].progressColors = { large: { direction: 'left-right' } };
		assert.strictEqual(editor.isValidCollection(malformed), false);
	});

	it('adds a configurable status bar without changing existing layouts', () => {
		const { scope, editor, writes } = loadSettings();
		scope.createStyle(true);
		const style = scope.getSelectedStyle();
		scope.selectEditorMode('color');
		scope.createStyle(true);
		const scheme = scope.getSelectedScheme();
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
		const reloaded = loadSettings(writes[0].value).scope;
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
		scope.createStyle(true);
		scope.saveSettings();
		assert.strictEqual(writes[0].value.styles.length, 2);
		scope.widgetStyles.styles[0].name = 'Unsaved name';
		scope.roundOfDurationsFlowcards = 3;
		scope.deleteStyle();
		assert.strictEqual(scope.widgetStyles.styles.length, 1);
		assert.strictEqual(scope.isBuiltInStyle(), true);
		assert.strictEqual(scope.isDirty(), true);
		assert.strictEqual(writes.length, 2);
		assert.strictEqual(writes[1].value.styles.length, 1);
		assert.notStrictEqual(writes[1].value.styles[0].name, 'Unsaved name');
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
		assert.strictEqual(writes[0].value.colorSchemes[0].foregroundOverrides.running.start, 'black');
		assert.strictEqual(writes[0].value.colorSchemes[0].foregroundColors.fields, 'white');
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
		const typeSelector = html.match(/<select id="preview-type"[\s\S]*?<\/select>/)[0];
		assert.ok(!/editor\.preview(?:Size|State)\s*=/.test(typeSelector));
		assert.ok(html.includes('ng-if="editor.previewType !== \'stopwatch\' || editor.previewState === \'starting\'"'));
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
		assert.deepStrictEqual(Array.from(editor.columnWidths(style, 'compact', 3)), ['span', 'span']);
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
		scope.selectEditorMode('color');
		scope.createStyle(true);
		scope.saveSettings();
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(writes[0].key, 'widgetStyles');
		assert.strictEqual(writes[0].value.styles.length, 1);
		assert.strictEqual(writes[0].value.styles[0].heightModes.normal, 'auto');
		assert.strictEqual(writes[0].value.colorSchemes[0].colors.icon, 'blue');
		assert.notStrictEqual(writes[0].value.styles[0].id, builtIn.id);
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
		assert.strictEqual(first[0].label, 'settings.style_color_inherit (settings.style_color_default)');
		scope.getSelectedScheme().colors.duration = 'red';
		const updated = scope.stateColorOptions('duration');
		assert.notStrictEqual(updated, first);
		assert.strictEqual(updated[0].label, 'settings.style_color_inherit (settings.style_color_red)');
		assert.strictEqual(scope.stateColorOptions('duration'), updated);
		const background = scope.stateColorOptions('background');
		assert.strictEqual(scope.stateColorOptions('background'), background);
		assert.strictEqual(scope.stateForegroundOptions('duration')[0].label,
			'settings.style_color_inherit (settings.style_color_red)');
		scope.getSelectedScheme().foregroundColors = { duration: 'red' };
		assert.strictEqual(scope.stateForegroundOptions('duration')[0].label,
			'settings.style_color_inherit (settings.style_color_red)');
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
