'use strict';

angular.module('chronographSettings').factory('widgetStyleEditor', function () {
	var elementIds = ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop', 'fields'];
	var groupedElementIds = elementIds.concat(['cancel', 'start', 'progress']);
	var sizes = ['compact', 'normal', 'large'];
	var colorIds = ['default', 'blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'];
	var foregroundIds = colorIds.concat(['black', 'white']);
	var backgroundIds = ['none'].concat(colorIds.slice(1));
	var legacyColorKeys = ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop'];
	var buttonIds = ['play', 'pause', 'stop', 'start', 'cancel'];
	var colorKeys = legacyColorKeys.concat(['start', 'cancel']);
	var backgroundKeys = ['inactive', 'running', 'paused'];
	var states = ['running', 'paused', 'inactive'];
	var layoutStates = states.concat(['starting']);
	var rowKeys = ['1', '2', '3', '4', '5'];

	function position(row, group, order) {
		return { row: row, group: group, order: order };
	}

	var currentGroups = window.ChronographWidgetStyle.currentGroups;
	var configureCurrentColumns = window.ChronographWidgetStyle.configureCurrentColumns;
	var configureCurrentPresentation = window.ChronographWidgetStyle.configureCurrentPresentation;
	var currentRowVisibility = window.ChronographWidgetStyle.currentRowVisibility;

	function fromCells(style) {
		var result = {};
		sizes.forEach(function (size) {
			function positions(cells) {
				var elements = {};
				cells.forEach(function (id, index) {
					if (id) elements[id] = position(Math.floor(index / 4) + 1, index % 4 + 1, 1);
				});
				return elements;
			}
			var base = positions(style.layouts[size]);
			base.cancel = position(4, 4, 2);
			base.progress = position(0, 1, 1);
			var overrides = {};
			layoutStates.forEach(function (state) {
				var resolved = positions(resolveLayout(style, size, state));
				var inherited = state === 'starting' ? positions(resolveLayout(style, size, 'inactive')) : base;
				var changed = {};
				elementIds.forEach(function (id) {
					if (!angular.equals(inherited[id], resolved[id])) changed[id] = resolved[id];
				});
				if (Object.keys(changed).length) overrides[state] = changed;
			});
			result[size] = { elements: base, overrides: overrides };
		});
		addStartPositions(result);
		return result;
	}

	function addStartPositions(groups) {
		sizes.forEach(function (size) {
			var layout = groups[size];
			if (layout.elements.start) return;
			layout.elements.start = angular.copy(layout.elements.play);
			Object.keys(layout.overrides).forEach(function (state) {
				var override = layout.overrides[state];
				if (override.play && !override.start) override.start = angular.copy(override.play);
			});
		});
	}

	function resolvedGroups(style, size, state) {
		var layout = style.groups[size];
		var result = angular.copy(layout.elements);
		var overrides = layout.overrides[state] || {};
		if (state === 'starting') {
			Object.keys(layout.overrides.inactive || {}).forEach(function (id) {
				result[id] = angular.copy(layout.overrides.inactive[id]);
			});
		}
		Object.keys(overrides).forEach(function (id) { result[id] = angular.copy(overrides[id]); });
		return result;
	}

	function rowColumns(style, size, row) {
		var columns = style.rowColumns && style.rowColumns[size];
		return columns && columns[row] !== undefined ? columns[row] : 4;
	}

	function rowAlignment(style, size, row) {
		var rows = style.rowAlignments && style.rowAlignments[size];
		return rows && rows[row] || 'top';
	}

	function rowTopPadding(style, size, row) {
		var rows = style.rowTopPadding && style.rowTopPadding[size];
		return rows && rows[row] !== undefined ? rows[row] : 0;
	}

	function setRowTopPadding(style, size, row, padding) {
		if (!style.groups || sizes.indexOf(size) === -1 || !Number.isInteger(row) || rowKeys.indexOf(String(row)) === -1
			|| !Number.isInteger(padding) || padding < 0 || padding > 100) throw new RangeError('Invalid row top padding');
		if (!style.rowTopPadding) style.rowTopPadding = {};
		if (!style.rowTopPadding[size]) style.rowTopPadding[size] = {};
		style.rowTopPadding[size][row] = padding;
	}

	function validRowTopPadding(style) {
		var value = style.rowTopPadding;
		if (value === undefined) return true;
		if (!style.groups || !value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var rows = value[size];
			return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
				&& Object.keys(rows).every(function (row) {
					return rowKeys.indexOf(row) !== -1 && Number.isInteger(rows[row]) && rows[row] >= 0 && rows[row] <= 100;
				});
		});
	}

	function moveRow(style, size, source, target) {
		if (!style.groups || sizes.indexOf(size) === -1
			|| rowKeys.indexOf(String(source)) === -1 || rowKeys.indexOf(String(target)) === -1
			|| !Number.isInteger(source) || !Number.isInteger(target)) throw new RangeError('Invalid row');
		if (source === target) return;
		function destination(row) {
			if (row === source) return target;
			if (source < target && row > source && row <= target) return row - 1;
			if (source > target && row >= target && row < source) return row + 1;
			return row;
		}
		var layout = style.groups[size];
		[layout.elements].concat(Object.keys(layout.overrides).map(function (state) {
			return layout.overrides[state];
		})).forEach(function (positions) {
			Object.keys(positions).forEach(function (id) {
				if (positions[id].row !== 0) positions[id].row = destination(positions[id].row);
			});
		});
		['rowVisibility', 'rowColumns', 'columnSpans', 'columnAlignments', 'columnVerticalAlignments',
			'columnDirections', 'columnWidths', 'columnRowSpans', 'rowAlignments', 'rowTopPadding'].forEach(function (key) {
			var rows = style[key] && style[key][size];
			if (!rows) return;
			var moved = {};
			Object.keys(rows).forEach(function (row) { moved[destination(Number(row))] = rows[row]; });
			style[key][size] = moved;
		});
		Object.keys(style.columnRowSpans && style.columnRowSpans[size] || {}).forEach(function (row) {
			style.columnRowSpans[size][row] = style.columnRowSpans[size][row].map(function (span) {
				return Math.min(span, 6 - Number(row));
			});
		});
	}

	function setRowAlignment(style, size, row, alignment) {
		if (!style.groups || sizes.indexOf(size) === -1 || !Number.isInteger(row) || rowKeys.indexOf(String(row)) === -1
			|| ['top', 'middle', 'bottom'].indexOf(alignment) === -1) {
			throw new RangeError('Invalid row alignment');
		}
		if (!style.rowAlignments) style.rowAlignments = {};
		if (!style.rowAlignments[size]) style.rowAlignments[size] = {};
		style.rowAlignments[size][row] = alignment;
	}

	function validRowAlignments(style) {
		var value = style.rowAlignments;
		if (value === undefined) return true;
		if (!style.groups || !value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var rows = value[size];
			return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
				&& Object.keys(rows).every(function (row) {
					return rowKeys.indexOf(row) !== -1
						&& ['top', 'middle', 'bottom'].indexOf(rows[row]) !== -1;
				});
		});
	}

	function columnSpans(style, size, row) {
		var spans = style.columnSpans && style.columnSpans[size] && style.columnSpans[size][row];
		if (spans) return spans.slice();
		var count = rowColumns(style, size, row);
		var result = Array.from({ length: count }, function () { return 1; });
		for (var i = 0; i < 4 - count; i++) result[i % count]++;
		return result;
	}

	function storeColumnSpans(style, size, row, spans) {
		if (!style.columnSpans) style.columnSpans = {};
		if (!style.columnSpans[size]) style.columnSpans[size] = {};
		style.columnSpans[size][row] = spans;
	}

	function columnValues(style, key, size, row, defaultValue) {
		var values = style[key] && style[key][size] && style[key][size][row];
		return values ? values.slice() : Array.from({ length: rowColumns(style, size, row) }, function () { return defaultValue; });
	}

	function storeColumnValues(style, key, size, row, values) {
		if (!style[key]) style[key] = {};
		if (!style[key][size]) style[key][size] = {};
		style[key][size][row] = values;
	}

	function columnAlignments(style, size, row) {
		return columnValues(style, 'columnAlignments', size, row, 'left');
	}

	function columnDirections(style, size, row) {
		return columnValues(style, 'columnDirections', size, row, 'horizontal');
	}

	function columnVerticalAlignments(style, size, row) {
		return columnValues(style, 'columnVerticalAlignments', size, row, 'middle');
	}

	function columnWidths(style, size, row) {
		return columnValues(style, 'columnWidths', size, row, 'span');
	}

	function columnRowSpans(style, size, row) {
		return columnValues(style, 'columnRowSpans', size, row, 1);
	}

	function setColumnRowSpan(style, size, row, column, span) {
		var values = columnRowSpans(style, size, row);
		if (!style.groups || sizes.indexOf(size) === -1 || rowKeys.indexOf(String(row)) === -1
			|| !Number.isInteger(column) || column < 1 || column > values.length
			|| !Number.isInteger(span) || span < 1 || span > 6 - row) throw new RangeError('Invalid column row span');
		values[column - 1] = span;
		storeColumnValues(style, 'columnRowSpans', size, row, values);
	}

	function setColumnValue(style, key, size, row, column, value, options, defaultValue) {
		var values = columnValues(style, key, size, row, defaultValue);
		if (!Number.isInteger(column) || column < 1 || column > values.length
			|| options.indexOf(value) === -1) {
			throw new RangeError('Invalid column setting');
		}
		values[column - 1] = value;
		storeColumnValues(style, key, size, row, values);
	}

	function setColumnAlignment(style, size, row, column, alignment) {
		setColumnValue(style, 'columnAlignments', size, row, column, alignment, ['left', 'center', 'right', 'stretch'], 'left');
	}

	function setColumnDirection(style, size, row, column, direction) {
		setColumnValue(style, 'columnDirections', size, row, column, direction, ['horizontal', 'vertical'], 'horizontal');
	}

	function setColumnVerticalAlignment(style, size, row, column, alignment) {
		setColumnValue(style, 'columnVerticalAlignments', size, row, column, alignment, ['top', 'middle', 'bottom'], 'middle');
	}

	function setColumnWidth(style, size, row, column, width) {
		setColumnValue(style, 'columnWidths', size, row, column, width, ['span', 'content'], 'span');
	}

	function moveColumn(style, size, row, source, target) {
		if (!style.groups || sizes.indexOf(size) === -1 || rowKeys.indexOf(String(row)) === -1
			|| !Number.isInteger(row) || !Number.isInteger(source) || !Number.isInteger(target)
			|| source < 1 || target < 1 || source > rowColumns(style, size, row)
			|| target > rowColumns(style, size, row)) throw new RangeError('Invalid column');
		if (source === target) return;
		function destination(column) {
			if (column === source) return target;
			if (source < target && column > source && column <= target) return column - 1;
			if (source > target && column >= target && column < source) return column + 1;
			return column;
		}
		var layout = style.groups[size];
		[layout.elements].concat(Object.keys(layout.overrides).map(function (state) {
			return layout.overrides[state];
		})).forEach(function (positions) {
			Object.keys(positions).forEach(function (id) {
				if (positions[id].row === row) positions[id].group = destination(positions[id].group);
			});
		});
		['columnSpans', 'columnAlignments', 'columnVerticalAlignments', 'columnDirections', 'columnWidths', 'columnRowSpans']
			.forEach(function (key) {
				var values = style[key] && style[key][size] && style[key][size][row];
				if (!values) return;
				values.splice(target - 1, 0, values.splice(source - 1, 1)[0]);
			});
	}

	function validColumnValues(style, key, options) {
		var value = style[key];
		if (value === undefined) return true;
		if (!style.groups || !value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var rows = value[size];
			return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
				&& Object.keys(rows).every(function (row) {
					var values = rows[row];
					return rowKeys.indexOf(row) !== -1 && Array.isArray(values)
						&& values.length === rowColumns(style, size, row)
						&& values.every(function (entry) { return options.indexOf(entry) !== -1; });
				});
		});
	}

	function setColumnSpan(style, size, row, column, span) {
		var spans = columnSpans(style, size, row);
		var alignments = columnAlignments(style, size, row);
		var verticalAlignments = columnVerticalAlignments(style, size, row);
		var directions = columnDirections(style, size, row);
		var widths = columnWidths(style, size, row);
		var rowSpans = columnRowSpans(style, size, row);
		var index = column - 1;
		if (!Number.isInteger(index) || index < 0 || index >= spans.length
			|| !Number.isInteger(span) || span < 1 || span > 4) {
			throw new RangeError('Invalid column span');
		}
		if (span < spans[index]) {
			var freed = spans[index] - span;
			spans[index] = span;
			while (freed-- > 0) {
				spans.push(1);
				alignments.push('left');
				verticalAlignments.push('middle');
				directions.push('horizontal');
				widths.push('span');
				rowSpans.push(1);
			}
			if (!style.rowColumns) style.rowColumns = {};
			if (!style.rowColumns[size]) style.rowColumns[size] = {};
			style.rowColumns[size][row] = spans.length;
			storeColumnSpans(style, size, row, spans);
			storeColumnValues(style, 'columnAlignments', size, row, alignments);
			storeColumnValues(style, 'columnVerticalAlignments', size, row, verticalAlignments);
			storeColumnValues(style, 'columnDirections', size, row, directions);
			storeColumnValues(style, 'columnWidths', size, row, widths);
			storeColumnValues(style, 'columnRowSpans', size, row, rowSpans);
			return column;
		}
		var removedColumns = [];
		var originalIndex = index;
		for (var candidate = originalIndex + 1; candidate < spans.length; candidate++) removedColumns.push(candidate);
		for (var previous = originalIndex - 1; previous >= 0; previous--) removedColumns.push(previous);
		removedColumns = removedColumns.slice(0, Math.max(0, spans.length - (5 - span)));
		if (removedColumns.length) {
			var kept = spans.map(function (value, i) { return i; }).filter(function (i) {
				return removedColumns.indexOf(i) === -1;
			});
			var removedSpan = removedColumns.reduce(function (sum, i) { return sum + spans[i]; }, 0);
			var selectedIndex = kept.indexOf(originalIndex);
			var removedBefore = originalIndex - selectedIndex;
			var layout = style.groups[size];
			[layout.elements].concat(Object.keys(layout.overrides).map(function (state) {
				return layout.overrides[state];
			})).forEach(function (positions) {
				Object.keys(positions).forEach(function (id) {
					var position = positions[id];
					if (position.row !== row) return;
					var oldIndex = position.group - 1;
					var newIndex;
					if (oldIndex > originalIndex) {
						newIndex = Math.min(oldIndex - removedBefore, kept.length - 1);
					} else {
						newIndex = kept.indexOf(oldIndex);
						if (newIndex === -1) newIndex = selectedIndex;
					}
					position.group = newIndex + 1;
				});
			});
			spans = kept.map(function (i) { return spans[i]; });
			alignments = kept.map(function (i) { return alignments[i]; });
			verticalAlignments = kept.map(function (i) { return verticalAlignments[i]; });
			directions = kept.map(function (i) { return directions[i]; });
			widths = kept.map(function (i) { return widths[i]; });
			rowSpans = kept.map(function (i) { return rowSpans[i]; });
			spans[spans.length - 1] += removedSpan;
			index = selectedIndex;
			if (!style.rowColumns) style.rowColumns = {};
			if (!style.rowColumns[size]) style.rowColumns[size] = {};
			style.rowColumns[size][row] = spans.length;
			storeColumnValues(style, 'columnAlignments', size, row, alignments);
			storeColumnValues(style, 'columnVerticalAlignments', size, row, verticalAlignments);
			storeColumnValues(style, 'columnDirections', size, row, directions);
			storeColumnValues(style, 'columnWidths', size, row, widths);
			storeColumnValues(style, 'columnRowSpans', size, row, rowSpans);
		}
		var difference = span - spans[index];
		var others = [];
		for (var i = index + 1; i < spans.length; i++) others.push(i);
		for (var j = index - 1; j >= 0; j--) others.push(j);
		if (difference > 0) {
			others.forEach(function (other) {
				var taken = Math.min(difference, spans[other] - 1);
				spans[other] -= taken;
				difference -= taken;
			});
		}
		spans[index] = span;
		storeColumnSpans(style, size, row, spans);
		return index + 1;
	}

	function validColumnSpans(style) {
		var value = style.columnSpans;
		if (value === undefined) return true;
		if (!style.groups || !value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var rows = value[size];
			return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
				&& Object.keys(rows).every(function (row) {
					var spans = rows[row];
					return rowKeys.indexOf(row) !== -1 && Array.isArray(spans)
						&& spans.length === rowColumns(style, size, row)
						&& spans.every(function (span) { return Number.isInteger(span) && span >= 1 && span <= 4; })
						&& spans.reduce(function (sum, span) { return sum + span; }, 0) === 4;
				});
		});
	}

	function validRowColumns(columns) {
		if (columns === undefined) return true;
		if (!columns || typeof columns !== 'object' || Array.isArray(columns)) return false;
		return Object.keys(columns).every(function (size) {
			var rows = columns[size];
			return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
				&& Object.keys(rows).every(function (row) {
					return rowKeys.indexOf(row) !== -1
						&& Number.isInteger(rows[row]) && rows[row] >= 1 && rows[row] <= 4;
				});
		});
	}

	function validColumnPositions(style) {
		if (!style.groups) return style.rowColumns === undefined;
		return sizes.every(function (size) {
			return [null].concat(layoutStates).every(function (state) {
				var positions = state ? resolvedGroups(style, size, state) : style.groups[size].elements;
				return groupedElementIds.every(function (id) {
					return !positions[id] || positions[id].group <= rowColumns(style, size, positions[id].row);
				});
			});
		});
	}

	function setRowColumns(style, size, row, count) {
		var layout = style.groups[size];
		var spans = columnSpans(style, size, row);
		var alignments = columnAlignments(style, size, row);
		var verticalAlignments = columnVerticalAlignments(style, size, row);
		var directions = columnDirections(style, size, row);
		var widths = columnWidths(style, size, row);
		var rowSpans = columnRowSpans(style, size, row);
		if (count < spans.length) {
			var removed = spans.splice(count);
			spans[count - 1] += removed.reduce(function (sum, span) { return sum + span; }, 0);
		} else {
			while (spans.length < count) {
				for (var i = spans.length - 1; i >= 0; i--) {
					if (spans[i] > 1) { spans[i]--; spans.push(1); break; }
				}
			}
		}
		if (!style.rowColumns) style.rowColumns = {};
		if (!style.rowColumns[size]) style.rowColumns[size] = {};
		style.rowColumns[size][row] = count;
		storeColumnSpans(style, size, row, spans);
		alignments = alignments.slice(0, count);
		while (alignments.length < count) alignments.push('left');
		storeColumnValues(style, 'columnAlignments', size, row, alignments);
		verticalAlignments = verticalAlignments.slice(0, count);
		while (verticalAlignments.length < count) verticalAlignments.push('middle');
		storeColumnValues(style, 'columnVerticalAlignments', size, row, verticalAlignments);
		directions = directions.slice(0, count);
		while (directions.length < count) directions.push('horizontal');
		storeColumnValues(style, 'columnDirections', size, row, directions);
		widths = widths.slice(0, count);
		while (widths.length < count) widths.push('span');
		storeColumnValues(style, 'columnWidths', size, row, widths);
		rowSpans = rowSpans.slice(0, count);
		while (rowSpans.length < count) rowSpans.push(1);
		storeColumnValues(style, 'columnRowSpans', size, row, rowSpans);
		[layout.elements].concat(Object.keys(layout.overrides).map(function (state) {
			return layout.overrides[state];
		})).forEach(function (positions) {
			Object.keys(positions).forEach(function (id) {
				if (positions[id].row === row && positions[id].group > count) positions[id].group = count;
			});
		});
	}

	function validGroups(groups) {
		if (groups === undefined) return true;
		if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return false;
		function validPosition(value) {
			return value && Number.isInteger(value.row) && value.row >= 0 && value.row <= 5
				&& Number.isInteger(value.group) && value.group >= 1 && value.group <= 4
				&& Number.isInteger(value.order) && value.order >= 1 && value.order <= groupedElementIds.length
				&& (value.row !== 0 || (value.group === 1 && value.order === 1));
		}
		function validElements(value, complete) {
			return value && typeof value === 'object' && !Array.isArray(value)
				&& Object.keys(value).every(function (id) { return groupedElementIds.indexOf(id) !== -1 && validPosition(value[id]); })
				&& (!complete || groupedElementIds.every(function (id) { return id === 'start' || id === 'progress' || validPosition(value[id]); }));
		}
		return sizes.every(function (size) {
			var layout = groups[size];
			return layout && validElements(layout.elements, true) && layout.overrides
				&& typeof layout.overrides === 'object' && !Array.isArray(layout.overrides)
				&& Object.keys(layout.overrides).every(function (state) {
					return layoutStates.indexOf(state) !== -1 && validElements(layout.overrides[state], false);
				});
		}) && Object.keys(groups).every(function (size) { return sizes.indexOf(size) !== -1; });
	}

	function create(id, name) {
		var cells = ['icon', 'name', 'status', 'duration', 'play', 'pause', 'stop', 'fields', '', '', '', ''];
		var scheme = window.ChronographWidgetStyle.currentScheme();
		return {
			id: id,
			name: name,
			layouts: {
				compact: cells.slice(),
				normal: cells.slice(),
				large: cells.slice()
			},
			overrides: { compact: {}, normal: {}, large: {} },
			startFieldsVisibility: { compact: 'play', normal: 'inactive', large: 'inactive' },
			colorModel: 2,
			foregroundModel: 1,
			colorOverrides: scheme.colorOverrides,
			colors: scheme.colors
		};
	}

	function resolveLayout(style, size, state) {
		var cells = style.layouts[size].slice();
		var overrides = style.overrides && style.overrides[size];
		if (!overrides) return cells;
		(state === 'starting' ? ['inactive', 'starting'] : [state]).forEach(function (key) {
			(overrides[key] || []).forEach(function (move) {
				var source = cells.indexOf(move.element);
				var displaced = cells[move.cell];
				cells[move.cell] = move.element;
				cells[source] = displaced;
			});
		});
		return cells;
	}

	function validOverrides(overrides) {
		if (overrides === undefined) return true;
		if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return false;
		return Object.keys(overrides).every(function (size) {
			if (sizes.indexOf(size) === -1 || !overrides[size] || typeof overrides[size] !== 'object'
				|| Array.isArray(overrides[size])) return false;
			return Object.keys(overrides[size]).every(function (state) {
				var moves = overrides[size][state];
				return layoutStates.indexOf(state) !== -1 && Array.isArray(moves)
					&& moves.every(function (move) {
						return move && elementIds.indexOf(move.element) !== -1
							&& Number.isInteger(move.cell) && move.cell >= 0 && move.cell < 12;
					});
			});
		});
	}

	function validColorOverrides(overrides) {
		if (overrides === undefined) return true;
		if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return false;
		return Object.keys(overrides).every(function (state) {
			var values = overrides[state];
			return layoutStates.indexOf(state) !== -1 && values && typeof values === 'object'
				&& !Array.isArray(values) && Object.keys(values).every(function (key) {
					return key === 'background'
						? backgroundIds.indexOf(values[key]) !== -1
						: colorKeys.indexOf(key) !== -1 && colorIds.indexOf(values[key]) !== -1;
				});
		});
	}

	function resolveColor(style, state, key, inheritedOnly) {
		var value = key === 'background' ? style.colors.inactive : style.colors[key];
		var overrides = style.colorOverrides || {};
		if (state !== 'inactive' && !inheritedOnly && overrides[state] && overrides[state][key] !== undefined) {
			value = overrides[state][key];
		}
		return key === 'cancel' && value === undefined ? 'default' : value;
	}

	function validForegroundColors(colors) {
		return colors === undefined || (colors && typeof colors === 'object' && !Array.isArray(colors)
			&& Object.keys(colors).every(function (key) {
				return groupedElementIds.indexOf(key) !== -1 && foregroundIds.indexOf(colors[key]) !== -1;
			}));
	}

	function validForegroundOverrides(overrides) {
		return overrides === undefined || (overrides && typeof overrides === 'object' && !Array.isArray(overrides)
			&& Object.keys(overrides).every(function (state) {
				return state !== 'inactive' && layoutStates.indexOf(state) !== -1
					&& validForegroundColors(overrides[state]) && overrides[state] !== undefined;
			}));
	}

	function resolveForeground(style, state, key, inheritedOnly) {
		var colors = style.foregroundColors || {};
		var overrides = style.foregroundOverrides || {};
		if (state !== 'inactive' && !inheritedOnly && overrides[state] && overrides[state][key] !== undefined) {
			return overrides[state][key];
		}
		if (colors[key] !== undefined) return colors[key];
		if (buttonIds.indexOf(key) === -1 && colorKeys.indexOf(key) !== -1) {
			return resolveColor(style, state, key, inheritedOnly);
		}
		return 'default';
	}

	function foregroundOverride(style, state, key) {
		var values = style.foregroundOverrides && style.foregroundOverrides[state];
		if (values && values[key] !== undefined) return values[key];
		var colors = style.foregroundColors || {};
		var legacy = style.colorOverrides && style.colorOverrides[state];
		if (buttonIds.indexOf(key) === -1 && colors[key] === undefined && legacy && legacy[key] !== undefined) {
			return legacy[key];
		}
		return 'inherit';
	}

	function migrateForeground(style) {
		if (style.foregroundModel === 1) return;
		Object.keys(style.foregroundColors || {}).forEach(function (key) {
			if (buttonIds.indexOf(key) === -1 && style.foregroundColors[key] === 'default'
				&& colorKeys.indexOf(key) !== -1) {
				style.foregroundColors[key] = resolveColor(style, 'inactive', key);
			}
		});
		Object.keys(style.foregroundOverrides || {}).forEach(function (state) {
			var values = style.foregroundOverrides[state];
			Object.keys(values).forEach(function (key) {
				if (buttonIds.indexOf(key) === -1 && values[key] === 'default' && colorKeys.indexOf(key) !== -1) {
					values[key] = resolveColor(style, state, key);
				}
			});
		});
		style.foregroundModel = 1;
	}

	function migrateColors(style) {
		if (style.colorModel === 2) return;
		if (style.colorModel === undefined) migrateLegacyColors(style);
		if (style.groups && resolveColor(style, 'running', 'duration') === 'default') {
			if (!style.colorOverrides) style.colorOverrides = {};
			if (!style.colorOverrides.running) style.colorOverrides.running = {};
			style.colorOverrides.running.duration = 'blue';
		}
		style.colorModel = 2;
	}

	function migrateStart(style) {
		if (style.groups) addStartPositions(style.groups);
		if (style.groups) sizes.forEach(function (size) {
			if (!style.groups[size].elements.progress) style.groups[size].elements.progress = position(0, 1, 1);
		});
		if (style.colors.start !== undefined) return;
		style.colors.start = style.colors.play;
		Object.keys(style.colorOverrides || {}).forEach(function (state) {
			var overrides = style.colorOverrides[state];
			if (overrides.play !== undefined && overrides.start === undefined) overrides.start = overrides.play;
		});
	}

	function migrateLegacyColors(style) {
		var original = style.colors;
		var oldOverrides = style.colorOverrides || {};
		var newOverrides = {};
		var keys = legacyColorKeys.concat(['background']);
		keys.forEach(function (key) {
			var originalKey = key === 'background' ? 'inactive' : key;
			var base = oldOverrides.inactive && oldOverrides.inactive[key] !== undefined
				? oldOverrides.inactive[key] : original[originalKey];
			['paused', 'running'].forEach(function (state) {
				var hasOverride = oldOverrides[state] && oldOverrides[state][key] !== undefined;
				var oldValue = hasOverride ? oldOverrides[state][key]
					: key === 'background' ? original[state] : original[key];
				if (hasOverride || oldValue !== base) {
					if (!newOverrides[state]) newOverrides[state] = {};
					newOverrides[state][key] = oldValue;
				}
			});
			original[originalKey] = base;
		});
		if (oldOverrides.starting && Object.keys(oldOverrides.starting).length) {
			newOverrides.starting = angular.copy(oldOverrides.starting);
		}
		if (Object.keys(newOverrides).length) style.colorOverrides = newOverrides;
		else delete style.colorOverrides;
	}

	function isValidStyle(style) {
		if (!style || typeof style.id !== 'string' || !style.id || typeof style.name !== 'string'
			|| !style.name.trim() || !style.layouts || !style.colors
			|| (style.colorModel !== undefined && style.colorModel !== 1 && style.colorModel !== 2)
			|| (style.foregroundModel !== undefined && style.foregroundModel !== 1)
			|| (style.colorModel !== undefined && style.colorOverrides && style.colorOverrides.inactive)
			|| !validStartFieldsVisibility(style.startFieldsVisibility) || !validRowVisibility(style.rowVisibility)
			|| !validForegroundColors(style.foregroundColors) || !validForegroundOverrides(style.foregroundOverrides)
			|| !validHeightModes(style.heightModes)
			|| !validInputFieldRows(style.inputFieldRows)
			|| !validElementSizes(style.elementSizes)
			|| (style.allowShrink !== undefined && typeof style.allowShrink !== 'boolean')
			|| !validProgressSettings(style)
			|| !validRowColumns(style.rowColumns) || !validRowAlignments(style) || !validRowTopPadding(style) || !validColumnSpans(style)
			|| !validColumnValues(style, 'columnAlignments', ['left', 'center', 'right', 'stretch'])
			|| !validColumnValues(style, 'columnVerticalAlignments', ['top', 'middle', 'bottom'])
			|| !validColumnValues(style, 'columnDirections', ['horizontal', 'vertical'])
			|| !validColumnValues(style, 'columnWidths', ['span', 'content'])
			|| !validColumnRowSpans(style)) return false;
		return validOverrides(style.overrides) && validGroups(style.groups) && validColorOverrides(style.colorOverrides) && sizes.every(function (size) {
			var cells = style.layouts[size];
			return Array.isArray(cells) && cells.length === 12
				&& cells.every(function (id) { return id === '' || elementIds.indexOf(id) !== -1; })
				&& elementIds.every(function (id) { return cells.filter(function (cell) { return cell === id; }).length === 1; });
		}) && validColumnPositions(style) && colorKeys.every(function (key) {
			return ((key === 'start' || key === 'cancel') && style.colors[key] === undefined) || colorIds.indexOf(style.colors[key]) !== -1;
		}) && backgroundKeys.every(function (key) {
			return backgroundIds.indexOf(style.colors[key]) !== -1;
		});
	}

	function validColumnRowSpans(style) {
		var value = style.columnRowSpans;
		if (value === undefined) return true;
		return !!style.groups && !!value && typeof value === 'object' && !Array.isArray(value)
			&& Object.keys(value).every(function (size) {
				var rows = value[size];
				return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
					&& Object.keys(rows).every(function (row) {
						return rowKeys.indexOf(row) !== -1 && Array.isArray(rows[row])
							&& rows[row].length === rowColumns(style, size, row)
							&& rows[row].every(function (span) { return Number.isInteger(span) && span >= 1 && span <= 6 - Number(row); });
					});
			});
	}

	function validProgressSettings(style) {
		var value = style.progressSettings;
		if (value === undefined) return true;
		if (!style.groups || !value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var settings = value[size];
			return sizes.indexOf(size) !== -1 && settings && typeof settings === 'object' && !Array.isArray(settings)
				&& Object.keys(settings).every(function (key) {
					return (key === 'background' || key === 'foreground') ? foregroundIds.indexOf(settings[key]) !== -1
						: key === 'direction' ? ['left-right', 'right-left', 'bottom-top', 'top-bottom'].indexOf(settings[key]) !== -1
							: key === 'timerMode' ? ['elapsed', 'remaining'].indexOf(settings[key]) !== -1
								: key === 'showSteps' && typeof settings[key] === 'boolean';
				});
		});
	}

	function validHeightModes(value) {
		return value === undefined || (value && typeof value === 'object' && !Array.isArray(value)
			&& Object.keys(value).every(function (size) {
				return sizes.indexOf(size) !== -1 && ['auto', 'minimum', 'minimum-without-inputs'].indexOf(value[size]) !== -1;
			}));
	}

	function validInputFieldRows(value) {
		return value === undefined || (value && typeof value === 'object' && !Array.isArray(value)
			&& Object.keys(value).every(function (size) {
				var rows = value[size];
				return sizes.indexOf(size) !== -1 && rows && typeof rows === 'object' && !Array.isArray(rows)
					&& Object.keys(rows).every(function (type) {
						return (type === 'timer' || type === 'transition') && Number.isInteger(rows[type])
							&& rows[type] >= 1 && rows[type] <= (type === 'timer' ? 2 : 5);
					});
			}));
	}

	function validElementSizes(value) {
		if (value === undefined) return true;
		function validMap(map) {
			return map && typeof map === 'object' && !Array.isArray(map)
				&& Object.keys(map).every(function (key) {
					return groupedElementIds.indexOf(key) !== -1 && Number.isInteger(map[key])
						&& map[key] >= 4 && map[key] <= 100;
				});
		}
		return value && typeof value === 'object' && !Array.isArray(value)
			&& Object.keys(value).every(function (key) { return key === 'base' || key === 'overrides'; })
			&& (value.base === undefined || (validMap(value.base) && groupedElementIds.every(function (key) {
				return Object.prototype.hasOwnProperty.call(value.base, key);
			}))) && value.overrides && typeof value.overrides === 'object'
			&& !Array.isArray(value.overrides)
			&& Object.keys(value.overrides).every(function (size) {
				return sizes.indexOf(size) !== -1 && validMap(value.overrides[size]);
			});
	}

	function validStartFieldsVisibility(value) {
		if (value === undefined) return true;
		return value && typeof value === 'object' && !Array.isArray(value)
			&& sizes.every(function (size) { return value[size] === 'play' || value[size] === 'inactive'; })
			&& Object.keys(value).every(function (size) { return sizes.indexOf(size) !== -1; });
	}

	function startFieldsVisibility(style, size) {
		return style.startFieldsVisibility ? style.startFieldsVisibility[size] : size === 'compact' ? 'play' : 'inactive';
	}

	function migrateRowVisibility(style) {
		Object.keys(style.rowVisibility || {}).forEach(function (size) {
			Object.keys(style.rowVisibility[size]).forEach(function (row) {
				var rule = style.rowVisibility[size][row];
				var actions = rule.actions;
				if (rule.startForm === undefined) {
					rule.startForm = rule.states.indexOf('inactive') !== -1 || !!actions.play;
					if (actions.play && actions.play.mode === 'timed') rule.hideAfterSeconds = actions.play.seconds;
					[['pause', 'paused'], ['stop', 'inactive']].forEach(function (mapping) {
						if (actions[mapping[0]] && rule.states.indexOf(mapping[1]) === -1) rule.states.push(mapping[1]);
					});
				}
				rule.actions = {};
			});
		});
	}

	function validRowVisibility(value) {
		if (value === undefined) return true;
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		return Object.keys(value).every(function (size) {
			var rows = value[size];
			if (sizes.indexOf(size) === -1 || !rows || typeof rows !== 'object' || Array.isArray(rows)) return false;
			return Object.keys(rows).every(function (row) {
				var rule = rows[row];
				return rowKeys.indexOf(row) !== -1 && rule
					&& Array.isArray(rule.states)
					&& rule.states.every(function (state, index) {
						return states.indexOf(state) !== -1 && rule.states.indexOf(state) === index;
					}) && (rule.startForm === undefined || typeof rule.startForm === 'boolean')
					&& (rule.hideAfterSeconds === undefined || (rule.startForm === true
						&& typeof rule.hideAfterSeconds === 'number' && isFinite(rule.hideAfterSeconds)
						&& rule.hideAfterSeconds >= 0.1 && rule.hideAfterSeconds <= 86400))
					&& rule.actions && typeof rule.actions === 'object' && !Array.isArray(rule.actions)
					&& Object.keys(rule.actions).every(function (action) {
						var config = rule.actions[action];
						return config && (action === 'start'
							? config.mode === 'hide'
							: ['play', 'pause', 'stop'].indexOf(action) !== -1
								&& ['until-next', 'status', 'toggle', 'timed'].indexOf(config.mode) !== -1)
							&& (config.mode !== 'timed' || (typeof config.seconds === 'number'
								&& isFinite(config.seconds) && config.seconds >= 0.1 && config.seconds <= 86400));
					});
			});
		});
	}

	function isValidCollection(value) {
		if (!value || (value.version !== 1 && value.version !== 2) || !Array.isArray(value.styles)) return false;
		var ids = [];
		if (!value.styles.every(function (style) {
			var valid = value.version === 1 ? isValidStyle(style) : isValidDesign(style);
			if (!valid || ids.indexOf(style.id) !== -1) return false;
			ids.push(style.id);
			return true;
		})) return false;
		if (value.version === 1) return value.colorSchemes === undefined;
		if (!Array.isArray(value.colorSchemes)) return false;
		ids = [];
		return value.colorSchemes.every(function (scheme) {
			if (!scheme || typeof scheme.id !== 'string' || !scheme.id || ids.indexOf(scheme.id) !== -1
				|| typeof scheme.name !== 'string' || !scheme.name.trim()
				|| !scheme.colors || typeof scheme.colors !== 'object' || Array.isArray(scheme.colors)
				|| !validColorOverrides(scheme.colorOverrides) || (scheme.colorOverrides && scheme.colorOverrides.inactive)
				|| !validForegroundColors(scheme.foregroundColors) || !validForegroundOverrides(scheme.foregroundOverrides)
				|| !validProgressSettings({ groups: true, progressSettings: scheme.progressColors })) return false;
			if (!colorKeys.every(function (key) {
				return ((key === 'start' || key === 'cancel') && scheme.colors[key] === undefined)
					|| colorIds.indexOf(scheme.colors[key]) !== -1;
			}) || !backgroundKeys.every(function (key) { return backgroundIds.indexOf(scheme.colors[key]) !== -1; })) return false;
			if (scheme.progressColors && !Object.keys(scheme.progressColors).every(function (size) {
				return Object.keys(scheme.progressColors[size]).every(function (key) { return key === 'background' || key === 'foreground'; });
			})) return false;
			ids.push(scheme.id);
			return true;
		});
	}

	function isValidDesign(style) {
		if (!style || ['colors', 'colorModel', 'colorOverrides', 'foregroundColors', 'foregroundOverrides', 'foregroundModel']
			.some(function (key) { return Object.prototype.hasOwnProperty.call(style, key); })) return false;
		if (style.groups && !sizes.every(function (size) {
			return style.groups[size] && style.groups[size].elements
				&& style.groups[size].elements.start && style.groups[size].elements.progress;
		})) return false;
		if (style.progressSettings && Object.keys(style.progressSettings).some(function (size) {
			var settings = style.progressSettings[size];
			return settings && (Object.prototype.hasOwnProperty.call(settings, 'background') || Object.prototype.hasOwnProperty.call(settings, 'foreground'));
		})) return false;
		var combined = angular.copy(style);
		combined.colors = create('validation', 'validation').colors;
		return isValidStyle(combined);
	}

	function designFromStyle(style) {
		var design = angular.copy(style);
		['colors', 'colorModel', 'colorOverrides', 'foregroundColors', 'foregroundOverrides', 'foregroundModel'].forEach(function (key) {
			delete design[key];
		});
		Object.keys(design.progressSettings || {}).forEach(function (size) {
			delete design.progressSettings[size].background;
			delete design.progressSettings[size].foreground;
		});
		return design;
	}

	function colorSchemeFromStyle(style) {
		var scheme = { id: style.id, name: style.name, colors: angular.copy(style.colors) };
		['colorOverrides', 'foregroundColors', 'foregroundOverrides'].forEach(function (key) {
			if (style[key] !== undefined) scheme[key] = angular.copy(style[key]);
		});
		Object.keys(style.progressSettings || {}).forEach(function (size) {
			var source = style.progressSettings[size];
			['background', 'foreground'].forEach(function (key) {
				if (source[key] === undefined) return;
				if (!scheme.progressColors) scheme.progressColors = {};
				if (!scheme.progressColors[size]) scheme.progressColors[size] = {};
				scheme.progressColors[size][key] = source[key];
			});
		});
		return scheme;
	}

	function newId(styles) {
		var id;
		do {
			id = 'style-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
		} while (styles.some(function (style) { return style.id === id; }));
		return id;
	}

	return {
		create: create,
		currentGroups: currentGroups,
		configureCurrentColumns: configureCurrentColumns,
		configureCurrentPresentation: configureCurrentPresentation,
		currentRowVisibility: currentRowVisibility,
		fromCells: fromCells,
		resolvedGroups: resolvedGroups,
		rowColumns: rowColumns,
		rowAlignment: rowAlignment,
		rowTopPadding: rowTopPadding,
		setRowTopPadding: setRowTopPadding,
		moveRow: moveRow,
		moveColumn: moveColumn,
		setRowAlignment: setRowAlignment,
		setRowColumns: setRowColumns,
		columnSpans: columnSpans,
		setColumnSpan: setColumnSpan,
		columnAlignments: columnAlignments,
		setColumnAlignment: setColumnAlignment,
		columnDirections: columnDirections,
		columnVerticalAlignments: columnVerticalAlignments,
		setColumnVerticalAlignment: setColumnVerticalAlignment,
		setColumnDirection: setColumnDirection,
		columnWidths: columnWidths,
		setColumnWidth: setColumnWidth,
		columnRowSpans: columnRowSpans,
		setColumnRowSpan: setColumnRowSpan,
		resolveColor: resolveColor,
		resolveForeground: resolveForeground,
		foregroundOverride: foregroundOverride,
		migrateForeground: migrateForeground,
		migrateColors: migrateColors,
		migrateStart: migrateStart,
		colorKeys: colorKeys,
		buttonIds: buttonIds,
		startFieldsVisibility: startFieldsVisibility,
		validRowVisibility: validRowVisibility,
		migrateRowVisibility: migrateRowVisibility,
		elementIds: groupedElementIds,
		resolveLayout: resolveLayout,
		newId: newId,
		isValidCollection: isValidCollection,
		designFromStyle: designFromStyle,
		colorSchemeFromStyle: colorSchemeFromStyle,
		colorIds: colorIds,
		foregroundIds: foregroundIds,
		backgroundIds: backgroundIds
	};
}).factory('styleTouchDrag', function () {
	return function (node) {
		var pointerId;
		var startX;
		var startY;
		var ghost;
		var dragged = false;
		var suppressClick = false;

		function moveGhost(event) {
			ghost.style.left = event.clientX + 'px';
			ghost.style.top = event.clientY + 'px';
		}

		function cleanup() {
			if (ghost) ghost.remove();
			ghost = null;
			node.classList.remove('style-touch-dragging');
			if (pointerId !== undefined && node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
			pointerId = undefined;
		}

		function start(event) {
			if (event.pointerType !== 'touch' || node.getAttribute('draggable') !== 'true' || pointerId !== undefined) return false;
			pointerId = event.pointerId;
			startX = event.clientX;
			startY = event.clientY;
			dragged = false;
			node.setPointerCapture(pointerId);
			return true;
		}

		function move(event) {
			if (pointerId !== event.pointerId) return;
			if (!dragged && Math.hypot(event.clientX - startX, event.clientY - startY) < 6) return false;
			if (!ghost) {
				dragged = true;
				ghost = document.createElement('div');
				ghost.className = 'style-touch-drag-ghost';
				var label = node.querySelector('.style-cell-label');
				ghost.textContent = label ? label.textContent : node.textContent;
				document.body.appendChild(ghost);
				node.classList.add('style-touch-dragging');
			}
			moveGhost(event);
			event.preventDefault();
			return true;
		}

		function end(event) {
			if (pointerId !== event.pointerId) return false;
			var wasDragged = dragged;
			cleanup();
			if (wasDragged) {
				suppressClick = true;
				setTimeout(function () { suppressClick = false; }, 0);
			}
			return wasDragged;
		}

		function click(event) {
			if (!suppressClick) return;
			suppressClick = false;
			event.preventDefault();
			event.stopImmediatePropagation();
		}

		node.addEventListener('click', click, true);
		return {
			start: start,
			move: move,
			end: end,
			cancel: function (event) { if (pointerId === event.pointerId) cleanup(); },
			destroy: function () { cleanup(); node.removeEventListener('click', click, true); }
		};
	};
}).directive('styleGridCell', ['styleTouchDrag', function (styleTouchDrag) {
	return {
		restrict: 'A',
		link: function (scope, element, attrs) {
			var startIndex;
			var touchDrag = styleTouchDrag(element[0]);

			function dragStart(event) {
				if (element[0].getAttribute('draggable') !== 'true') { event.preventDefault(); return; }
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-chronograph-style-cell', attrs.styleGridCell);
			}

			function dragOver(event) {
				event.preventDefault();
				event.dataTransfer.dropEffect = 'move';
			}

			function drop(event) {
				event.preventDefault();
				var sourceValue = event.dataTransfer.getData('application/x-chronograph-style-cell');
				if (sourceValue === '') return;
				var source = Number(sourceValue);
				var target = Number(attrs.styleGridCell);
				if (Number.isInteger(source) && Number.isInteger(target)) {
					scope.$apply(function () { scope.moveStyleElement(source, target); });
				}
			}

			function pointerDown(event) {
				if (touchDrag.start(event)) startIndex = Number(attrs.styleGridCell);
			}

			function pointerUp(event) {
				if (!touchDrag.end(event) || startIndex === undefined) return;
				var target = document.elementFromPoint(event.clientX, event.clientY);
				var cell = target && target.closest('[data-style-cell]');
				if (cell && element[0].parentNode.contains(cell)) {
					var targetIndex = Number(cell.getAttribute('data-style-cell'));
					if (targetIndex !== startIndex) {
						scope.$apply(function () { scope.moveStyleElement(startIndex, targetIndex); });
					}
				}
				startIndex = undefined;
			}
			function pointerCancel(event) { touchDrag.cancel(event); startIndex = undefined; }

			element.on('dragstart', dragStart);
			element.on('dragover', dragOver);
			element.on('drop', drop);
			element.on('pointerdown', pointerDown);
			element.on('pointermove', touchDrag.move);
			element.on('pointerup', pointerUp);
			element.on('pointercancel', pointerCancel);
			element.on('lostpointercapture', pointerCancel);
			scope.$on('$destroy', function () {
				touchDrag.destroy();
				element.off('dragstart', dragStart);
				element.off('dragover', dragOver);
				element.off('drop', drop);
				element.off('pointerdown', pointerDown);
				element.off('pointermove', touchDrag.move);
				element.off('pointerup', pointerUp);
				element.off('pointercancel', pointerCancel);
				element.off('lostpointercapture', pointerCancel);
			});
		}
	};
}]).directive('styleReorderDrag', ['styleTouchDrag', function (styleTouchDrag) {
	return {
		restrict: 'A',
		link: function (scope, element, attrs) {
			var touchDrag = styleTouchDrag(element[0]);
			function dragStart(event) {
				if (element[0].getAttribute('draggable') !== 'true') { event.preventDefault(); return; }
				event.stopPropagation();
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-chronograph-style-' + attrs.styleReorderDrag, attrs.styleReorderSource);
			}
			function pointerDown(event) { touchDrag.start(event); }
			function pointerUp(event) {
				if (!touchDrag.end(event)) return;
				var target = document.elementFromPoint(event.clientX, event.clientY);
				var destination = target && target.closest('[data-style-reorder-' + attrs.styleReorderDrag + ']');
				var editor = element[0].closest('.style-group-editor');
				if (destination && editor && editor.contains(destination)) {
					var value = destination.getAttribute('data-style-reorder-' + attrs.styleReorderDrag);
					scope.$apply(function () { scope.reorderDesigner(attrs.styleReorderDrag, attrs.styleReorderSource, value); });
				}
			}
			element.on('dragstart', dragStart);
			element.on('pointerdown', pointerDown);
			element.on('pointermove', touchDrag.move);
			element.on('pointerup', pointerUp);
			element.on('pointercancel', touchDrag.cancel);
			element.on('lostpointercapture', touchDrag.cancel);
			scope.$on('$destroy', function () {
				touchDrag.destroy();
				element.off('dragstart', dragStart);
				element.off('pointerdown', pointerDown);
				element.off('pointermove', touchDrag.move);
				element.off('pointerup', pointerUp);
				element.off('pointercancel', touchDrag.cancel);
				element.off('lostpointercapture', touchDrag.cancel);
			});
		}
	};
}]).directive('styleReorderDrop', function () {
	return {
		restrict: 'A',
		link: function (scope, element, attrs) {
			var type = 'application/x-chronograph-style-' + attrs.styleReorderDrop;
			function dragOver(event) {
				if (Array.prototype.indexOf.call(event.dataTransfer.types, type) === -1) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = 'move';
			}
			function drop(event) {
				var source = event.dataTransfer.getData(type);
				if (!source) return;
				event.preventDefault();
				event.stopPropagation();
				scope.$apply(function () { scope.reorderDesigner(attrs.styleReorderDrop, source, attrs.styleReorderTarget); });
			}
			element.on('dragover', dragOver);
			element.on('drop', drop);
			scope.$on('$destroy', function () {
				element.off('dragover', dragOver);
				element.off('drop', drop);
			});
		}
	};
}).factory('styleGroupInsertion', function () {
	var indicator;
	var source;
	var highlighted;

	function clear() {
		if (indicator) indicator.remove();
		indicator = null;
		if (highlighted) highlighted.classList.remove('style-group-drop-target');
		highlighted = null;
	}

	function show(slot, y, translate) {
		clear();
		highlighted = slot;
		slot.classList.add('style-group-drop-target');
		var unused = slot.getAttribute('data-style-group') === '0:1';
		var items = Array.from(slot.querySelectorAll('[data-style-element]')).filter(function (item) {
			return item.getAttribute('data-style-element') !== source;
		});
		var index = unused ? -1 : items.findIndex(function (item) {
			var bounds = item.getBoundingClientRect();
			return y < bounds.top + bounds.height / 2;
		});
		if (index === -1) index = items.length;
		var slotBounds = slot.getBoundingClientRect();
		var bounds = items[index] ? items[index].getBoundingClientRect()
			: items.length ? items[items.length - 1].getBoundingClientRect() : slotBounds;
		var top = unused ? slotBounds.top + 4 : items[index] ? bounds.top : items.length ? bounds.bottom : slotBounds.bottom - 5;
		indicator = document.createElement('div');
		indicator.className = 'style-group-insertion-indicator';
		var label = document.createElement('span');
		label.className = 'style-group-insertion-label';
		var reference = items[index] || items[items.length - 1];
		var key = unused ? 'settings.style_drop_unused'
			: items[index] ? 'settings.style_drop_before'
				: reference ? 'settings.style_drop_after' : 'settings.style_drop_empty';
		label.textContent = translate(key).replace('__element__', reference ? reference.textContent.trim() : '');
		indicator.appendChild(label);
		indicator.style.left = (slotBounds.left + 4) + 'px';
		indicator.style.width = Math.max(0, slotBounds.width - 8) + 'px';
		indicator.style.top = top + 'px';
		document.body.appendChild(indicator);
		return unused ? 0 : index;
	}

	return {
		start: function (id) { clear(); source = id; },
		show: show,
		clear: clear
	};
}).directive('styleGroupDrop', ['styleGroupInsertion', function (styleGroupInsertion) {
	return {
		restrict: 'A',
		link: function (scope, element, attrs) {
			function drop(event) {
				var id = event.dataTransfer.getData('application/x-chronograph-style-element');
				if (!id) return;
				event.preventDefault();
				event.stopPropagation();
				var destination = attrs.styleGroupDrop.split(':').map(Number);
				var index = styleGroupInsertion.show(element[0], event.clientY, scope.t);
				styleGroupInsertion.clear();
				if (destination.length === 2) {
					scope.$apply(function () { scope.moveGroupedElement(id, destination[0], destination[1], index); });
				}
			}
			function dragOver(event) {
				if (Array.prototype.indexOf.call(event.dataTransfer.types, 'application/x-chronograph-style-element') === -1) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = 'move';
				styleGroupInsertion.show(element[0], event.clientY, scope.t);
			}
			function dragLeave(event) {
				if (!event.relatedTarget || !element[0].contains(event.relatedTarget)) styleGroupInsertion.clear();
			}
			element.on('dragover', dragOver);
			element.on('dragleave', dragLeave);
			element.on('drop', drop);
			scope.$on('$destroy', function () {
				element.off('dragover', dragOver);
				element.off('dragleave', dragLeave);
				element.off('drop', drop);
			});
		}
	};
}]).directive('styleGroupElement', ['styleTouchDrag', 'styleGroupInsertion', function (styleTouchDrag, styleGroupInsertion) {
	return {
		restrict: 'A',
		link: function (scope, element, attrs) {
			var touchDrag = styleTouchDrag(element[0]);
			function dragStart(event) {
				if (element[0].getAttribute('draggable') !== 'true') { event.preventDefault(); return; }
				styleGroupInsertion.start(attrs.styleGroupElement);
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-chronograph-style-element', attrs.styleGroupElement);
			}
			function pointerDown(event) {
				touchDrag.start(event);
			}
			function pointerMove(event) {
				if (!touchDrag.move(event)) return;
				var target = document.elementFromPoint(event.clientX, event.clientY);
				var slot = target && target.closest('[data-style-group]');
				var editor = element[0].closest('.style-group-editor');
				styleGroupInsertion.start(attrs.styleGroupElement);
				if (slot && editor && editor.contains(slot)) styleGroupInsertion.show(slot, event.clientY, scope.t);
			}
			function pointerUp(event) {
				if (!touchDrag.end(event)) return;
				var target = document.elementFromPoint(event.clientX, event.clientY);
				var slot = target && target.closest('[data-style-group]');
				var editor = element[0].closest('.style-group-editor');
				if (slot && editor && editor.contains(slot)) {
					var destination = slot.getAttribute('data-style-group').split(':').map(Number);
					var index = styleGroupInsertion.show(slot, event.clientY, scope.t);
					styleGroupInsertion.clear();
					scope.$apply(function () { scope.moveGroupedElement(attrs.styleGroupElement, destination[0], destination[1], index); });
				}
				styleGroupInsertion.clear();
			}
			function pointerCancel(event) { touchDrag.cancel(event); styleGroupInsertion.clear(); }
			element.on('dragstart', dragStart);
			element.on('dragend', styleGroupInsertion.clear);
			element.on('pointerdown', pointerDown);
			element.on('pointermove', pointerMove);
			element.on('pointerup', pointerUp);
			element.on('pointercancel', pointerCancel);
			element.on('lostpointercapture', pointerCancel);
			scope.$on('$destroy', function () {
				touchDrag.destroy();
				styleGroupInsertion.clear();
				element.off('dragstart', dragStart);
				element.off('dragend', styleGroupInsertion.clear);
				element.off('pointerdown', pointerDown);
				element.off('pointermove', pointerMove);
				element.off('pointerup', pointerUp);
				element.off('pointercancel', pointerCancel);
				element.off('lostpointercapture', pointerCancel);
			});
		}
	};
}]);
