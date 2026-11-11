'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'settings', 'assets', 'widget-style-editor.js'), 'utf8');
const runtimeScript = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'chronograph-widget-style.js'), 'utf8');

function loadEditor() {
	let editor;
	const module = {
		factory(name, factory) { if (name === 'widgetStyleEditor') editor = factory(); return this; },
		directive() { return this; }
	};
	const context = {
		window: {},
		angular: {
			module: () => module,
			copy: value => JSON.parse(JSON.stringify(value))
		}
	};
	vm.runInNewContext(runtimeScript, context);
	vm.runInNewContext(script, context);
	return editor;
}

describe('Widget style status colors', () => {
	it('uses legacy non-button colors unless an explicit foreground color replaces them', () => {
		const editor = loadEditor();
		const style = editor.create('custom', 'Custom');
		assert.strictEqual(editor.resolveForeground(style, 'inactive', 'icon'), 'blue');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'duration'), 'blue');
		assert.strictEqual(editor.foregroundOverride(style, 'running', 'duration'), 'blue');
		style.foregroundColors = { icon: 'green', duration: 'default' };
		assert.strictEqual(editor.resolveForeground(style, 'inactive', 'icon'), 'green');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'duration'), 'default');
		assert.strictEqual(editor.foregroundOverride(style, 'running', 'duration'), 'inherit');
		style.colors.cancel = 'red';
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), true);
	});

	it('preserves previously automatic foreground colors when loading older styles', () => {
		const editor = loadEditor();
		const style = editor.create('custom', 'Custom');
		delete style.foregroundModel;
		style.foregroundColors = { icon: 'default' };
		style.foregroundOverrides = { running: { duration: 'default' } };
		editor.migrateForeground(style);
		assert.strictEqual(editor.resolveForeground(style, 'inactive', 'icon'), 'blue');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'duration'), 'blue');
		style.foregroundColors.icon = 'default';
		editor.migrateForeground(style);
		assert.strictEqual(editor.resolveForeground(style, 'inactive', 'icon'), 'default');
	});

	it('supports independent foreground colors and validates state overrides', () => {
		const editor = loadEditor();
		const style = editor.create('custom', 'Custom');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'fields'), 'default');
		style.foregroundColors = { fields: 'black', cancel: 'white', start: 'red' };
		style.foregroundOverrides = { running: { start: 'green', cancel: 'default' } };
		assert.strictEqual(editor.resolveForeground(style, 'paused', 'fields'), 'black');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'start'), 'green');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'start', true), 'red');
		assert.strictEqual(editor.resolveForeground(style, 'running', 'cancel'), 'default');
		assert.strictEqual(editor.resolveColor(style, 'running', 'start'), 'blue');
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), true);
		style.foregroundOverrides.running.start = 'invalid';
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), false);
	});

	it('inherits inactive colors unless a state explicitly overrides them', () => {
		const editor = loadEditor();
		const style = editor.create('custom', 'Custom');
		style.colors.icon = 'red';
		style.colors.inactive = 'blue';
		style.colorOverrides = { paused: { icon: 'green', background: 'none' } };

		assert.strictEqual(editor.resolveColor(style, 'paused', 'icon'), 'green');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'background'), 'none');
		assert.strictEqual(editor.resolveColor(style, 'running', 'icon'), 'red');
		assert.strictEqual(editor.resolveColor(style, 'running', 'background'), 'blue');
		assert.strictEqual(editor.resolveColor(style, 'starting', 'background'), 'blue');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'icon', true), 'red');

		style.colors.icon = 'purple';
		style.colors.inactive = 'yellow';
		assert.strictEqual(editor.resolveColor(style, 'running', 'icon'), 'purple');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'icon'), 'green');
		assert.strictEqual(editor.resolveColor(style, 'running', 'background'), 'yellow');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'background'), 'none');
		delete style.colorOverrides.paused.icon;
		assert.strictEqual(editor.resolveColor(style, 'paused', 'icon'), 'purple');
	});

	it('represents the default running duration color as a removable override', () => {
		const editor = loadEditor();
		const style = editor.create('default', 'Default');
		assert.strictEqual(editor.resolveColor(style, 'inactive', 'duration'), 'default');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'duration'), 'default');
		assert.strictEqual(editor.resolveColor(style, 'running', 'duration'), 'blue');
		assert.strictEqual(editor.resolveColor(style, 'running', 'duration', true), 'default');
		delete style.colorOverrides.running.duration;
		assert.strictEqual(editor.resolveColor(style, 'running', 'duration'), 'default');
	});

	it('migrates legacy colors without changing their appearance or explicit overrides', () => {
		const editor = loadEditor();
		const style = editor.create('legacy', 'Legacy');
		delete style.colorModel;
		style.colors.inactive = 'blue';
		style.colors.paused = 'none';
		style.colors.running = 'green';
		style.colorOverrides = {
			inactive: { icon: 'red' },
			paused: { name: 'default' },
			starting: { background: 'yellow' }
		};

		editor.migrateColors(style);
		assert.strictEqual(editor.resolveColor(style, 'inactive', 'icon'), 'red');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'icon'), 'blue');
		assert.strictEqual(editor.resolveColor(style, 'running', 'icon'), 'blue');
		assert.strictEqual(editor.resolveColor(style, 'paused', 'background'), 'none');
		assert.strictEqual(editor.resolveColor(style, 'running', 'background'), 'green');
		assert.strictEqual(editor.resolveColor(style, 'starting', 'background'), 'yellow');
		assert.strictEqual(style.colorOverrides.paused.name, 'default');
		assert.strictEqual(style.colorModel, 2);
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), true);

		style.colors.icon = 'purple';
		editor.migrateColors(style);
		assert.strictEqual(editor.resolveColor(style, 'inactive', 'icon'), 'purple');
	});

	it('migrates the former implicit blue duration only for grouped previews', () => {
		const editor = loadEditor();
		const grouped = editor.create('grouped', 'Grouped');
		grouped.colorModel = 1;
		grouped.groups = editor.currentGroups();
		delete grouped.colorOverrides;
		editor.migrateColors(grouped);
		assert.strictEqual(editor.resolveColor(grouped, 'running', 'duration'), 'blue');
		assert.strictEqual(editor.resolveColor(grouped, 'running', 'duration', true), 'default');
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [grouped] }), true);

		const cell = editor.create('cell', 'Cell');
		cell.colorModel = 1;
		delete cell.colorOverrides;
		editor.migrateColors(cell);
		assert.strictEqual(editor.resolveColor(cell, 'running', 'duration'), 'default');
	});

	it('validates optional per-size start field visibility settings', () => {
		const editor = loadEditor();
		const style = editor.create('custom', 'Custom');
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), true);
		delete style.startFieldsVisibility;
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), true);
		style.startFieldsVisibility = { compact: 'play', normal: 'inactive', large: 'invalid' };
		assert.strictEqual(editor.isValidCollection({ version: 1, styles: [style] }), false);
	});
});
