'use strict';

const assert = require('assert');
const widgetStyle = require('../assets/js/chronograph-widget-style.js');

describe('Widget style runtime', () => {
	it('reads setting autocomplete selections stored as strings or objects', () => {
		assert.strictEqual(widgetStyle.settingId('design-a'), 'design-a');
		assert.strictEqual(widgetStyle.settingId({ id: 'design-b' }), 'design-b');
		assert.strictEqual(widgetStyle.settingId({ data: { id: 'scheme-c' } }), 'scheme-c');
		assert.strictEqual(widgetStyle.settingId(null), '');
	});

	it('builds responsive rows and applies state-specific positions and visibility', () => {
		const style = {
			startFieldsVisibility: { compact: 'play', normal: 'inactive', large: 'inactive' },
			groups: {
				compact: { elements: {}, overrides: {} },
				normal: {
					elements: {
						name: { row: 1, group: 1, order: 1 },
						status: { row: 1, group: 1, order: 2 },
						duration: { row: 1, group: 2, order: 1 },
						pause: { row: 1, group: 3, order: 1 },
						play: { row: 1, group: 3, order: 1 },
						stop: { row: 1, group: 3, order: 2 },
						fields: { row: 2, group: 1, order: 1 },
						start: { row: 2, group: 2, order: 1 },
						progress: { row: 3, group: 1, order: 1 }
					},
					overrides: { paused: { play: { row: 1, group: 3, order: 1 } } }
				},
				large: { elements: {}, overrides: {} }
			},
			rowColumns: { normal: { 1: 3, 2: 2, 3: 1 } },
			rowVisibility: {
				normal: {
					1: { states: ['inactive', 'running', 'paused'], startForm: true },
					2: { states: ['inactive'], startForm: true },
					3: { states: ['running', 'paused'], startForm: false }
				}
			}
		};
		const inactive = widgetStyle.buildRows(style, 'normal', 'starting', 'timer', true);
		assert.deepStrictEqual(inactive.map(row => row.id), [1, 2]);
		assert.deepStrictEqual(inactive[0].groups[0].elements, ['name', 'status']);
		assert.deepStrictEqual(inactive[1].groups[0].elements, ['fields']);
		assert.deepStrictEqual(inactive[1].groups[1].elements, ['start']);

		const running = widgetStyle.buildRows(style, 'normal', 'running', 'timer', false);
		assert.deepStrictEqual(running.map(row => row.id), [1, 3]);
		assert.deepStrictEqual(running[0].groups[2].elements, ['pause', 'stop']);
		assert.strictEqual(running[0].tracks, 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)');
		assert.strictEqual(widgetStyle.buildRows(style, 'normal', 'running', 'stopwatch', false)
			.some(row => row.groups.some(group => group.elements.includes('progress'))), false);
		assert.strictEqual(widgetStyle.buildRows(style, 'normal', 'starting', 'timer', true, true)
			.some(row => row.groups.some(group => group.elements.includes('fields'))), false);
	});

	it('resolves state overrides and legacy color schemes', () => {
		const scheme = {
			colors: { icon: 'blue', name: 'default', duration: 'default', play: 'green', stop: 'red', inactive: 'none' },
			colorOverrides: { paused: { duration: 'purple', background: 'grey' } },
			foregroundColors: { name: 'white' },
			foregroundOverrides: { running: { name: 'black' } }
		};
		assert.strictEqual(widgetStyle.resolveColor(scheme, 'paused', 'duration'), 'purple');
		assert.strictEqual(widgetStyle.resolveColor(scheme, 'paused', 'background'), 'grey');
		assert.strictEqual(widgetStyle.resolveForeground(scheme, 'running', 'name'), 'black');
		assert.strictEqual(widgetStyle.buttonColor(scheme, 'running', 'play'), 'green');
		assert.strictEqual(widgetStyle.valueColor('invalid'), 'inherit');

		const collection = {
			version: 1,
			styles: [{ id: 'legacy', colors: { icon: 'red' }, progressSettings: { normal: { background: 'grey' } } }]
		};
		assert.strictEqual(widgetStyle.findScheme(collection, 'legacy').colors.icon, 'red');
		assert.strictEqual(widgetStyle.findScheme(collection, 'legacy').progressColors.normal.background, 'grey');
	});
});
