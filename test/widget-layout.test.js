'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'chronograph-widget.css'), 'utf8');
const previewCss = fs.readFileSync(path.join(root, 'settings', 'assets', 'styles.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'assets', 'templates', 'chronograph-widget-design.html'), 'utf8');

describe('Widget input layout', () => {
	it('keeps text elements together unless the column is stretched', () => {
		assert.match(css, /\.chronograph-design-element-name,\s*\.chronograph-design-element-status,\s*\.chronograph-design-element-duration\s*\{[^}]*flex:\s*0 1 auto/s);
		assert.match(css, /\.chronograph-design \.chronograph-icon\s*\{[^}]*margin-right:\s*0/s);
		for (const sheet of [css, previewCss]) {
			assert.match(sheet, /\[data-direction="horizontal"\]\[data-alignment="stretch"\][^{]*\{[^}]*flex:\s*1 1 0/s);
			assert.match(sheet, /\[data-direction="vertical"\]\[data-alignment="stretch"\][^{]*\{[^}]*align-items:\s*stretch/s);
			assert.match(sheet, /\[data-alignment="stretch"\][^{]*action[^{]*\{[^}]*width:\s*100%/s);
		}
	});

	it('keeps form labels accessible but out of the grid', () => {
		assert.match(css, /\.chronograph-widget \.visually-hidden\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
		for (const id of ['design-duration', 'design-duration-unit', 'design-transition-from', 'design-transition-to', 'design-transition-steps']) {
			assert.ok(template.includes("designLayer.measure ? undefined : '" + id + "'"), id);
		}
	});

	it('sizes fields within their columns and wraps them like the designer', () => {
		const tracks = 'repeat(auto-fit, minmax(min(100%, 68px), 1fr))';
		assert.ok(css.includes('grid-template-columns: ' + tracks));
		assert.ok(previewCss.includes('grid-template-columns: ' + tracks));
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
