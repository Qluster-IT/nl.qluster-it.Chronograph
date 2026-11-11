(function (root, factory) {
	var runtime = factory();
	if (typeof module === 'object' && module.exports) module.exports = runtime;
	root.ChronographWidgetStyle = runtime;
}(typeof window === 'undefined' ? globalThis : window, function () {
	var elementIds = ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop', 'fields', 'cancel', 'start', 'progress'];
	var buttonIds = ['play', 'pause', 'stop', 'cancel', 'start'];
	var states = ['inactive', 'running', 'paused', 'starting'];
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
		return findItem(collection && collection.styles, id);
	}

	function findScheme(collection, id) {
		var scheme = findItem(collection && collection.colorSchemes, id);
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
			progressColors: progressColors
		};
	}

	function currentScheme() {
		return {
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

	function buildRows(style, size, state, type, showForm) {
		if (!style || !states.includes(state) || !['compact', 'normal', 'large'].includes(size)) return [];
		var positions = resolvePositions(style, size, state);
		var rowVisibility = style.rowVisibility && style.rowVisibility[size] || {};
		var columns = style.rowColumns && style.rowColumns[size] || {};
		var spans = style.columnSpans && style.columnSpans[size] || {};
		var alignments = style.columnAlignments && style.columnAlignments[size] || {};
		var verticalAlignments = style.columnVerticalAlignments && style.columnVerticalAlignments[size] || {};
		var directions = style.columnDirections && style.columnDirections[size] || {};
		var widths = style.columnWidths && style.columnWidths[size] || {};
		return [1, 2, 3, 4, 5].map(function (rowId) {
			var rule = rowVisibility[rowId];
			var visibleStates = rule && Array.isArray(rule.states) ? rule.states : [];
			if (rule && visibleStates.indexOf(state) === -1 && !(state === 'starting' && rule.startForm)) return null;
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
					return position && position.row === rowId && position.group === groupId
						&& isElementVisible(id, state, type, showForm, style, size);
				}).sort(function (left, right) {
					return positions[left].order - positions[right].order || elementIds.indexOf(left) - elementIds.indexOf(right);
				});
				return {
					id: groupId,
					span: rowSpans[groupIndex] || 1,
					alignment: rowAlignments[groupIndex] || 'left',
					verticalAlignment: rowVerticalAlignments[groupIndex] || 'middle',
					direction: rowDirections[groupIndex] || 'horizontal',
					width: rowWidths[groupIndex] || 'span',
					elements: elements
				};
			});
			var visible = !rule || visibleStates.indexOf(state) !== -1 || (state === 'starting' && rule.startForm);
			return visible && groups.some(function (group) { return group.elements.length; })
				? {
					id: rowId,
					alignment: style.rowAlignments && style.rowAlignments[size]
						&& style.rowAlignments[size][rowId] || 'top',
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
			style.backgroundColor = valueColor(buttonColor(scheme, state, element));
			var foreground = resolveForeground(scheme, state, element);
			if (foreground !== 'default') style.color = valueColor(foreground);
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
		buildRows: buildRows,
		valueColor: valueColor,
		buttonColor: buttonColor,
		resolveColor: resolveColor,
		resolveForeground: resolveForeground,
		elementStyle: elementStyle,
		backgroundStyle: backgroundStyle
	};
}));
