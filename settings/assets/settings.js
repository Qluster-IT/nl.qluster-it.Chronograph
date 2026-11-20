'use strict';

var chronographSettingsScope;
var pendingHomey;

function previewBackgroundPaint(scheme, state) {
	var runtime = window.ChronographWidgetStyle;
	var color = runtime.resolveColor(scheme, state, 'background');
	var paint = runtime.backgroundPaint(scheme, state);
	if (color !== 'default' && color !== 'none' && paint.backgroundColor === undefined) {
		paint.backgroundColor = runtime.valueColor(color);
	}
	return paint;
}

window.onHomeyReady = function (homey) {
	pendingHomey = homey;
	if (chronographSettingsScope) chronographSettingsScope.initialize(homey);
};

angular.module('chronographSettings', []).controller('SettingsController', [
	'$scope',
	'$interval',
	'$timeout',
	'widgetStyleEditor',
	function ($scope, $interval, $timeout, widgetStyleEditor) {
		var refreshInterval;
		var durationInterval;
		var refreshInProgress = false;
		var savedStyles = { version: 3, styles: [], themes: [] };
		var decimalsLoaded = false;
		var stylesLoaded = false;
		var migrationPending = false;
		var builtInStyle;
		var builtInDesigns = {};
		var builtInScheme;
		var builtInSchemes = {};
		var savedPreviewBuiltIns;
		var previewBuiltInsLoaded = false;
		var groupedRowsCache = {};
		var previewRowsCache = {};
		var designerRowLayouts = new WeakMap();
		var colorOptionsCache = {};
		var startFormTimer;
		var editHistory;
		var editHistories = {};
		var confirmingSwitch = false;
		var darkSchemeQuery = window.chronographSettingsPreview !== true && window.matchMedia
			? window.matchMedia('(prefers-color-scheme: dark)') : null;
		var Homey;
		chronographSettingsScope = $scope;

		$scope.localPreview = window.chronographSettingsPreview === true;
		$scope.activeTab = $scope.localPreview ? 'widgets' : 'chronographs';
		$scope.chronographs = [];
		$scope.chronographsNames = {};
		$scope.roundOfDurationsFlowcards = 2;
		$scope.savedDecimals = 2;
		$scope.decimalOptions = Array.from({ length: 11 }, function (value, index) {
			return index;
		});
		$scope.savingSettings = false;
		$scope.styleHelpExpanded = true;
		$scope.styleHelpAvailable = false;
		$scope.styleHelpSaving = false;
		$scope.widgetStyles = { version: 3, styles: [], themes: [] };
		$scope.templates = { open: false, section: 'export', designId: null, themeId: null, text: '',
			previewDesignId: 'builtin:current', previewThemeId: 'builtin:current', review: null, busy: false,
			catalog: null, catalogQuery: '', catalogOrder: '-number', savedCatalogOrder: '-number',
			catalogOrderReady: false, catalogOrderSaving: false, favorites: {},
			showPreviews: false, previewsAvailable: false, previewsSaving: false };
		$scope.editor = {
			mode: 'design',
			selectedStyleId: '',
			selectedSchemeId: 'builtin:current',
			previewType: 'timer',
			previewSize: 'normal',
			previewState: 'running',
			previewMode: darkSchemeQuery && darkSchemeQuery.matches ? 'dark' : 'light',
			previewColumns: 'single',
			previewSeparator: 'none',
			previewSeparatorColor: 'default',
			copyLayoutFrom: 'compact',
			editStatus: false,
			selectedCell: null,
			selectedElement: null,
			selectedBackground: false,
			position: {},
			selectedRow: null,
			selectedColumn: null,
			rowRule: null,
			colorValues: {},
			foregroundValues: {},
			previewValues: { time: 1, unit: 'seconds', from: null, to: null, steps: null }
		};
		var previewHostElements = [];
		var previewHostObserver;
		for (var hostElement = window.frameElement; hostElement; hostElement = hostElement.parentElement) {
			previewHostElements.push(hostElement);
		}
		function updatePreviewCounterInvert() {
			if (previewHostElements.length) {
				$scope.previewCounterInvert = previewHostElements.some(function (element) {
					var filter = element.ownerDocument.defaultView.getComputedStyle(element).filter;
					return /\binvert\((?:1(?:\.0+)?|100%)\)/.test(filter) && /\bhue-rotate\(180deg\)/.test(filter);
				});
			} else {
				$scope.previewCounterInvert = false;
			}
		}
		function updatePreviewMode() {
			updatePreviewCounterInvert();
			$scope.editor.previewMode = darkSchemeQuery && darkSchemeQuery.matches ? 'dark' : 'light';
		}
		updatePreviewMode();
		function previewSchemeChanged() {
			$scope.$applyAsync(updatePreviewMode);
		}
		if (darkSchemeQuery && darkSchemeQuery.addEventListener) darkSchemeQuery.addEventListener('change', previewSchemeChanged);
		if (previewHostElements.length && window.MutationObserver) {
			previewHostObserver = new window.MutationObserver(function () {
				$scope.$applyAsync(updatePreviewCounterInvert);
			});
			previewHostElements.forEach(function (element) {
				previewHostObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
			});
		}
		$scope.rowCountOptions = Array.from({ length: window.ChronographWidgetStyle.maxRows }, function (unused, index) { return index + 1; });
		$scope.iconPickers = {
			timer: { query: '', results: [], visibleCount: 60, open: false, busy: false, request: 0 },
			stopwatch: { query: '', results: [], visibleCount: 60, open: false, busy: false, request: 0 },
			transition: { query: '', results: [], visibleCount: 60, open: false, busy: false, request: 0 }
		};
		$scope.previewTiles = [{ type: 'timer' }, { type: 'stopwatch' }, { type: 'transition' }];
		$scope.visiblePreviewTiles = function () {
			return $scope.editor.previewColumns === 'single' ? [null] : $scope.previewTiles;
		};
		$scope.previewRows = function () {
			if (previewRowsCache[$scope.editor.previewColumns]) return previewRowsCache[$scope.editor.previewColumns];
			var tiles = $scope.visiblePreviewTiles();
			var columns = $scope.editor.previewColumns === 'single' ? 1 : Number($scope.editor.previewColumns);
			var rows = [];
			for (var index = 0; index < tiles.length; index += columns) rows.push(tiles.slice(index, index + columns));
			previewRowsCache[$scope.editor.previewColumns] = rows;
			return rows;
		};
		$scope.previewSeparatorColor = function () {
			return $scope.editor.previewSeparatorColor === 'default'
				? 'currentColor' : window.ChronographWidgetStyle.valueColor($scope.editor.previewSeparatorColor);
		};
		$scope.layoutGroups = [1, 2, 3, 4];
		$scope.layoutOrders = Array.from({ length: widgetStyleEditor.elementIds.length }, function (unused, index) { return index + 1; });
		$scope.styleElements = widgetStyleEditor.elementIds;
		$scope.stylesAvailable = false;
		$scope.decimalsAvailable = false;

		function showError(error) {
			Homey.alert(window.chronographErrorMessage(Homey, error));
		}

		$scope.toggleStyleHelp = function () {
			if (!$scope.styleHelpAvailable || $scope.styleHelpSaving) return;
			var expanded = !$scope.styleHelpExpanded;
			$scope.styleHelpSaving = true;
			Homey.set('widgetDesignerHelpExpanded', expanded, function (error) {
				$scope.$applyAsync(function () {
					$scope.styleHelpSaving = false;
					if (error) { showError(error); return; }
					$scope.styleHelpExpanded = expanded;
				});
			});
		};

		function setConfiguredChronographs(value) {
			$scope.chronographsNames = value && typeof value === 'object' ? value : {};
		}

		function sortChronographs(chronographs) {
			return chronographs.sort(function (left, right) {
				return left.duration === right.duration
					? left.name.localeCompare(right.name)
					: left.duration > right.duration ? 1 : -1;
			});
		}

		$scope.sortedStyleOptions = function (items) {
			return (items || []).slice().sort(function (left, right) {
				return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });
			});
		};

		$scope.selectTab = function (tab) {
			if (tab === $scope.activeTab || $scope.templates.busy || $scope.savingSettings) return;
			if ($scope.activeTab === 'widgets' && !$scope.templates.open) {
				leaveEditingItem(function () { $scope.activeTab = tab; });
			} else {
				$scope.activeTab = tab;
			}
		};

		$scope.isGeneralDirty = function () {
			return decimalsLoaded && $scope.roundOfDurationsFlowcards !== $scope.savedDecimals;
		};
		$scope.isWidgetDirty = function () {
			return (stylesLoaded && (migrationPending || !angular.equals($scope.widgetStyles, savedStyles)))
				|| (previewBuiltInsLoaded && !angular.equals(previewBuiltIns(), savedPreviewBuiltIns));
		};
		$scope.isDirty = function () {
			return $scope.isGeneralDirty() || $scope.isWidgetDirty();
		};
		function warnBeforeLeaving(event) {
			if (!$scope.isDirty()) return;
			event.preventDefault();
			event.returnValue = '';
			return '';
		}
		if (window.addEventListener) window.addEventListener('beforeunload', warnBeforeLeaving);

		function previewBuiltIns() {
			return {
				version: 3,
				styles: Object.keys(builtInDesigns).map(function (id) { return widgetStyleEditor.designFromStyle(builtInDesigns[id]); }),
				themes: Object.keys(builtInSchemes).map(function (id) { return angular.copy(builtInSchemes[id]); })
			};
		}

		function validPreviewBuiltIns(value) {
			if (!value || (value.version !== 2 && value.version !== 3) || !widgetStyleEditor.isValidCollection(value)) return false;
			return value.styles.every(function (item) { return Object.prototype.hasOwnProperty.call(builtInDesigns, item.id); })
				&& (value.version === 3 ? value.themes : value.colorSchemes)
					.every(function (item) { return Object.prototype.hasOwnProperty.call(builtInSchemes, item.id); });
		}

		function addOptionalDurationPositions(style) {
			if (!style || !style.groups) return;
			['compact', 'normal', 'large'].forEach(function (size) {
				['remaining', 'total'].forEach(function (element) {
					if (!style.groups[size].elements[element]) style.groups[size].elements[element] = { row: 0, group: 1, order: 1 };
				});
			});
		}

		function normalizeDesignSpans(style) {
			if (!style || !style.groups) return;
			addOptionalDurationPositions(style);
			['compact', 'normal', 'large'].forEach(function (size) {
				widgetStyleEditor.normalizeColumnSpans(style, size);
			});
		}

		function migratePreviewRowCounts(style, defaults) {
			if (!style.groups || style.rowCounts !== undefined) return;
			style.rowCounts = {};
			['compact', 'normal', 'large'].forEach(function (size) {
				var layout = style.groups[size];
				var count = sizeRuntime.rowCount(defaults, size);
				var defaultCount = count;
				[layout.elements].concat(Object.keys(layout.overrides).map(function (state) { return layout.overrides[state]; }))
					.forEach(function (positions) {
						Object.keys(positions).forEach(function (element) { count = Math.max(count, positions[element].row); });
					});
				['rowVisibility', 'rowColumns', 'columnSpans', 'columnAlignments', 'columnVerticalAlignments',
					'columnDirections', 'columnWidths', 'columnRowSpans', 'rowAlignments', 'rowTopPadding'].forEach(function (key) {
					var rows = style[key] && style[key][size] || {};
					var defaultRows = defaults[key] && defaults[key][size] || {};
					Object.keys(rows).forEach(function (row) {
						if (Number(row) > defaultCount && !angular.equals(rows[row], defaultRows[row])) count = Math.max(count, Number(row));
					});
				});
				var spans = style.columnRowSpans && style.columnRowSpans[size] || {};
				Object.keys(spans).forEach(function (row) {
					spans[row].forEach(function (span, index) {
						if (style.id === 'builtin:vertical' && Number(row) === 1 && index === 0 && span === 5 && count <= 4) {
							spans[row][index] = span = 4;
						}
						count = Math.max(count, Number(row) + span - 1);
					});
				});
				style.rowCounts[size] = count;
			});
		}

		function designById(selection) {
			if (Object.prototype.hasOwnProperty.call(builtInDesigns, selection)) return builtInDesigns[selection];
			var id = selection.slice(7);
			if (selection.indexOf('custom:') !== 0) return undefined;
			return $scope.widgetStyles.styles.find(function (style) { return style.id === id; });
		}
		$scope.getSelectedStyle = function () {
			var template = $scope.templates;
			if (template.open && template.section === 'export') {
				return template.designId ? designById('custom:' + template.designId) : builtInStyle;
			}
			if (template.open && template.section === 'import' && template.review) {
				if (template.includeDesign && template.review.design) return template.review.design;
				return designById(template.previewDesignId);
			}
			return designById($scope.editor.selectedStyleId);
		};

		$scope.isBuiltInStyle = function () {
			return $scope.editor.mode === 'color'
				? $scope.isBuiltInScheme()
				: Object.prototype.hasOwnProperty.call(builtInDesigns, $scope.editor.selectedStyleId);
		};

		$scope.isPresetDesign = function () {
			return Object.prototype.hasOwnProperty.call(builtInDesigns, $scope.editor.selectedStyleId);
		};

		$scope.isBuiltInScheme = function () {
			return Object.prototype.hasOwnProperty.call(builtInSchemes, $scope.editor.selectedSchemeId);
		};

		$scope.isDesignReadOnly = function () {
			return $scope.isPresetDesign() && !previewBuiltInsLoaded;
		};
		$scope.isSchemeReadOnly = function () {
			return $scope.isBuiltInScheme() && !previewBuiltInsLoaded;
		};
		$scope.defaultDesignName = function () { return builtInDesigns['builtin:current'] && builtInDesigns['builtin:current'].name; };
		$scope.defaultSchemeName = function () { return builtInSchemes['builtin:current'] && builtInSchemes['builtin:current'].name; };

		function themeById(selection) {
			if (Object.prototype.hasOwnProperty.call(builtInSchemes, selection)) return builtInSchemes[selection];
			if (selection.indexOf('custom:') !== 0) return undefined;
			var id = selection.slice(7);
			return ($scope.widgetStyles.themes || []).find(function (scheme) { return scheme.id === id; });
		}
		$scope.getSelectedScheme = function () {
			var template = $scope.templates;
			if (template.open && template.section === 'export') {
				return template.themeId ? themeById('custom:' + template.themeId) : builtInScheme;
			}
			if (template.open && template.section === 'import' && template.review) {
				if (template.includeTheme && template.review.theme) return template.review.theme;
				return themeById(template.previewThemeId);
			}
			return themeById($scope.editor.selectedSchemeId);
		};
		$scope.getEditingItem = function () {
			return $scope.editor.mode === 'color' ? $scope.getSelectedScheme() : $scope.getSelectedStyle();
		};
		function editingKey() {
			return $scope.editor.mode + ':' + ($scope.editor.mode === 'color'
				? $scope.editor.selectedSchemeId : $scope.editor.selectedStyleId);
		}
		function captureEditHistory() {
			if ($scope.templates.open) return;
			var item = $scope.getEditingItem();
			if (!item) { editHistory = null; return; }
			var key = editingKey();
			if (!editHistory || editHistory.key !== key) {
				editHistory = editHistories[key];
				if (!editHistory) editHistory = editHistories[key] = { key: key, entries: [angular.copy(item)], index: 0 };
			}
			if (!angular.equals(item, editHistory.entries[editHistory.index])) {
				editHistory.entries.splice(editHistory.index + 1);
				editHistory.entries.push(angular.copy(item));
				editHistory.index++;
			}
		}
		$scope.$watch(function () { return [editingKey(), $scope.getEditingItem()]; }, captureEditHistory, true);
		$scope.canUndoEdit = function () {
			return !!editHistory && editHistory.key === editingKey() && editHistory.index > 0;
		};
		$scope.canRedoEdit = function () {
			return !!editHistory && editHistory.key === editingKey() && editHistory.index < editHistory.entries.length - 1;
		};
		function replaceItem(item, value) {
			Object.keys(item).forEach(function (key) { delete item[key]; });
			Object.assign(item, angular.copy(value));
		}
		function refreshEditedItem() {
			$scope.editor.selectedRow = null;
			$scope.editor.selectedColumn = null;
			$scope.editor.rowRule = null;
			$scope.editor.selectedCell = null;
			$scope.editor.invalidRowRule = false;
			sizeDraft = undefined;
			$scope.refreshLayoutElement();
			refreshColorControls();
			$scope.resetRowPreview();
		}
		$scope.undoEdit = function () {
			if ($scope.savingSettings || !$scope.canUndoEdit() || !canChangeSelection()) return;
			replaceItem($scope.getEditingItem(), editHistory.entries[--editHistory.index]);
			refreshEditedItem();
		};
		$scope.redoEdit = function () {
			if ($scope.savingSettings || !$scope.canRedoEdit() || !canChangeSelection()) return;
			replaceItem($scope.getEditingItem(), editHistory.entries[++editHistory.index]);
			refreshEditedItem();
		};
		function savedEditingItem(item, colorMode) {
			var collection = colorMode ? 'themes' : 'styles';
			if ($scope.isBuiltInStyle()) {
				return savedPreviewBuiltIns && savedPreviewBuiltIns[collection].find(function (saved) { return saved.id === item.id; });
			}
			return savedStyles[collection].find(function (saved) { return saved.id === item.id; });
		}
		function leaveEditingItem(next) {
			if (confirmingSwitch || $scope.savingSettings || !canChangeSelection()) return;
			var item = $scope.getEditingItem();
			var colorMode = $scope.editor.mode === 'color';
			var currentKey = editingKey();
			var saved = item && savedEditingItem(item, colorMode);
			var current = item && (!colorMode && $scope.isBuiltInStyle() ? widgetStyleEditor.designFromStyle(item) : item);
			if (!item || saved && angular.equals(current, saved) || $scope.isBuiltInStyle() && !previewBuiltInsLoaded) {
				editHistory = null;
				next();
				return;
			}
			confirmingSwitch = true;
			Homey.confirm(Homey.__('settings.style_discard_switch_confirm').replace('__name__', item.name), 'warning', function (error, confirmed) {
				$scope.$applyAsync(function () {
					confirmingSwitch = false;
					if (error) { showError(error); return; }
					if (!confirmed || $scope.savingSettings || $scope.getEditingItem() !== item) return;
					if (saved) replaceItem(item, saved);
					else {
						var items = colorMode ? $scope.widgetStyles.themes : $scope.widgetStyles.styles;
						var index = items.indexOf(item);
						if (index !== -1) items.splice(index, 1);
						if (colorMode) $scope.editor.selectedSchemeId = 'builtin:current';
						else $scope.editor.selectedStyleId = 'builtin:current';
					}
					delete editHistories[currentKey];
					editHistory = null;
					next();
					refreshEditedItem();
				});
			});
		}
		$scope.selectEditingStyle = function (id) {
			if (!arguments.length) return $scope.editor.selectedStyleId;
			if (id === $scope.editor.selectedStyleId) return id;
			leaveEditingItem(function () {
				$scope.editor.selectedStyleId = id;
				resetDesignerSelection();
			});
			return $scope.editor.selectedStyleId;
		};
		$scope.selectEditingScheme = function (id) {
			if (!arguments.length) return $scope.editor.selectedSchemeId;
			if (id === $scope.editor.selectedSchemeId) return id;
			leaveEditingItem(function () {
				$scope.editor.selectedSchemeId = id;
				resetDesignerSelection();
			});
			return $scope.editor.selectedSchemeId;
		};
		$scope.selectEditorMode = function (mode) {
			if (mode !== 'design' && mode !== 'color') return;
			if (mode === $scope.editor.mode) return;
			if ($scope.editor.rowPaddingForm && $scope.editor.rowPaddingForm.$invalid) { Homey.alert(Homey.__('settings.style_row_padding_invalid')); return; }
			if ($scope.editor.elementSizeForm && $scope.editor.elementSizeForm.$invalid) { Homey.alert(Homey.__('settings.style_size_invalid')); return; }
			if ($scope.editor.colorForm && $scope.editor.colorForm.$invalid) { Homey.alert(Homey.__('settings.style_hex_invalid')); return; }
			if ($scope.editor.invalidRowRule) { Homey.alert(Homey.__('settings.style_row_invalid')); return; }
			leaveEditingItem(function () {
				if (!$scope.getSelectedStyle()) $scope.editor.selectedStyleId = 'builtin:current';
				var design = $scope.getSelectedStyle();
				var element = $scope.editor.selectedElement;
				var background = $scope.editor.selectedBackground;
				var row = $scope.editor.selectedRow;
				var column = $scope.editor.selectedColumn;
				if (element && design && !design.groups && $scope.getStyleCells().indexOf(element) === -1) element = null;
				$scope.editor.mode = mode;
				resetDesignerSelection();
				$scope.editor.selectedElement = element;
				$scope.editor.selectedBackground = background;
				if (row && layoutRows().indexOf(row) !== -1) $scope.selectVisibilityRow(row);
				else if (column && design && design.groups) $scope.selectColumn(column.row, column.group);
				$scope.refreshLayoutElement();
			});
		};

		$scope.heightMode = function (mode) {
			var style = $scope.getSelectedStyle();
			if (arguments.length && style && !$scope.savingSettings && !$scope.isDesignReadOnly()
				&& ['auto', 'minimum', 'minimum-without-inputs'].indexOf(mode) !== -1) {
				if (!style.heightModes) style.heightModes = {};
				style.heightModes[$scope.editor.previewSize] = mode;
			}
			return style && style.heightModes && style.heightModes[$scope.editor.previewSize] || 'auto';
		};

		var sizeRuntime = window.ChronographWidgetStyle;
		$scope.pixelOptions = Array.from({ length: 101 }, function (unused, value) { return value; });
		function editPixels(key, id, value, writing, minimum, fallback) {
			var design = $scope.getSelectedStyle(), size = $scope.editor.previewSize;
			if (writing && design && id !== null && id !== undefined && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (value !== null && (!Number.isInteger(value) || value < minimum || value > 100)) throw new RangeError('Invalid pixel value');
				if (value === null) {
					if (design[key] && design[key][size]) {
						delete design[key][size][id];
						if (!Object.keys(design[key][size]).length) delete design[key][size];
						if (!Object.keys(design[key]).length) delete design[key];
					}
				} else {
					if (!design[key]) design[key] = {};
					if (!design[key][size]) design[key][size] = {};
					design[key][size][id] = value;
				}
			}
			var values = design && design[key] && design[key][size];
			return values && values[id] !== undefined ? values[id] : fallback;
		}
		$scope.widgetPaddingControls = ['top', 'right', 'bottom', 'left'].map(function (side) {
			return { side: side, value: function (value) {
				return editPixels('widgetPadding', side, value, arguments.length, 0, null);
			} };
		});
		$scope.rowColumnGap = function (value) {
			return editPixels('rowColumnGaps', $scope.editor.selectedRow, value, arguments.length, 0, 8);
		};
		$scope.columnElementGap = function (value) {
			var design = $scope.getSelectedStyle(), column = $scope.editor.selectedColumn;
			if (!design || !column) return 8;
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				widgetStyleEditor.setColumnElementGap(design, $scope.editor.previewSize, column.row, column.group, value);
			}
			return widgetStyleEditor.columnElementGaps(design, $scope.editor.previewSize, column.row)[column.group - 1];
		};
		$scope.elementLineHeight = function (value) {
			return editPixels('elementLineHeights', $scope.editor.selectedElement, value, arguments.length, 4, null);
		};
		$scope.previewElementLineHeight = function (element) {
			return sizeRuntime.elementLineHeight($scope.getSelectedStyle(), $scope.editor.previewSize, element);
		};
		$scope.previewSeparatorLayout = function () {
			return $scope.editor.previewColumns === 'single' ? 'none' : sizeRuntime.separatorLayout($scope.editor.previewSeparator);
		};
		$scope.previewPaddingStyle = function (location) {
			var layout = $scope.previewSeparatorLayout();
			var owner = $scope.editor.previewColumns === 'single' || layout === 'cards' ? 'tile'
				: layout === 'rows' ? 'row' : 'frame';
			return owner === location ? Object.assign(sizeRuntime.paddingStyle([
				sizeRuntime.widgetPadding($scope.getSelectedStyle(), $scope.editor.previewSize)
			]), sizeRuntime.frameStyle(sizeRuntime.borderlessFrame($scope.getSelectedStyle(), $scope.editor.previewSize))) : {};
		};
		$scope.templatePaddingStyle = function () {
			return Object.assign(sizeRuntime.paddingStyle([sizeRuntime.widgetPadding($scope.getSelectedStyle(), $scope.editor.previewSize)]),
				sizeRuntime.frameStyle(sizeRuntime.borderlessFrame($scope.getSelectedStyle(), $scope.editor.previewSize)),
				previewBackgroundPaint($scope.getSelectedScheme(), $scope.editor.previewState));
		};
		$scope.previewTileStyle = function (state) {
			return Object.assign($scope.previewPaddingStyle('tile'), previewBackgroundPaint(
				$scope.getSelectedScheme(), state || $scope.editor.previewState));
		};
		$scope.previewCardRowStyle = function () {
			return $scope.editor.previewColumns === 'single' ? {} : Object.assign({
				'grid-template-columns': 'repeat(' + $scope.editor.previewColumns + ', minmax(0, 1fr))'
			}, $scope.previewPaddingStyle('row'));
		};
		$scope.previewHexStyle = function (element, state) {
			return '--hex-palette: ' + sizeRuntime.valueColor($scope.previewColor(element, false, state))
				+ '; --hex-foreground: ' + sizeRuntime.valueColor($scope.previewForeground(element, false, state));
		};
		$scope.progressCustomColor = function (key) {
			var value = $scope.progressSetting(key);
			return sizeRuntime.isHexColor(value) ? value : undefined;
		};
		$scope.previewFrameStyle = function () {
			var padding = $scope.previewPaddingStyle('frame');
			return '--style-preview-separator-color: ' + $scope.previewSeparatorColor() + '; ' + Object.keys(padding).map(function (key) {
				return key.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); }) + ': ' + padding[key];
			}).join('; ');
		};
		$scope.widgetBorderWidths = Array.from({ length: 21 }, function (unused, width) { return width; });
		$scope.widgetBorderWidth = function (width) {
			var design = $scope.getSelectedStyle(), size = $scope.editor.previewSize;
			if (arguments.length && design && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (width !== null && $scope.widgetBorderWidths.indexOf(width) === -1) throw new RangeError('Invalid widget border width');
				['borderWidths', 'borderlessFrames'].forEach(function (key) {
					if (!design[key]) return;
					delete design[key][size];
					if (!Object.keys(design[key]).length) delete design[key];
				});
				if (width !== null) {
					if (!design.borderWidths) design.borderWidths = {};
					design.borderWidths[size] = width;
					if (width === 0) {
						if (!design.borderlessFrames) design.borderlessFrames = {};
						design.borderlessFrames[size] = true;
					}
				}
			}
			return sizeRuntime.borderlessFrame(design, size) ? 0 : sizeRuntime.borderWidth(design, size) || null;
		};
		$scope.previewBorderStyle = function (state) {
			return sizeRuntime.borderStyle($scope.getSelectedStyle(), $scope.getSelectedScheme(),
				$scope.editor.previewSize, state || $scope.editor.previewState);
		};
		$scope.colorSwatchStyle = function (channel, key) {
			var scheme = $scope.getSelectedScheme(), state = $scope.editor.previewState;
			var paint = previewBackgroundPaint(scheme, state);
			var text = paint.color || 'var(--homey-text-color)';
			var color;
			if (channel === 'separator') {
				return { backgroundColor: $scope.previewSeparatorColor() };
			}
			if (channel === 'progress') {
				color = $scope.progressSetting(key);
				return { backgroundColor: color === 'default' ? text : sizeRuntime.valueColor(color) };
			}
			if (channel === 'background') {
				if (key === 'background') {
					return { backgroundColor: paint.backgroundColor || 'var(--chronograph-surface)',
						backgroundImage: paint.backgroundImage || 'none' };
				}
				return { backgroundColor: $scope.previewButtonStyle(key).backgroundColor
					|| ($scope.editor.previewMode === 'dark' ? '#2e3039'
						: 'color-mix(in srgb, var(--homey-text-color) 8%, var(--homey-background-color))') };
			}
			if (channel === 'border') {
				var overrides = scheme && scheme.borderOverrides && scheme.borderOverrides[state];
				color = overrides && overrides[key] !== undefined ? overrides[key]
					: scheme && scheme.borderColors && scheme.borderColors[key]
						|| (key === 'background' || key === 'cancel' ? 'default' : 'none');
				return { backgroundColor: color !== 'default' ? sizeRuntime.valueColor(color)
					: key === 'background' ? 'var(--homey-line-color)'
						: 'color-mix(in srgb, var(--homey-text-color-light) 30%, var(--homey-background-color))' };
			}
			color = $scope.previewForeground(key);
			if (color === 'default') {
				color = $scope.previewColor(key);
				return { backgroundColor: $scope.isButtonElement(key) && key !== 'cancel' ? sizeRuntime.valueColor('white')
					: color && color !== 'default' ? sizeRuntime.valueColor(color)
						: key === 'status' ? 'var(--homey-text-color-light)' : text };
			}
			return { backgroundColor: sizeRuntime.valueColor(color) };
		};
		var sizeDraft;
		function layoutRows() {
			return $scope.rowCountOptions.slice(0, sizeRuntime.rowCount($scope.getSelectedStyle(), $scope.editor.previewSize));
		}
		$scope.designRowCount = function (value) {
			var style = $scope.getSelectedStyle();
			var size = $scope.editor.previewSize;
			var current = sizeRuntime.rowCount(style, size);
			if (!arguments.length) return current;
			if (!style || !style.groups || $scope.isDesignReadOnly() || $scope.savingSettings
				|| !canChangeSelection() || $scope.rowCountOptions.indexOf(value) === -1 || value === current) return current;
			function applyCount() {
				widgetStyleEditor.setRowCount(style, size, value);
				$scope.refreshLayoutElement();
				$scope.resetRowPreview();
			}
			if (value > current) {
				applyCount();
			} else {
				Homey.confirm(Homey.__('settings.style_row_count_confirm').replace('__count__', value), 'warning', function (error, confirmed) {
					$scope.$applyAsync(function () {
						if (error) { showError(error); return; }
						if (confirmed && !$scope.savingSettings && $scope.editor.mode === 'design'
							&& $scope.getSelectedStyle() === style && $scope.editor.previewSize === size
							&& sizeRuntime.rowCount(style, size) === current) applyCount();
					});
				});
			}
			return sizeRuntime.rowCount(style, size);
		};
		$scope.inputFieldRows = function (type, value) {
			var style = $scope.getSelectedStyle();
			if (arguments.length > 1 && style && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (value === null) {
					if (style.inputFieldRows && style.inputFieldRows[$scope.editor.previewSize]) {
						delete style.inputFieldRows[$scope.editor.previewSize][type];
					}
				} else if (Number.isInteger(value) && value >= 1 && value <= (type === 'timer' ? 2 : 5)) {
					if (!style.inputFieldRows) style.inputFieldRows = {};
					if (!style.inputFieldRows[$scope.editor.previewSize]) style.inputFieldRows[$scope.editor.previewSize] = {};
					style.inputFieldRows[$scope.editor.previewSize][type] = value;
				}
			}
			return sizeRuntime.inputFieldRows(style, $scope.editor.previewSize, type);
		};
		$scope.timerInputFieldRows = function (value) {
			return arguments.length ? $scope.inputFieldRows('timer', value) : $scope.inputFieldRows('timer');
		};
		$scope.transitionInputFieldRows = function (value) {
			return arguments.length ? $scope.inputFieldRows('transition', value) : $scope.inputFieldRows('transition');
		};
		$scope.previewFieldLayout = function (type) {
			return sizeRuntime.inputFieldLayout($scope.getSelectedStyle(), $scope.editor.previewSize, type || $scope.editor.previewType);
		};
		$scope.allowDesignShrink = function (value) {
			var style = $scope.getSelectedStyle();
			if (arguments.length && style && !$scope.savingSettings && !$scope.isDesignReadOnly()) style.allowShrink = value;
			return !style || style.allowShrink !== false;
		};
		$scope.copySizeLayout = function () {
			var style = $scope.getSelectedStyle();
			var source = $scope.editor.copyLayoutFrom;
			var destination = $scope.editor.previewSize;
			if (!style || $scope.isDesignReadOnly() || $scope.savingSettings
				|| ['compact', 'normal', 'large'].indexOf(source) === -1 || source === destination) return;
			Homey.confirm(Homey.__('settings.style_copy_size_confirm')
				.replace('__source__', Homey.__('settings.style_' + source))
				.replace('__destination__', Homey.__('settings.style_' + destination)), 'warning', function (error, confirmed) {
				$scope.$applyAsync(function () {
					if (error) { showError(error); return; }
					if (!confirmed || $scope.savingSettings || $scope.editor.mode !== 'design' || $scope.getSelectedStyle() !== style
						|| $scope.editor.previewSize !== destination) return;
					var startVisibility = widgetStyleEditor.startFieldsVisibility(style, source);
					['layouts', 'overrides', 'groups', 'rowCounts', 'rowVisibility', 'rowColumns', 'rowAlignments', 'rowTopPadding',
						'columnSpans', 'columnRowSpans', 'columnWidths', 'columnAlignments',
						'columnVerticalAlignments', 'columnDirections', 'rowColumnGaps', 'columnElementGaps'].forEach(function (key) {
						if (style[key] && style[key][source] !== undefined) {
							style[key][destination] = angular.copy(style[key][source]);
						} else if (style[key]) {
							delete style[key][destination];
						}
					});
					if (!style.startFieldsVisibility) {
						style.startFieldsVisibility = { compact: 'play', normal: 'inactive', large: 'inactive' };
					}
					style.startFieldsVisibility[destination] = startVisibility;
					$scope.editor.selectedRow = null;
					$scope.editor.selectedColumn = null;
					$scope.editor.rowRule = null;
					$scope.editor.selectedCell = null;
					$scope.refreshLayoutElement();
					$scope.resetRowPreview();
				});
			});
		};
		$scope.buttonText = function (element) {
			return sizeRuntime.buttonText($scope.getSelectedStyle(), $scope.editor.previewSize, element, Homey.__('settings.widget_start'));
		};
		$scope.buttonShapeOverride = function (value) {
			var style = $scope.getSelectedStyle(), size = $scope.editor.previewSize, element = $scope.editor.selectedElement;
			if (!style || !$scope.isButtonElement(element)) return false;
			var overrides = style.buttonShapes && style.buttonShapes.overrides;
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (value) {
					var shape = sizeRuntime.buttonShape(style, size, element);
					if (!style.buttonShapes) style.buttonShapes = {};
					if (!style.buttonShapes.overrides) style.buttonShapes.overrides = {};
					if (!style.buttonShapes.overrides[size]) style.buttonShapes.overrides[size] = {};
					style.buttonShapes.overrides[size][element] = shape;
				} else if (overrides && overrides[size]) {
					delete overrides[size][element];
				}
			}
			return !!(style.buttonShapes && style.buttonShapes.overrides && style.buttonShapes.overrides[size]
				&& style.buttonShapes.overrides[size][element]);
		};
		$scope.editButtonShape = function (value) {
			var style = $scope.getSelectedStyle(), size = $scope.editor.previewSize, element = $scope.editor.selectedElement;
			if (!style || !$scope.isButtonElement(element)) return 'round';
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()
				&& ['round', 'square'].indexOf(value) !== -1) {
				if (!style.buttonShapes) style.buttonShapes = {};
				if ($scope.buttonShapeOverride()) style.buttonShapes.overrides[size][element] = value;
				else {
					if (!style.buttonShapes.base) style.buttonShapes.base = {};
					style.buttonShapes.base[element] = value;
				}
			}
			return sizeRuntime.buttonShape(style, size, element);
		};
		$scope.previewButtonStyle = function (element, state) {
			return Object.assign(sizeRuntime.elementStyle($scope.getSelectedScheme(), state || $scope.editor.previewState, element),
				sizeRuntime.buttonShapeStyle($scope.getSelectedStyle(), $scope.editor.previewSize, element));
		};
		$scope.useDefaultButtonText = function (value) {
			var style = $scope.getSelectedStyle();
			var size = $scope.editor.previewSize;
			var element = $scope.editor.selectedElement;
			if (!style || !$scope.isButtonElement(element)) return true;
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (!style.buttonTexts) style.buttonTexts = {};
				if (!style.buttonTexts[size]) style.buttonTexts[size] = {};
				style.buttonTexts[size][element] = value ? null : '';
			}
			var texts = style.buttonTexts && style.buttonTexts[size];
			return !texts || texts[element] === undefined || texts[element] === null;
		};
		$scope.editButtonText = function (value) {
			var style = $scope.getSelectedStyle();
			var size = $scope.editor.previewSize;
			var element = $scope.editor.selectedElement;
			if (!style || !$scope.isButtonElement(element)) return '';
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()
				&& !$scope.useDefaultButtonText() && (value === null || typeof value === 'string' && value.length <= 80)) {
				style.buttonTexts[size][element] = value === null ? '' : value;
			}
			return $scope.useDefaultButtonText() ? '' : $scope.buttonText(element);
		};
		$scope.elementSize = function (element) {
			return sizeRuntime.elementSize($scope.getSelectedStyle(), $scope.editor.previewSize, element);
		};
		function editableElementSizes() {
			var style = $scope.getSelectedStyle();
			if (!style.elementSizes) style.elementSizes = sizeRuntime.elementSizesDefaults();
			else if (style.elementSizes.base) style.elementSizes = sizeRuntime.migrateElementSizes(style);
			return style.elementSizes;
		}
		$scope.defaultElementSize = function () {
			return sizeRuntime.defaultElementSize($scope.editor.previewSize, $scope.editor.selectedElement);
		};
		$scope.reserveElementSpace = function (value) {
			var style = $scope.getSelectedStyle();
			var size = $scope.editor.previewSize;
			var element = $scope.editor.selectedElement;
			if (!style || ['icon', 'duration', 'remaining', 'total', 'progress'].indexOf(element) === -1) return false;
			if (arguments.length && typeof value === 'boolean' && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (!style.reservedElements) style.reservedElements = {};
				if (!style.reservedElements[size]) style.reservedElements[size] = {};
				style.reservedElements[size][element] = value;
			}
			return sizeRuntime.reserveElement(style, size, element);
		};
		$scope.overrideElementSize = function (value) {
			var style = $scope.getSelectedStyle();
			var element = $scope.editor.selectedElement;
			if (!style || !element) return undefined;
			if (arguments.length && !$scope.savingSettings && !$scope.isDesignReadOnly()) {
				if (value === null || (Number.isInteger(value) && value >= 4 && value <= 100)) {
					sizeDraft = null;
					var sizes = editableElementSizes();
					if (!sizes.overrides[$scope.editor.previewSize]) sizes.overrides[$scope.editor.previewSize] = {};
					if (value === null) delete sizes.overrides[$scope.editor.previewSize][element];
					else sizes.overrides[$scope.editor.previewSize][element] = value;
				} else {
					sizeDraft = { style: style, element: element, size: $scope.editor.previewSize, value: value };
				}
			}
			if (sizeDraft && sizeDraft.style === style && sizeDraft.element === element && sizeDraft.size === $scope.editor.previewSize) return sizeDraft.value;
			if (style.elementSizes && style.elementSizes.base) {
				var legacyValue = $scope.elementSize(element);
				return legacyValue === $scope.defaultElementSize() ? null : legacyValue;
			}
			var overrides = style.elementSizes && style.elementSizes.overrides[$scope.editor.previewSize];
			return overrides && overrides[element] !== undefined ? overrides[element] : null;
		};

		var progressDefaults = { background: 'grey', foreground: 'blue', direction: 'left-right', timerMode: 'elapsed', showSteps: false };
		$scope.progressSetting = function (key, value) {
			var color = key === 'background' || key === 'foreground';
			var style = color ? $scope.getSelectedScheme() : $scope.getSelectedStyle();
			if (arguments.length > 1 && style && (color ? !$scope.isSchemeReadOnly() : style.groups && !$scope.isDesignReadOnly()) && !$scope.savingSettings
				&& Object.prototype.hasOwnProperty.call(progressDefaults, key)) {
				var field = color ? 'progressColors' : 'progressSettings';
				if (!style[field]) style[field] = {};
				if (!style[field][$scope.editor.previewSize]) style[field][$scope.editor.previewSize] = {};
				style[field][$scope.editor.previewSize][key] = value;
			}
			var settings = style && (color ? style.progressColors : style.progressSettings);
			settings = settings && settings[$scope.editor.previewSize];
			return settings && settings[key] !== undefined ? settings[key] : progressDefaults[key];
		};
		['background', 'foreground', 'direction', 'timerMode', 'showSteps'].forEach(function (key) {
			$scope['progress' + key.charAt(0).toUpperCase() + key.slice(1)] = function (value) {
				return arguments.length ? $scope.progressSetting(key, value) : $scope.progressSetting(key);
			};
		});
		$scope.progressPercent = function (state, type) {
			var elapsed = state === 'running' || state === 'paused' ? 25 : 0;
			return (type || $scope.editor.previewType) === 'timer' && $scope.progressSetting('timerMode') === 'remaining' ? 100 - elapsed : elapsed;
		};
		$scope.progressMarkers = function () {
			var steps = $scope.editor.previewValues.steps;
			if (!Number.isInteger(steps) || steps < 2 || steps > 100) steps = 5;
			return Array.from({ length: steps - 1 }, function (unused, i) { return (i + 1) * 100 / steps; });
		};

		$scope.heightScenarios = ['inactive', 'paused', 'running', 'starting'].map(function (state) {
			return { state: state, id: state };
		});
		var heightScenariosWithoutInputs = ['inactive', 'paused', 'running'].map(function (state) {
			return { state: state, id: state + '-without-inputs', excludeFields: true };
		});
		$scope.measureHeightScenarios = function () {
			return $scope.heightMode() === 'minimum-without-inputs' ? heightScenariosWithoutInputs : $scope.heightScenarios;
		};

		$scope.$watchGroup(['editor.selectedStyleId', 'editor.previewSize'], function () {
			$scope.resetRowPreview();
			if ($scope.templates.open) return;
			if ($scope.editor.selectedRow !== null) refreshRowRule();
			if ($scope.editor.selectedColumn) {
				var style = $scope.getSelectedStyle();
				if (!style || !style.groups || $scope.editor.selectedColumn.group
					> widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, $scope.editor.selectedColumn.row)) {
					$scope.editor.selectedColumn = null;
				} else {
					refreshColumnSpan();
				}
			}
			$scope.refreshLayoutElement();
		});

		$scope.$watch(function () {
			var style = $scope.getSelectedStyle();
			return angular.toJson([style && style.id, style && style.groups, style && style.rowVisibility,
				$scope.editor.previewSize, $scope.editor.previewType, $scope.editor.previewState, $scope.editor.editStatus]);
		}, function () {
			$scope.resetRowPreview();
		});

		function refreshColorControls() {
			var style = $scope.getSelectedScheme();
			if (style && $scope.editor.previewState === 'inactive') {
				$scope.editor.colorValues = {};
				widgetStyleEditor.colorKeys.concat(['background']).forEach(function (key) {
					$scope.editor.colorValues[key] = widgetStyleEditor.resolveColor(style, 'inactive', key);
				});
			} else {
				var overrides = style && style.colorOverrides && style.colorOverrides[$scope.editor.previewState];
				$scope.editor.colorValues = angular.copy(overrides || {});
				widgetStyleEditor.colorKeys.concat(['background']).forEach(function (key) {
					if (!$scope.editor.colorValues[key]) $scope.editor.colorValues[key] = 'inherit';
				});
			}
			$scope.editor.foregroundValues = {};
			$scope.styleElements.forEach(function (key) {
				$scope.editor.foregroundValues[key] = style && $scope.editor.previewState === 'inactive'
					? widgetStyleEditor.resolveForeground(style, 'inactive', key)
					: style ? widgetStyleEditor.foregroundOverride(style, $scope.editor.previewState, key) : 'inherit';
			});
		}
		$scope.$watchGroup(['editor.selectedSchemeId', 'editor.previewState'], refreshColorControls);

		$scope.previewColor = function (key, inheritedOnly, state) {
			var style = $scope.getSelectedScheme();
			return style ? widgetStyleEditor.resolveColor(style, state || $scope.editor.previewState, key, inheritedOnly) : undefined;
		};

		$scope.updateColorOverride = function (key) {
			var style = $scope.getSelectedScheme();
			if (!style || $scope.savingSettings || $scope.isSchemeReadOnly()) return;
			var state = $scope.editor.previewState;
			var value = $scope.editor.colorValues[key];
			if (key === 'background') style.colorModel = 2;
			if (state === 'inactive') {
				style.colors[key === 'background' ? 'inactive' : key] = value;
				return;
			}
			if (value && value !== 'inherit') {
				if (!style.colorOverrides) style.colorOverrides = {};
				if (!style.colorOverrides[state]) style.colorOverrides[state] = {};
				style.colorOverrides[state][key] = value;
			} else if (style.colorOverrides && style.colorOverrides[state]) {
				delete style.colorOverrides[state][key];
				if (!Object.keys(style.colorOverrides[state]).length) delete style.colorOverrides[state];
				if (!Object.keys(style.colorOverrides).length) delete style.colorOverrides;
			}
		};
		$scope.gradientOptions = [
			{ value: null, key: 'settings.style_color_inherit' },
			{ value: false, key: 'settings.style_background_solid' },
			{ value: true, key: 'settings.style_background_gradient' }
		];
		$scope.backgroundGradient = function (value) {
			var scheme = $scope.getSelectedScheme(), state = $scope.editor.previewState;
			if (arguments.length && scheme && !$scope.savingSettings && !$scope.isSchemeReadOnly()) {
				if (value !== null && typeof value !== 'boolean') throw new RangeError('Invalid background gradient');
				if (value === null) {
					if (scheme.backgroundGradients) delete scheme.backgroundGradients[state];
				} else {
					if (!scheme.backgroundGradients) scheme.backgroundGradients = {};
					scheme.backgroundGradients[state] = value;
				}
			}
			var values = scheme && scheme.backgroundGradients || {};
			return values[state] === undefined ? state === 'inactive' ? false : null : values[state];
		};

		function inheritedStateColorLabel() {
			return Homey.__('settings.style_color_inherit') + ' (' + Homey.__('settings.widget_not_running') + ')';
		}

		$scope.stateColorOptions = function (key) {
			var inherited = $scope.previewColor(key, true);
			var options = key === 'background' ? $scope.backgroundOptions : $scope.isButtonElement(key) ? $scope.buttonBackgroundOptions : $scope.colorOptions;
			var cached = colorOptionsCache[key];
			if (cached && cached.inherited === inherited && cached.options === options) return cached.values;
			var values = [{
				id: 'inherit',
				label: inheritedStateColorLabel()
			}].concat(options);
			colorOptionsCache[key] = { inherited: inherited, options: options, values: values };
			return values;
		};

		$scope.previewForeground = function (key, inheritedOnly, state) {
			var style = $scope.getSelectedScheme();
			return style ? widgetStyleEditor.resolveForeground(style, state || $scope.editor.previewState, key, inheritedOnly) : 'default';
		};
		$scope.buttonBorder = function (value) {
			var scheme = $scope.getSelectedScheme(), key = $scope.selectedColorKey(), state = $scope.editor.previewState;
			if (!scheme || !($scope.isButtonElement(key) || key === 'background')) return 'none';
			var base = scheme.borderColors && scheme.borderColors[key] || (key === 'cancel' || key === 'background' ? 'default' : 'none');
			var overrides = scheme.borderOverrides && scheme.borderOverrides[state];
			if (arguments.length && !$scope.savingSettings && !$scope.isSchemeReadOnly()
				&& (value === 'inherit' && state !== 'inactive' || value === 'default' && state === 'inactive'
					|| sizeRuntime.isHexColor(value) || $scope.borderOptions.some(function (item) { return item.id === value; }))) {
				if (state === 'inactive') {
					if (value === 'default') {
						if (scheme.borderColors) delete scheme.borderColors[key];
					} else {
						if (!scheme.borderColors) scheme.borderColors = {};
						scheme.borderColors[key] = value;
					}
				} else if (value === 'inherit') {
					if (overrides) delete overrides[key];
				} else {
					if (!scheme.borderOverrides) scheme.borderOverrides = {};
					if (!scheme.borderOverrides[state]) scheme.borderOverrides[state] = {};
					scheme.borderOverrides[state][key] = value;
				}
				overrides = scheme.borderOverrides && scheme.borderOverrides[state];
				base = scheme.borderColors && scheme.borderColors[key] || (key === 'cancel' || key === 'background' ? 'default' : 'none');
			}
			return state === 'inactive' ? base : overrides && overrides[key] || 'inherit';
		};
		$scope.stateBorderOptions = function () {
			var scheme = $scope.getSelectedScheme(), key = $scope.selectedColorKey();
			var inherited = scheme && scheme.borderColors && scheme.borderColors[key]
				|| (key === 'cancel' || key === 'background' ? 'default' : 'none');
			var cacheKey = 'border:' + key, cached = colorOptionsCache[cacheKey];
			if (cached && cached.inherited === inherited && cached.options === $scope.borderOptions) return cached.values;
			var values = [{ id: 'inherit', label: inheritedStateColorLabel() }].concat($scope.borderOptions);
			colorOptionsCache[cacheKey] = { inherited: inherited, options: $scope.borderOptions, values: values };
			return values;
		};

		$scope.updateForeground = function (key) {
			var style = $scope.getSelectedScheme();
			if (!style || $scope.savingSettings || $scope.isSchemeReadOnly() || $scope.styleElements.indexOf(key) === -1) return;
			var state = $scope.editor.previewState;
			var value = $scope.editor.foregroundValues[key];
			if (state === 'inactive') {
				if (!$scope.isButtonElement(key) && (!style.foregroundColors || style.foregroundColors[key] === undefined)) {
					Object.keys(style.colorOverrides || {}).forEach(function (overrideState) {
						var legacy = style.colorOverrides[overrideState][key];
						if (legacy === undefined) return;
						if (!style.foregroundOverrides) style.foregroundOverrides = {};
						if (!style.foregroundOverrides[overrideState]) style.foregroundOverrides[overrideState] = {};
						if (style.foregroundOverrides[overrideState][key] === undefined) {
							style.foregroundOverrides[overrideState][key] = legacy;
						}
					});
				}
				if (!style.foregroundColors) style.foregroundColors = {};
				style.foregroundColors[key] = value;
			} else if (value !== 'inherit') {
				if (!style.foregroundOverrides) style.foregroundOverrides = {};
				if (!style.foregroundOverrides[state]) style.foregroundOverrides[state] = {};
				style.foregroundOverrides[state][key] = value;
			} else if (style.foregroundOverrides && style.foregroundOverrides[state]) {
				delete style.foregroundOverrides[state][key];
				if (!Object.keys(style.foregroundOverrides[state]).length) delete style.foregroundOverrides[state];
				if (!Object.keys(style.foregroundOverrides).length) delete style.foregroundOverrides;
			}
			if (state !== 'inactive' && !$scope.isButtonElement(key) && style.colorOverrides && style.colorOverrides[state]) {
				delete style.colorOverrides[state][key];
				if (!Object.keys(style.colorOverrides[state]).length) delete style.colorOverrides[state];
				if (!Object.keys(style.colorOverrides).length) delete style.colorOverrides;
			}
		};

		$scope.stateForegroundOptions = function (key) {
			var inherited = $scope.previewForeground(key, true);
			var cacheKey = 'foreground:' + key;
			var options = $scope.isButtonElement(key) ? $scope.foregroundOptions : $scope.elementColorOptions;
			var cached = colorOptionsCache[cacheKey];
			if (cached && cached.inherited === inherited && cached.options === options) return cached.values;
			var values = [{
				id: 'inherit',
				label: inheritedStateColorLabel()
			}].concat(options);
			colorOptionsCache[cacheKey] = { inherited: inherited, options: options, values: values };
			return values;
		};

		$scope.createStyle = function (copy) {
			if (!stylesLoaded || $scope.savingSettings) return;
			var colorMode = $scope.editor.mode === 'color';
			var items = colorMode ? $scope.widgetStyles.themes : $scope.widgetStyles.styles;
			var source = $scope.getEditingItem();
			if (copy && !source) return;
			var sourceCopy = copy ? angular.copy(source) : null;
			leaveEditingItem(function () {
				var prefix = copy ? sourceCopy.name + ' - ' + $scope.labels.copy
					: colorMode ? Homey.__('settings.style_new_scheme') : $scope.labels.newStyle;
				var name = prefix;
				var number = 2;
				while (items.some(function (style) { return normalizedStyleName(style.name) === normalizedStyleName(name); })) {
					name = prefix + ' ' + number++;
				}
				var id = widgetStyleEditor.newId(items);
				var style = copy ? sourceCopy : colorMode
					? widgetStyleEditor.colorSchemeFromStyle(widgetStyleEditor.create(id, name))
					: widgetStyleEditor.create(id, name);
				if (!copy && !colorMode) {
					style.groups = widgetStyleEditor.currentGroups();
					style.rowVisibility = widgetStyleEditor.currentRowVisibility();
					widgetStyleEditor.configureCurrentColumns(style);
					widgetStyleEditor.configureCurrentPresentation(style);
				}
				if (!colorMode) style = widgetStyleEditor.designFromStyle(style);
				if (!colorMode) normalizeDesignSpans(style);
				style.id = id;
				style.name = name;
				items.push(style);
				if (colorMode) $scope.editor.selectedSchemeId = 'custom:' + id;
				else $scope.editor.selectedStyleId = 'custom:' + id;
				$scope.editor.selectedCell = null;
				$scope.refreshLayoutElement();
			});
		};

		function normalizedStyleName(name) {
			return typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
		}

		function hasDuplicateStyleNames(items) {
			var names = [];
			return items.some(function (item) {
				var name = normalizedStyleName(item.name);
				if (names.indexOf(name) !== -1) return true;
				names.push(name);
				return false;
			});
		}

		$scope.duplicateEditingName = function () {
			var item = $scope.getEditingItem();
			if (!item || $scope.isBuiltInStyle() || typeof item.name !== 'string' || !item.name.trim()) return false;
			var items = $scope.editor.mode === 'color' ? $scope.widgetStyles.themes : $scope.widgetStyles.styles;
			return items.some(function (other) {
				return other !== item && normalizedStyleName(other.name) === normalizedStyleName(item.name);
			});
		};

		function uniqueStyleName(name, items) {
			name = name.trim().slice(0, 80);
			var candidate = name;
			var number = 2;
			var names = items.map(function (item) { return normalizedStyleName(item.name); });
			while (names.indexOf(normalizedStyleName(candidate)) !== -1) {
				var suffix = ' (' + number++ + ')';
				candidate = name.slice(0, 80 - suffix.length) + suffix;
			}
			return candidate;
		}

		var exportPreviewState;
		function clearTemplateImage() {
			$scope.templates.imageData = null;
			$scope.templates.copyStatus = null;
		}

		$scope.clearTemplateExport = function () {
			$scope.templates.exportText = '';
			clearTemplateImage();
		};

		function enterExportPreview() {
			exportPreviewState = {
				size: $scope.editor.previewSize,
				type: $scope.editor.previewType,
				state: $scope.editor.previewState
			};
			$scope.editor.previewSize = 'normal';
			$scope.editor.previewType = 'timer';
			$scope.editor.previewState = 'running';
			$scope.resetRowPreview();
		}

		function leaveExportPreview() {
			if (!exportPreviewState) return;
			$scope.editor.previewSize = exportPreviewState.size;
			$scope.editor.previewType = exportPreviewState.type;
			$scope.editor.previewState = exportPreviewState.state;
			exportPreviewState = null;
		}

		$scope.openTemplates = function () {
			if (!$scope.stylesAvailable || $scope.templates.busy) return;
			leaveEditingItem(function () {
				$scope.templates.open = true;
				$scope.templates.section = 'export';
				$scope.templates.review = null;
				enterExportPreview();
			});
		};

		$scope.closeTemplates = function () {
			if ($scope.templates.busy) return;
			if ($scope.templates.section === 'export') leaveExportPreview();
			$scope.templates.open = false;
			$scope.templates.review = null;
			$scope.clearTemplateExport();
			$scope.resetRowPreview();
			$scope.refreshLayoutElement();
		};

		$scope.selectTemplateSection = function (section) {
			if ($scope.templates.busy || ['export', 'import', 'catalog'].indexOf(section) === -1) return;
			if (section !== $scope.templates.section) {
				if ($scope.templates.section === 'export') leaveExportPreview();
				if (section === 'export') enterExportPreview();
			}
			$scope.templates.section = section;
			$scope.templates.review = null;
			$scope.resetRowPreview();
			if (section === 'catalog' && !$scope.templates.catalog) $scope.refreshTemplateCatalog();
		};

		$scope.toggleTemplatePreviews = function () {
			var template = $scope.templates;
			if (template.previewsSaving || !template.previewsAvailable) return;
			var enabled = !template.showPreviews;
			template.previewsSaving = true;
			Homey.set('widgetTemplateShowPreviews', enabled, function (error) {
				$scope.$applyAsync(function () {
					template.previewsSaving = false;
					if (error) { showError(error); return; }
					template.showPreviews = enabled;
				});
			});
		};

		function isTemplateCatalogOrder(order) {
			return ['-number', 'number', 'title', '-likes', '-favorite'].indexOf(order) !== -1;
		}

		$scope.saveTemplateCatalogOrder = function () {
			var template = $scope.templates;
			var order = template.catalogOrder;
			if (template.catalogOrderSaving || !template.catalogOrderReady || !isTemplateCatalogOrder(order)) {
				template.catalogOrder = template.savedCatalogOrder;
				return;
			}
			if (order === template.savedCatalogOrder) return;
			var previousOrder = template.savedCatalogOrder;
			template.catalogOrderSaving = true;
			Homey.set('widgetTemplateCatalogSort', order, function (error) {
				$scope.$applyAsync(function () {
					template.catalogOrderSaving = false;
					if (error) {
						template.catalogOrder = previousOrder;
						showError(error);
						return;
					}
					template.savedCatalogOrder = order;
				});
			});
		};

		$scope.refreshTemplateCatalog = function () {
			var template = $scope.templates;
			if (template.busy) return;
			template.busy = true;
			Homey.get('widgetTemplateFavorites', function (error, favorites) {
				if (error) {
					$scope.$applyAsync(function () { template.busy = false; showError(error); });
					return;
				}
				Homey.api('GET', '/widget-templates/catalog', null, function (apiError, result) {
					$scope.$applyAsync(function () {
						template.busy = false;
						if (apiError) { showError(apiError); return; }
						if (!Array.isArray(result)) { showError(new Error('Invalid community catalog')); return; }
						template.favorites = favorites && typeof favorites === 'object' && !Array.isArray(favorites) ? favorites : {};
						var previous = new Map((template.catalog || []).map(function (item) { return [item.id, item]; }));
						template.catalog = result;
						template.catalog.forEach(function (item) {
							item.favorite = !!template.favorites[item.postId];
							var cached = previous.get(item.id);
							if (cached && cached.text === item.text && cached.preview) item.preview = cached.preview;
							if (template.showPreviews) $scope.loadCatalogPreview(item);
						});
					});
				});
			});
		};

		$scope.catalogMatches = function (item) {
			var query = $scope.templates.catalogQuery.trim().toLowerCase();
			return !query || [item.title, item.description, item.author].some(function (value) {
				return String(value || '').toLowerCase().indexOf(query) !== -1;
			});
		};

		$scope.toggleTemplateFavorite = function (item) {
			var template = $scope.templates;
			if (template.busy) return;
			var favorites = angular.copy(template.favorites);
			if (favorites[item.postId]) delete favorites[item.postId];
			else favorites[item.postId] = true;
			template.busy = true;
			Homey.set('widgetTemplateFavorites', favorites, function (error) {
				$scope.$applyAsync(function () {
					template.busy = false;
					if (error) { showError(error); return; }
					template.favorites = favorites;
					template.catalog.forEach(function (entry) { entry.favorite = !!favorites[entry.postId]; });
				});
			});
		};

		$scope.importCatalogTemplate = function (item) {
			if ($scope.templates.busy) return;
			$scope.selectTemplateSection('import');
			$scope.templates.importText = item.text;
			$scope.readWidgetTemplate();
		};

		$scope.loadCatalogPreview = function (item) {
			if (item.preview || item.previewLoading || item.previewError) return;
			item.previewLoading = true;
			Homey.api('POST', '/widget-templates/decode', { text: item.text }, function (error, value) {
				$scope.$applyAsync(function () {
					item.previewLoading = false;
					if (!error && (!value || (!value.design && !value.theme)
						|| value.design && !validTemplateItem(value.design, 'design')
						|| value.theme && !validTemplateItem(value.theme, 'color'))) {
						error = new Error(Homey.__('settings.style_transfer_invalid'));
					}
					if (error) {
						item.previewError = window.chronographErrorMessage(Homey, error);
						return;
					}
					var design = angular.copy(value.design || builtInStyle);
					addOptionalDurationPositions(design);
					if (!design.groups) design.groups = widgetStyleEditor.fromCells(design);
					var icon = design.defaultIcons && design.defaultIcons.timer;
					item.preview = {
						design: design,
						theme: angular.copy(value.theme || builtInScheme),
						icon: icon ? $scope.iconClass(icon) : 'fa-' + sizeRuntime.defaultIcon('timer'),
						iconStyle: $scope.iconStyle(icon)
					};
				});
			});
		};

		$scope.openTemplateImage = function (image, title) {
			$scope.templates.imageViewer = { image: image, title: title };
			$scope.templates.imageZoom = 1;
			document.getElementById('template-image-dialog').showModal();
		};
		$scope.zoomTemplateImage = function (change) {
			$scope.templates.imageZoom = Math.max(1, Math.min(5, $scope.templates.imageZoom + change));
		};
		$scope.closeTemplateImage = function () {
			document.getElementById('template-image-dialog').close();
			$scope.templates.imageViewer = null;
		};

		$scope.generateWidgetTemplate = function () {
			var template = $scope.templates;
			if (template.busy || $scope.isWidgetDirty()) return;
			var design = savedStyles.styles.find(function (item) { return item.id === template.designId; });
			var theme = savedStyles.themes.find(function (item) { return item.id === template.themeId; });
			if (!design && !theme) {
				Homey.alert(Homey.__('settings.template_select_item'));
				return;
			}
			template.busy = true;
			template.generating = true;
			var pendingCopy = beginTemplateForumPostCopy();
			Homey.api('POST', '/widget-templates/encode', {
				design: design ? widgetStyleEditor.designFromStyle(design) : undefined,
				theme: theme ? angular.copy(theme) : undefined
			}, function (error, text) {
				$scope.$applyAsync(function () {
					template.busy = false;
					if (error) {
						template.generating = false;
						if (pendingCopy) pendingCopy.reject(error);
						showError(error);
						return;
					}
					clearTemplateImage();
					template.exportText = text;
					template.exportDesignName = design && design.name;
					template.exportThemeName = theme && theme.name;
					$scope.prepareTemplateImage(pendingCopy);
				});
			});
		};

		$scope.templateForumPost = function () {
			var template = $scope.templates;
			if (!template.exportText) return '';
			var heading = [];
			if (template.exportDesignName) heading.push('Design: ' + template.exportDesignName.replace(/\s+/g, ' ').trim());
			if (template.exportThemeName) heading.push('Theme: ' + template.exportThemeName.replace(/\s+/g, ' ').trim());
			return '# ' + heading.join(' | ') + '\n\n\n\n```javascript\n' + template.exportText + '\n```';
		};

		$scope.openWidgetExchange = function (number) {
			if (number !== undefined && (!Number.isSafeInteger(number) || number < 1)) {
				showError(new Error('Invalid forum post number'));
				return;
			}
			Homey.openURL('https://community.homey.app/t/162213' + (number === undefined ? '' : '/' + number));
		};

		$scope.copyWidgetTemplate = function (id) {
			var field = document.getElementById(id);
			if (!field || !field.value) return;
			field.focus();
			field.select();
			if (!document.execCommand('copy')) Homey.alert(Homey.__('settings.template_copy_error'));
			else if ($scope.templates.copyStatus === 'copied') $scope.templates.copyStatus = null;
		};

		async function templatePreviewImages() {
			var template = $scope.templates;
			var preview = document.getElementById('template-export-preview');
			if (!preview || !window.htmlToImage) throw new Error('Template preview is unavailable');
			var iconStyles = ['timer', 'stopwatch', 'transition'].filter(function (type) {
				return !!$scope.previewIcon(type);
			}).map($scope.previewIconStyle);
			var fonts = [
				{ style: 'fa-solid', family: 'Font Awesome 7 Free', weight: 900, file: 'fa-solid-900.woff2' },
				{ style: 'fa-regular', family: 'Font Awesome 7 Free', weight: 400, file: 'fa-regular-400.woff2' },
				{ style: 'fa-brands', family: 'Font Awesome 7 Brands', weight: 400, file: 'fa-brands-400.woff2' }
			];
			var fontCSS = (await Promise.all(fonts.filter(function (font) {
				return iconStyles.indexOf(font.style) !== -1;
			}).map(async function (font) {
				var response = await fetch('../assets/webfonts/' + font.file);
				if (!response.ok) throw new Error('Could not load preview font: ' + font.file);
				var bytes = new Uint8Array(await response.arrayBuffer());
				var binary = '';
				for (var index = 0; index < bytes.length; index += 8192) {
					binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192));
				}
				return '@font-face{font-family:"' + font.family + '";font-style:normal;font-weight:' + font.weight
					+ ';src:url(data:font/woff2;base64,' + btoa(binary) + ')}';
			}))).join('\n');
			var original = {
				mode: template.imageMode,
				size: $scope.editor.previewSize,
				type: $scope.editor.previewType,
				state: $scope.editor.previewState,
				width: preview.style.width,
				boxSizing: preview.style.boxSizing
			};
			var types = ['stopwatch', 'timer', 'transition'];
			var sizes = ['compact', 'normal', 'large'];
			var states = ['running', 'paused', 'inactive'];
			var stateLabels = { running: 'widget_running', paused: 'widget_paused', inactive: 'widget_not_running' };
			var images = [];
			try {
				preview.style.width = '350px';
				preview.style.boxSizing = 'border-box';
				for (var mode of ['light', 'dark']) {
					for (var type of types) {
						var rows = [];
						for (var state of states) {
							var row = [];
							for (var size of sizes) {
								await new Promise(function (resolve) {
									$scope.$applyAsync(function () {
										template.imageMode = mode;
										$scope.editor.previewSize = size;
										$scope.editor.previewType = type;
										$scope.editor.previewState = state;
										window.setTimeout(resolve, 20);
									});
								});
								var numberFields = Array.from(preview.querySelectorAll('input[type="number"]'));
								try {
									// Native number spinners can appear in the rendered image even when not visible in the preview.
									numberFields.forEach(function (field) { field.type = 'text'; });
									row.push(await new Promise(function (resolve, reject) {
										var timer = window.setTimeout(function () { reject(new Error('Preview image timed out')); }, 15000);
										window.htmlToImage.toCanvas(preview, { fontEmbedCSS: fontCSS, skipFonts: !fontCSS, pixelRatio: 1 }).then(function (image) {
											window.clearTimeout(timer);
											resolve(image);
										}, function (error) {
											window.clearTimeout(timer);
											reject(error);
										});
									}));
								} finally {
									numberFields.forEach(function (field) { field.type = 'number'; });
								}
								$scope.$applyAsync(function () { template.imageProgress++; });
							}
							rows.push(row);
						}
						var imageStyle = window.getComputedStyle(preview);
						images.push({
							type: type, rows: rows,
							background: mode === 'dark' ? '#111217' : '#f5f4fa',
							textColor: imageStyle.getPropertyValue('--homey-text-color').trim()
						});
					}
				}
			} finally {
				preview.style.width = original.width;
				preview.style.boxSizing = original.boxSizing;
				$scope.$applyAsync(function () {
					template.imageMode = original.mode;
					$scope.editor.previewSize = original.size;
					$scope.editor.previewType = original.type;
					$scope.editor.previewState = original.state;
				});
			}
			var padding = 16, gap = 12, rowLabelWidth = 110, headingHeight = 32, columnHeight = 28;
			var cellWidth = Math.max.apply(null, images.flatMap(function (panel) {
				return panel.rows.flatMap(function (row) { return row.map(function (image) { return image.width; }); });
			}));
			images.forEach(function (panel) {
				panel.rowHeights = panel.rows.map(function (row) {
					return Math.max.apply(null, row.map(function (image) { return image.height; }));
				});
			});
			return images.map(function (panel) {
				var canvas = document.createElement('canvas');
				canvas.width = padding * 2 + rowLabelWidth + cellWidth * 3 + gap * 2;
				canvas.height = padding * 2 + headingHeight + columnHeight
					+ panel.rowHeights.reduce(function (sum, value) { return sum + value + gap; }, 0);
				var context = canvas.getContext('2d');
				context.fillStyle = panel.background;
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.fillStyle = panel.textColor;
				context.textBaseline = 'middle';
				var y = padding;
				context.font = '600 20px sans-serif';
				context.fillText(previewTypeNames[panel.type], padding, y + headingHeight / 2);
				y += headingHeight;
				context.font = '600 14px sans-serif';
				sizes.forEach(function (size, column) {
					context.fillText(Homey.__('settings.style_' + size), padding + rowLabelWidth + column * (cellWidth + gap), y + columnHeight / 2);
				});
				y += columnHeight;
				panel.rows.forEach(function (row, rowIndex) {
					context.fillText(Homey.__('settings.' + stateLabels[states[rowIndex]]), padding, y + panel.rowHeights[rowIndex] / 2, rowLabelWidth - gap);
					row.forEach(function (image, column) {
						context.drawImage(image, padding + rowLabelWidth + column * (cellWidth + gap), y);
					});
					y += panel.rowHeights[rowIndex] + gap;
				});
				return canvas.toDataURL('image/png');
			});
		}

		function requiresManualCopyOnHttp() {
			return window.isSecureContext === false && window.location && window.location.protocol === 'http:';
		}

		function beginTemplateForumPostCopy() {
			if (requiresManualCopyOnHttp()) return null;
			var clipboard = window.navigator && window.navigator.clipboard;
			if (!clipboard || !clipboard.write || !window.ClipboardItem) return null;
			var resolvePost, rejectPost;
			var post = new Promise(function (resolve, reject) {
				resolvePost = resolve;
				rejectPost = reject;
			});
			var formats = {};
			['text/plain', 'text/html'].forEach(function (type) {
				formats[type] = post.then(function (data) { return new Blob([data[type]], { type: type }); });
				// The browser may reject the write without consuming the deferred data.
				formats[type].catch(function () {});
			});
			try {
				// Start within the click's user activation; supply the images after rendering.
				var result = clipboard.write([new window.ClipboardItem(formats)]).then(function () {
					return true;
				}, function () { return false; });
				return { resolve: resolvePost, reject: rejectPost, result: result };
			} catch (error) {
				rejectPost(error);
				return null;
			}
		}

		$scope.prepareTemplateImage = function (pendingCopy) {
			var template = $scope.templates;
			if (template.busy || !template.exportText) {
				if (!template.busy) template.generating = false;
				if (pendingCopy) pendingCopy.reject(new Error('Forum post is unavailable'));
				return;
			}
			clearTemplateImage();
			template.busy = true;
			template.generating = true;
			template.imageProgress = 0;
			function finishCopy(copied) {
				if (copied) {
					$scope.$applyAsync(function () {
						template.busy = false;
						template.copyStatus = 'copied';
					});
					return;
				}
				// Let the view remove inert before the legacy copy path focuses the text field.
				$timeout(function () {
					template.busy = false;
					$scope.copyTemplateForumPost(true);
				});
			}
			return templatePreviewImages().then(function (images) {
				$scope.$applyAsync(function () {
					template.imageData = images;
					template.generating = false;
					template.imageProgress = null;
					if (requiresManualCopyOnHttp()) {
						template.busy = false;
						template.copyStatus = 'http';
					} else if (pendingCopy) {
						pendingCopy.resolve(templateForumPostClipboardData());
						pendingCopy.result.then(finishCopy);
					} else {
						finishCopy(false);
					}
				});
			}, function (error) {
				if (pendingCopy) pendingCopy.reject(error);
				$scope.$applyAsync(function () {
					template.busy = false;
					template.generating = false;
					template.imageProgress = null;
					Homey.alert(Homey.__('settings.template_prepare_image_error') + '\n' + window.chronographErrorMessage(Homey, error));
				});
			});
		};

		function templateForumPostClipboardData() {
			var template = $scope.templates;
			function escapeHtml(value) {
				return value.replace(/[&<>"']/g, function (character) {
					return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
				});
			}
			var text = $scope.templateForumPost();
			var heading = text.slice(2, text.indexOf('\n\n'));
			var html = '<h1>' + escapeHtml(heading) + '</h1><p><br></p>'
				+ template.imageData.map(function (image) {
					return '<p><img alt="Widget preview" src="' + image + '"></p>';
				}).join('')
				+ '<pre data-params="javascript"><code class="language-javascript">' + escapeHtml(template.exportText) + '</code></pre>';
			return { 'text/plain': text, 'text/html': html };
		}

		$scope.copyTemplateForumPost = function (automatic) {
			var template = $scope.templates;
			if (template.busy || !template.exportText || !template.imageData || !template.imageData.length) return;
			template.copyStatus = null;
			var data = templateForumPostClipboardData();
			var copied = false;
			function onCopy(event) {
				event.preventDefault();
				event.clipboardData.setData('text/plain', data['text/plain']);
				event.clipboardData.setData('text/html', data['text/html']);
				copied = true;
			}
			var copyError;
			try {
				var field = document.getElementById('template-forum-post');
				if (!field) throw new Error('Forum post is unavailable');
				field.focus();
				field.select();
				document.addEventListener('copy', onCopy);
				var successful = document.execCommand('copy');
				if ((!successful || !copied) && document.createRange && window.getSelection && field.setSelectionRange) {
					var editable = field.contentEditable;
					var readOnly = field.readOnly;
					try {
						field.contentEditable = true;
						field.readOnly = false;
						var range = document.createRange();
						range.selectNodeContents(field);
						var selection = window.getSelection();
						selection.removeAllRanges();
						selection.addRange(range);
						field.setSelectionRange(0, field.value.length);
						successful = document.execCommand('copy');
					} finally {
						field.contentEditable = editable;
						field.readOnly = readOnly;
					}
				}
				if (!successful || !copied) throw new Error('Clipboard copy was blocked');
			} catch (error) {
				copyError = error;
			} finally {
				document.removeEventListener('copy', onCopy);
			}
			function finish(error) {
				template.busy = false;
				template.copyStatus = error ? 'retry' : 'copied';
				if (error && !automatic) {
					Homey.alert(Homey.__('settings.template_clipboard_image_error') + '\n' + window.chronographErrorMessage(Homey, error));
				}
			}
			if (!copyError) { finish(); return; }
			try {
				if (!window.navigator || !window.navigator.clipboard || !window.navigator.clipboard.write || !window.ClipboardItem) {
					finish(copyError);
					return;
				}
				template.busy = true;
				var item = new window.ClipboardItem({
					'text/plain': new Blob([data['text/plain']], { type: 'text/plain' }),
					'text/html': new Blob([data['text/html']], { type: 'text/html' })
				});
				window.navigator.clipboard.write([item]).then(function () {
					$scope.$applyAsync(function () { finish(); });
				}, function (error) {
					$scope.$applyAsync(function () { finish(error); });
				});
			} catch (error) {
				finish(error);
			}
		};

		function validTemplateItem(item, type) {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			var copy = angular.copy(item);
			copy.id = 'template-preview';
			var collection = { version: 3, styles: [], themes: [] };
			collection[type === 'color' ? 'themes' : 'styles'].push(copy);
			try {
				return widgetStyleEditor.isValidCollection(collection);
			} catch (error) {
				return false;
			}
		}

		$scope.readWidgetTemplate = function () {
			var template = $scope.templates;
			if (template.busy || !template.importText) return;
			var text = template.importText;
			template.busy = true;
			template.review = null;
			Homey.api('POST', '/widget-templates/decode', { text: text }, function (error, value) {
				$scope.$applyAsync(function () {
					template.busy = false;
					if (error) { showError(error); return; }
					if (text !== template.importText || !template.open || template.section !== 'import') return;
					if (!value || (!value.design && !value.theme)
						|| value.design && !validTemplateItem(value.design, 'design')
						|| value.theme && !validTemplateItem(value.theme, 'color')) {
						Homey.alert(Homey.__('settings.style_transfer_invalid'));
						return;
					}
					template.review = angular.copy(value);
					if (template.review.design) {
						addOptionalDurationPositions(template.review.design);
						template.review.design.id = 'template-preview';
						template.designName = uniqueStyleName(template.review.design.name, $scope.widgetStyles.styles);
					}
					if (template.review.theme) {
						template.review.theme.id = 'template-preview';
						template.themeName = uniqueStyleName(template.review.theme.name, $scope.widgetStyles.themes);
					}
					template.includeDesign = !!template.review.design;
					template.includeTheme = !!template.review.theme;
					template.previewDesignId = 'builtin:current';
					template.previewThemeId = 'builtin:current';
				});
			});
		};

		$scope.saveWidgetTemplate = function () {
			var template = $scope.templates;
			if (template.busy || !template.review || (!template.includeDesign && !template.includeTheme)) return;
			if (!angular.equals($scope.widgetStyles, savedStyles) || migrationPending) {
				Homey.alert(Homey.__('settings.template_save_first'));
				return;
			}
			var collection = angular.copy(savedStyles);
			var selections = [
				{ enabled: template.includeDesign, item: template.review.design, name: template.designName,
					items: collection.styles, type: 'design' },
				{ enabled: template.includeTheme, item: template.review.theme, name: template.themeName,
					items: collection.themes, type: 'color' }
			];
			for (var i = 0; i < selections.length; i++) {
				var selection = selections[i];
				if (!selection.enabled) continue;
				if (!selection.item || typeof selection.name !== 'string' || !selection.name.trim()
					|| selection.name.length > 80 || !validTemplateItem(selection.item, selection.type)) {
					Homey.alert(Homey.__('settings.style_transfer_invalid'));
					return;
				}
				var imported = angular.copy(selection.item);
				imported.id = widgetStyleEditor.newId(selection.items);
				imported.name = uniqueStyleName(selection.name, selection.items);
				if (selection.type === 'design') normalizeDesignSpans(imported);
				selection.items.push(imported);
			}
			if (!widgetStyleEditor.isValidCollection(collection)) {
				Homey.alert(Homey.__('settings.style_transfer_invalid'));
				return;
			}
			if (hasDuplicateStyleNames(collection.styles) || hasDuplicateStyleNames(collection.themes)) {
				Homey.alert(Homey.__('settings.style_duplicate_name'));
				return;
			}
			template.busy = true;
			Homey.set('widgetStyles', collection, function (error) {
				$scope.$applyAsync(function () {
					template.busy = false;
					if (error) { showError(error); return; }
					$scope.widgetStyles = angular.copy(collection);
					savedStyles = angular.copy(collection);
					migrationPending = false;
					template.review = null;
					template.importText = '';
					Homey.alert(Homey.__('settings.saved'));
				});
			});
		};

		$scope.deleteStyle = function () {
			var colorMode = $scope.editor.mode === 'color';
			var collectionKey = colorMode ? 'themes' : 'styles';
			var selectionKey = colorMode ? 'selectedSchemeId' : 'selectedStyleId';
			var style = $scope.getEditingItem();
			if (!stylesLoaded || $scope.savingSettings || !style || $scope.isBuiltInStyle()) return;
			Homey.confirm(Homey.__(colorMode ? 'settings.style_delete_scheme_confirm' : 'settings.style_delete_confirm')
				.replace('__name__', style.name), 'warning', function (error, confirmed) {
				$scope.$applyAsync(function () {
					if (error) {
						showError(error);
						return;
					}
					if (!confirmed || $scope.savingSettings) return;
					var index = $scope.widgetStyles[collectionKey].indexOf(style);
					if (index === -1) return;
					function removeFromEditor() {
						var currentIndex = $scope.widgetStyles[collectionKey].indexOf(style);
						if (currentIndex !== -1) $scope.widgetStyles[collectionKey].splice(currentIndex, 1);
						if ($scope.editor[selectionKey] === 'custom:' + style.id) {
							delete editHistories[editingKey()];
							editHistory = null;
							$scope.editor[selectionKey] = 'builtin:current';
							$scope.editor.invalidRowRule = false;
							resetDesignerSelection();
						}
					}
					if (!savedStyles[collectionKey].some(function (item) { return item.id === style.id; })) {
						removeFromEditor();
						return;
					}
					var remaining = angular.copy(savedStyles);
					remaining[collectionKey] = remaining[collectionKey].filter(function (item) { return item.id !== style.id; });
					$scope.savingSettings = true;
					Homey.set('widgetStyles', remaining, function (saveError) {
						$scope.$applyAsync(function () {
							$scope.savingSettings = false;
							if (saveError) {
								showError(saveError);
								return;
							}
							savedStyles = angular.copy(remaining);
							migrationPending = false;
							removeFromEditor();
						});
					});
				});
			});
		};

		$scope.upgradeLayout = function () {
			var style = $scope.getSelectedStyle();
			if (!style || $scope.savingSettings || style.groups) return;
			style.groups = widgetStyleEditor.fromCells(style);
			$scope.refreshLayoutElement();
		};

		$scope.refreshLayoutElement = function () {
			var style = $scope.getSelectedStyle();
			var element = $scope.editor.selectedElement;
			if (!style || !style.groups || !element) return;
			var layout = $scope.editor.editStatus
				? widgetStyleEditor.resolvedGroups(style, $scope.editor.previewSize, $scope.editor.previewState)
				: style.groups[$scope.editor.previewSize].elements;
			$scope.editor.position = angular.copy(layout[element]);
		};

		function canChangeSelection() {
			if ($scope.editor.colorForm && $scope.editor.colorForm.$invalid) {
				Homey.alert(Homey.__('settings.style_hex_invalid'));
				return false;
			}
			if ($scope.editor.rowPaddingForm && $scope.editor.rowPaddingForm.$invalid) {
				Homey.alert(Homey.__('settings.style_row_padding_invalid'));
				return false;
			}
			if ($scope.editor.elementSizeForm && $scope.editor.elementSizeForm.$invalid) {
				Homey.alert(Homey.__('settings.style_size_invalid'));
				return false;
			}
			if (!$scope.editor.invalidRowRule) return true;
			Homey.alert(Homey.__('settings.style_row_invalid'));
			return false;
		}

		function clearDesignerSelection() {
			if (canChangeSelection()) resetDesignerSelection();
		}

		function resetDesignerSelection() {
			$scope.editor.selectedElement = null;
			$scope.editor.selectedRow = null;
			$scope.editor.selectedColumn = null;
			$scope.editor.selectedCell = null;
			$scope.editor.selectedBackground = false;
			$scope.editor.rowRule = null;
			$scope.editor.position = {};
			sizeDraft = undefined;
		}

		$scope.toggleLayoutElement = function (element) {
			if ($scope.editor.selectedElement === element) clearDesignerSelection();
			else $scope.selectLayoutElement(element);
		};
		$scope.toggleWidgetBackground = function () {
			if ($scope.editor.selectedBackground) clearDesignerSelection();
			else $scope.selectWidgetBackground();
		};
		$scope.toggleVisibilityRow = function (row) {
			if ($scope.editor.selectedRow === row) clearDesignerSelection();
			else $scope.selectVisibilityRow(row);
		};
		$scope.toggleColumn = function (row, group) {
			var selected = $scope.editor.selectedColumn;
			if (selected && selected.row === row && selected.group === group) clearDesignerSelection();
			else $scope.selectColumn(row, group);
		};

		$scope.selectLayoutElement = function (element) {
			if ($scope.styleElements.indexOf(element) === -1 || !canChangeSelection()) return;
			$scope.editor.selectedElement = element;
			$scope.editor.selectedRow = null;
			$scope.editor.selectedColumn = null;
			$scope.editor.selectedBackground = false;
			$scope.editor.rowRule = null;
			$scope.refreshLayoutElement();
		};

		$scope.selectWidgetBackground = function () {
			if (!canChangeSelection()) return;
			$scope.editor.selectedElement = null;
			$scope.editor.selectedRow = null;
			$scope.editor.selectedColumn = null;
			$scope.editor.selectedCell = null;
			$scope.editor.selectedBackground = true;
			$scope.editor.rowRule = null;
		};

		$scope.selectedColorKey = function () {
			if ($scope.editor.selectedBackground) return 'background';
			if ($scope.editor.selectedElement === 'progress') return null;
			return $scope.styleElements.indexOf($scope.editor.selectedElement) !== -1
				? $scope.editor.selectedElement : null;
		};

		$scope.isButtonElement = function (key) {
			return widgetStyleEditor.buttonIds.indexOf(key) !== -1;
		};

		$scope.updateLayoutPosition = function () {
			var style = $scope.getSelectedStyle();
			var value = $scope.editor.position;
			if ($scope.editor.mode !== 'design' || !style || !style.groups || !$scope.editor.selectedElement || $scope.savingSettings
				|| [0].concat(layoutRows()).indexOf(value.row) === -1
				|| $scope.layoutGroups.indexOf(value.group) === -1
				|| $scope.layoutOrders.indexOf(value.order) === -1
				|| (value.row === 0 && (value.group !== 1 || value.order !== 1))) return;
			if (value.group > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, value.row)) {
				showError(Homey.__('settings.style_row_column_error'));
				$scope.refreshLayoutElement();
				return;
			}
			var layout = style.groups[$scope.editor.previewSize];
			var element = $scope.editor.selectedElement;
			if ($scope.editor.editStatus) {
				var state = $scope.editor.previewState;
				if (!layout.overrides[state]) layout.overrides[state] = {};
				layout.overrides[state][element] = angular.copy(value);
			} else {
				layout.elements[element] = angular.copy(value);
				var previewState = $scope.editor.previewState;
				if ((layout.overrides[previewState] && layout.overrides[previewState][element])
					|| (previewState === 'starting' && layout.overrides.inactive && layout.overrides.inactive[element])) {
					if (!layout.overrides[previewState]) layout.overrides[previewState] = {};
					layout.overrides[previewState][element] = angular.copy(value);
				}
			}
		};

		$scope.moveGroupedElement = function (element, row, group, insertionIndex) {
			if ($scope.editor.mode !== 'design' || $scope.isDesignReadOnly() || $scope.savingSettings
				|| $scope.styleElements.indexOf(element) === -1
				|| [0].concat(layoutRows()).indexOf(row) === -1 || $scope.layoutGroups.indexOf(group) === -1
				|| (row === 0 && group !== 1)) return;
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups) return;
			var columns = widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row);
			if (row > 0 && group > columns + 1) {
				showError(Homey.__('settings.style_row_column_error'));
				return;
			}
			if (row > 0 && group > columns) {
				if (group > widgetStyleEditor.rowSpanCapacity(style, $scope.editor.previewSize, row)) {
					showError(Homey.__('settings.style_row_column_error'));
					return;
				}
				widgetStyleEditor.setRowColumns(style, $scope.editor.previewSize, row, group);
			}
			if (group > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)) {
				showError(Homey.__('settings.style_row_column_error'));
				return;
			}
			$scope.selectLayoutElement(element);
			if ($scope.editor.selectedElement !== element) return;
			if (row > 0 && insertionIndex !== undefined) {
				var layout = style.groups[$scope.editor.previewSize];
				var positions = $scope.editor.editStatus
					? widgetStyleEditor.resolvedGroups(style, $scope.editor.previewSize, $scope.editor.previewState)
					: angular.copy(layout.elements);
				var elements = $scope.styleElements.filter(function (id) {
					return id !== element && positions[id].row === row && positions[id].group === group;
				}).sort(function (a, b) {
					return positions[a].order - positions[b].order || $scope.styleElements.indexOf(a) - $scope.styleElements.indexOf(b);
				});
				if (!Number.isInteger(insertionIndex) || insertionIndex < 0 || insertionIndex > elements.length) return;
				elements.splice(insertionIndex, 0, element);
				elements.forEach(function (id, index) {
					var position = { row: row, group: group, order: index + 1 };
					if (angular.equals(positions[id], position)) return;
					if ($scope.editor.editStatus) {
						var state = $scope.editor.previewState;
						if (!layout.overrides[state]) layout.overrides[state] = {};
						layout.overrides[state][id] = position;
					} else {
						layout.elements[id] = position;
						var previewState = $scope.editor.previewState;
						if ((layout.overrides[previewState] && layout.overrides[previewState][id])
							|| (previewState === 'starting' && layout.overrides.inactive && layout.overrides.inactive[id])) {
							if (!layout.overrides[previewState]) layout.overrides[previewState] = {};
							layout.overrides[previewState][id] = angular.copy(position);
						}
					}
				});
				$scope.refreshLayoutElement();
				return;
			}
			$scope.editor.position.row = row;
			$scope.editor.position.group = group;
			if (row === 0) $scope.editor.position.order = 1;
			$scope.updateLayoutPosition();
		};

		$scope.moveDesignerRow = function (source, target) {
			var style = $scope.getSelectedStyle();
			if ($scope.editor.mode !== 'design' || $scope.isDesignReadOnly() || !style || !style.groups || $scope.savingSettings || !canChangeSelection()
				|| layoutRows().indexOf(source) === -1 || layoutRows().indexOf(target) === -1 || source === target) return;
			widgetStyleEditor.moveRow(style, $scope.editor.previewSize, source, target);
			$scope.selectVisibilityRow(target);
			$scope.resetRowPreview();
		};

		$scope.moveDesignerColumn = function (row, source, target) {
			var style = $scope.getSelectedStyle();
			if ($scope.editor.mode !== 'design' || $scope.isDesignReadOnly() || !style || !style.groups || $scope.savingSettings || !canChangeSelection()
				|| layoutRows().indexOf(row) === -1 || !Number.isInteger(source) || !Number.isInteger(target)
				|| source < 1 || target < 1 || source > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)
				|| target > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row) || source === target) return;
			widgetStyleEditor.moveColumn(style, $scope.editor.previewSize, row, source, target);
			$scope.selectColumn(row, target);
			$scope.resetRowPreview();
		};

		$scope.reorderDesigner = function (type, source, target) {
			if (type === 'row' && /^(?:[1-9]|10)$/.test(source) && /^(?:[1-9]|10)$/.test(target)) {
				$scope.moveDesignerRow(Number(source), Number(target));
			} else if (type === 'column' && /^(?:[1-9]|10):[1-4]$/.test(source) && /^(?:[1-9]|10):[1-4]$/.test(target)) {
				var from = source.split(':').map(Number);
				var to = target.split(':').map(Number);
				if (from[0] !== to[0]) {
					showError(Homey.__('settings.style_column_reorder_same_row'));
					return;
				}
				$scope.moveDesignerColumn(from[0], from[1], to[1]);
			}
		};

		$scope.unusedElements = function () {
			$scope.groupedRows(false);
			var cached = groupedRowsCache['editor:' + $scope.editor.previewType];
			return cached ? cached.unused : [];
		};

		$scope.designerRowLayout = function () {
			var rows = $scope.groupedRows(false);
			var cached = designerRowLayouts.get(rows);
			if (cached) return cached;
			var editorRows = rows.map(function (row) {
				return Object.assign({}, row, {
					alignment: 'top',
					groups: row.groups.map(function (group) {
						var elements = group.elements.length ? group.elements : [''];
						return Object.assign({}, group, { elements: elements, renderElements: elements });
					})
				});
			});
			var layout = sizeRuntime.layoutSpanningRows(editorRows);
			if (layout.spanning) {
				var boundaries = [0, 1];
				layout.rows.forEach(function (row) {
					row.groups.forEach(function (group) { boundaries.push(group.gridStart, group.gridEnd); });
				});
				boundaries = Array.from(new Set(boundaries)).sort(function (a, b) { return a - b; });
				layout = Object.assign({}, layout, {
					tracks: boundaries.slice(1).map(function (end, index) {
						return 'minmax(0, ' + (end - boundaries[index]) + 'fr)';
					}).join(' ')
				});
			}
			layout.rows.forEach(function (row, index) {
				row.groups.forEach(function (group, groupIndex) {
					group.elements = rows[index].groups[groupIndex].elements;
					if (layout.spanning) {
						group.editorGridColumn = group.gridColumn.split(' / ').map(function (line) {
							return Number(line) + 1;
						}).join(' / ');
					}
				});
			});
			designerRowLayouts.set(rows, layout);
			return layout;
		};

		$scope.previewRowLayout = function (scenario, type) {
			return sizeRuntime.layoutSpanningRows($scope.groupedRows(true, scenario, type));
		};
		$scope.previewRowTrack = function (row) {
			var start = Number(row.groups[0].gridRow.split(' / ')[0]);
			return start + ' / ' + (start + 1);
		};
		$scope.previewTileState = function (scenario, type) {
			var state = scenario ? scenario.state : $scope.editor.previewState;
			return (type || $scope.editor.previewType) === 'stopwatch' && state === 'starting' ? 'inactive' : state;
		};

		$scope.groupedRows = function (preview, scenario, type) {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups) return [];
			type = type || $scope.editor.previewType;
			var state = preview ? $scope.previewTileState(scenario, type) : $scope.editor.previewState;
			var showStateOverrides = $scope.editor.editStatus || (preview && $scope.templates.open);
			var cacheKey = (scenario ? 'measure:' + scenario.id : preview ? 'preview' : 'editor') + ':' + type;
			var fingerprint = angular.toJson([
				style.id, style.groups[$scope.editor.previewSize], $scope.editor.previewSize,
				state, type, showStateOverrides,
				style.rowCounts, style.rowVisibility, style.rowColumns, style.rowAlignments, style.rowTopPadding, style.columnSpans, style.columnRowSpans, style.columnAlignments, style.columnVerticalAlignments, style.columnDirections, style.columnWidths, style.reservedElements,
				style.defaultIcons, style.rowColumnGaps, style.columnElementGaps, style.wrapNarrowElements, $scope.previewIcon(type), $scope.getStartFieldsVisibility()
			]);
			if (groupedRowsCache[cacheKey] && groupedRowsCache[cacheKey].fingerprint === fingerprint) {
				return groupedRowsCache[cacheKey].rows;
			}
			var layout = showStateOverrides
				? widgetStyleEditor.resolvedGroups(style, $scope.editor.previewSize, state)
				: style.groups[$scope.editor.previewSize].elements;
			var rows = layoutRows().map(function (row) {
				var visible = !preview || $scope.isRowVisible(row, { state: state });
				var spans = widgetStyleEditor.columnSpans(style, $scope.editor.previewSize, row);
				var alignments = widgetStyleEditor.columnAlignments(style, $scope.editor.previewSize, row);
				var verticalAlignments = widgetStyleEditor.columnVerticalAlignments(style, $scope.editor.previewSize, row);
				var directions = widgetStyleEditor.columnDirections(style, $scope.editor.previewSize, row);
				var widths = widgetStyleEditor.columnWidths(style, $scope.editor.previewSize, row);
				var rowSpans = widgetStyleEditor.columnRowSpans(style, $scope.editor.previewSize, row);
				var gaps = widgetStyleEditor.columnElementGaps(style, $scope.editor.previewSize, row);
				return {
					id: row,
					columnGap: style.rowColumnGaps && style.rowColumnGaps[$scope.editor.previewSize]
						&& style.rowColumnGaps[$scope.editor.previewSize][row] !== undefined ? style.rowColumnGaps[$scope.editor.previewSize][row] : 8,
					alignment: widgetStyleEditor.rowAlignment(style, $scope.editor.previewSize, row),
					topPadding: widgetStyleEditor.rowTopPadding(style, $scope.editor.previewSize, row),
					tracks: spans.map(function (span, index) {
						return widths[index] === 'content' ? 'minmax(0, max-content)' : 'minmax(0, ' + span + 'fr)';
					}).join(' '),
					groups: $scope.layoutGroups.slice(0, widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)).map(function (group) {
						var elements = $scope.styleElements.filter(function (id) {
							return visible && layout[id].row === row && layout[id].group === group
								&& (!preview || (!(scenario && scenario.excludeFields && id === 'fields') && $scope.previewVisible(id, state, type)));
						}).sort(function (a, b) { return layout[a].order - layout[b].order || $scope.styleElements.indexOf(a) - $scope.styleElements.indexOf(b); });
						var placeholders = preview ? ['icon', 'duration', 'remaining', 'total', 'progress'].filter(function (id) {
							return visible && layout[id].row === row && layout[id].group === group && elements.indexOf(id) === -1
								&& sizeRuntime.reserveElement(style, $scope.editor.previewSize, id);
						}) : [];
						var renderElements = elements.concat(placeholders).sort(function (a, b) {
							return layout[a].order - layout[b].order || $scope.styleElements.indexOf(a) - $scope.styleElements.indexOf(b);
						});
						return {
							id: group, gap: gaps[group - 1], span: spans[group - 1], rowSpan: rowSpans[group - 1],
							alignment: alignments[group - 1], verticalAlignment: verticalAlignments[group - 1],
							direction: directions[group - 1], width: widths[group - 1],
							narrowStart: style.wrapNarrowElements === true && elements.indexOf('start') !== -1,
							wrap: style.wrapNarrowElements === true && elements.length === 2
								&& ((elements.indexOf('start') !== -1 && elements.indexOf('cancel') !== -1)
									|| (elements.indexOf('status') !== -1 && elements.indexOf('duration') !== -1)),
							elements: elements, placeholders: placeholders, renderElements: renderElements
						};
					})
				};
			}).filter(function (row) {
				return !preview || row.groups.some(function (group) { return group.renderElements.length; });
			});
			rows.forEach(function (row) {
				row.hasFields = row.groups.some(function (group) { return group.elements.indexOf('fields') !== -1; });
			});
			groupedRowsCache[cacheKey] = {
				fingerprint: fingerprint,
				rows: rows,
				unused: $scope.styleElements.filter(function (id) { return layout[id].row === 0; })
			};
			return rows;
		};

		$scope.moveStyleElement = function (source, target) {
			var style = $scope.getSelectedStyle();
			if ($scope.editor.mode !== 'design' || $scope.isDesignReadOnly() || !style || $scope.savingSettings || !Number.isInteger(source) || !Number.isInteger(target)
				|| source < 0 || target < 0 || source >= 12 || target >= 12) return;
			var size = $scope.editor.previewSize;
			if ($scope.editor.editStatus) {
				var cells = widgetStyleEditor.resolveLayout(style, size, $scope.editor.previewState);
				if (!cells[source] || source === target) return;
				if (!style.overrides) style.overrides = {};
				if (!style.overrides[size]) style.overrides[size] = {};
				if (!style.overrides[size][$scope.editor.previewState]) style.overrides[size][$scope.editor.previewState] = [];
				style.overrides[size][$scope.editor.previewState].push({ element: cells[source], cell: target });
			} else {
				var base = style.layouts[size];
				var item = base[source];
				base[source] = base[target];
				base[target] = item;
			}
			$scope.editor.selectedCell = null;
		};

		$scope.getStyleCells = function () {
			var style = $scope.getSelectedStyle();
			if (!style) return [];
			return $scope.editor.editStatus
				? widgetStyleEditor.resolveLayout(style, $scope.editor.previewSize, $scope.editor.previewState)
				: style.layouts[$scope.editor.previewSize];
		};

		$scope.getPreviewCells = function (scenario, type) {
			var style = $scope.getSelectedStyle();
			if (style && ($scope.editor.editStatus || $scope.templates.open)) {
				return widgetStyleEditor.resolveLayout(style, $scope.editor.previewSize, $scope.previewTileState(scenario, type));
			}
			return $scope.getStyleCells();
		};

		$scope.clearStatusLayout = function () {
			var style = $scope.getSelectedStyle();
			if ($scope.savingSettings || !style) return;
			if (style.groups) {
				delete style.groups[$scope.editor.previewSize].overrides[$scope.editor.previewState];
				$scope.refreshLayoutElement();
				return;
			}
			if (!style.overrides || !style.overrides[$scope.editor.previewSize]) return;
			delete style.overrides[$scope.editor.previewSize][$scope.editor.previewState];
			if (!Object.keys(style.overrides[$scope.editor.previewSize]).length) delete style.overrides[$scope.editor.previewSize];
			if (!Object.keys(style.overrides).length) delete style.overrides;
			$scope.editor.selectedCell = null;
		};

		$scope.selectStyleCell = function (index) {
			if ($scope.savingSettings || !canChangeSelection()) return;
			if ($scope.getStyleCells()[index] && $scope.editor.selectedElement === $scope.getStyleCells()[index]) {
				clearDesignerSelection();
				return;
			}
			if ($scope.editor.selectedCell === null) {
				if ($scope.getStyleCells()[index]) {
					$scope.selectLayoutElement($scope.getStyleCells()[index]);
					if ($scope.editor.selectedElement === $scope.getStyleCells()[index]) $scope.editor.selectedCell = index;
				}
			} else {
				$scope.moveStyleElement($scope.editor.selectedCell, index);
			}
		};

		$scope.previewVisible = function (element, previewState, previewType) {
			var type = previewType || $scope.editor.previewType;
			var state = $scope.previewTileState(previewState ? { state: previewState } : null, type);
			if (element === 'icon') return !!$scope.previewIcon(type);
			if (element === 'progress') return type !== 'stopwatch';
			if (element === 'remaining' || element === 'total') return (type === 'timer' || type === 'transition') && (state === 'running' || state === 'paused');
			if (element === 'cancel') return state === 'starting';
			if (element === 'fields') return (state === 'starting'
				|| (state === 'inactive' && ($scope.hasFieldsRowRule(state) || $scope.showStartFieldsWhenInactive())))
				&& type !== 'stopwatch';
			if (element === 'start' || element === 'play') {
				var style = $scope.getSelectedStyle();
				if (element === 'play' && (!style || !style.groups)) return state !== 'running';
				var startButton = state === 'starting'
					|| (state === 'inactive' && (type === 'stopwatch'
						? $scope.editor.previewSize !== 'compact' : $scope.showStartFieldsWhenInactive()));
				return element === 'start' ? startButton : state !== 'running' && !startButton;
			}
			if (element === 'pause') return state === 'running';
			if (element === 'stop' || element === 'duration') return state === 'running' || state === 'paused';
			return !!element;
		};

		$scope.showStartFieldsWhenInactive = function () {
			var style = $scope.getSelectedStyle();
			return style && widgetStyleEditor.startFieldsVisibility(style, $scope.editor.previewSize) === 'inactive';
		};

		$scope.getStartFieldsVisibility = function () {
			var style = $scope.getSelectedStyle();
			return style && widgetStyleEditor.startFieldsVisibility(style, $scope.editor.previewSize);
		};

		function getRowRule(row) {
			var style = $scope.getSelectedStyle();
			var rows = style && style.rowVisibility && style.rowVisibility[$scope.editor.previewSize];
			return rows && rows[row];
		}

		$scope.resetRowPreview = function () {
			if (startFormTimer) $timeout.cancel(startFormTimer);
			startFormTimer = null;
			if ($scope.editor.previewState !== 'starting'
				|| $scope.editor.previewColumns === 'single' && $scope.editor.previewType === 'stopwatch') return;
			var durations = $scope.groupedRows(true, null, $scope.editor.previewColumns === 'single' ? null : 'timer').map(function (row) {
				var rule = getRowRule(row.id);
				return rule && rule.startForm && rule.hideAfterSeconds;
			}).filter(function (seconds) { return typeof seconds === 'number' && seconds > 0; });
			if (durations.length) startFormTimer = $timeout(function () {
				startFormTimer = null;
				if ($scope.editor.previewState === 'starting') $scope.previewAction('cancel');
			}, Math.min.apply(null, durations) * 1000);
		};

		function refreshRowRule() {
			var row = $scope.editor.selectedRow;
			var rule = getRowRule(row);
			$scope.editor.rowColumns = widgetStyleEditor.rowColumns($scope.getSelectedStyle(), $scope.editor.previewSize, row);
			$scope.editor.rowAlignment = widgetStyleEditor.rowAlignment($scope.getSelectedStyle(), $scope.editor.previewSize, row);
			$scope.editor.rowTopPadding = widgetStyleEditor.rowTopPadding($scope.getSelectedStyle(), $scope.editor.previewSize, row);
			$scope.editor.rowRule = {
				inactive: !rule || rule.states.indexOf('inactive') !== -1,
				paused: !rule || rule.states.indexOf('paused') !== -1,
				running: !rule || rule.states.indexOf('running') !== -1,
				starting: !rule || rule.startForm,
				hideAfter: !!(rule && rule.hideAfterSeconds),
				seconds: rule && rule.hideAfterSeconds || 10
			};
		}

		$scope.selectVisibilityRow = function (row) {
			if (layoutRows().indexOf(row) === -1 || !canChangeSelection()) return;
			$scope.editor.selectedRow = row;
			$scope.editor.selectedColumn = null;
			$scope.editor.selectedElement = null;
			$scope.editor.selectedBackground = false;
			$scope.editor.selectedCell = null;
			refreshRowRule();
		};

		function refreshColumnSpan() {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			$scope.editor.columnSpan = widgetStyleEditor.columnSpans(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
			$scope.editor.columnRowSpan = widgetStyleEditor.columnRowSpans(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
			$scope.editor.columnAlignment = widgetStyleEditor.columnAlignments(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
			$scope.editor.columnVerticalAlignment = widgetStyleEditor.columnVerticalAlignments(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
			$scope.editor.columnDirection = widgetStyleEditor.columnDirections(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
			$scope.editor.columnWidth = widgetStyleEditor.columnWidths(style, $scope.editor.previewSize, selected.row)[selected.group - 1];
		}

		$scope.selectColumn = function (row, group) {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups || !canChangeSelection() || layoutRows().indexOf(row) === -1
				|| !Number.isInteger(group) || group < 1
				|| group > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)) return;
			$scope.editor.selectedColumn = { row: row, group: group };
			$scope.editor.selectedRow = null;
			$scope.editor.selectedElement = null;
			$scope.editor.selectedBackground = false;
			$scope.editor.selectedCell = null;
			$scope.editor.rowRule = null;
			refreshColumnSpan();
		};

		$scope.availableColumnSpans = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups) return [];
			var size = $scope.editor.previewSize;
			var max = widgetStyleEditor.rowSpanCapacity(style, size, selected.row);
			var height = widgetStyleEditor.columnRowSpans(style, size, selected.row)[selected.group - 1];
			for (var row = selected.row + 1; row < selected.row + height; row++) {
				max = Math.min(max, widgetStyleEditor.rowSpanCapacity(style, size, row)
					+ widgetStyleEditor.columnSpans(style, size, selected.row)[selected.group - 1] - 1);
			}
			return $scope.layoutGroups.slice(0, max);
		};

		$scope.updateColumnSpan = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings
				|| $scope.availableColumnSpans().indexOf($scope.editor.columnSpan) === -1) return;
			selected.group = widgetStyleEditor.setColumnSpan(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnSpan);
			refreshColumnSpan();
		};

		$scope.availableColumnRowSpans = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups) return [];
			var size = $scope.editor.previewSize;
			var width = widgetStyleEditor.columnSpans(style, size, selected.row)[selected.group - 1];
			var current = widgetStyleEditor.columnRowSpans(style, size, selected.row)[selected.group - 1];
			return layoutRows().slice(0, sizeRuntime.rowCount(style, size) + 1 - selected.row).filter(function (height) {
				for (var row = selected.row + 1; row < selected.row + height; row++) {
					var capacity = widgetStyleEditor.rowSpanCapacity(style, size, row);
					if (row < selected.row + current) capacity += width;
					if (capacity < 2) return false;
				}
				return true;
			});
		};

		$scope.updateColumnRowSpan = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings || $scope.isDesignReadOnly()
				|| $scope.availableColumnRowSpans().indexOf($scope.editor.columnRowSpan) === -1) return;
			widgetStyleEditor.setColumnRowSpan(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnRowSpan);
			refreshColumnSpan();
		};

		$scope.updateColumnAlignment = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings
				|| ['left', 'center', 'right', 'stretch'].indexOf($scope.editor.columnAlignment) === -1) return;
			widgetStyleEditor.setColumnAlignment(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnAlignment);
		};

		$scope.updateColumnDirection = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings
				|| ['horizontal', 'vertical'].indexOf($scope.editor.columnDirection) === -1) return;
			widgetStyleEditor.setColumnDirection(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnDirection);
		};

		$scope.updateColumnVerticalAlignment = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings
				|| ['top', 'middle', 'bottom'].indexOf($scope.editor.columnVerticalAlignment) === -1) return;
			widgetStyleEditor.setColumnVerticalAlignment(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnVerticalAlignment);
		};

		$scope.updateColumnWidth = function () {
			var selected = $scope.editor.selectedColumn;
			var style = $scope.getSelectedStyle();
			if (!selected || !style || !style.groups || $scope.savingSettings
				|| ['span', 'content'].indexOf($scope.editor.columnWidth) === -1) return;
			widgetStyleEditor.setColumnWidth(style, $scope.editor.previewSize, selected.row, selected.group, $scope.editor.columnWidth);
		};

		$scope.updateRowColumns = function () {
			var style = $scope.getSelectedStyle();
			var count = $scope.editor.rowColumns;
			if (!style || !style.groups || $scope.savingSettings || $scope.editor.invalidRowRule
				|| $scope.availableRowColumns().indexOf(count) === -1 || layoutRows().indexOf($scope.editor.selectedRow) === -1) return;
			widgetStyleEditor.setRowColumns(style, $scope.editor.previewSize, $scope.editor.selectedRow, count);
			$scope.refreshLayoutElement();
		};

		$scope.availableRowColumns = function () {
			var style = $scope.getSelectedStyle();
			return style && style.groups && $scope.editor.selectedRow
				? $scope.layoutGroups.slice(0, widgetStyleEditor.rowSpanCapacity(style, $scope.editor.previewSize, $scope.editor.selectedRow)) : [];
		};

		$scope.updateRowAlignment = function () {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups || $scope.savingSettings || $scope.editor.invalidRowRule
				|| layoutRows().indexOf($scope.editor.selectedRow) === -1
				|| ['top', 'middle', 'bottom'].indexOf($scope.editor.rowAlignment) === -1) return;
			widgetStyleEditor.setRowAlignment(style, $scope.editor.previewSize, $scope.editor.selectedRow, $scope.editor.rowAlignment);
		};

		$scope.updateRowTopPadding = function () {
			var style = $scope.getSelectedStyle();
			var padding = $scope.editor.rowTopPadding;
			if (!style || !style.groups || $scope.savingSettings || layoutRows().indexOf($scope.editor.selectedRow) === -1
				|| !Number.isInteger(padding) || padding < 0 || padding > 100) return;
			widgetStyleEditor.setRowTopPadding(style, $scope.editor.previewSize, $scope.editor.selectedRow, padding);
		};

		$scope.availablePositionGroups = function () {
			var style = $scope.getSelectedStyle();
			var row = $scope.editor.position.row;
			return style && style.groups && layoutRows().indexOf(row) !== -1
				? $scope.layoutGroups.slice(0, widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)) : [];
		};

		$scope.updatePositionRow = function () {
			if ($scope.editor.position.row === 0) {
				$scope.editor.position.group = 1;
				$scope.editor.position.order = 1;
				$scope.updateLayoutPosition();
				return;
			}
			var groups = $scope.availablePositionGroups();
			if (groups.indexOf($scope.editor.position.group) === -1 && groups.length) {
				$scope.editor.position.group = groups[groups.length - 1];
			}
			$scope.updateLayoutPosition();
		};

		$scope.updateRowRule = function () {
			var style = $scope.getSelectedStyle();
			var input = $scope.editor.rowRule;
			if (!style || !input || $scope.savingSettings) return;
			var rule = { states: [], actions: {}, startForm: !!input.starting };
			['inactive', 'paused', 'running'].forEach(function (state) {
				if (input[state]) rule.states.push(state);
			});
			if (input.starting && input.hideAfter) rule.hideAfterSeconds = input.seconds;
			$scope.editor.invalidRowRule = (input.starting && input.hideAfter
				&& (typeof input.seconds !== 'number' || !isFinite(input.seconds) || input.seconds < 0.1 || input.seconds > 86400))
				|| !widgetStyleEditor.validRowVisibility({ compact: { 1: rule } });
			if ($scope.editor.invalidRowRule) return;
			if (!style.rowVisibility) style.rowVisibility = {};
			if (!style.rowVisibility[$scope.editor.previewSize]) style.rowVisibility[$scope.editor.previewSize] = {};
			style.rowVisibility[$scope.editor.previewSize][$scope.editor.selectedRow] = rule;
			$scope.resetRowPreview();
		};

		$scope.isRowVisible = function (row, scenario) {
			var rule = getRowRule(row);
			if (!rule) return true;
			var state = scenario ? scenario.state : $scope.editor.previewState;
			if (state === 'starting') return rule.startForm === undefined ? rule.states.indexOf('inactive') !== -1 : rule.startForm;
			return rule.states.indexOf(state) !== -1;
		};

		$scope.hasFieldsRowRule = function (state) {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups) return false;
			var layout = $scope.editor.editStatus
				? widgetStyleEditor.resolvedGroups(style, $scope.editor.previewSize, state || $scope.editor.previewState)
				: style.groups[$scope.editor.previewSize].elements;
			return !!getRowRule(layout.fields.row);
		};

		$scope.previewAction = function (action, previewType) {
			if ($scope.templates.busy || ($scope.templates.open && $scope.templates.section === 'export')) return;
			if ($scope.editor.colorForm && $scope.editor.colorForm.$invalid && !canChangeSelection()) return;
			var state = $scope.previewTileState(null, previewType);
			if (action === 'start' || action === 'play') {
				if (state === 'inactive' && (!$scope.showStartFieldsWhenInactive() || ($scope.hasFieldsRowRule()
					&& !$scope.isRowVisible(($scope.editor.editStatus
						? widgetStyleEditor.resolvedGroups($scope.getSelectedStyle(), $scope.editor.previewSize, state)
						: $scope.getSelectedStyle().groups[$scope.editor.previewSize].elements).fields.row)))
					&& (previewType || $scope.editor.previewType) !== 'stopwatch') {
					state = 'starting';
				} else {
					state = 'running';
				}
			} else if (action === 'pause') {
				state = 'paused';
			} else if (action === 'stop' || action === 'cancel') {
				state = 'inactive';
			} else {
				return;
			}
			$scope.editor.previewState = state;
			$scope.resetRowPreview();
			$scope.editor.selectedCell = null;
			$scope.refreshLayoutElement();
		};

		$scope.previewActionLabel = function (action) {
			if (action === 'start') return Homey.__('settings.widget_start');
			if (action === 'play') {
				return $scope.editor.previewState === 'paused' ? $scope.labels.resume : Homey.__('settings.widget_start');
			}
			if (action === 'pause') return $scope.labels.pause;
			if (action === 'stop') return $scope.labels.stop;
			return Homey.__('settings.widget_cancel');
		};

		function defaultIconId(type) {
			var style = $scope.getSelectedStyle();
			return style && style.defaultIcons && style.defaultIcons[type];
		}
		$scope.iconClass = function (id) {
			if (id === 'chronograph:transition') return 'fa-chronograph-transition';
			var match = /^(?:fas|far|fab):([a-z0-9-]+)$/.exec(id || '');
			return match ? 'fa-' + match[1] : undefined;
		};
		$scope.iconStyle = function (id) {
			return id && id.indexOf('far:') === 0 ? 'fa-regular'
				: id && id.indexOf('fab:') === 0 ? 'fa-brands' : 'fa-solid';
		};
		var previewTypeNames = { stopwatch: 'Stopwatch', timer: 'Timer', transition: 'Transition' };
		$scope.previewName = function (type) {
			type = type || $scope.editor.previewType;
			return $scope.templates.generating ? previewTypeNames[type] : $scope.t('settings.widget_type_' + type);
		};
		$scope.previewIcon = function (type) {
			type = type || $scope.editor.previewType;
			var id = defaultIconId(type);
			if (id) return $scope.iconClass(id);
			var icon = window.ChronographWidgetStyle.defaultIcon(type);
			return icon ? 'fa-' + icon : undefined;
		};
		$scope.previewIconStyle = function (type) {
			return $scope.iconStyle(defaultIconId(type || $scope.editor.previewType));
		};
		$scope.selectedDefaultIconName = function (type) {
			var id = defaultIconId(type);
			if (!id) return Homey.__('settings.style_current');
			if (id === 'none') return Homey.__('settings.widget_icon_none');
			var match = $scope.iconPickers[type].results.find(function (item) { return item.id === id; });
			var appNames = { 'fas:hourglass-half': 'Timer', 'fas:stopwatch': 'Stopwatch', 'chronograph:transition': 'Transition' };
			var styleNames = { fas: 'Solid', far: 'Regular', fab: 'Brands' };
			var name = match ? match.name : appNames[id] || id.slice(id.indexOf(':') + 1).replace(/-/g, ' ');
			var category = match ? match.description : appNames[id] ? 'App' : styleNames[id.split(':')[0]];
			return category ? name + ' (' + category + ')' : name;
		};
		$scope.searchDefaultIcons = function (type) {
			var picker = $scope.iconPickers[type];
			if (!picker || !picker.open || $scope.savingSettings || $scope.isDesignReadOnly()) return;
			var request = ++picker.request;
			picker.busy = true;
			Homey.api('POST', '/widget-icons/search', { query: picker.query }, function (error, results) {
				$scope.$applyAsync(function () {
					if (request !== picker.request || !picker.open) return;
					picker.busy = false;
					if (error) { picker.results = []; showError(error); return; }
					picker.visibleCount = 60;
					picker.results = results;
				});
			});
		};
		$scope.toggleIconPicker = function (type) {
			var picker = $scope.iconPickers[type];
			if (!picker || $scope.savingSettings || $scope.isDesignReadOnly()) return;
			picker.open = !picker.open;
			if (picker.open) $scope.searchDefaultIcons(type);
			else picker.request++;
		};
		$scope.setDefaultIcon = function (type, id) {
			var picker = $scope.iconPickers[type], style = $scope.getSelectedStyle();
			if (!picker || !style || $scope.savingSettings || $scope.isDesignReadOnly()
				|| (id !== null && !picker.results.some(function (item) { return item.id === id; }))) return;
			if (id === null) {
				if (style.defaultIcons) {
					delete style.defaultIcons[type];
					if (!Object.keys(style.defaultIcons).length) delete style.defaultIcons;
				}
			} else {
				if (!style.defaultIcons) style.defaultIcons = {};
				style.defaultIcons[type] = id;
			}
			picker.open = false;
			picker.request++;
		};

		$scope.getChronographs = function (type) {
			var typeName = type.charAt(0).toUpperCase() + type.slice(1);
			return $scope.chronographs.filter(function (chronograph) {
				return chronograph.data && chronograph.data.type === typeName;
			});
		};

		$scope.getConfiguredChronographs = function (type) {
			var configured = $scope.chronographsNames[type];
			return Array.isArray(configured) ? configured : [];
		};

		$scope.getConfiguredName = function (chronograph) {
			return typeof chronograph === 'string' ? chronograph : chronograph.name || '';
		};

		$scope.getConfiguredAction = function (chronograph) {
			return chronograph && typeof chronograph === 'object' ? chronograph.action : null;
		};

		$scope.formatConfiguredAction = function (chronograph) {
			var action = $scope.getConfiguredAction(chronograph);
			var date = action ? new Date(action) : null;
			return date && !isNaN(date.getTime()) ? date.toLocaleString() : '';
		};

		$scope.formatDuration = function (chronograph) {
			var duration = Math.max(0, Number(chronograph.duration) || 0);
			if (chronograph.data.type === 'Timer' && isFinite(Number(chronograph.targetDuration))) {
				duration = Math.max(0, Number(chronograph.targetDuration) - duration);
			}

			duration /= 1000;
			var days = Math.floor(duration / 86400);
			duration %= 86400;
			var hours = Math.floor(duration / 3600);
			duration %= 3600;
			var minutes = Math.floor(duration / 60);
			duration %= 60;
			var seconds = duration.toFixed(2).padStart(5, '0');
			var result = seconds;

			if (minutes > 0 || hours > 0 || days > 0) {
				result = String(minutes).padStart(2, '0') + ':' + result;
			}
			if (hours > 0 || days > 0) {
				result = String(hours).padStart(2, '0') + ':' + result;
			}
			if (days > 0) {
				result = days + Homey.__('settings.days_abbreviation') + ' ' + result;
			}
			return result;
		};

		$scope.refresh = function (callback) {
			if (refreshInProgress) {
				if (typeof callback === 'function') callback();
				return;
			}
			refreshInProgress = true;
			Homey.api('GET', '/chronographs/', null, function (error, chronographs) {
				$scope.$applyAsync(function () {
					refreshInProgress = false;
					if (error) {
						if (typeof callback === 'function') callback(error);
						return;
					}
					$scope.chronographs = sortChronographs(chronographs || []);
					if (typeof callback === 'function') callback();
				});
			});
		};

		$scope.toggleChronograph = function (chronograph) {
			if (chronograph.busy) return;
			chronograph.busy = true;
			Homey.api('PUT', '/chronographs/' + chronograph.data.type.toLowerCase() + '/' + encodeURIComponent(chronograph.name), {
				running: !chronograph.running
			}, function (error, updatedChronograph) {
				$scope.$applyAsync(function () {
					chronograph.busy = false;
					if (error) {
						showError(error);
						return;
					}
					chronograph.running = updatedChronograph.running;
					chronograph.duration = updatedChronograph.duration;
				});
			});
		};

		$scope.stopChronograph = function (chronograph) {
			if (chronograph.busy) return;
			chronograph.busy = true;
			Homey.api('DELETE', '/chronographs/' + chronograph.data.type.toLowerCase() + '/' + encodeURIComponent(chronograph.name), null, function (error) {
				$scope.$applyAsync(function () {
					chronograph.busy = false;
					if (error) {
						showError(error);
						return;
					}
					var index = $scope.chronographs.indexOf(chronograph);
					if (index !== -1) $scope.chronographs.splice(index, 1);
				});
			});
		};

		$scope.saveSettings = function () {
			if ($scope.savingSettings || !$scope.isWidgetDirty()) return;
			if ($scope.editor.colorForm && $scope.editor.colorForm.$invalid) {
				Homey.alert(Homey.__('settings.style_hex_invalid'));
				return;
			}
			if ($scope.editor.rowPaddingForm && $scope.editor.rowPaddingForm.$invalid) {
				Homey.alert(Homey.__('settings.style_row_padding_invalid'));
				return;
			}
			if ($scope.editor.elementSizeForm && $scope.editor.elementSizeForm.$invalid) {
				Homey.alert(Homey.__('settings.style_size_invalid'));
				return;
			}
			if ($scope.editor.invalidRowRule) {
				Homey.alert(Homey.__('settings.style_row_invalid'));
				return;
			}
			var stylesChanged = stylesLoaded && (migrationPending || !angular.equals($scope.widgetStyles, savedStyles));
			var previewChanges = previewBuiltInsLoaded && !angular.equals(previewBuiltIns(), savedPreviewBuiltIns);
			if (stylesChanged && !widgetStyleEditor.isValidCollection($scope.widgetStyles)) {
				Homey.alert($scope.labels.invalidStyle);
				return;
			}
			if (stylesChanged && (hasDuplicateStyleNames($scope.widgetStyles.styles) || hasDuplicateStyleNames($scope.widgetStyles.themes))) {
				Homey.alert(Homey.__('settings.style_duplicate_name'));
				return;
			}
			var previewToSave = previewChanges ? previewBuiltIns() : null;
			if (previewChanges && !validPreviewBuiltIns(previewToSave)) {
				Homey.alert($scope.labels.invalidStyle);
				return;
			}
			var stylesToSave = angular.copy($scope.widgetStyles);
			var writes = [];
			if (stylesChanged) writes.push({ key: 'widgetStyles', value: stylesToSave });
			if (previewChanges) writes.push({ key: 'previewBuiltIns', value: previewToSave });
			saveWrites(writes);
		};

		$scope.saveGeneralSettings = function () {
			if ($scope.savingSettings || !$scope.isGeneralDirty()) return;
			var decimals = $scope.roundOfDurationsFlowcards;
			if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
				Homey.alert(Homey.__('settings.invalid_decimals'));
				return;
			}
			saveWrites([{ key: 'roundOfDurationsFlowcards', value: decimals }]);
		};

		function saveWrites(writes) {
			$scope.savingSettings = true;
			function saveNext() {
				if (!writes.length) {
					$scope.savingSettings = false;
					Homey.alert(Homey.__('settings.saved'));
					return;
				}
				var write = writes.shift();
				Homey.set(write.key, write.value, function (error) {
					$scope.$applyAsync(function () {
						if (error) {
							$scope.savingSettings = false;
							showError(error);
							return;
						}
						if (write.key === 'roundOfDurationsFlowcards') $scope.savedDecimals = write.value;
						else if (write.key === 'previewBuiltIns') savedPreviewBuiltIns = angular.copy(write.value);
						else {
							savedStyles = angular.copy(write.value);
							migrationPending = false;
						}
						saveNext();
					});
				});
			}
			saveNext();
		}

		$scope.$on('$destroy', function () {
			if (darkSchemeQuery && darkSchemeQuery.removeEventListener) darkSchemeQuery.removeEventListener('change', previewSchemeChanged);
			if (previewHostObserver) previewHostObserver.disconnect();
			clearTemplateImage();
			if (refreshInterval) $interval.cancel(refreshInterval);
			if (durationInterval) $interval.cancel(durationInterval);
			if (startFormTimer) $timeout.cancel(startFormTimer);
			if (window.removeEventListener) window.removeEventListener('beforeunload', warnBeforeLeaving);
		});

		$scope.initialize = function (homey) {
			Homey = homey;
			$scope.t = function (key) { return Homey.__(key); };
			$scope.layoutModes = [
				{ value: false, label: Homey.__('settings.style_base_layout') },
				{ value: true, label: Homey.__('settings.style_status_layout') }
			];
			$scope.labels = {
				chronographs: Homey.__('settings.tab_chronographs'),
				widgets: Homey.__('settings.tab_widgets'),
				general: Homey.__('settings.tab_general'),
				chronographsTitle: Homey.__('settings.running_chronographs'),
				widgetStyles: Homey.__('settings.widget_default_styles'),
				widgetStylesLater: Homey.__('settings.widget_styles_later'),
				generalTitle: Homey.__('settings.general_settings'),
				decimals: Homey.__('settings.amount_of_decimals'),
				decimalsDescription: Homey.__('settings.amount_of_decimals_description'),
				newStyle: Homey.__('settings.style_new'),
				copy: Homey.__('settings.style_copy'),
				invalidStyle: Homey.__('settings.style_invalid'),
				save: Homey.__('settings.save'),
				running: Homey.__('settings.widget_running'),
				paused: Homey.__('settings.widget_paused'),
				pause: Homey.__('settings.pause'),
				resume: Homey.__('settings.resume'),
				stop: Homey.__('settings.stop')
			};
			builtInStyle = widgetStyleEditor.create('builtin:current', Homey.__('settings.style_current'));
			builtInStyle.reservedElements = angular.copy(sizeRuntime.currentDesign().reservedElements);
			builtInStyle.groups = widgetStyleEditor.currentGroups();
			builtInStyle.rowVisibility = widgetStyleEditor.currentRowVisibility();
			widgetStyleEditor.configureCurrentColumns(builtInStyle);
			widgetStyleEditor.configureCurrentPresentation(builtInStyle);
			builtInScheme = widgetStyleEditor.colorSchemeFromStyle(builtInStyle);
			builtInDesigns = { 'builtin:current': builtInStyle };
			$scope.builtInDesigns = window.ChronographWidgetStyle.builtInDesignDefinitions.map(function (definition) {
				var design = widgetStyleEditor.designFromStyle(Object.assign(
					widgetStyleEditor.create(definition.id, Homey.__(definition.nameKey)),
					window.ChronographWidgetStyle.builtInDesign(definition.id)
				));
				builtInDesigns[design.id] = design;
				return design;
			});
			builtInSchemes = { 'builtin:current': builtInScheme };
			$scope.builtInSchemes = window.ChronographWidgetStyle.builtInSchemeDefinitions.map(function (definition) {
				var scheme = window.ChronographWidgetStyle.builtInScheme(definition.id);
				scheme.id = definition.id;
				scheme.name = Homey.__(definition.nameKey);
				builtInSchemes[scheme.id] = scheme;
				return scheme;
			});
			$scope.styleLabels = {
				icon: Homey.__('settings.style_icon'),
				name: Homey.__('settings.style_name'),
				status: Homey.__('settings.style_status'),
				duration: Homey.__('settings.widget_duration'),
				remaining: Homey.__('settings.widget_elapsed'),
				total: Homey.__('settings.widget_total'),
				play: Homey.__('settings.style_play'),
				start: Homey.__('settings.widget_start'),
				pause: Homey.__('settings.pause'),
				stop: Homey.__('settings.stop'),
				fields: Homey.__('settings.style_fields'),
				cancel: Homey.__('settings.widget_cancel'),
				progress: Homey.__('settings.style_progress')
			};
			$scope.colorOptions = widgetStyleEditor.colorIds.map(function (id) {
				return { id: id, label: Homey.__('settings.style_color_' + id) };
			});
			$scope.foregroundOptions = widgetStyleEditor.foregroundIds.map(function (id) {
				return { id: id, label: Homey.__(id === 'default'
					? 'settings.style_foreground_automatic' : 'settings.style_color_' + id) };
			});
			$scope.elementColorOptions = widgetStyleEditor.foregroundIds.map(function (id) {
				return { id: id, label: Homey.__('settings.style_color_' + id) };
			});
			$scope.backgroundOptions = widgetStyleEditor.backgroundIds.map(function (id) {
				return { id: id, label: Homey.__('settings.style_color_' + id) };
			});
			$scope.buttonBackgroundOptions = [{ id: 'none', label: Homey.__('settings.style_color_none') }].concat($scope.colorOptions);
			$scope.borderOptions = [{ id: 'none', label: Homey.__('settings.style_color_none') }].concat($scope.foregroundOptions.filter(function (color) { return color.id !== 'default'; }));
			$scope.baseBorderOptions = [{ id: 'default', label: Homey.__('settings.style_color_default') }].concat($scope.borderOptions);
			$scope.sections = [
				{
					key: 'stopwatch',
					label: Homey.__('settings.stopwatches'),
					icon: $scope.previewIcon('stopwatch'),
					emptyActive: Homey.__('settings.no_active_stopwatches'),
					emptyConfigured: Homey.__('settings.no_stopwatches')
				},
				{
					key: 'timer',
					label: Homey.__('settings.timers'),
					icon: $scope.previewIcon('timer'),
					emptyActive: Homey.__('settings.no_active_timers'),
					emptyConfigured: Homey.__('settings.no_timers')
				},
				{
					key: 'transition',
					label: Homey.__('settings.transitions'),
					icon: $scope.previewIcon('transition'),
					emptyActive: Homey.__('settings.no_active_transitions'),
					emptyConfigured: Homey.__('settings.no_transitions')
				}
			];
			$scope.$applyAsync();

			var readyRequests = 0;
			function completeInitialLoad(error) {
				if (error) showError(error);
				readyRequests += 1;
				if (readyRequests !== ($scope.localPreview ? 6 : 5)) return;

				Homey.on('chronograph_event', function (event) {
					$scope.$applyAsync(function () {
						if (!event.data || !event.data.type) return;
						var index = $scope.chronographs.findIndex(function (chronograph) {
							return chronograph.name === event.name && chronograph.data && event.data
								&& chronograph.data.type === event.data.type;
						});
						if (event.removed) {
							if (index !== -1) $scope.chronographs.splice(index, 1);
						} else if (index !== -1) {
							Object.assign($scope.chronographs[index], event);
						} else {
							$scope.chronographs.push(event);
						}
						sortChronographs($scope.chronographs);
					});
				});

				refreshInterval = $interval(function () {
					$scope.refresh();
				}, 5000);
				durationInterval = $interval(function () {
					$scope.chronographs.forEach(function (chronograph) {
						if (chronograph.running) chronograph.duration += 100;
					});
				}, 100);
				Homey.ready();
			}

			Homey.get('roundOfDurationsFlowcards', function (error, value) {
				if (error) {
					completeInitialLoad(error);
					return;
				}
				var decimals = Number.parseInt(value, 10);
				$scope.$applyAsync(function () {
					if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 10) {
						$scope.roundOfDurationsFlowcards = decimals;
						$scope.savedDecimals = decimals;
						decimalsLoaded = true;
						$scope.decimalsAvailable = true;
					} else {
						showError(Homey.__('settings.invalid_decimals'));
					}
				});
				completeInitialLoad();
			});

			Homey.get('chronographs', function (error, value) {
				if (error) {
					completeInitialLoad(error);
					return;
				}
				$scope.$applyAsync(function () {
					setConfiguredChronographs(value);
				});
				completeInitialLoad();
			});

			Homey.get('widgetDesignerHelpExpanded', function (error, value) {
				$scope.$applyAsync(function () {
					if (error) {
						completeInitialLoad(error);
						return;
					}
					if (value !== null && value !== undefined && typeof value !== 'boolean') {
						completeInitialLoad(new Error('Invalid widget designer help preference'));
						return;
					}
					$scope.styleHelpExpanded = value !== false;
					$scope.styleHelpAvailable = true;
					completeInitialLoad();
				});
			});

			Homey.get('widgetTemplateShowPreviews', function (error, value) {
				$scope.$applyAsync(function () {
					if (error) { showError(error); return; }
					if (value !== null && value !== undefined && typeof value !== 'boolean') {
						showError(new Error('Invalid template previews preference'));
						return;
					}
					$scope.templates.showPreviews = value === true;
					$scope.templates.previewsAvailable = true;
				});
			});

			Homey.get('widgetTemplateCatalogSort', function (error, value) {
				$scope.$applyAsync(function () {
					if (error) showError(error);
					else if (value !== null && value !== undefined && !isTemplateCatalogOrder(value)) {
						showError(new Error('Invalid template catalog sort preference'));
					} else if (isTemplateCatalogOrder(value)) {
						$scope.templates.catalogOrder = value;
						$scope.templates.savedCatalogOrder = value;
					}
					$scope.templates.catalogOrderReady = true;
				});
			});

			Homey.get('widgetStyles', function (error, value) {
				$scope.$applyAsync(function () {
					if (error) {
						completeInitialLoad(error);
						return;
					}
					if (value === null || value === undefined) value = { version: 3, styles: [], themes: [] };
					if (!widgetStyleEditor.isValidCollection(value)) {
						completeInitialLoad(new Error(Homey.__('settings.style_load_error')));
						return;
					}
					$scope.widgetStyles = angular.copy(value);
					if ($scope.widgetStyles.version === 1) {
						$scope.widgetStyles.styles.forEach(function (style) {
							widgetStyleEditor.migrateColors(style);
							widgetStyleEditor.migrateStart(style);
							widgetStyleEditor.migrateForeground(style);
							widgetStyleEditor.migrateRowVisibility(style);
						});
						$scope.widgetStyles.colorSchemes = $scope.widgetStyles.styles.map(widgetStyleEditor.colorSchemeFromStyle);
						$scope.widgetStyles.styles = $scope.widgetStyles.styles.map(widgetStyleEditor.designFromStyle);
						$scope.widgetStyles.version = 2;
						migrationPending = $scope.widgetStyles.styles.length > 0;
					}
					if ($scope.widgetStyles.version === 2) {
						$scope.widgetStyles.themes = $scope.widgetStyles.colorSchemes;
						delete $scope.widgetStyles.colorSchemes;
						$scope.widgetStyles.version = 3;
					}
					$scope.widgetStyles.styles.forEach(addOptionalDurationPositions);
					savedStyles = angular.copy($scope.widgetStyles);
					$scope.widgetStyles.styles.forEach(normalizeDesignSpans);
					if (!angular.equals($scope.widgetStyles, savedStyles)) migrationPending = true;
					stylesLoaded = true;
					$scope.stylesAvailable = !$scope.localPreview || previewBuiltInsLoaded;
					$scope.editor.selectedStyleId = 'builtin:current';
					$scope.refreshLayoutElement();
					completeInitialLoad();
				});
			});

			if ($scope.localPreview) {
				Homey.get('previewBuiltIns', function (error, value) {
					$scope.$applyAsync(function () {
						if (error) {
							completeInitialLoad(error);
							return;
						}
						if (value !== null && value !== undefined) {
							if (!validPreviewBuiltIns(value)) {
								completeInitialLoad(new Error(Homey.__('settings.style_load_error')));
								return;
							}
							value.styles.forEach(function (item) {
								var design = angular.copy(item);
								addOptionalDurationPositions(design);
								if (design.reservedElements === undefined && builtInDesigns[item.id].reservedElements) {
									design.reservedElements = angular.copy(builtInDesigns[item.id].reservedElements);
								}
								['compact', 'normal', 'large'].forEach(function (size) {
									if (!design.reservedElements[size]) design.reservedElements[size] = {};
									if (design.reservedElements[size].icon === undefined) design.reservedElements[size].icon = true;
								});
								builtInDesigns[item.id] = design;
							});
							(value.version === 3 ? value.themes : value.colorSchemes).forEach(function (item) {
								builtInSchemes[item.id] = angular.copy(item);
							});
							$scope.builtInDesigns = $scope.builtInDesigns.map(function (item) { return builtInDesigns[item.id]; });
							$scope.builtInSchemes = $scope.builtInSchemes.map(function (item) { return builtInSchemes[item.id]; });
						}
						Object.keys(builtInDesigns).forEach(function (id) {
							migratePreviewRowCounts(builtInDesigns[id], sizeRuntime.builtInDesign(id));
						});
						savedPreviewBuiltIns = previewBuiltIns();
						Object.keys(builtInDesigns).forEach(function (id) {
							normalizeDesignSpans(builtInDesigns[id]);
						});
						previewBuiltInsLoaded = true;
						$scope.stylesAvailable = stylesLoaded;
						completeInitialLoad();
					});
				});
			}

			$scope.refresh(completeInitialLoad);
		};

		if (pendingHomey) $scope.initialize(pendingHomey);
	}
]).directive('styleColorSelect', function () {
	return {
		restrict: 'E',
		require: 'ngModel',
		scope: true,
		template: '<label class="hy-nostyle style-color-label" ng-attr-for="{{ colorControl.inputId }}">'
			+ '<span class="style-color-sample style-preview-light" ng-class="{ \'style-preview-dark\': editor.previewMode === \'dark\','
			+ ' \'style-preview-counter-invert\': previewCounterInvert }" aria-hidden="true">'
			+ '<span class="style-color-dot" ng-style="colorControl.swatch()"></span></span>{{ colorControl.label }}</label>'
			+ '<div class="style-color-control"><select class="form-select" ng-attr-id="{{ colorControl.inputId }}" ng-model="colorControl.choice"'
			+ ' ng-options="color.id as color.label for color in colorControl.options" ng-change="colorControl.choose()" ng-disabled="savingSettings"></select>'
			+ '<div class="style-hex-controls" ng-if="colorControl.choice === \'hex\'">'
			+ '<input class="hy-nostyle form-control" type="text" maxlength="7" spellcheck="false" ng-attr-aria-label="{{ t(\'settings.style_color_hex\') }}"'
			+ ' ng-model="colorControl.hex" ng-change="colorControl.commit()" ng-disabled="savingSettings">'
			+ '<input class="hy-nostyle form-control form-control-color" type="color" ng-attr-aria-label="{{ t(\'settings.style_color_picker\') }}"'
			+ ' ng-model="colorControl.picker" ng-change="colorControl.pick()" ng-disabled="savingSettings"></div>'
			+ '<p class="help-text" role="alert" ng-if="colorControl.invalid">{{ t(\'settings.style_hex_invalid\') }}</p></div>',
		link: function (scope, element, attrs, model) {
			var control = scope.colorControl = { hex: '#2F8DF6', picker: '#2F8DF6' };
			attrs.$observe('inputId', function (id) { control.inputId = id; });
			attrs.$observe('label', function (label) { control.label = label; });
			control.swatch = function () {
				return attrs.swatchStyle ? scope.$eval(attrs.swatchStyle)
					: { backgroundColor: control.choice === 'hex' ? model.$viewValue
						: window.ChronographWidgetStyle.valueColor(model.$viewValue) };
			};
			scope.$watchCollection(attrs.colorOptions, function (options) {
				control.options = (options || []).concat([{ id: 'hex', label: scope.t('settings.style_color_hex') }]);
			});
			model.$render = function () {
				var value = model.$viewValue;
				control.choice = window.ChronographWidgetStyle.isHexColor(value) ? 'hex' : value;
				if (control.choice === 'hex') control.hex = control.picker = value;
				control.invalid = false;
				model.$setValidity('hex', true);
			};
			control.commit = function () {
				control.invalid = !window.ChronographWidgetStyle.isHexColor(control.hex);
				model.$setValidity('hex', !control.invalid);
				if (control.invalid) return;
				control.picker = control.hex;
				model.$setViewValue(control.hex);
			};
			control.pick = function () { control.hex = control.picker; control.commit(); };
			control.choose = function () {
				if (control.choice === 'hex') {
					if (!window.ChronographWidgetStyle.isHexColor(control.hex)) control.hex = '#2F8DF6';
					control.commit();
				} else {
					control.invalid = false;
					model.$setValidity('hex', true);
					model.$setViewValue(control.choice);
				}
			};
		}
	};
}).directive('templateCatalogPreview', function () {
	return {
		restrict: 'A',
		scope: { preview: '=templateCatalogPreview', t: '=', labels: '=', previewName: '=', mode: '=?', counterInvert: '=?' },
		template: '<div class="style-preview style-preview-normal style-preview-light"'
			+ ' ng-class="{ \'style-preview-dark\': mode === \'dark\', \'style-preview-counter-invert\': counterInvert }"'
			+ ' ng-attr-data-background="{{ previewColor(\'background\') }}"'
			+ ' ng-style="templatePaddingStyle()" ng-attr-data-allow-shrink="{{ preview.design.allowShrink !== false }}">'
			+ '<div class="style-preview-outline style-preview-height" ng-style="previewBorderStyle()">'
			+ '<div class="style-preview-layer" ng-include="\'grouped-preview.html\'"></div></div></div>',
		link: function (scope) {
			var runtime = window.ChronographWidgetStyle;
			var layout;
			scope.editor = { previewSize: 'normal', previewType: 'timer', previewState: 'running' };
			scope.previewTile = { type: 'timer' };
			scope.previewScenario = { state: 'running' };
			scope.$watch('preview', function (preview) {
				layout = runtime.layoutSpanningRows(runtime.buildRows(preview.design, 'normal', 'running', 'timer', false, false, !!preview.icon));
			});
			scope.previewRowLayout = function () { return layout; };
			scope.previewTileState = function () { return 'running'; };
			scope.elementSize = function (element) { return runtime.elementSize(scope.preview.design, 'normal', element); };
			scope.previewElementLineHeight = function (element) { return runtime.elementLineHeight(scope.preview.design, 'normal', element); };
			scope.templatePaddingStyle = function () {
				return Object.assign(runtime.paddingStyle([runtime.widgetPadding(scope.preview.design, 'normal')]),
					runtime.frameStyle(runtime.borderlessFrame(scope.preview.design, 'normal')),
					previewBackgroundPaint(scope.preview.theme, 'running'));
			};
			scope.previewHexStyle = function (element) {
				return '--hex-palette: ' + runtime.valueColor(scope.previewColor(element))
					+ '; --hex-foreground: ' + runtime.valueColor(scope.previewForeground(element));
			};
			scope.progressCustomColor = function (key) {
				var value = key === 'background' ? scope.progressBackground() : scope.progressForeground();
				return runtime.isHexColor(value) ? value : undefined;
			};
			scope.previewIcon = function () { return scope.preview.icon; };
			scope.previewIconStyle = function () { return scope.preview.iconStyle; };
			scope.isButtonElement = function (element) { return ['start', 'play', 'pause', 'stop', 'cancel'].indexOf(element) !== -1; };
			scope.previewColor = function (element) { return runtime.resolveColor(scope.preview.theme, 'running', element); };
			scope.previewForeground = function (element) { return runtime.resolveForeground(scope.preview.theme, 'running', element); };
			scope.previewBorderStyle = function () { return runtime.borderStyle(scope.preview.design, scope.preview.theme, 'normal', 'running'); };
			scope.previewButtonStyle = function (element) {
				return Object.assign(runtime.elementStyle(scope.preview.theme, 'running', element),
					runtime.buttonShapeStyle(scope.preview.design, 'normal', element));
			};
			scope.buttonText = function (element) { return runtime.buttonText(scope.preview.design, 'normal', element, scope.t('settings.widget_start')); };
			scope.previewActionLabel = function (element) { return scope.labels[element]; };
			scope.progressDirection = function () {
				var settings = scope.preview.design.progressSettings;
				return settings && settings.normal && settings.normal.direction || 'left-right';
			};
			scope.progressPercent = function () {
				var settings = scope.preview.design.progressSettings;
				return settings && settings.normal && settings.normal.timerMode === 'remaining' ? 75 : 25;
			};
			['background', 'foreground'].forEach(function (key) {
				scope['progress' + key.charAt(0).toUpperCase() + key.slice(1)] = function () {
					var colors = scope.preview.theme.progressColors;
					return colors && colors.normal && colors.normal[key] || (key === 'background' ? 'grey' : 'blue');
				};
			});
		}
	};
}).directive('templateImageGestures', function () {
	return {
		restrict: 'A',
		link: function (scope, element) {
			var viewport = element[0];
			var gesture;
			var drag;
			function distance(touches) {
				return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
			}
			function midpoint(touches) {
				var bounds = viewport.getBoundingClientRect();
				return {
					x: (touches[0].clientX + touches[1].clientX) / 2 - bounds.left,
					y: (touches[0].clientY + touches[1].clientY) / 2 - bounds.top
				};
			}
			function endGesture() { gesture = null; }
			function start(event) {
				endGesture();
				if (event.touches.length !== 2) return;
				var image = viewport.querySelector('img');
				var separation = distance(event.touches);
				var width = image && image.getBoundingClientRect().width;
				if (!width || !separation) return;
				var point = midpoint(event.touches);
				gesture = {
					ids: Array.from(event.touches, function (touch) { return touch.identifier; }),
					distance: separation, zoom: scope.templates.imageZoom,
					image: image, width: width,
					x: viewport.scrollLeft + point.x, y: viewport.scrollTop + point.y
				};
				if (event.cancelable) event.preventDefault();
			}
			function move(event) {
				if (!gesture) return;
				var touches = gesture.ids.map(function (id) {
					return Array.from(event.touches).find(function (touch) { return touch.identifier === id; });
				});
				if (event.touches.length !== 2 || touches.some(function (touch) { return !touch; })) { end(); return; }
				if (event.cancelable) event.preventDefault();
				var zoom = gesture.zoom * distance(touches) / gesture.distance;
				var point = midpoint(touches);
				scope.$apply(function () { scope.zoomTemplateImage(zoom - scope.templates.imageZoom); });
				var scale = gesture.image.getBoundingClientRect().width / gesture.width;
				viewport.scrollLeft = gesture.x * scale - point.x;
				viewport.scrollTop = gesture.y * scale - point.y;
			}
			function zoomAt(target, clientX, clientY) {
				var current = scope.templates.imageZoom;
				var zoom = Math.max(1, Math.min(5, target));
				if (zoom === current) return;
				var bounds = viewport.getBoundingClientRect();
				var x = clientX - bounds.left;
				var y = clientY - bounds.top;
				var contentX = viewport.scrollLeft + x;
				var contentY = viewport.scrollTop + y;
				scope.$apply(function () { scope.zoomTemplateImage(zoom - current); });
				var scale = scope.templates.imageZoom / current;
				viewport.scrollLeft = contentX * scale - x;
				viewport.scrollTop = contentY * scale - y;
			}
			function wheel(event) {
				if (!event.ctrlKey || !event.deltaY) return;
				if (event.cancelable) event.preventDefault();
				zoomAt(scope.templates.imageZoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
			}
			function pointerDown(event) {
				if (event.pointerType !== 'mouse' || event.button !== 0 || scope.templates.imageZoom <= 1) return;
				drag = {
					id: event.pointerId,
					x: event.clientX, y: event.clientY,
					scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop
				};
				viewport.classList.add('template-image-dragging');
				if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
				if (event.cancelable) event.preventDefault();
			}
			function pointerMove(event) {
				if (!drag || drag.id !== event.pointerId) return;
				if (event.cancelable) event.preventDefault();
				viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
				viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
			}
			function pointerEnd(event) {
				if (!drag || event && drag.id !== event.pointerId) return;
				var pointerId = drag.id;
				drag = null;
				viewport.classList.remove('template-image-dragging');
				if (viewport.hasPointerCapture && viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
			}
			function end() { endGesture(); pointerEnd(); }
			viewport.addEventListener('wheel', wheel, { passive: false });
			viewport.addEventListener('touchstart', start, { passive: false });
			viewport.addEventListener('touchmove', move, { passive: false });
			viewport.addEventListener('touchend', endGesture);
			viewport.addEventListener('touchcancel', endGesture);
			viewport.addEventListener('pointerdown', pointerDown);
			viewport.addEventListener('pointermove', pointerMove);
			viewport.addEventListener('pointerup', pointerEnd);
			viewport.addEventListener('pointercancel', pointerEnd);
			viewport.addEventListener('lostpointercapture', pointerEnd);
			scope.$watch('templates.imageViewer', end);
			scope.$on('$destroy', function () {
				viewport.removeEventListener('wheel', wheel);
				viewport.removeEventListener('touchstart', start);
				viewport.removeEventListener('touchmove', move);
				viewport.removeEventListener('touchend', endGesture);
				viewport.removeEventListener('touchcancel', endGesture);
				viewport.removeEventListener('pointerdown', pointerDown);
				viewport.removeEventListener('pointermove', pointerMove);
				viewport.removeEventListener('pointerup', pointerEnd);
				viewport.removeEventListener('pointercancel', pointerEnd);
				viewport.removeEventListener('lostpointercapture', pointerEnd);
				end();
			});
		}
	};
}).directive('stickyBorder', function () {
	return {
		restrict: 'A',
		link: function (scope, element) {
			var sticky = element[0];
			var scrollContainer = sticky.closest('.settings-content');
			var settingsPage = scrollContainer.parentNode;
			var tabs = settingsPage.querySelector('.settings-tabs');
			var sentinel = document.createElement('div');
			sentinel.setAttribute('aria-hidden', 'true');
			sticky.parentNode.insertBefore(sentinel, sticky);
			var timer = null;
			function update() {
				timer = null;
				sticky.classList.toggle('is-stuck', scrollContainer.clientHeight > 0
					&& sticky.getClientRects().length > 0 && sticky.getAttribute('data-editable') === 'true'
					&& sentinel.getBoundingClientRect().top < scrollContainer.getBoundingClientRect().top - 0.5);
			}
			function schedule() {
				if (timer === null) timer = window.setTimeout(update, 0);
			}
			function updateTabHeight() {
				if (tabs.offsetHeight) settingsPage.style.setProperty('--chronograph-settings-tabs-height', tabs.offsetHeight + 'px');
				schedule();
			}
			var observer = window.ResizeObserver ? new window.ResizeObserver(updateTabHeight) : null;
			if (observer) observer.observe(tabs);
			scrollContainer.addEventListener('scroll', schedule, { passive: true });
			window.addEventListener('resize', updateTabHeight);
			scope.$watch(function () {
				return scope.activeTab + ':' + sticky.getAttribute('data-editable');
			}, function () { scope.$evalAsync(schedule); });
			updateTabHeight();
			scope.$on('$destroy', function () {
				scrollContainer.removeEventListener('scroll', schedule);
				window.removeEventListener('resize', updateTabHeight);
				if (observer) observer.disconnect();
				if (timer !== null) window.clearTimeout(timer);
				sentinel.remove();
			});
		}
	};
}).directive('iconResultsScroll', function () {
	return {
		restrict: 'A',
		link: function (scope, element) {
			function scroll() {
				var list = element[0];
				if (list.scrollTop + list.clientHeight < list.scrollHeight - 40) return;
				scope.$applyAsync(function () {
					var picker = scope.iconPickers[scope.type];
					picker.visibleCount = Math.min(picker.visibleCount + 60, picker.results.length);
				});
			}
			scope.$watch(function () { return scope.iconPickers[scope.type].results; }, function () { element[0].scrollTop = 0; });
			element.on('scroll', scroll);
			scope.$on('$destroy', function () { element.off('scroll', scroll); });
		}
	};
});
