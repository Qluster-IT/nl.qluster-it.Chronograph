'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'chronograph-widget.css'), 'utf8');
const previewCss = fs.readFileSync(path.join(root, 'settings', 'assets', 'styles.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'assets', 'templates', 'chronograph-widget-design.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'settings', 'index.html'), 'utf8');

describe('Widget input layout', () => {
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
