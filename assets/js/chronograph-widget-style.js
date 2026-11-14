(function (root, factory) {
	var runtime = factory();
	if (typeof module === 'object' && module.exports) module.exports = runtime;
	root.ChronographWidgetStyle = runtime;
}(typeof window === 'undefined' ? globalThis : window, function () {
	var elementIds = ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop', 'fields', 'cancel', 'start', 'progress'];
	var buttonIds = ['play', 'pause', 'stop', 'cancel', 'start'];
	var states = ['inactive', 'running', 'paused', 'starting'];
	var maxRows = 10;

	function rowCount(style, size) {
		var count = style && style.rowCounts && style.rowCounts[size];
		return Number.isInteger(count) && count >= 1 && count <= maxRows ? count : 5;
	}
	var defaultElementSizes = {
		base: { icon: 16, name: 14, status: 12, duration: 14, play: 28, pause: 28, stop: 28, fields: 32, cancel: 28, start: 32, progress: 6 },
		overrides: {
			compact: {},
			normal: { duration: 20, play: 32, pause: 32, stop: 32, cancel: 32, progress: 8 },
			large: { icon: 20, name: 20, status: 14, duration: 32, play: 40, pause: 40, stop: 40, fields: 40, cancel: 32, start: 40, progress: 8 }
		}
	};

	function elementSizesDefaults() {
		return { overrides: { compact: {}, normal: {}, large: {} } };
	}

	function defaultElementSize(size, element) {
		return defaultElementSizes.overrides[size] && defaultElementSizes.overrides[size][element] !== undefined
			? defaultElementSizes.overrides[size][element] : defaultElementSizes.base[element];
	}

	function elementSize(style, size, element) {
		var values = style && style.elementSizes;
		if (!values) return defaultElementSize(size, element);
		var override = values.overrides && values.overrides[size];
		var value = override && override[element] !== undefined ? override[element] : values.base && values.base[element];
		if (Number.isInteger(value) && value >= 4 && value <= 100) return value;
		return defaultElementSize(size, element);
	}

	function buttonText(style, size, element, defaultStartText) {
		var values = style && style.buttonTexts && style.buttonTexts[size];
		var value = values && values[element];
		return typeof value === 'string' ? value : element === 'start' ? defaultStartText : '';
	}

	function buttonShape(style, size, element) {
		var shapes = style && style.buttonShapes || {};
		var overrides = shapes.overrides && shapes.overrides[size];
		return overrides && overrides[element] || shapes.base && shapes.base[element] || 'round';
	}

	function buttonShapeStyle(style, size, element) {
		return buttonShape(style, size, element) === 'square' ? { borderRadius: '4px' } : {};
	}

	function reserveElement(style, size, element) {
		return !!(style && style.reservedElements && style.reservedElements[size]
			&& style.reservedElements[size][element] === true);
	}

	function inputFieldRows(style, size, type) {
		var fallback = type === 'transition' ? 2 : 1;
		var max = type === 'transition' ? 5 : 2;
		var value = style && style.inputFieldRows && style.inputFieldRows[size] && style.inputFieldRows[size][type];
		return Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
	}

	function inputFieldLayout(style, size, type) {
		var count = type === 'transition' ? 5 : 2;
		var rows = inputFieldRows(style, size, type);
		var lengths = Array.from({ length: rows }, function (unused, row) {
			return Math.floor(count / rows) + (row < count % rows ? 1 : 0);
		});
		if (type === 'transition' && rows === 2) lengths = [2, 3];
		var columns = lengths.reduce(function (a, b) {
			var x = a, y = b;
			while (y) { var remainder = x % y; x = y; y = remainder; }
			return a * b / x;
		}, 1);
		var positions = [];
		lengths.forEach(function (length, row) {
			for (var i = 0; i < length; i++) {
				positions.push({ 'grid-row': row + 1, 'grid-column': 'span ' + columns / length });
			}
		});
		return { columns: columns, positions: positions };
	}

	function migrateElementSizes(style) {
		var sizes = elementSizesDefaults();
		['compact', 'normal', 'large'].forEach(function (size) {
			elementIds.forEach(function (element) {
				var value = elementSize(style, size, element);
				if (value !== defaultElementSize(size, element)) sizes.overrides[size][element] = value;
			});
		});
		return sizes;
	}
	var colorValues = {
		default: 'inherit',
		none: 'transparent',
		blue: 'var(--homey-color-blue, #2f8df6)',
		red: 'var(--homey-color-red, #f25f5c)',
		orange: 'var(--homey-color-orange, #f07a1f)',
		yellow: '#f5c518',
		green: 'var(--homey-color-green, #71d51b)',
		purple: '#9033fc',
		teal: '#1fc7b0',
		cyan: '#2cc3e8',
		indigo: '#7c83f7',
		pink: '#f2549e',
		brown: '#b9875a',
		grey: '#9a9ca6',
		black: '#000',
		white: '#fff'
	};

	function settingId(setting) {
		if (typeof setting === 'string') return setting;
		if (!setting || typeof setting !== 'object') return '';
		return typeof setting.id === 'string' ? setting.id
			: setting.data && typeof setting.data.id === 'string' ? setting.data.id : '';
	}

	function findItem(items, id) {
		if (!Array.isArray(items)) return undefined;
		return items.find(function (item) { return item && item.id === id; });
	}

	function findStyle(collection, id) {
		return builtInDesign(id) || findItem(collection && collection.styles, id);
	}

	function findScheme(collection, id) {
		var builtIn = builtInScheme(id);
		if (builtIn) return builtIn;
		var scheme = findItem(collection && (collection.version === 3 ? collection.themes : collection.colorSchemes), id);
		if (scheme) return scheme;
		var legacy = collection && collection.version === 1 && findItem(collection.styles, id);
		if (!legacy) return undefined;
		var progressColors = {};
		Object.keys(legacy.progressSettings || {}).forEach(function (size) {
			var settings = legacy.progressSettings[size];
			var colors = {};
			['background', 'foreground'].forEach(function (key) {
				if (settings[key] !== undefined) colors[key] = settings[key];
			});
			if (Object.keys(colors).length) progressColors[size] = colors;
		});
		return {
			colors: legacy.colors || {},
			colorOverrides: legacy.colorOverrides || {},
			foregroundColors: legacy.foregroundColors || {},
			foregroundOverrides: legacy.foregroundOverrides || {},
			borderColors: legacy.borderColors || {},
			borderOverrides: legacy.borderOverrides || {},
			progressColors: progressColors
		};
	}

	function currentScheme() {
		return {
			colorOverrides: { running: { duration: 'blue' } },
			colors: {
				icon: 'blue',
				name: 'default',
				status: 'default',
				duration: 'default',
				play: 'blue',
				start: 'blue',
				pause: 'blue',
				stop: 'red',
				cancel: 'default',
				inactive: 'none',
				running: 'none',
				paused: 'none'
			}
		};
	}

	var builtInSchemeDefinitions = [
		{ id: 'builtin:settings', nameKey: 'settings.style_preset_settings' },
		{ id: 'builtin:ocean', nameKey: 'settings.style_scheme_ocean', accent: 'teal', buttonText: 'black' },
		{ id: 'builtin:forest', nameKey: 'settings.style_scheme_forest', accent: 'green', buttonText: 'black' },
		{ id: 'builtin:sunset', nameKey: 'settings.style_scheme_sunset', accent: 'orange', buttonText: 'black' },
		{ id: 'builtin:twilight', nameKey: 'settings.style_scheme_twilight', accent: 'purple', buttonText: 'white' },
		{ id: 'builtin:blossom', nameKey: 'settings.style_scheme_blossom', accent: 'pink', buttonText: 'black' },
		{ id: 'builtin:sky', nameKey: 'settings.style_scheme_sky', accent: 'cyan', buttonText: 'black' },
		{ id: 'builtin:amber', nameKey: 'settings.style_scheme_amber', accent: 'yellow', buttonText: 'black' }
	];

	function builtInScheme(id) {
		if (id === 'builtin:current') return currentScheme();
		var definition = builtInSchemeDefinitions.find(function (item) { return item.id === id; });
		if (!definition) return undefined;
		var scheme = currentScheme();
		if (id === 'builtin:settings') {
			scheme.colorOverrides = {};
			scheme.foregroundColors = {};
			scheme.borderColors = {};
			buttonIds.forEach(function (button) {
				var color = button === 'stop' ? 'red' : 'grey';
				scheme.colors[button] = 'none';
				scheme.foregroundColors[button] = color;
				scheme.borderColors[button] = color;
			});
			return scheme;
		}
		scheme.colors.icon = definition.accent;
		scheme.colors.play = definition.accent;
		scheme.colors.start = definition.accent;
		scheme.colors.pause = definition.accent;
		scheme.colorOverrides.running.duration = definition.accent;
		scheme.foregroundColors = {
			play: definition.buttonText, start: definition.buttonText, pause: definition.buttonText
		};
		scheme.progressColors = {};
		['compact', 'normal', 'large'].forEach(function (size) {
			scheme.progressColors[size] = { background: 'grey', foreground: definition.accent };
		});
		return scheme;
	}

	function currentLayout(size) {
		function position(row, group, order) {
			return { row: row, group: group, order: order };
		}
		var compact = size === 'compact';
		return {
			elements: {
				icon: position(1, 1, 1),
				name: position(1, 1, 2),
				status: position(compact ? 1 : 2, 1, 3),
				duration: position(compact ? 1 : 3, compact ? 2 : 1, 1),
				play: position(compact ? 1 : 3, compact ? 3 : 2, 1),
				start: position(compact ? 3 : 4, 2, 1),
				pause: position(compact ? 1 : 3, compact ? 3 : 2, 1),
				stop: position(compact ? 1 : 3, compact ? 3 : 2, 2),
				fields: position(compact ? 3 : 4, 1, 1),
				cancel: compact ? position(3, 2, 2) : position(0, 1, 1),
				progress: position(compact ? 2 : 5, 1, 1)
			},
			overrides: compact
				? { starting: { fields: position(3, 1, 1), start: position(3, 2, 1) } }
				: { inactive: { start: position(4, 2, 1) } }
		};
	}

	function currentGroups() {
		return {
			compact: currentLayout('compact'),
			normal: currentLayout('normal'),
			large: currentLayout('large')
		};
	}

	function configureCurrentColumns(style) {
		style.rowColumns = { compact: { 1: 3, 2: 1, 3: 2 }, normal: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 1 }, large: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 1 } };
		style.columnSpans = { compact: { 1: [2, 1, 1], 2: [4], 3: [3, 1] },
			normal: { 1: [4], 2: [4], 3: [3, 1], 4: [3, 1], 5: [4] }, large: { 1: [4], 2: [4], 3: [3, 1], 4: [3, 1], 5: [4] } };
		style.columnWidths = { compact: { 1: ['span', 'content', 'content'], 2: ['span'], 3: ['span', 'content'] },
			normal: { 1: ['span'], 2: ['span'], 3: ['span', 'content'], 4: ['span', 'content'], 5: ['span'] },
			large: { 1: ['span'], 2: ['span'], 3: ['span', 'content'], 4: ['span', 'content'], 5: ['span'] } };
		style.columnAlignments = { compact: { 2: ['left'], 3: ['left', 'left'] },
			normal: { 1: ['left'], 2: ['left'], 3: ['left', 'left'], 4: ['left', 'left'], 5: ['left'] },
			large: { 1: ['left'], 2: ['left'], 3: ['left', 'left'], 4: ['left', 'left'], 5: ['left'] } };
		style.columnDirections = { compact: { 2: ['horizontal'], 3: ['horizontal', 'horizontal'] },
			normal: { 1: ['horizontal'], 2: ['horizontal'], 3: ['horizontal', 'horizontal'], 4: ['horizontal', 'horizontal'], 5: ['horizontal'] },
			large: { 1: ['horizontal'], 2: ['horizontal'], 3: ['horizontal', 'horizontal'], 4: ['horizontal', 'horizontal'], 5: ['horizontal'] } };
		style.columnVerticalAlignments = { compact: { 2: ['middle'] }, normal: { 2: ['middle'], 3: ['middle', 'middle'], 4: ['middle', 'middle'], 5: ['middle'] },
			large: { 1: ['middle'], 2: ['middle'], 3: ['middle', 'middle'], 4: ['middle', 'middle'], 5: ['middle'] } };
	}

	function configureCurrentPresentation(style) {
		style.rowCounts = { compact: 3, normal: 5, large: 5 };
		style.heightModes = { compact: 'minimum-without-inputs', normal: 'minimum', large: 'minimum' };
		style.rowAlignments = { compact: { 1: 'top' }, normal: { 3: 'bottom' }, large: { 3: 'bottom' } };
		style.progressSettings = { normal: { timerMode: 'elapsed', showSteps: true }, compact: { showSteps: true }, large: { showSteps: true } };
		style.elementSizes = elementSizesDefaults();
		style.buttonTexts = { compact: { start: null }, normal: { start: null }, large: { start: null } };
	}

	function currentRowVisibility() {
		function rule(states, startForm, hideAfterSeconds) {
			var result = { states: states, actions: {}, startForm: !!startForm };
			if (hideAfterSeconds !== undefined) result.hideAfterSeconds = hideAfterSeconds;
			return result;
		}
		function expanded() {
			return {
				1: rule(['inactive', 'paused', 'running'], true),
				2: rule(['inactive', 'paused', 'running'], true),
				3: rule(['paused', 'running']),
				4: rule(['inactive'], true),
				5: rule(['paused', 'running'])
			};
		}
		return {
			compact: {
				1: rule(['inactive', 'paused', 'running'], true),
				2: rule(['paused', 'running']),
				3: rule([], true, 10),
				4: rule([])
			},
			normal: expanded(),
			large: expanded()
		};
	}

	function currentDesign() {
		var style = {
			groups: currentGroups(),
			rowVisibility: currentRowVisibility(),
			startFieldsVisibility: { compact: 'play', normal: 'inactive', large: 'inactive' }
		};
		configureCurrentColumns(style);
		configureCurrentPresentation(style);
		return style;
	}

	var builtInDesignDefinitions = [
		{ id: 'builtin:settings', nameKey: 'settings.style_preset_settings' },
		{ id: 'builtin:centered', nameKey: 'settings.style_design_centered' },
		{ id: 'builtin:dashboard', nameKey: 'settings.style_design_dashboard' },
		{ id: 'builtin:focus', nameKey: 'settings.style_design_focus' },
		{ id: 'builtin:vertical', nameKey: 'settings.style_design_vertical' },
		{ id: 'builtin:small', nameKey: 'settings.style_design_small' },
		{ id: 'builtin:tiny', nameKey: 'settings.style_design_tiny' }
	];

	function narrowDesign(design, tiny) {
		design.rowCounts = { compact: 5, normal: 5, large: 5 };
		design.wrapNarrowElements = true;
		design.inputFieldRows = {};
		design.reservedElements = {};
		['compact', 'normal', 'large'].forEach(function (size) {
			function position(row, group, order) { return { row: row, group: group, order: order }; }
			design.groups[size] = { elements: {
				icon: position(1, 1, 1), name: position(1, 1, 2),
				status: position(2, 1, 1), duration: position(tiny ? 3 : 2, 1, tiny ? 1 : 2),
				progress: position(5, 1, 1), fields: position(3, 1, 1),
				play: position(4, 1, 1), pause: position(4, 1, 1), stop: position(4, 1, 2),
				start: size === 'compact' ? position(0, 1, 1) : position(4, 1, 1),
				cancel: size === 'compact' ? position(4, 1, 2) : position(0, 1, 1)
			}, overrides: size === 'compact' ? { starting: { start: position(4, 1, 1) } } : {} };
			design.rowColumns[size] = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
			design.columnSpans[size] = { 1: [4], 2: [4], 3: [4], 4: [4], 5: [4] };
			design.columnWidths[size] = { 1: ['span'], 2: ['span'],
				3: ['span'], 4: ['span'], 5: ['span'] };
			design.columnAlignments[size] = {};
			design.columnDirections[size] = {};
			design.columnVerticalAlignments[size] = {};
			design.rowAlignments[size] = {};
			design.rowVisibility[size] = {
				1: { states: ['inactive', 'running', 'paused'], actions: {}, startForm: true },
				2: { states: ['inactive', 'running', 'paused'], actions: {}, startForm: true },
				3: { states: ['running', 'paused'], actions: {}, startForm: true },
				4: { states: ['inactive', 'running', 'paused'], actions: {}, startForm: true },
				5: { states: ['running', 'paused'], actions: {}, startForm: false }
			};
			design.inputFieldRows[size] = { timer: 2, transition: 5 };
			design.reservedElements[size] = { duration: true };
			design.elementSizes.overrides[size] = {
				icon: 16, name: size === 'large' ? 16 : 14, status: 12,
				duration: size === 'large' ? 18 : size === 'normal' ? 16 : 14,
				play: 28, pause: 28, stop: 28, cancel: 28, start: 32, fields: 32, progress: 6
			};
		});
	}

	function builtInDesign(id) {
		if (id === 'builtin:current') return currentDesign();
		if (!builtInDesignDefinitions.some(function (item) { return item.id === id; })) return undefined;
		var design = currentDesign();
		if (id === 'builtin:settings') {
			design.buttonShapes = { base: {} };
			design.rowCounts = { compact: 3, normal: 4, large: 4 };
			design.columnRowSpans = {};
			buttonIds.forEach(function (button) { design.buttonShapes.base[button] = 'square'; });
			['compact', 'normal', 'large'].forEach(function (size) {
				var elements = design.groups[size].elements;
				elements.icon = { row: 0, group: 1, order: 1 };
				elements.progress = { row: 0, group: 1, order: 1 };
				elements.name = { row: 1, group: 1, order: 1 };
				elements.status = { row: 2, group: 1, order: 1 };
				elements.duration = { row: 2, group: 1, order: 2 };
				elements.play = { row: 1, group: 2, order: 1 };
				elements.pause = { row: 1, group: 2, order: 1 };
				elements.stop = { row: 1, group: 2, order: 2 };
				design.rowColumns[size][1] = 2;
				design.rowColumns[size][2] = 1;
				design.columnSpans[size][1] = [3, 1];
				design.columnSpans[size][2] = [3];
				design.columnWidths[size][1] = ['span', 'content'];
				design.columnWidths[size][2] = ['span'];
				design.columnAlignments[size][1] = ['left', 'right'];
				design.columnAlignments[size][2] = ['left'];
				design.columnDirections[size][1] = ['horizontal', 'horizontal'];
				design.columnDirections[size][2] = ['horizontal'];
				design.columnVerticalAlignments[size][1] = ['middle', 'middle'];
				design.columnVerticalAlignments[size][2] = ['middle'];
				design.columnRowSpans[size] = { 1: [1, 2] };
				design.rowVisibility[size][2] = { states: ['inactive', 'running', 'paused'], actions: {}, startForm: true };
				design.elementSizes.overrides[size] = { name: 14, status: 12, duration: 14, play: 32, pause: 32, stop: 32 };
			});
		} else if (id === 'builtin:small' || id === 'builtin:tiny') {
			narrowDesign(design, id === 'builtin:tiny');
		} else if (id === 'builtin:centered') {
			['compact', 'normal', 'large'].forEach(function (size) {
				Object.keys(design.rowColumns[size]).forEach(function (row) {
					design.columnAlignments[size][row] = Array(design.rowColumns[size][row]).fill('center');
				});
			});
			['normal', 'large'].forEach(function (size) {
				var positions = design.groups[size].elements;
				positions.duration.group = 2;
				positions.play.group = 3;
				positions.pause.group = 1;
				positions.stop.group = 3;
				positions.start = { row: 4, group: 1, order: 2 };
				design.groups[size].overrides.inactive.start = { row: 4, group: 1, order: 2 };
				design.rowColumns[size][3] = 3;
				design.columnSpans[size][3] = [1, 2, 1];
				design.columnWidths[size][3] = ['content', 'span', 'content'];
				design.columnAlignments[size][3] = ['left', 'center', 'center'];
				design.columnDirections[size][3] = ['horizontal', 'horizontal', 'horizontal'];
				design.columnVerticalAlignments[size][3] = ['middle', 'middle', 'middle'];
				design.rowColumns[size][4] = 1;
				design.columnSpans[size][4] = [4];
				design.columnWidths[size][4] = ['span'];
				design.columnAlignments[size][4] = ['center'];
				design.columnDirections[size][4] = ['horizontal'];
				design.columnVerticalAlignments[size][4] = ['middle'];
			});
			design.columnRowSpans = { normal: { 3: [1, 1, 1], 4: [1] }, large: { 3: [1, 1, 1], 4: [1] } };
		} else if (id === 'builtin:dashboard') {
			['normal', 'large'].forEach(function (size) {
				var positions = design.groups[size].elements;
				positions.status = { row: 1, group: 1, order: 3 };
				positions.duration = { row: 2, group: 1, order: 1 };
				design.rowVisibility[size][2] = { states: ['paused', 'running'], actions: {}, startForm: false };
				design.rowAlignments[size][4] = 'bottom';
				design.columnVerticalAlignments[size][4][1] = 'bottom';
			});
		} else if (id === 'builtin:focus') {
			design.elementSizes.overrides.compact.duration = 20;
			design.elementSizes.overrides.normal.duration = 30;
			design.elementSizes.overrides.large.duration = 44;
			['normal', 'large'].forEach(function (size) {
				design.columnAlignments[size][3] = ['center', 'right'];
				design.rowAlignments[size][4] = 'middle';
			});
		} else if (id === 'builtin:vertical') {
			design.rowCounts = { compact: 4, normal: 4, large: 4 };
			design.groups.compact = currentLayout('normal');
			['rowColumns', 'columnSpans', 'columnWidths', 'columnAlignments', 'columnDirections', 'columnVerticalAlignments'].forEach(function (key) {
				design[key].compact = JSON.parse(JSON.stringify(design[key].normal));
			});
			design.rowVisibility.compact = currentRowVisibility().normal;
			design.rowVisibility.compact[3].states.push('inactive');
			design.rowVisibility.compact[4].states = [];
			design.rowVisibility.compact[4].hideAfterSeconds = 10;
			design.groups.compact.elements.cancel = { row: 4, group: 2, order: 2 };
			design.columnRowSpans = {};
			design.reservedElements = {};
			['compact', 'normal', 'large'].forEach(function (size) {
				design.groups[size].elements.icon.group = 2;
				design.groups[size].elements.name.group = 2;
				design.groups[size].elements.progress.row = 1;
				design.rowVisibility[size][5].states = [];
				design.rowColumns[size][1] = 2;
				design.columnSpans[size] = { 1: [1, 3], 2: [3], 3: [2, 1], 4: [2, 1], 5: [3] };
				design.columnWidths[size][1] = [size === 'compact' ? 'span' : 'content', 'span'];
				design.columnAlignments[size][1] = ['left', 'left'];
				design.columnDirections[size][1] = ['horizontal', 'horizontal'];
				design.columnVerticalAlignments[size][1] = ['middle', 'middle'];
				design.columnVerticalAlignments[size][3] = ['middle', size === 'compact' ? 'top' : 'bottom'];
				design.columnVerticalAlignments[size][4] = ['middle', size === 'compact' ? 'top' : 'bottom'];
				design.columnRowSpans[size] = { 1: [4, 1] };
				design.reservedElements[size] = { progress: true };
				design.progressSettings[size].direction = 'bottom-top';
			});
		}
		return design;
	}

	var rowSpanCache = new WeakMap();
	function hasGroupContent(group) {
		return (group.renderElements || group.elements).length > 0;
	}

	function layoutSpanningRows(rows) {
		var cached = rowSpanCache.get(rows);
		if (cached) return cached;
		var sourceRows = rows;
		rows = rows.map(function (row) {
			var groups = row.groups.filter(function (group) {
				return !(group.rowSpan > 1) || hasGroupContent(group);
			});
			if (groups.length === row.groups.length) return row;
			return Object.assign({}, row, {
				groups: groups,
				tracks: groups.map(function (group) {
					return group.width === 'content' ? 'minmax(0, max-content)' : 'minmax(0, ' + group.span + 'fr)';
				}).join(' ')
			});
		});
		var spanning = rows.some(function (row) {
			return row.groups.some(function (group) {
				return group.rowSpan > 1 && hasGroupContent(group) && rows.some(function (other) {
					return other.id > row.id && other.id < row.id + group.rowSpan;
				});
			});
		});
		if (!spanning) {
			var ordinary = { rows: rows.every(function (row, index) { return row === sourceRows[index]; }) ? sourceRows : rows, spanning: false };
			rowSpanCache.set(sourceRows, ordinary);
			return ordinary;
		}
		var rowTracks = [];
		var rowLines = rows.map(function (row) {
			if (row.alignment === 'middle' || row.alignment === 'bottom') rowTracks.push('minmax(0, 1fr)');
			var line = rowTracks.length + 1;
			rowTracks.push('auto');
			if (row.alignment === 'middle') rowTracks.push('minmax(0, 1fr)');
			return line;
		});
		var reservations = [];
		var result = rows.map(function (row, rowIndex) {
			var occupied = reservations.filter(function (item) { return item.end >= row.id; })
				.sort(function (a, b) { return a.start - b.start; });
			var gaps = [];
			var cursor = 0;
			occupied.forEach(function (item) {
				if (item.start > cursor) gaps.push({ start: cursor, end: item.start });
				cursor = Math.max(cursor, item.endColumn);
			});
			if (cursor < 1) gaps.push({ start: cursor, end: 1 });
			var groups = row.groups;
			gaps.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });
			gaps = gaps.slice(0, groups.length).sort(function (a, b) { return a.start - b.start; });
			var remainingWidth = gaps.reduce(function (sum, item) { return sum + item.end - item.start; }, 0);
			var placed = [];
			var groupIndex = 0;
			gaps.forEach(function (gap, gapIndex) {
				var width = gap.end - gap.start;
				var remainingGroups = groups.length - groupIndex;
				var count = gapIndex === gaps.length - 1 ? remainingGroups
					: Math.max(1, Math.min(remainingGroups - (gaps.length - gapIndex - 1),
						Math.round(remainingGroups * width / remainingWidth)));
				var selection = groups.slice(groupIndex, groupIndex + count);
				groupIndex += count;
				remainingWidth -= width;
				var weight = selection.reduce(function (sum, group) { return sum + group.span; }, 0);
				var allSpanning = selection.every(function (group) {
					return group.rowSpan > 1 && hasGroupContent(group)
						&& rows.some(function (other) { return other.id > row.id && other.id < row.id + group.rowSpan; });
				});
				var scale = allSpanning ? 0.75 : 1;
				var usedWeight = 0;
				selection.forEach(function (group) {
					var start = gap.start + width * scale * usedWeight / weight;
					usedWeight += group.span;
					var end = gap.start + width * scale * usedWeight / weight;
					var endRow = row.id + (group.rowSpan || 1) - 1;
					var last = rowIndex;
					while (last + 1 < rows.length && rows[last + 1].id <= endRow) last++;
					if (last > rowIndex && hasGroupContent(group)) {
						reservations.push({ start: start, endColumn: end, end: endRow });
					}
					placed.push(Object.assign({}, group, {
						gridStart: start,
						gridEnd: end,
						gridRow: rowLines[rowIndex] + ' / ' + (rowLines[last] + 1),
						fitContent: group.width === 'content' || last > rowIndex,
						rowTopPadding: (row.topPadding || 0) + (rowIndex ? 4 : 0)
					}));
				});
			});
			return Object.assign({}, row, { groups: placed });
		});
		var boundaries = [0, 1];
		result.forEach(function (row) {
			row.groups.forEach(function (group) {
				boundaries.push(group.gridStart, group.gridEnd);
			});
		});
		boundaries = Array.from(new Set(boundaries)).sort(function (a, b) { return a - b; });
		result.forEach(function (row) {
			row.groups.forEach(function (group) {
				group.gridColumn = (boundaries.indexOf(group.gridStart) + 1) + ' / ' + (boundaries.indexOf(group.gridEnd) + 1);
			});
		});
		var trackDefinitions = boundaries.slice(1).map(function (end, index) {
			var start = boundaries[index];
			var content = result.some(function (row) {
				return row.groups.some(function (group) {
					return group.fitContent && hasGroupContent(group) && group.gridStart <= start && group.gridEnd >= end;
				});
			});
			return { content: content, weight: end - start };
		});
		// Fractional tracks totaling less than 1fr leave part of the grid unused.
		var flexibleWeight = trackDefinitions.reduce(function (sum, track) {
			return sum + (track.content ? 0 : track.weight);
		}, 0);
		var tracks = trackDefinitions.map(function (track) {
			if (track.content) return 'minmax(0, max-content)';
			return 'minmax(0, ' + (track.weight / flexibleWeight) + 'fr)';
		}).join(' ');
		var layout = { rows: result, spanning: true, tracks: tracks, rowTracks: rowTracks.join(' ') };
		rowSpanCache.set(sourceRows, layout);
		return layout;
	}

	function resolvePositions(style, size, state) {
		if (style.groups && style.groups[size]) {
			var layout = style.groups[size];
			var positions = Object.assign({}, layout.elements || {});
			if (state === 'starting') {
				Object.assign(positions, layout.overrides && layout.overrides.inactive || {});
			}
			Object.assign(positions, layout.overrides && layout.overrides[state] || {});
			return positions;
		}
		var cells = style.layouts && style.layouts[size] || [];
		var positions = {};
		cells.forEach(function (id, index) {
			if (id) positions[id] = { row: Math.floor(index / 4) + 1, group: index % 4 + 1, order: 1 };
		});
		if (positions.play && !positions.start) positions.start = Object.assign({}, positions.play);
		return positions;
	}

	function isElementVisible(element, state, type, showForm, style, size) {
		if (element === 'progress') return type !== 'stopwatch';
		if (element === 'duration') return state === 'running' || state === 'paused';
		if (element === 'fields') return type !== 'stopwatch' && showForm;
		if (element === 'cancel') return state === 'starting' && showForm;
		if (element === 'start') return state === 'starting' || (state === 'inactive' && type === 'stopwatch');
		if (element === 'play') {
			return state === 'paused' || (state === 'inactive' && !showForm
				&& (style.startFieldsVisibility ? style.startFieldsVisibility[size] : size === 'compact' ? 'play' : 'inactive') === 'play');
		}
		if (element === 'pause') return state === 'running';
		if (element === 'stop') return state === 'running' || state === 'paused';
		return true;
	}

	function buildRows(style, size, state, type, showForm, excludeFields) {
		if (!style || !states.includes(state) || !['compact', 'normal', 'large'].includes(size)) return [];
		var positions = resolvePositions(style, size, state);
		var rowVisibility = style.rowVisibility && style.rowVisibility[size] || {};
		var columns = style.rowColumns && style.rowColumns[size] || {};
		var spans = style.columnSpans && style.columnSpans[size] || {};
		var alignments = style.columnAlignments && style.columnAlignments[size] || {};
		var verticalAlignments = style.columnVerticalAlignments && style.columnVerticalAlignments[size] || {};
		var directions = style.columnDirections && style.columnDirections[size] || {};
		var widths = style.columnWidths && style.columnWidths[size] || {};
		var rowSpansByColumn = style.columnRowSpans && style.columnRowSpans[size] || {};
		return Array.from({ length: rowCount(style, size) }, function (unused, index) {
			var rowId = index + 1;
			var rule = rowVisibility[rowId];
			var visibleStates = rule && Array.isArray(rule.states) ? rule.states : [];
			var visible = !rule || visibleStates.indexOf(state) !== -1 || (state === 'starting' && rule.startForm);
			var count = Number.isInteger(columns[rowId]) && columns[rowId] >= 1 && columns[rowId] <= 4 ? columns[rowId] : 4;
			var rowSpans = spans[rowId] && spans[rowId].length === count
				? spans[rowId] : Array.from({ length: count }, function () { return 1; });
			var rowAlignments = alignments[rowId] || [];
			var rowVerticalAlignments = verticalAlignments[rowId] || [];
			var rowDirections = directions[rowId] || [];
			var rowWidths = widths[rowId] || [];
			var groups = Array.from({ length: count }, function (unused, groupIndex) {
				var groupId = groupIndex + 1;
				var elements = elementIds.filter(function (id) {
					var position = positions[id];
					return visible && !(excludeFields && id === 'fields')
						&& position && position.row === rowId && position.group === groupId
						&& isElementVisible(id, state, type, showForm, style, size);
				}).sort(function (left, right) {
					return positions[left].order - positions[right].order || elementIds.indexOf(left) - elementIds.indexOf(right);
				});
				var placeholders = ['duration', 'progress'].filter(function (id) {
					var position = positions[id];
					return reserveElement(style, size, id) && position && position.row === rowId && position.group === groupId
						&& elements.indexOf(id) === -1;
				});
				var renderElements = elements.concat(placeholders).sort(function (left, right) {
					return positions[left].order - positions[right].order || elementIds.indexOf(left) - elementIds.indexOf(right);
				});
				return {
					id: groupId,
					span: rowSpans[groupIndex] || 1,
					narrowStart: style.wrapNarrowElements === true && elements.indexOf('start') !== -1,
					wrap: style.wrapNarrowElements === true && elements.length === 2
						&& ((elements.indexOf('start') !== -1 && elements.indexOf('cancel') !== -1)
							|| (elements.indexOf('status') !== -1 && elements.indexOf('duration') !== -1)),
					alignment: rowAlignments[groupIndex] || 'left',
					verticalAlignment: rowVerticalAlignments[groupIndex] || 'middle',
					direction: rowDirections[groupIndex] || 'horizontal',
					width: rowWidths[groupIndex] || 'span',
					rowSpan: rowSpansByColumn[rowId] && rowSpansByColumn[rowId][groupIndex] || 1,
					elements: elements,
					placeholders: placeholders,
					renderElements: renderElements
				};
			});
			return groups.some(hasGroupContent)
				? {
					id: rowId,
					alignment: style.rowAlignments && style.rowAlignments[size]
						&& style.rowAlignments[size][rowId] || 'top',
					topPadding: style.rowTopPadding && style.rowTopPadding[size]
						&& Number.isInteger(style.rowTopPadding[size][rowId])
						&& style.rowTopPadding[size][rowId] >= 0 && style.rowTopPadding[size][rowId] <= 100
						? style.rowTopPadding[size][rowId] : 0,
					tracks: groups.map(function (group) {
						return group.width === 'content' ? 'minmax(0, max-content)' : 'minmax(0, ' + group.span + 'fr)';
					}).join(' '),
					groups: groups
				}
				: null;
		}).filter(Boolean);
	}

	function valueColor(value) {
		return Object.prototype.hasOwnProperty.call(colorValues, value) ? colorValues[value] : colorValues.default;
	}

	function resolveColor(scheme, state, key) {
		if (!scheme || !scheme.colors) return 'default';
		var value = key === 'background' ? scheme.colors[state] : scheme.colors[key];
		var overrides = scheme.colorOverrides || {};
		if (overrides[state] && overrides[state][key] !== undefined) value = overrides[state][key];
		return value === undefined ? 'default' : value;
	}

	function resolveForeground(scheme, state, key) {
		var colors = scheme && scheme.foregroundColors || {};
		var overrides = scheme && scheme.foregroundOverrides || {};
		if (overrides[state] && overrides[state][key] !== undefined) return overrides[state][key];
		if (colors[key] !== undefined) return colors[key];
		if (!buttonIds.includes(key)) return resolveColor(scheme, state, key);
		return 'default';
	}

	function buttonColor(scheme, state, element) {
		var color = resolveColor(scheme, state, element);
		if (!Object.prototype.hasOwnProperty.call(colorValues, color) || color === 'default' || color === 'none') {
			return element === 'stop' ? 'red' : 'blue';
		}
		return color;
	}

	function elementStyle(scheme, state, element) {
		var style = {};
		if (buttonIds.indexOf(element) !== -1) {
			var background = resolveColor(scheme, state, element);
			style.backgroundColor = background === 'none' ? 'transparent' : valueColor(buttonColor(scheme, state, element));
			var foreground = resolveForeground(scheme, state, element);
			if (foreground !== 'default') style.color = valueColor(foreground);
			var borders = scheme && scheme.borderColors || {};
			var overrides = scheme && scheme.borderOverrides && scheme.borderOverrides[state];
			var border = overrides && overrides[element] !== undefined ? overrides[element] : borders[element];
			if (border) style.border = border === 'none' ? '0' : '1px solid ' + valueColor(border);
		} else {
			var color = resolveForeground(scheme, state, element);
			if (color !== 'default') style.color = valueColor(color);
		}
		return style;
	}

	function backgroundStyle(scheme, state) {
		return { backgroundColor: valueColor(resolveColor(scheme, state, 'background')) };
	}

	return {
		settingId: settingId,
		findItem: findItem,
		findStyle: findStyle,
		findScheme: findScheme,
		currentScheme: currentScheme,
		builtInDesign: builtInDesign,
		builtInDesignDefinitions: builtInDesignDefinitions,
		layoutSpanningRows: layoutSpanningRows,
		builtInScheme: builtInScheme,
		builtInSchemeDefinitions: builtInSchemeDefinitions,
		currentDesign: currentDesign,
		maxRows: maxRows,
		rowCount: rowCount,
		currentGroups: currentGroups,
		currentRowVisibility: currentRowVisibility,
		configureCurrentColumns: configureCurrentColumns,
		configureCurrentPresentation: configureCurrentPresentation,
		elementSizesDefaults: elementSizesDefaults,
		defaultElementSize: defaultElementSize,
		migrateElementSizes: migrateElementSizes,
		elementSize: elementSize,
		buttonText: buttonText,
		buttonShape: buttonShape,
		buttonShapeStyle: buttonShapeStyle,
		reserveElement: reserveElement,
		inputFieldRows: inputFieldRows,
		inputFieldLayout: inputFieldLayout,
		buildRows: buildRows,
		valueColor: valueColor,
		buttonColor: buttonColor,
		resolveColor: resolveColor,
		resolveForeground: resolveForeground,
		elementStyle: elementStyle,
		backgroundStyle: backgroundStyle
	};
}));
