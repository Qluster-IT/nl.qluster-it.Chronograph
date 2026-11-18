'use strict';

const assert = require('assert');
const widgetStyle = require('../assets/js/chronograph-widget-style.js');

describe('Widget style runtime', () => {
	it('keeps the native cancel appearance for App default without ignoring explicit theme overrides', () => {
		const scheme = widgetStyle.currentScheme();
		assert.strictEqual(widgetStyle.elementStyle(scheme, 'starting', 'cancel').backgroundColor, undefined);
		scheme.colors.cancel = 'red';
		assert.strictEqual(widgetStyle.elementStyle(scheme, 'starting', 'cancel').backgroundColor, widgetStyle.valueColor('red'));
		scheme.colorOverrides.starting = { cancel: 'none' };
		scheme.foregroundOverrides = { starting: { cancel: '#123456' } };
		scheme.borderOverrides = { starting: { cancel: '#654321' } };
		assert.deepStrictEqual(widgetStyle.elementStyle(scheme, 'starting', 'cancel'), {
			backgroundColor: 'transparent', color: '#123456', border: '1px solid #654321'
		});
	});

	it('preserves native padding unless overridden and aggregates each side independently', () => {
		assert.deepStrictEqual(widgetStyle.paddingStyle([{}]), {});
		assert.deepStrictEqual(widgetStyle.paddingStyle([{ top: 0, right: 12, bottom: 4, left: 0 }]),
			{ paddingTop: '0px', paddingRight: '12px', paddingBottom: '4px', paddingLeft: '0px' });
		assert.deepStrictEqual(widgetStyle.paddingStyle([{ top: 4, right: 20 }, { top: 8, left: 0 }]), {
			paddingTop: '8px', paddingRight: 'max(var(--homey-su-4, 16px), 20px)',
			paddingLeft: 'max(var(--homey-su-4, 16px), 0px)'
		});
		const design = { widgetPadding: { normal: { top: 0 } } };
		assert.deepStrictEqual(widgetStyle.paddingStyle([widgetStyle.widgetPadding(design, 'compact')]), {});
		assert.deepStrictEqual(widgetStyle.paddingStyle([widgetStyle.widgetPadding(design, 'normal')]), { paddingTop: '0px' });
	});

	it('renders custom colors safely and applies the WidgetKeeper gradient only while running', () => {
		const scheme = widgetStyle.builtInScheme('builtin:widgetkeeper');
		assert.match(widgetStyle.backgroundPaint(scheme, 'running').backgroundImage, /^linear-gradient\(to bottom,/);
		assert.deepStrictEqual(widgetStyle.backgroundPaint(scheme, 'paused'), {});
		assert.deepStrictEqual(widgetStyle.backgroundPaint(scheme, 'inactive'), {});
		scheme.backgroundGradients = { inactive: true, paused: false };
		scheme.colors.inactive = scheme.colors.running = scheme.colors.paused = '#2B2C36';
		assert.strictEqual(widgetStyle.backgroundGradient(scheme, 'running'), true);
		assert.strictEqual(widgetStyle.backgroundPaint(scheme, 'paused').backgroundImage, undefined);
		assert.strictEqual(widgetStyle.backgroundPaint(scheme, 'paused').color, '#fff');
		scheme.colors.paused = '#FAFAFA';
		assert.strictEqual(widgetStyle.backgroundPaint(scheme, 'paused').color, '#000');
		scheme.colors.pause = '#aBc123';
		scheme.foregroundColors.pause = '#123456';
		scheme.borderColors = { pause: '#654321' };
		assert.deepStrictEqual(widgetStyle.elementStyle(scheme, 'paused', 'pause'), {
			backgroundColor: '#aBc123', color: '#123456', border: '1px solid #654321'
		});
		assert.strictEqual(widgetStyle.valueColor('black-light'), '#2B2C36');
		for (const value of ['#123', '#12345678', '#zzzzzz', 'red;display:none', null]) {
			assert.strictEqual(widgetStyle.isHexColor(value), false);
			assert.strictEqual(widgetStyle.valueColor(value), 'inherit');
		}
	});

	it('keeps the standard frame unless a size requests an outline and resolves its state color', () => {
		const design = widgetStyle.currentDesign();
		const scheme = widgetStyle.currentScheme();
		assert.deepStrictEqual(widgetStyle.borderStyle(design, scheme, 'normal', 'running'), {});
		design.borderWidths = { normal: 3, large: 0 };
		assert.match(widgetStyle.backgroundStyle(scheme, 'inactive', design, 'normal').border, /^3px solid var\(--homey-line-color,/);
		scheme.borderColors = { background: 'blue' };
		scheme.borderOverrides = { paused: { background: 'red' }, running: { background: 'none' } };
		assert.strictEqual(widgetStyle.borderStyle(design, scheme, 'normal', 'inactive').border, '3px solid ' + widgetStyle.valueColor('blue'));
		assert.strictEqual(widgetStyle.borderStyle(design, scheme, 'normal', 'paused').border, '3px solid ' + widgetStyle.valueColor('red'));
		assert.deepStrictEqual(widgetStyle.borderStyle(design, scheme, 'normal', 'running'), {});
		assert.deepStrictEqual(widgetStyle.borderStyle(design, scheme, 'large', 'inactive'), {});
		assert.deepStrictEqual(widgetStyle.borderStyle(design, scheme, 'compact', 'inactive'), {});
	});

	it('shows optional elapsed and total time for active timers and transitions and reserves them when requested', () => {
		for (const preset of ['builtin:current', ...widgetStyle.builtInDesignDefinitions.map(item => item.id)]) {
			const design = widgetStyle.builtInDesign(preset);
			for (const size of ['compact', 'normal', 'large']) {
				if (preset === 'builtin:transitions' && size !== 'compact') continue;
				assert.strictEqual(design.groups[size].elements.remaining.row, 0);
				assert.strictEqual(design.groups[size].elements.total.row, 0);
			}
		}
		for (const element of ['remaining', 'total']) {
			const design = widgetStyle.currentDesign();
			design.groups.normal.elements[element] = { row: 1, group: 1, order: 2 };
			const group = (state, type) => widgetStyle.buildRows(design, 'normal', state, type, false)
				.find(row => row.id === 1).groups[0];
			for (const state of ['running', 'paused']) {
				for (const type of ['timer', 'transition']) assert.ok(group(state, type).elements.includes(element));
				assert.ok(!group(state, 'stopwatch').elements.includes(element));
			}
			for (const state of ['inactive', 'starting']) {
				for (const type of ['timer', 'transition']) assert.ok(!group(state, type).elements.includes(element));
			}
			design.reservedElements.normal[element] = true;
			assert.ok(group('inactive', 'transition').placeholders.includes(element));
			assert.ok(group('running', 'stopwatch').placeholders.includes(element));
			delete design.groups.normal.elements[element];
			assert.doesNotThrow(() => widgetStyle.buildRows(design, 'normal', 'running', 'transition', false));
		}
	});

	it('bases Transitions on Default with every element placed in Normal and Large', () => {
		const design = widgetStyle.builtInDesign('builtin:transitions');
		const current = widgetStyle.currentDesign();
		for (const key of Object.keys(current)) {
			if (current[key].compact) assert.deepStrictEqual(design[key].compact, current[key].compact, key);
		}
		for (const size of ['normal', 'large']) {
			const seen = new Set();
			for (const state of ['inactive', 'starting', 'running', 'paused']) {
				const elements = widgetStyle.buildRows(design, size, state, 'transition', state === 'starting')
					.flatMap(row => row.groups.flatMap(group => group.elements));
				elements.forEach(element => seen.add(element));
				if (state === 'running' || state === 'paused') {
					for (const element of ['duration', 'remaining', 'total', 'progress', 'stop']) {
						assert.ok(elements.includes(element), `${size} ${state} ${element}`);
					}
					assert.ok(!elements.includes('fields') && !elements.includes('cancel') && !elements.includes('start'));
				}
			}
			assert.deepStrictEqual([...seen].sort(), Object.keys(design.groups[size].elements).sort(), size);
			for (const position of Object.values(design.groups[size].elements)) assert.ok(position.row > 0);
		}
		assert.strictEqual(current.groups.normal.elements.total.row, 0);
	});

	it('renders Settings buttons as outlined squares and preserves inherited defaults', () => {
		const design = widgetStyle.builtInDesign('builtin:settings');
		const scheme = widgetStyle.builtInScheme('builtin:settings');
		for (const size of ['compact', 'normal', 'large']) {
			for (const state of ['running', 'paused']) {
				const rows = widgetStyle.buildRows(design, size, state, 'timer', false);
				const elements = rows.flatMap(row => row.groups.flatMap(group => group.elements));
				assert.ok(elements.includes('name') && elements.includes('status') && elements.includes('duration'));
				assert.ok(!elements.includes('icon') && !elements.includes('progress'));
				const button = state === 'running' ? 'pause' : 'play';
				assert.deepStrictEqual(widgetStyle.buttonShapeStyle(design, size, button), { borderRadius: '4px' });
				assert.deepStrictEqual(widgetStyle.elementStyle(scheme, state, button), {
					backgroundColor: 'transparent', color: widgetStyle.valueColor('grey'), border: '1px solid ' + widgetStyle.valueColor('grey')
				});
			}
		}
		assert.deepStrictEqual(widgetStyle.buttonShapeStyle(null, 'normal', 'play'), {});
		scheme.borderOverrides = { running: { pause: 'none' } };
		assert.strictEqual(widgetStyle.elementStyle(scheme, 'running', 'pause').border, '0');
	});
	it('renders configured rows beyond five and preserves legacy layouts', () => {
		const design = widgetStyle.currentDesign();
		design.rowCounts.normal = 10;
		design.groups.normal.elements.name.row = 10;
		const rows = widgetStyle.buildRows(design, 'normal', 'running', 'timer', false);
		assert.ok(rows.find(row => row.id === 10).groups[0].elements.includes('name'));
		delete design.rowCounts;
		assert.strictEqual(widgetStyle.rowCount(design, 'normal'), 5);
		assert.ok(!widgetStyle.buildRows(design, 'normal', 'running', 'timer', false).some(row => row.id === 10));
	});

	it('preserves WidgetKeeper controls and large progress spacing across chronograph types', () => {
		const design = widgetStyle.builtInDesign('builtin:widgetkeeper');
		for (const type of ['timer', 'stopwatch', 'transition']) {
			for (const size of ['compact', 'normal', 'large']) {
				for (const state of ['running', 'paused']) {
					const rows = widgetStyle.buildRows(design, size, state, type, false);
					const elements = rows.flatMap(row => row.groups.flatMap(group => group.elements));
					assert.ok(elements.includes('duration') && elements.includes('stop'));
					assert.ok(elements.includes(state === 'running' ? 'pause' : 'play'));
					if (size === 'compact') {
						const titles = rows[0].groups.find(group => group.elements.includes('name'));
						assert.deepStrictEqual(titles.elements, ['name', 'status']);
						assert.strictEqual(titles.direction, 'vertical');
						assert.ok(!titles.elements.includes('icon'));
						const controls = rows[0].groups.find(group => group.elements.includes('stop'));
						assert.ok(controls.elements.includes(state === 'running' ? 'pause' : 'play'));
					}
					if (size === 'large') {
						const progress = rows.flatMap(row => row.groups).find(group => group.renderElements.includes('progress'));
						assert.ok(progress);
						assert.strictEqual(progress.placeholders.includes('progress'), type === 'stopwatch');
					}
				}
				if (type !== 'stopwatch') {
					const rows = widgetStyle.buildRows(design, size, 'starting', type, true);
					const elements = rows.flatMap(row => row.groups.flatMap(group => group.elements));
					assert.ok(elements.includes('fields') && elements.includes('start'));
					if (size === 'large') assert.strictEqual(rows.find(row => row.id === 4).alignment, 'bottom');
				}
			}
		}
	});

	it('uses the occupied row counts for built-in presets', () => {
		for (const id of ['builtin:current', ...widgetStyle.builtInDesignDefinitions.map(item => item.id)]) {
			const design = widgetStyle.builtInDesign(id);
			const expected = id === 'builtin:settings' ? [3, 4, 4] : id === 'builtin:vertical' ? [4, 4, 4]
				: id === 'builtin:small' || id === 'builtin:tiny' ? [5, 5, 5]
					: id === 'builtin:transitions' ? [3, 6, 6] : [3, 5, 5];
			assert.deepStrictEqual(['compact', 'normal', 'large'].map(size => widgetStyle.rowCount(design, size)), expected);
		}
	});

	it('shows only one start control for inactive stopwatches in every built-in layout', () => {
		for (const preset of ['builtin:current', ...widgetStyle.builtInDesignDefinitions.map(item => item.id)]) {
			for (const size of ['compact', 'normal', 'large']) {
				const elements = widgetStyle.buildRows(widgetStyle.builtInDesign(preset), size, 'inactive', 'stopwatch', false)
					.flatMap(row => row.groups.flatMap(group => group.elements));
				assert.deepStrictEqual(elements.filter(element => element === 'play' || element === 'start'),
					[size === 'compact' ? 'play' : 'start'], `${preset} ${size}`);
			}
		}
	});

	it('stacks narrow layouts and their start fields while retaining state controls', () => {
		for (const [id, durationRow] of [['builtin:small', 2], ['builtin:tiny', 3]]) {
			const design = widgetStyle.builtInDesign(id);
			for (const size of ['compact', 'normal', 'large']) {
				assert.strictEqual(widgetStyle.inputFieldRows(design, size, 'timer'), 2);
				assert.strictEqual(widgetStyle.inputFieldRows(design, size, 'transition'), 5);
				for (const type of ['timer', 'transition', 'stopwatch']) {
					for (const state of ['running', 'paused']) {
						const rows = widgetStyle.buildRows(design, size, state, type, false);
						const elements = row => rows.find(item => item.id === row).groups.flatMap(group => group.elements);
						assert.ok(elements(1).includes('name'));
						assert.ok(elements(2).includes('status'));
						assert.ok(elements(durationRow).includes('duration'));
						assert.deepStrictEqual(elements(4), [state === 'running' ? 'pause' : 'play', 'stop']);
						if (type !== 'stopwatch') {
							assert.deepStrictEqual(rows[rows.length - 1].groups[0].elements, ['progress']);
						} else {
							assert.strictEqual(rows[rows.length - 1].id, 4);
						}
					}
					if (type !== 'stopwatch') {
						const rows = widgetStyle.buildRows(design, size, 'starting', type, true);
						assert.deepStrictEqual(rows.find(row => row.id === 3).groups[0].elements, ['fields']);
						const actions = rows.find(row => row.id === 4).groups[0];
						assert.deepStrictEqual(actions.elements,
							size === 'compact' ? ['start', 'cancel'] : ['start']);
						assert.strictEqual(actions.wrap, size === 'compact');
						assert.strictEqual(actions.narrowStart, true);
					}
				}
			}
		}
	});

	it('reserves the compact default start column for both buttons', () => {
		for (const type of ['timer', 'transition']) {
			const rows = widgetStyle.buildRows(widgetStyle.currentDesign(), 'compact', 'starting', type, true);
			const row = rows.find(item => item.id === 3);
			assert.deepStrictEqual(row.groups.map(group => group.elements), [['fields'], ['start', 'cancel']]);
			assert.strictEqual(row.tracks, 'minmax(0, 3fr) minmax(0, max-content)');
		}
	});

	it('fills the available width beside content-sized spanning columns in the Vertical start form', () => {
		const design = widgetStyle.builtInDesign('builtin:vertical');
		for (const size of ['normal', 'large']) {
			for (const type of ['timer', 'transition']) {
				const layout = widgetStyle.layoutSpanningRows(widgetStyle.buildRows(design, size, 'starting', type, true));
				assert.strictEqual(layout.tracks, 'minmax(0, max-content) minmax(0, 1fr) minmax(0, max-content)');
			}
		}
	});

	it('uses the designed Vertical layout with a row-spanning status bar at every size', () => {
		const design = widgetStyle.builtInDesign('builtin:vertical');
		for (const size of ['compact', 'normal', 'large']) {
			const positions = design.groups[size].elements;
			assert.deepStrictEqual(positions.progress, { row: 1, group: 1, order: 1 });
			assert.strictEqual(positions.icon.group, 2);
			assert.strictEqual(positions.name.group, 2);
			assert.strictEqual(design.rowColumns[size][1], 2);
			assert.deepStrictEqual(design.columnSpans[size], { 1: [1, 3], 2: [3], 3: [2, 1], 4: [2, 1], 5: [3] });
			assert.deepStrictEqual(design.columnWidths[size][1], [size === 'compact' ? 'span' : 'content', 'span']);
			assert.deepStrictEqual(design.columnRowSpans[size][1], [4, 1]);
			assert.deepStrictEqual(design.columnVerticalAlignments[size][3], ['middle', size === 'compact' ? 'top' : 'bottom']);
			assert.deepStrictEqual(design.columnVerticalAlignments[size][4], ['middle', size === 'compact' ? 'top' : 'bottom']);
			assert.deepStrictEqual(design.rowVisibility[size][5].states, []);
			for (const type of ['timer', 'transition']) {
				for (const state of ['running', 'paused']) {
					const rows = widgetStyle.buildRows(design, size, state, type, false);
					const layout = widgetStyle.layoutSpanningRows(rows);
					assert.strictEqual(layout.spanning, true);
					assert.ok(!rows.some(row => row.id === 5));
					const progress = layout.rows[0].groups[0];
					assert.deepStrictEqual(progress.elements, ['progress']);
					assert.strictEqual(progress.rowSpan, 4);
					assert.strictEqual(progress.fitContent, true);
					assert.ok(layout.rows[0].groups[1].elements.includes('name'));
					assert.strictEqual(layout.rows.find(row => row.id === 3).groups[1].verticalAlignment,
						size === 'compact' ? 'top' : 'bottom');
				}
			}
		}
	});

	it('collapses the hidden Vertical progress column for stopwatches', () => {
		const design = widgetStyle.builtInDesign('builtin:vertical');
		design.reservedElements = {};
		for (const size of ['compact', 'normal', 'large']) {
			for (const state of ['inactive', 'running', 'paused']) {
				const rows = widgetStyle.buildRows(design, size, state, 'stopwatch', false);
				const layout = widgetStyle.layoutSpanningRows(rows);
				const header = layout.rows.find(row => row.id === 1);
				assert.strictEqual(layout.spanning, false);
				assert.deepStrictEqual(header.groups.map(group => group.id), [2]);
				assert.strictEqual(header.tracks, 'minmax(0, 3fr)');
				assert.deepStrictEqual(header.groups[0].elements, ['icon', 'name']);
				assert.strictEqual(rows[0].groups.length, 2);
			}
		}
	});

	it('reserves the Vertical progress column for stopwatches at every size', () => {
		const design = widgetStyle.builtInDesign('builtin:vertical');
		for (const size of ['compact', 'normal', 'large']) {
			for (const state of ['inactive', 'running', 'paused']) {
				const rows = widgetStyle.buildRows(design, size, state, 'stopwatch', false);
				const layout = widgetStyle.layoutSpanningRows(rows);
				const progress = layout.rows[0].groups[0];
				assert.deepStrictEqual(progress.elements, []);
				assert.deepStrictEqual(progress.placeholders, ['progress']);
				assert.deepStrictEqual(progress.renderElements, ['progress']);
				assert.strictEqual(layout.spanning, true);
				assert.strictEqual(layout.rows[0].groups[1].gridStart, layout.rows[1].groups[0].gridStart);
			}
		}
	});

	it('reserves hidden duration only while its Small or Tiny row is visible', () => {
		for (const preset of ['builtin:small', 'builtin:tiny']) {
			const design = widgetStyle.builtInDesign(preset);
			for (const size of ['compact', 'normal', 'large']) {
				for (const type of ['timer', 'transition', 'stopwatch']) {
					const rows = widgetStyle.buildRows(design, size, 'inactive', type, false);
					const row = rows.find(item => item.id === (preset === 'builtin:tiny' ? 3 : 2));
					if (preset === 'builtin:tiny') {
						assert.strictEqual(row, undefined);
						continue;
					}
					const group = row.groups[0];
					assert.ok(group.placeholders.includes('duration'));
					assert.ok(!group.elements.includes('duration'));
					assert.ok(group.renderElements.includes('duration'));
				}
			}
		}
	});

	it('collapses hidden WidgetKeeper rows despite reservations while retaining minimum-height scenarios', () => {
		const design = widgetStyle.builtInDesign('builtin:widgetkeeper');
		design.rowAlignments.large[4] = 'middle';
		for (const state of ['inactive', 'starting']) {
			const rows = widgetStyle.buildRows(design, 'large', state, 'timer', state === 'starting');
			assert.ok(!rows.some(row => row.id === 5));
			if (state === 'starting') assert.strictEqual(rows.find(row => row.id === 4).alignment, 'middle');
		}
		for (const state of ['running', 'paused']) {
			const measured = widgetStyle.buildRows(design, 'large', state, 'timer', false, true);
			const progress = measured.find(row => row.id === 5);
			assert.strictEqual(progress.topPadding, 16);
			assert.ok(progress.groups.some(group => group.elements.includes('progress')));
		}
	});

	it('reserves a hidden icon only when enabled for its size', () => {
		const design = widgetStyle.currentDesign();
		for (const size of ['compact', 'normal', 'large']) {
			const rows = widgetStyle.buildRows(design, size, 'running', 'timer', false, false, false);
			const group = rows.find(row => row.id === 1).groups.find(item => item.placeholders.includes('icon'));
			assert.ok(group, size);
			assert.ok(!group.elements.includes('icon'));
			assert.ok(group.renderElements.includes('icon'));
			design.reservedElements[size].icon = false;
			const without = widgetStyle.buildRows(design, size, 'running', 'timer', false, false, false);
			assert.ok(!without.some(row => row.groups.some(item => item.renderElements.includes('icon'))));
		}
	});

	it('collapses an empty spanning column even when another column spans rows', () => {
		const rows = [
			{ id: 1, groups: [
				{ id: 1, span: 1, rowSpan: 2, elements: [] },
				{ id: 2, span: 1, rowSpan: 2, elements: ['name'] },
				{ id: 3, span: 1, rowSpan: 1, elements: [] }
			] },
			{ id: 2, groups: [{ id: 1, span: 1, rowSpan: 1, elements: ['duration'] }] }
		];
		const layout = widgetStyle.layoutSpanningRows(rows);
		assert.strictEqual(layout.spanning, true);
		assert.deepStrictEqual(layout.rows[0].groups.map(group => group.id), [2, 3]);
		assert.strictEqual(rows[0].groups.length, 3);
	});

	it('uses the designed centered layout in normal and large sizes', () => {
		const design = widgetStyle.builtInDesign('builtin:centered');
		for (const size of ['normal', 'large']) {
			const positions = design.groups[size].elements;
			assert.deepStrictEqual([positions.pause.group, positions.duration.group, positions.play.group, positions.stop.group], [1, 2, 3, 3]);
			assert.strictEqual(design.rowColumns[size][3], 3);
			assert.deepStrictEqual(design.columnSpans[size][3], [1, 2, 1]);
			assert.deepStrictEqual(design.columnWidths[size][3], ['content', 'span', 'content']);
			assert.deepStrictEqual(design.columnAlignments[size][3], ['left', 'center', 'center']);
			assert.deepStrictEqual(design.columnDirections[size][3], ['horizontal', 'horizontal', 'horizontal']);
			assert.deepStrictEqual(design.columnVerticalAlignments[size][3], ['middle', 'middle', 'middle']);
			assert.deepStrictEqual(design.columnRowSpans[size][3], [1, 1, 1]);
			for (const state of ['running', 'paused']) {
				const row = widgetStyle.buildRows(design, size, state, 'timer', false).find(item => item.id === 3);
				assert.deepStrictEqual(row.groups.map(group => group.elements),
					state === 'running' ? [['pause'], ['duration'], ['stop']] : [[], ['duration'], ['play', 'stop']]);
			}
			for (const type of ['timer', 'transition', 'stopwatch']) {
				const state = type === 'stopwatch' ? 'inactive' : 'starting';
				const row = widgetStyle.buildRows(design, size, state, type, type !== 'stopwatch').find(item => item.id === 4);
				assert.deepStrictEqual(row.groups[0].elements, type === 'stopwatch' ? ['start'] : ['fields', 'start']);
				assert.strictEqual(row.groups[0].alignment, 'center');
			}
		}
	});

	it('bottom-aligns the Dashboard start row and button in normal and large sizes', () => {
		const design = widgetStyle.builtInDesign('builtin:dashboard');
		for (const size of ['normal', 'large']) {
			for (const type of ['timer', 'transition', 'stopwatch']) {
				const state = type === 'stopwatch' ? 'inactive' : 'starting';
				const row = widgetStyle.buildRows(design, size, state, type, type !== 'stopwatch').find(item => item.id === 4);
				assert.strictEqual(row.alignment, 'bottom');
				assert.deepStrictEqual(row.groups[1].elements, ['start']);
				assert.strictEqual(row.groups[1].verticalAlignment, 'bottom');
			}
		}
	});

	it('centers the Focus start row vertically in normal and large sizes', () => {
		const design = widgetStyle.builtInDesign('builtin:focus');
		for (const size of ['normal', 'large']) {
			for (const type of ['timer', 'transition', 'stopwatch']) {
				const state = type === 'stopwatch' ? 'inactive' : 'starting';
				const row = widgetStyle.buildRows(design, size, state, type, type !== 'stopwatch').find(item => item.id === 4);
				assert.strictEqual(row.alignment, 'middle');
			}
		}
	});

	it('spans any column across configured visible rows without overlapping other columns', () => {
		const group = (id, span, rowSpan, elements) => ({ id, span, rowSpan, elements });
		const rows = [
			{ id: 1, topPadding: 0, groups: [group(1, 3, 1, ['name']), group(2, 1, 4, ['progress'])] },
			{ id: 3, topPadding: 0, groups: [group(1, 4, 1, ['duration'])] },
			{ id: 4, topPadding: 0, groups: [group(1, 4, 1, ['fields'])] },
			{ id: 5, topPadding: 0, groups: [group(1, 4, 1, ['status'])] }
		];
		const original = JSON.stringify(rows);
		const layout = widgetStyle.layoutSpanningRows(rows);
		assert.strictEqual(layout.spanning, true);
		assert.strictEqual(widgetStyle.layoutSpanningRows(rows), layout);
		assert.strictEqual(JSON.stringify(rows), original);
		assert.strictEqual(layout.rows[0].groups[1].gridRow, '1 / 4');
		const interval = item => item.gridColumn.split(' / ').map(Number);
		const progress = interval(layout.rows[0].groups[1]);
		for (const row of layout.rows.slice(1, 3)) {
			const other = interval(row.groups[0]);
			assert.ok(other[1] <= progress[0] || other[0] >= progress[1]);
		}
		assert.strictEqual(layout.rows[3].groups[0].gridStart, 0);
		assert.strictEqual(layout.rows[3].groups[0].gridEnd, 1);
		const ordinary = [{ id: 1, groups: [group(1, 4, 1, ['name'])] }];
		assert.strictEqual(widgetStyle.layoutSpanningRows(ordinary).rows, ordinary);
	});

	it('fits columns on both sides of a spanning column, including nested spans', () => {
		const group = (id, rowSpan, elements) => ({ id, span: 1, rowSpan, elements });
		const rows = [
			{ id: 1, groups: [group(1, 1, ['icon']), group(2, 4, ['name']), group(3, 1, ['status'])] },
			{ id: 2, groups: [group(1, 3, ['duration']), group(2, 1, ['play'])] },
			{ id: 3, groups: [group(1, 1, ['fields']), group(2, 1, ['start'])] },
			{ id: 4, groups: [group(1, 1, ['pause']), group(2, 1, ['stop'])] }
		];
		const layout = widgetStyle.layoutSpanningRows(rows);
		assert.ok(layout.rows[1].groups[0].gridEnd <= layout.rows[0].groups[1].gridStart);
		assert.ok(layout.rows[1].groups[1].gridStart >= layout.rows[0].groups[1].gridEnd);
		const items = layout.rows.flatMap(row => row.groups.map(group => ({
			start: group.gridStart, end: group.gridEnd, rows: group.gridRow.split(' / ').map(Number)
		})));
		for (const [i, a] of items.entries()) {
			assert.ok(a.end > a.start);
			for (const b of items.slice(i + 1)) {
				assert.ok(a.end <= b.start || b.end <= a.start || a.rows[1] <= b.rows[0] || b.rows[1] <= a.rows[0]);
			}
		}
	});

	it('keeps row alignment space and padding within the shared grid', () => {
		const rows = [
			{ id: 1, alignment: 'top', topPadding: 2, groups: [{ id: 1, span: 1, rowSpan: 3, elements: ['name'] }] },
			{ id: 2, alignment: 'middle', topPadding: 6, groups: [{ id: 1, span: 1, rowSpan: 1, elements: ['status'] }] },
			{ id: 3, alignment: 'bottom', topPadding: 0, groups: [{ id: 1, span: 1, rowSpan: 1, elements: ['duration'] }] }
		];
		const layout = widgetStyle.layoutSpanningRows(rows);
		assert.strictEqual(layout.rowTracks, 'auto minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1fr) auto');
		assert.strictEqual(layout.rows[0].groups[0].gridRow, '1 / 7');
		assert.strictEqual(layout.rows[1].groups[0].gridRow, '3 / 4');
		assert.strictEqual(layout.rows[1].groups[0].rowTopPadding, 10);
	});

	it('uses content-sized tracks for spanning and explicitly content-sized columns', () => {
		const rows = [
			{ id: 1, groups: [
				{ id: 1, span: 3, rowSpan: 1, width: 'span', elements: ['name'] },
				{ id: 2, span: 1, rowSpan: 3, width: 'span', elements: ['progress'] }
			] },
			{ id: 2, groups: [
				{ id: 1, span: 3, rowSpan: 1, width: 'span', elements: ['duration'] },
				{ id: 2, span: 1, rowSpan: 1, width: 'content', elements: ['stop'] }
			] },
			{ id: 3, groups: [{ id: 1, span: 4, rowSpan: 1, width: 'span', elements: ['fields'] }] }
		];
		const layout = widgetStyle.layoutSpanningRows(rows);
		assert.ok(layout.rows[0].groups[1].fitContent);
		assert.ok(layout.rows[1].groups[1].fitContent);
		assert.ok(!layout.rows[0].groups[0].fitContent);
		const tracks = layout.tracks.split(') ').map(track => track + (track.endsWith(')') ? '' : ')'));
		for (const group of [layout.rows[0].groups[1], layout.rows[1].groups[1]]) {
			const [start, end] = group.gridColumn.split(' / ').map(Number);
			assert.ok(tracks.slice(start - 1, end - 1).every(track => track === 'minmax(0, max-content)'));
		}
	});

	it('lays out all input fields in the requested number of rows for each type and size', () => {
		for (const type of ['timer', 'transition']) {
			const count = type === 'timer' ? 2 : 5;
			for (const size of ['compact', 'normal', 'large']) {
				assert.strictEqual(widgetStyle.inputFieldRows(null, size, type), type === 'timer' ? 1 : 2);
				for (let rows = 1; rows <= count; rows++) {
					const design = { inputFieldRows: { [size]: { [type]: rows } } };
					const layout = widgetStyle.inputFieldLayout(design, size, type);
					assert.strictEqual(layout.positions.length, count);
					assert.deepStrictEqual([...new Set(layout.positions.map(position => position['grid-row']))],
						Array.from({ length: rows }, (_, index) => index + 1));
					for (let row = 1; row <= rows; row++) {
						const total = layout.positions.filter(position => position['grid-row'] === row)
							.reduce((sum, position) => sum + Number(position['grid-column'].split(' ')[1]), 0);
						assert.strictEqual(total, layout.columns);
					}
				}
			}
		}
		const defaultLayout = widgetStyle.inputFieldLayout(null, 'normal', 'transition');
		assert.deepStrictEqual(defaultLayout.positions.map(position => position['grid-row']), [1, 1, 2, 2, 2]);
	});

	it('keeps built-in designs independent and preserves controls in every state and size', () => {
		assert.deepStrictEqual(widgetStyle.builtInDesign('builtin:current'), widgetStyle.currentDesign());
		assert.strictEqual(widgetStyle.builtInDesign('builtin:missing'), undefined);
		for (const preset of widgetStyle.builtInDesignDefinitions) {
			const design = widgetStyle.builtInDesign(preset.id);
			const fresh = widgetStyle.findStyle(null, preset.id);
			design.groups.normal.elements.icon.row = 9;
			assert.notStrictEqual(fresh.groups.normal.elements.icon.row, 9);
			for (const size of ['compact', 'normal', 'large']) {
				for (const type of ['timer', 'transition', 'stopwatch']) {
					const elements = (state, showForm) => widgetStyle.buildRows(fresh, size, state, type, showForm)
						.flatMap(row => row.groups.flatMap(group => group.elements));
					for (const state of ['running', 'paused']) {
						const visible = elements(state, false);
						for (const item of ['name', 'status', 'duration', state === 'running' ? 'pause' : 'play', 'stop']) {
							assert.ok(visible.includes(item), `${preset.id} ${size} ${type} ${state} ${item}`);
						}
					}
					if (type !== 'stopwatch') {
						const visible = elements('starting', true);
						assert.ok(visible.includes('fields'), `${preset.id} ${size} ${type} fields`);
						assert.ok(visible.includes('start'), `${preset.id} ${size} ${type} start`);
					} else {
						const action = size === 'compact' ? 'play' : 'start';
						assert.ok(elements('inactive', false).includes(action), `${preset.id} ${size} stopwatch ${action}`);
					}
				}
			}
		}
	});

	it('returns independent built-in schemes without changing the existing Default', () => {
		assert.deepStrictEqual(widgetStyle.builtInScheme('builtin:current'), widgetStyle.currentScheme());
		assert.strictEqual(widgetStyle.builtInScheme('builtin:missing'), undefined);
		for (const preset of widgetStyle.builtInSchemeDefinitions) {
			const first = widgetStyle.findScheme(null, preset.id);
			const second = widgetStyle.builtInScheme(preset.id);
			first.colors.icon = 'red';
			if (preset.id === 'builtin:settings') {
				first.borderColors.play = 'red';
				assert.strictEqual(second.borderColors.play, 'grey');
				continue;
			}
			first.progressColors.compact.foreground = 'red';
			assert.strictEqual(second.colors.icon, preset.accent);
			assert.strictEqual(second.progressColors.compact.foreground, preset.accent);
		}
	});

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
			columnAlignments: { normal: { 1: ['stretch', 'left', 'right'] } },
			rowTopPadding: { normal: { 1: 24, 2: 8, 3: 12 } },
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
		assert.deepStrictEqual(inactive.map(row => row.topPadding), [24, 8]);
		assert.deepStrictEqual(inactive[0].groups[0].elements, ['name', 'status']);
		assert.deepStrictEqual(inactive[1].groups[0].elements, ['fields']);
		assert.deepStrictEqual(inactive[1].groups[1].elements, ['start']);

		const running = widgetStyle.buildRows(style, 'normal', 'running', 'timer', false);
		assert.deepStrictEqual(running.map(row => row.id), [1, 3]);
		assert.deepStrictEqual(running.map(row => row.topPadding), [24, 12]);
		assert.deepStrictEqual(running[0].groups[2].elements, ['pause', 'stop']);
		assert.strictEqual(running[0].groups[0].alignment, 'stretch');
		assert.strictEqual(running[0].tracks, 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)');
		assert.strictEqual(widgetStyle.buildRows(style, 'normal', 'running', 'stopwatch', false)
			.some(row => row.groups.some(group => group.elements.includes('progress'))), false);
		assert.strictEqual(widgetStyle.buildRows(style, 'normal', 'starting', 'timer', true, true)
			.some(row => row.groups.some(group => group.elements.includes('fields'))), false);
		style.rowTopPadding.normal[1] = -1;
		assert.strictEqual(widgetStyle.buildRows(style, 'normal', 'running', 'timer', false)[0].topPadding, 0);
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
