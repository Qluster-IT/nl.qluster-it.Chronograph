'use strict';

var chronographSettingsScope;
var pendingHomey;

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
		var savedStyles = { version: 2, styles: [], colorSchemes: [] };
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
		var designerRowLayouts = new WeakMap();
		var colorOptionsCache = {};
		var startFormTimer;
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
		$scope.widgetStyles = { version: 2, styles: [], colorSchemes: [] };
		$scope.editor = {
			mode: 'design',
			selectedStyleId: '',
			selectedSchemeId: 'builtin:current',
			previewType: 'timer',
			previewSize: 'normal',
			previewState: 'running',
			previewColumns: 'single',
			editStatus: false,
			selectedCell: null,
			selectedElement: 'name',
			selectedBackground: false,
			position: {},
			selectedRow: null,
			selectedColumn: null,
			rowRule: null,
			colorValues: {},
			foregroundValues: {},
			previewValues: { time: 1, unit: 'seconds', from: null, to: null, steps: null }
		};
		$scope.layoutRows = [1, 2, 3, 4, 5];
		$scope.positionRows = [0, 1, 2, 3, 4, 5];
		$scope.layoutGroups = [1, 2, 3, 4];
		$scope.layoutOrders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
		$scope.styleElements = widgetStyleEditor.elementIds;
		$scope.stylesAvailable = false;
		$scope.decimalsAvailable = false;

		function showError(error) {
			Homey.alert(window.chronographErrorMessage(Homey, error));
		}

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
			$scope.activeTab = tab;
		};

		$scope.isDirty = function () {
			return (decimalsLoaded && $scope.roundOfDurationsFlowcards !== $scope.savedDecimals)
				|| (stylesLoaded && (migrationPending || !angular.equals($scope.widgetStyles, savedStyles)))
				|| (previewBuiltInsLoaded && !angular.equals(previewBuiltIns(), savedPreviewBuiltIns));
		};

		function previewBuiltIns() {
			return {
				version: 2,
				styles: Object.keys(builtInDesigns).map(function (id) { return widgetStyleEditor.designFromStyle(builtInDesigns[id]); }),
				colorSchemes: Object.keys(builtInSchemes).map(function (id) { return angular.copy(builtInSchemes[id]); })
			};
		}

		function validPreviewBuiltIns(value) {
			if (!value || value.version !== 2 || !widgetStyleEditor.isValidCollection(value)) return false;
			return value.styles.every(function (item) { return Object.prototype.hasOwnProperty.call(builtInDesigns, item.id); })
				&& value.colorSchemes.every(function (item) { return Object.prototype.hasOwnProperty.call(builtInSchemes, item.id); });
		}

		function normalizeDesignSpans(style) {
			if (!style || !style.groups) return;
			['compact', 'normal', 'large'].forEach(function (size) {
				widgetStyleEditor.normalizeColumnSpans(style, size);
			});
		}

		$scope.getSelectedStyle = function () {
			if (Object.prototype.hasOwnProperty.call(builtInDesigns, $scope.editor.selectedStyleId)) return builtInDesigns[$scope.editor.selectedStyleId];
			var id = $scope.editor.selectedStyleId.slice(7);
			if ($scope.editor.selectedStyleId.indexOf('custom:') !== 0) return undefined;
			return $scope.widgetStyles.styles.find(function (style) { return style.id === id; });
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

		$scope.getSelectedScheme = function () {
			if (Object.prototype.hasOwnProperty.call(builtInSchemes, $scope.editor.selectedSchemeId)) return builtInSchemes[$scope.editor.selectedSchemeId];
			if ($scope.editor.selectedSchemeId.indexOf('custom:') !== 0) return undefined;
			var id = $scope.editor.selectedSchemeId.slice(7);
			return ($scope.widgetStyles.colorSchemes || []).find(function (scheme) { return scheme.id === id; });
		};
		$scope.getEditingItem = function () {
			return $scope.editor.mode === 'color' ? $scope.getSelectedScheme() : $scope.getSelectedStyle();
		};
		$scope.selectEditorMode = function (mode) {
			if (mode !== 'design' && mode !== 'color') return;
			if ($scope.editor.rowPaddingForm && $scope.editor.rowPaddingForm.$invalid) { Homey.alert(Homey.__('settings.style_row_padding_invalid')); return; }
			if ($scope.editor.elementSizeForm && $scope.editor.elementSizeForm.$invalid) { Homey.alert(Homey.__('settings.style_size_invalid')); return; }
			if ($scope.editor.invalidRowRule) { Homey.alert(Homey.__('settings.style_row_invalid')); return; }
			if (!$scope.getSelectedStyle()) $scope.editor.selectedStyleId = 'builtin:current';
			$scope.editor.mode = mode;
			$scope.editor.selectedRow = null;
			$scope.editor.selectedColumn = null;
			$scope.editor.selectedCell = null;
			$scope.editor.rowRule = null;
			if (mode === 'color' && !$scope.editor.selectedBackground && !$scope.editor.selectedElement) {
				$scope.editor.selectedElement = 'name';
			}
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
		var sizeDraft;
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
		$scope.previewFieldLayout = function () {
			return sizeRuntime.inputFieldLayout($scope.getSelectedStyle(), $scope.editor.previewSize, $scope.editor.previewType);
		};
		$scope.allowDesignShrink = function (value) {
			var style = $scope.getSelectedStyle();
			if (arguments.length && style && !$scope.savingSettings && !$scope.isDesignReadOnly()) style.allowShrink = value;
			return !style || style.allowShrink !== false;
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
		$scope.progressPercent = function (state) {
			var elapsed = state === 'running' || state === 'paused' ? 25 : 0;
			return $scope.editor.previewType === 'timer' && $scope.progressSetting('timerMode') === 'remaining' ? 100 - elapsed : elapsed;
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

		$scope.$watchGroup(['editor.selectedSchemeId', 'editor.previewState'], function () {
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
		});

		$scope.previewColor = function (key, inheritedOnly) {
			var style = $scope.getSelectedScheme();
			return style ? widgetStyleEditor.resolveColor(style, $scope.editor.previewState, key, inheritedOnly) : undefined;
		};

		$scope.updateColorOverride = function (key) {
			var style = $scope.getSelectedScheme();
			if (!style || $scope.savingSettings || $scope.isSchemeReadOnly()) return;
			var state = $scope.editor.previewState;
			var value = $scope.editor.colorValues[key];
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

		$scope.stateColorOptions = function (key) {
			var inherited = $scope.previewColor(key, true);
			var options = key === 'background' ? $scope.backgroundOptions : $scope.colorOptions;
			var cached = colorOptionsCache[key];
			if (cached && cached.inherited === inherited && cached.options === options) return cached.values;
			var values = [{
				id: 'inherit',
				label: Homey.__('settings.style_color_inherit') + ' (' + Homey.__('settings.style_color_' + inherited) + ')'
			}].concat(options);
			colorOptionsCache[key] = { inherited: inherited, options: options, values: values };
			return values;
		};

		$scope.previewForeground = function (key, inheritedOnly) {
			var style = $scope.getSelectedScheme();
			return style ? widgetStyleEditor.resolveForeground(style, $scope.editor.previewState, key, inheritedOnly) : 'default';
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
				label: Homey.__('settings.style_color_inherit') + ' (' + Homey.__(inherited === 'default'
					? ($scope.isButtonElement(key) ? 'settings.style_foreground_automatic' : 'settings.style_color_default')
					: 'settings.style_color_' + inherited) + ')'
			}].concat(options);
			colorOptionsCache[cacheKey] = { inherited: inherited, options: options, values: values };
			return values;
		};

		$scope.createStyle = function (copy) {
			if (!stylesLoaded || $scope.savingSettings) return;
			var colorMode = $scope.editor.mode === 'color';
			var items = colorMode ? $scope.widgetStyles.colorSchemes : $scope.widgetStyles.styles;
			var source = $scope.getEditingItem();
			if (copy && !source) return;
			var prefix = copy ? source.name + ' - ' + $scope.labels.copy
				: colorMode ? Homey.__('settings.style_new_scheme') : $scope.labels.newStyle;
			var name = prefix;
			var number = 2;
			while (items.some(function (style) { return style.name === name; })) {
				name = prefix + ' ' + number++;
			}
			var id = widgetStyleEditor.newId(items);
			var style = copy ? angular.copy(source) : colorMode
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
		};

		$scope.deleteStyle = function () {
			var colorMode = $scope.editor.mode === 'color';
			var collectionKey = colorMode ? 'colorSchemes' : 'styles';
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
							$scope.editor[selectionKey] = 'builtin:current';
							$scope.editor.selectedCell = null;
							$scope.editor.invalidRowRule = false;
							$scope.refreshLayoutElement();
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
			if (!style || !style.groups || !$scope.editor.selectedElement || $scope.savingSettings
				|| $scope.positionRows.indexOf(value.row) === -1
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
			if ($scope.savingSettings
				|| $scope.styleElements.indexOf(element) === -1
				|| $scope.positionRows.indexOf(row) === -1 || $scope.layoutGroups.indexOf(group) === -1
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
			if (!style || !style.groups || $scope.savingSettings || !canChangeSelection()
				|| $scope.layoutRows.indexOf(source) === -1 || $scope.layoutRows.indexOf(target) === -1 || source === target) return;
			widgetStyleEditor.moveRow(style, $scope.editor.previewSize, source, target);
			$scope.selectVisibilityRow(target);
			$scope.resetRowPreview();
		};

		$scope.moveDesignerColumn = function (row, source, target) {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups || $scope.savingSettings || !canChangeSelection()
				|| $scope.layoutRows.indexOf(row) === -1 || !Number.isInteger(source) || !Number.isInteger(target)
				|| source < 1 || target < 1 || source > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)
				|| target > widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row) || source === target) return;
			widgetStyleEditor.moveColumn(style, $scope.editor.previewSize, row, source, target);
			$scope.selectColumn(row, target);
			$scope.resetRowPreview();
		};

		$scope.reorderDesigner = function (type, source, target) {
			if (type === 'row' && /^[1-5]$/.test(source) && /^[1-5]$/.test(target)) {
				$scope.moveDesignerRow(Number(source), Number(target));
			} else if (type === 'column' && /^[1-5]:[1-4]$/.test(source) && /^[1-5]:[1-4]$/.test(target)) {
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
			return groupedRowsCache.editor ? groupedRowsCache.editor.unused : [];
		};

		$scope.designerRowLayout = function () {
			var rows = $scope.groupedRows(false);
			var cached = designerRowLayouts.get(rows);
			if (cached) return cached;
			var editorRows = rows.map(function (row) {
				return Object.assign({}, row, {
					alignment: 'top',
					groups: row.groups.map(function (group) {
						return Object.assign({}, group, { elements: group.elements.length ? group.elements : [''] });
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

		$scope.previewRowLayout = function (scenario) {
			return sizeRuntime.layoutSpanningRows($scope.groupedRows(true, scenario));
		};

		$scope.groupedRows = function (preview, scenario) {
			var style = $scope.getSelectedStyle();
			if (!style || !style.groups) return [];
			var state = scenario ? scenario.state : $scope.editor.previewState;
			var cacheKey = scenario ? 'measure:' + scenario.id : preview ? 'preview' : 'editor';
			var fingerprint = angular.toJson([
				style.id, style.groups[$scope.editor.previewSize], $scope.editor.previewSize,
				state, $scope.editor.previewType, $scope.editor.editStatus,
				style.rowVisibility, style.rowColumns, style.rowAlignments, style.rowTopPadding, style.columnSpans, style.columnRowSpans, style.columnAlignments, style.columnVerticalAlignments, style.columnDirections, style.columnWidths,
				$scope.getStartFieldsVisibility()
			]);
			if (groupedRowsCache[cacheKey] && groupedRowsCache[cacheKey].fingerprint === fingerprint) {
				return groupedRowsCache[cacheKey].rows;
			}
			var layout = $scope.editor.editStatus
				? widgetStyleEditor.resolvedGroups(style, $scope.editor.previewSize, state)
				: style.groups[$scope.editor.previewSize].elements;
			var rows = $scope.layoutRows.map(function (row) {
				var spans = widgetStyleEditor.columnSpans(style, $scope.editor.previewSize, row);
				var alignments = widgetStyleEditor.columnAlignments(style, $scope.editor.previewSize, row);
				var verticalAlignments = widgetStyleEditor.columnVerticalAlignments(style, $scope.editor.previewSize, row);
				var directions = widgetStyleEditor.columnDirections(style, $scope.editor.previewSize, row);
				var widths = widgetStyleEditor.columnWidths(style, $scope.editor.previewSize, row);
				var rowSpans = widgetStyleEditor.columnRowSpans(style, $scope.editor.previewSize, row);
				return {
					id: row,
					alignment: widgetStyleEditor.rowAlignment(style, $scope.editor.previewSize, row),
					topPadding: widgetStyleEditor.rowTopPadding(style, $scope.editor.previewSize, row),
					tracks: spans.map(function (span, index) {
						return widths[index] === 'content' ? 'minmax(0, max-content)' : 'minmax(0, ' + span + 'fr)';
					}).join(' '),
					groups: $scope.layoutGroups.slice(0, widgetStyleEditor.rowColumns(style, $scope.editor.previewSize, row)).map(function (group) {
						var elements = $scope.styleElements.filter(function (id) {
							return layout[id].row === row && layout[id].group === group
								&& (!preview || (!(scenario && scenario.excludeFields && id === 'fields') && $scope.previewVisible(id, state)));
						}).sort(function (a, b) { return layout[a].order - layout[b].order || $scope.styleElements.indexOf(a) - $scope.styleElements.indexOf(b); });
						return { id: group, span: spans[group - 1], rowSpan: rowSpans[group - 1], alignment: alignments[group - 1], verticalAlignment: verticalAlignments[group - 1], direction: directions[group - 1], width: widths[group - 1], elements: elements };
					})
				};
			}).filter(function (row) {
				return !preview || ($scope.isRowVisible(row.id, scenario) && row.groups.some(function (group) { return group.elements.length; }));
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
			if (!style || $scope.savingSettings || !Number.isInteger(source) || !Number.isInteger(target)
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

		$scope.getPreviewCells = function (scenario) {
			var style = $scope.getSelectedStyle();
			if (scenario && style && $scope.editor.editStatus) {
				return widgetStyleEditor.resolveLayout(style, $scope.editor.previewSize, scenario.state);
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
			if ($scope.editor.selectedCell === null) {
				if ($scope.getStyleCells()[index]) {
					$scope.selectLayoutElement($scope.getStyleCells()[index]);
					if ($scope.editor.selectedElement === $scope.getStyleCells()[index]) $scope.editor.selectedCell = index;
				}
			} else if ($scope.editor.selectedCell === index) {
				$scope.editor.selectedCell = null;
				$scope.editor.selectedElement = null;
			} else {
				$scope.moveStyleElement($scope.editor.selectedCell, index);
			}
		};

		$scope.previewVisible = function (element, previewState) {
			var state = previewState || $scope.editor.previewState;
			if (element === 'progress') return $scope.editor.previewType !== 'stopwatch';
			if (element === 'cancel') return state === 'starting';
			if (element === 'fields') return (state === 'starting'
				|| (state === 'inactive' && ($scope.hasFieldsRowRule(state) || $scope.showStartFieldsWhenInactive())))
				&& $scope.editor.previewType !== 'stopwatch';
			if (element === 'start' || element === 'play') {
				var style = $scope.getSelectedStyle();
				if (element === 'play' && (!style || !style.groups)) return state !== 'running';
				var startButton = state === 'starting'
					|| (state === 'inactive' && ($scope.editor.previewType === 'stopwatch'
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
			if ($scope.editor.previewState !== 'starting' || $scope.editor.previewType === 'stopwatch') return;
			var durations = $scope.groupedRows(true).map(function (row) {
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
			if ($scope.layoutRows.indexOf(row) === -1 || !canChangeSelection()) return;
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
			if (!style || !style.groups || !canChangeSelection() || $scope.layoutRows.indexOf(row) === -1
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
			return $scope.layoutRows.slice(0, 6 - selected.row).filter(function (height) {
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
				|| $scope.availableRowColumns().indexOf(count) === -1 || $scope.layoutRows.indexOf($scope.editor.selectedRow) === -1) return;
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
				|| $scope.layoutRows.indexOf($scope.editor.selectedRow) === -1
				|| ['top', 'middle', 'bottom'].indexOf($scope.editor.rowAlignment) === -1) return;
			widgetStyleEditor.setRowAlignment(style, $scope.editor.previewSize, $scope.editor.selectedRow, $scope.editor.rowAlignment);
		};

		$scope.updateRowTopPadding = function () {
			var style = $scope.getSelectedStyle();
			var padding = $scope.editor.rowTopPadding;
			if (!style || !style.groups || $scope.savingSettings || $scope.layoutRows.indexOf($scope.editor.selectedRow) === -1
				|| !Number.isInteger(padding) || padding < 0 || padding > 100) return;
			widgetStyleEditor.setRowTopPadding(style, $scope.editor.previewSize, $scope.editor.selectedRow, padding);
		};

		$scope.availablePositionGroups = function () {
			var style = $scope.getSelectedStyle();
			var row = $scope.editor.position.row;
			return style && style.groups && $scope.layoutRows.indexOf(row) !== -1
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

		$scope.previewAction = function (action) {
			var state = $scope.editor.previewState;
			if (action === 'start') {
				state = 'running';
			} else if (action === 'play') {
				if (state === 'inactive' && (!$scope.showStartFieldsWhenInactive() || ($scope.hasFieldsRowRule()
					&& !$scope.isRowVisible(($scope.editor.editStatus
						? widgetStyleEditor.resolvedGroups($scope.getSelectedStyle(), $scope.editor.previewSize, state)
						: $scope.getSelectedStyle().groups[$scope.editor.previewSize].elements).fields.row)))
					&& $scope.editor.previewType !== 'stopwatch') {
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

		$scope.previewIcon = function () {
			return { stopwatch: 'fa-stopwatch', timer: 'fa-clock', transition: 'fa-shuffle' }[$scope.editor.previewType];
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
			if ($scope.savingSettings || !$scope.isDirty()) return;
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
			var decimals = $scope.roundOfDurationsFlowcards;
			var decimalsChanged = decimalsLoaded && decimals !== $scope.savedDecimals;
			var stylesChanged = stylesLoaded && (migrationPending || !angular.equals($scope.widgetStyles, savedStyles));
			var previewChanges = previewBuiltInsLoaded && !angular.equals(previewBuiltIns(), savedPreviewBuiltIns);
			if (decimalsChanged && (!Number.isInteger(decimals) || decimals < 0 || decimals > 10)) {
				Homey.alert(Homey.__('settings.invalid_decimals'));
				return;
			}
			if (stylesChanged && !widgetStyleEditor.isValidCollection($scope.widgetStyles)) {
				Homey.alert($scope.labels.invalidStyle);
				return;
			}
			var previewToSave = previewChanges ? previewBuiltIns() : null;
			if (previewChanges && !validPreviewBuiltIns(previewToSave)) {
				Homey.alert($scope.labels.invalidStyle);
				return;
			}
			var stylesToSave = angular.copy($scope.widgetStyles);
			var writes = [];
			if (decimalsChanged) writes.push({ key: 'roundOfDurationsFlowcards', value: decimals });
			if (stylesChanged) writes.push({ key: 'widgetStyles', value: stylesToSave });
			if (previewChanges) writes.push({ key: 'previewBuiltIns', value: previewToSave });
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
		};

		$scope.$on('$destroy', function () {
			if (refreshInterval) $interval.cancel(refreshInterval);
			if (durationInterval) $interval.cancel(durationInterval);
			if (startFormTimer) $timeout.cancel(startFormTimer);
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
			$scope.sections = [
				{
					key: 'stopwatch',
					label: Homey.__('settings.stopwatches'),
					icon: 'fa-stopwatch',
					emptyActive: Homey.__('settings.no_active_stopwatches'),
					emptyConfigured: Homey.__('settings.no_stopwatches')
				},
				{
					key: 'timer',
					label: Homey.__('settings.timers'),
					icon: 'fa-hourglass-half',
					emptyActive: Homey.__('settings.no_active_timers'),
					emptyConfigured: Homey.__('settings.no_timers')
				},
				{
					key: 'transition',
					label: Homey.__('settings.transitions'),
					icon: 'fa-right-left',
					emptyActive: Homey.__('settings.no_active_transitions'),
					emptyConfigured: Homey.__('settings.no_transitions')
				}
			];
			$scope.$applyAsync();

			var readyRequests = 0;
			function completeInitialLoad(error) {
				if (error) showError(error);
				readyRequests += 1;
				if (readyRequests !== ($scope.localPreview ? 5 : 4)) return;

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

			Homey.get('widgetStyles', function (error, value) {
				$scope.$applyAsync(function () {
					if (error) {
						completeInitialLoad(error);
						return;
					}
					if (value === null || value === undefined) value = { version: 2, styles: [], colorSchemes: [] };
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
								builtInDesigns[item.id] = angular.copy(item);
							});
							value.colorSchemes.forEach(function (item) {
								builtInSchemes[item.id] = angular.copy(item);
							});
							$scope.builtInDesigns = $scope.builtInDesigns.map(function (item) { return builtInDesigns[item.id]; });
							$scope.builtInSchemes = $scope.builtInSchemes.map(function (item) { return builtInSchemes[item.id]; });
						}
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
]);
