'use strict';

function onHomeyReady(Homey) {
	var widgetStylesRequest;
	function loadWidgetStyles() {
		if (!widgetStylesRequest) {
			widgetStylesRequest = Homey.api('GET', '/widget-styles', {}).catch(function (error) {
				widgetStylesRequest = null;
				throw error;
			});
		}
		return widgetStylesRequest;
	}

	angular.module('chronographWidget').controller('ChronographWidgetController', [
		'$scope',
		'$interval',
		'$timeout',
		'$element',
		function ($scope, $interval, $timeout, $element) {
		var refreshInterval;
		var durationInterval;
		var startFormTimeout;
			var resizeObserver;
			var destroyed = false;
			var widgetReady = false;
			var lastHeight = 0;
			var refreshVersion = 0;
			var expectedRealtime = null;
			var deferredRealtime = false;
			var startupChronograph = null;
			var multipleEntry = $scope.widgetEntry;
			var settings = multipleEntry ? multipleEntry.settings : Homey.getSettings() || {};
		var widgetStyleRuntime = window.ChronographWidgetStyle;
		var designStyleId = widgetStyleRuntime.settingId(settings.designStyle) || 'builtin:current';
		var colorSchemeId = widgetStyleRuntime.settingId(
			Object.prototype.hasOwnProperty.call(settings, 'colorTheme') ? settings.colorTheme : settings.colorScheme
		) || 'builtin:current';
		var activeDesign;
		var activeColorScheme;
		var activeDesignScheme = widgetStyleRuntime.currentScheme();
		var styleError = null;
		var appearanceRequest;
		var layoutDesign;
		var layoutSize;
		var layoutHasIcon;
		var designLayouts = {};
		var designLayers = {};
		var fieldLayout;
		var fieldLayoutDesign;
		var fieldLayoutSize;
		var presentationDesign;
		var presentationScheme;
		var presentationSize;
		var presentationStartLabel;
		var presentations = {};
		var markerSteps = 0;
		var progressMarkers = [];
		var widgetType = multipleEntry ? multipleEntry.type : document.body.getAttribute('data-chronograph-type');
			$scope.widgetInputPrefix = multipleEntry ? 'chronograph-' + multipleEntry.slot + '-' : '';
			function applyIcon() {
				var selectedIcon = settings.icon;
				if (selectedIcon == null && activeDesign && activeDesign.defaultIcons && activeDesign.defaultIcons[widgetType]) {
					selectedIcon = { id: activeDesign.defaultIcons[widgetType] };
				}
				$scope.iconClass = '';
				$scope.iconImage = '';
				if (selectedIcon && typeof selectedIcon === 'object') {
					var iconId = typeof selectedIcon.id === 'string'
						? /^(fas|far|fab):([a-z0-9-]+)$/.exec(selectedIcon.id)
						: null;
					if (selectedIcon.id === 'chronograph:transition') {
						$scope.iconClass = 'fa-solid fa-chronograph-transition';
					} else if (selectedIcon.id !== 'none' && typeof selectedIcon.image === 'string'
						&& (selectedIcon.image.indexOf('data:image/svg+xml;base64,') === 0
							|| selectedIcon.image.indexOf('data:image/png;base64,') === 0)) {
						$scope.iconImage = selectedIcon.image;
					} else if (iconId) {
						var iconStyles = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' };
						$scope.iconClass = iconStyles[iconId[1]] + ' fa-' + iconId[2];
					}
				} else {
					var legacyIcon = typeof selectedIcon === 'string' ? selectedIcon : widgetStyleRuntime.defaultIcon(widgetType);
					if (legacyIcon && legacyIcon !== 'none' && /^[a-z0-9-]+$/.test(legacyIcon)) {
						$scope.iconClass = 'fa-solid fa-' + legacyIcon;
					}
				}
			}
			applyIcon();
			var isTimer = widgetType === 'timer';
			var isTransition = widgetType === 'transition';
			var isStopwatch = widgetType === 'stopwatch';
			var chronographCollectionPaths = {
				timer: 'timers',
				transition: 'transitions',
				stopwatch: 'stopwatches'
			};
			var selectedSetting = settings.chronograph;
			var selectedName = selectedSetting && (selectedSetting.chronographName || (selectedSetting.data && selectedSetting.data.name) || selectedSetting.name);
			$scope.alternativeName = typeof settings.alternativeName === 'string' ? settings.alternativeName.trim() : '';
			$scope.layout = settings.layout === 'compact' || settings.layout === 'large' ? settings.layout : 'normal';
			var buttonColors = [
				'blue', 'red', 'orange', 'yellow', 'green', 'purple',
				'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'
			];
			var legacyIconColor = buttonColors.indexOf(settings.iconColor) !== -1 ? settings.iconColor : 'blue';
			var legacyRunningColor = settings.runningColor === 'none' || buttonColors.indexOf(settings.runningColor) !== -1
				? settings.runningColor : 'none';
			var legacyInactiveColor = settings.inactiveColor === 'none' || buttonColors.indexOf(settings.inactiveColor) !== -1
				? settings.inactiveColor : 'none';
			var legacyPausedColor = settings.pausedColor === 'none' || buttonColors.indexOf(settings.pausedColor) !== -1
				? settings.pausedColor : 'none';
			var legacyPlayColor = buttonColors.indexOf(settings.playColor) !== -1 ? settings.playColor : 'blue';
			var legacyPauseColor = buttonColors.indexOf(settings.pauseColor) !== -1 ? settings.pauseColor : 'blue';
			var legacyStopColor = buttonColors.indexOf(settings.stopColor) !== -1 ? settings.stopColor : 'red';
			$scope.iconColor = buttonColors.indexOf(settings.iconColor) !== -1 ? settings.iconColor : 'blue';
			$scope.iconMask = $scope.iconColor !== 'blue' && /^data:image\/(?:svg\+xml|png);base64,[a-z0-9+/=]+$/i.test($scope.iconImage)
				? 'url("' + $scope.iconImage + '")'
				: '';
			$scope.runningColor = settings.runningColor === 'none' || buttonColors.indexOf(settings.runningColor) !== -1
				? settings.runningColor
				: 'none';
			$scope.inactiveColor = settings.inactiveColor === 'none' || buttonColors.indexOf(settings.inactiveColor) !== -1
				? settings.inactiveColor
				: 'none';
			$scope.pausedColor = settings.pausedColor === 'none' || buttonColors.indexOf(settings.pausedColor) !== -1
				? settings.pausedColor
				: 'none';
			$scope.getWidgetColor = function () {
				var chronograph = $scope.selectedChronograph;
				if (!chronograph || !chronograph.active) return $scope.inactiveColor;
				return chronograph.running ? $scope.runningColor : $scope.pausedColor;
			};
			$scope.playColor = legacyPlayColor;
			$scope.pauseColor = legacyPauseColor;
			$scope.stopColor = legacyStopColor;
			$scope.showMilliseconds = settings.showMilliseconds === true;
			$scope.reverseTime = !isStopwatch && settings.reverseTime === true;

			function applyColorScheme(scheme) {
				activeColorScheme = scheme || null;
				activeDesignScheme = scheme || widgetStyleRuntime.currentScheme();
				if (!activeColorScheme) {
					$scope.iconColor = legacyIconColor;
					$scope.runningColor = legacyRunningColor;
					$scope.inactiveColor = legacyInactiveColor;
					$scope.pausedColor = legacyPausedColor;
					$scope.playColor = legacyPlayColor;
					$scope.pauseColor = legacyPauseColor;
					$scope.stopColor = legacyStopColor;
				} else {
					$scope.iconColor = widgetStyleRuntime.buttonColor(scheme, 'inactive', 'icon');
					$scope.runningColor = widgetStyleRuntime.resolveColor(scheme, 'running', 'background');
					$scope.inactiveColor = widgetStyleRuntime.resolveColor(scheme, 'inactive', 'background');
					$scope.pausedColor = widgetStyleRuntime.resolveColor(scheme, 'paused', 'background');
					if ($scope.runningColor === 'default') $scope.runningColor = 'none';
					if ($scope.inactiveColor === 'default') $scope.inactiveColor = 'none';
					if ($scope.pausedColor === 'default') $scope.pausedColor = 'none';
					$scope.playColor = widgetStyleRuntime.buttonColor(scheme, 'paused', 'play');
					$scope.pauseColor = widgetStyleRuntime.buttonColor(scheme, 'running', 'pause');
					$scope.stopColor = widgetStyleRuntime.buttonColor(scheme, 'running', 'stop');
				}
				$scope.iconMask = $scope.iconColor !== 'blue' && /^data:image\/(?:svg\+xml|png);base64,[a-z0-9+/=]+$/i.test($scope.iconImage)
					? 'url("' + $scope.iconImage + '")'
					: '';
			}

			$scope.labels = {
				selectChronograph: Homey.__('settings.widget_select_chronograph'),
				running: Homey.__('settings.widget_running'),
				paused: Homey.__('settings.widget_paused'),
				notRunning: Homey.__('settings.widget_not_running'),
				duration: Homey.__('settings.widget_duration'),
				remaining: Homey.__('settings.widget_remaining'),
				elapsed: Homey.__('settings.widget_elapsed'),
				total: Homey.__('settings.widget_total'),
				unit: Homey.__('settings.widget_unit'),
				from: Homey.__('settings.widget_from'),
				to: Homey.__('settings.widget_to'),
				steps: Homey.__('settings.widget_steps'),
				start: Homey.__('settings.widget_start'),
				cancel: Homey.__('settings.widget_cancel'),
				pause: Homey.__('settings.pause'),
				resume: Homey.__('settings.resume'),
				stop: Homey.__('settings.stop')
			};
			$scope.units = [
				{ id: 'milliseconds', label: Homey.__('settings.milliseconds') },
				{ id: 'seconds', label: Homey.__('settings.seconds') },
				{ id: 'minutes', label: Homey.__('settings.minutes') },
				{ id: 'hours', label: Homey.__('settings.hours') },
				{ id: 'days', label: Homey.__('settings.days') }
			];
			$scope.startValues = {};
			var widgetDefaults = {};
			if (!isStopwatch) {
				var configuredDuration = Number(String(settings.defaultDuration).replace(',', '.'));
				widgetDefaults.time = settings.defaultDuration !== undefined
					&& settings.defaultDuration !== null
					&& settings.defaultDuration !== ''
					&& configuredDuration !== 0;
				$scope.startValues.time = widgetDefaults.time
					? configuredDuration
					: null;
				var defaultUnit = settings.defaultDurationUnit;
				widgetDefaults.unit = widgetDefaults.time && !!defaultUnit && defaultUnit !== 'auto';
				$scope.startValues.unit = widgetDefaults.unit ? defaultUnit : 'minutes';
			}
			if (isTransition) {
				['from', 'to', 'steps'].forEach(function (key) {
					var value = settings['defaultTransition' + key.charAt(0).toUpperCase() + key.slice(1)];
					widgetDefaults[key] = value !== undefined && value !== null && value !== '' && Number(value) !== 0;
					$scope.startValues[key] = widgetDefaults[key] ? Number(value) : null;
				});
			}
			var lastSavedValues = null;
			$scope.selectedChronograph = null;
			$scope.showStartForm = false;
			$scope.loading = true;
			$scope.busy = false;
			$scope.error = null;
			$scope.clock = Date.now();
			$scope.isStopwatch = isStopwatch;
			$scope.isTransition = isTransition;
			$scope.widgetType = widgetType;
			$scope.designEnabled = false;
			$scope.designRows = [];
			$scope.designLayers = [];
			$scope.designState = 'inactive';
			$scope.designScheme = activeDesignScheme;

			function hasDesignStartForm() {
				if (!activeDesign || isStopwatch || ($scope.selectedChronograph && $scope.selectedChronograph.active)) return false;
				if ($scope.layout === 'compact') return $scope.showStartForm;
				var visibility = activeDesign.startFieldsVisibility && activeDesign.startFieldsVisibility[$scope.layout];
				return visibility ? visibility === 'inactive' : true;
			}

			function updateDesignRows() {
				if (!activeDesign) {
					$scope.designRows = [];
					$scope.designLayers = [];
					$scope.designEnabled = false;
					return;
				}
				var hasIcon = !!($scope.iconClass || $scope.iconImage);
				if (layoutDesign !== activeDesign || layoutSize !== $scope.layout || layoutHasIcon !== hasIcon) {
					layoutDesign = activeDesign;
					layoutSize = $scope.layout;
					layoutHasIcon = hasIcon;
					designLayouts = {};
					designLayers = {};
				}
				function getLayout(state, showForm, omitInputs) {
					var key = state + ':' + showForm + ':' + omitInputs;
					if (!designLayouts[key]) {
						var rows = widgetStyleRuntime.buildRows(activeDesign, $scope.layout, state, widgetType, showForm, omitInputs, hasIcon);
						var layout = widgetStyleRuntime.layoutSpanningRows(rows);
						designLayouts[key] = {
							rows: rows,
							layer: { state: state, rows: layout.rows, spanning: layout.spanning, tracks: layout.tracks, rowTracks: layout.rowTracks },
							signature: state + ':' + JSON.stringify(layout)
						};
					}
					return designLayouts[key];
				}
				var chronograph = $scope.selectedChronograph;
				var showStartForm = hasDesignStartForm();
				var state = chronograph && chronograph.active
					? chronograph.running ? 'running' : 'paused'
					: showStartForm ? 'starting' : 'inactive';
				$scope.designState = state;
				$scope.designScheme = activeDesignScheme;
				var current = getLayout(state, showStartForm, false);
				$scope.designRows = current.rows;
				$scope.designEnabled = $scope.designRows.length > 0;
				var key = state + ':' + showStartForm;
				if (designLayers[key]) {
					$scope.designLayers = designLayers[key];
					return;
				}
				var layers = [Object.assign({ id: 'current', measure: false }, current.layer)];
				var seen = {};
				seen[current.signature] = true;
				var mode = activeDesign.heightModes && activeDesign.heightModes[$scope.layout] || 'auto';
				if (mode === 'minimum' || mode === 'minimum-without-inputs') {
					var states = mode === 'minimum'
						? ['inactive', 'paused', 'running', 'starting'] : ['inactive', 'paused', 'running'];
					states.forEach(function (scenario) {
						var showForm = scenario === 'starting'
							|| (scenario === 'inactive' && !isStopwatch && $scope.layout !== 'compact'
								&& (!activeDesign.startFieldsVisibility || activeDesign.startFieldsVisibility[$scope.layout] === 'inactive'));
						var scenarioState = scenario === 'inactive' && showForm ? 'starting' : scenario;
						var scenarioLayout = getLayout(scenarioState, showForm, mode === 'minimum-without-inputs');
						if (seen[scenarioLayout.signature]) return;
						seen[scenarioLayout.signature] = true;
						layers.push(Object.assign({ id: scenario, measure: true }, scenarioLayout.layer));
					});
				}
				designLayers[key] = layers;
				$scope.designLayers = layers;
			}

			function presentationFor(state) {
				if (presentationDesign !== activeDesign || presentationScheme !== activeDesignScheme
					|| presentationSize !== $scope.layout || presentationStartLabel !== $scope.labels.start) {
					presentationDesign = activeDesign;
					presentationScheme = activeDesignScheme;
					presentationSize = $scope.layout;
					presentationStartLabel = $scope.labels.start;
					presentations = {};
				}
				if (!presentations[state]) {
					var progress = activeDesign && activeDesign.progressSettings && activeDesign.progressSettings[$scope.layout];
					var colors = activeDesignScheme.progressColors && activeDesignScheme.progressColors[$scope.layout];
					presentations[state] = {
						elements: {}, buttons: {}, sizes: {}, texts: {}, colors: {}, legacy: {}, markers: {},
						background: widgetStyleRuntime.backgroundStyle(activeDesignScheme, state),
						progressDirection: progress && progress.direction || 'left-right',
						progressBackground: widgetStyleRuntime.valueColor(colors && colors.background || 'grey'),
						progressForeground: widgetStyleRuntime.valueColor(colors && colors.foreground || 'blue')
					};
				}
				return presentations[state];
			}

			$scope.designElementStyle = function (element) {
				var cache = presentationFor($scope.designState).elements;
				if (!cache[element]) {
					cache[element] = ['play', 'pause', 'stop', 'cancel', 'start'].indexOf(element) !== -1
						? {} : widgetStyleRuntime.elementStyle(activeDesignScheme, $scope.designState, element);
				}
				return cache[element];
			};
			$scope.designElementSize = function (element) {
				var cache = presentationFor($scope.designState).sizes;
				if (cache[element] === undefined) cache[element] = widgetStyleRuntime.elementSize(activeDesign, $scope.layout, element);
				return cache[element];
			};
			$scope.designButtonText = function (element) {
				var cache = presentationFor($scope.designState).texts;
				if (cache[element] === undefined) cache[element] = widgetStyleRuntime.buttonText(activeDesign, $scope.layout, element, $scope.labels.start);
				return cache[element];
			};
			$scope.designFieldLayout = function () {
				if (!fieldLayout || fieldLayoutDesign !== activeDesign || fieldLayoutSize !== $scope.layout) {
					fieldLayoutDesign = activeDesign;
					fieldLayoutSize = $scope.layout;
					fieldLayout = widgetStyleRuntime.inputFieldLayout(activeDesign, $scope.layout, widgetType);
				}
				return fieldLayout;
			};
			$scope.designAllowShrink = function () {
				return !activeDesign || activeDesign.allowShrink !== false;
			};
			$scope.designButtonStyle = function (element) {
				var cache = presentationFor($scope.designState).buttons;
				if (!cache[element]) cache[element] = Object.assign(widgetStyleRuntime.elementStyle(activeDesignScheme, $scope.designState, element),
					widgetStyleRuntime.buttonShapeStyle(activeDesign, $scope.layout, element));
				return cache[element];
			};
			$scope.designButtonColor = function (element) {
				var cache = presentationFor($scope.designState).colors;
				if (cache[element] === undefined) cache[element] = widgetStyleRuntime.buttonColor(activeDesignScheme, $scope.designState, element);
				return cache[element];
			};
			$scope.designBackgroundStyle = function () {
				return presentationFor($scope.designState).background;
			};
			$scope.schemeElementStyle = function (element) {
				var state = $scope.selectedChronograph && $scope.selectedChronograph.active
					? $scope.selectedChronograph.running ? 'running' : 'paused' : 'inactive';
				var cache = presentationFor(state).legacy;
				if (!cache[element]) {
					var style = activeColorScheme ? widgetStyleRuntime.elementStyle(activeColorScheme, state, element) : {};
					if (['play', 'pause', 'stop', 'start', 'cancel'].indexOf(element) !== -1) {
						Object.assign(style, widgetStyleRuntime.buttonShapeStyle(activeDesign, $scope.layout, element));
					}
					cache[element] = style;
				}
				return cache[element];
			};
			$scope.designProgressDirection = function () {
				return presentationFor($scope.designState).progressDirection;
			};
			$scope.designProgressPercent = function () {
				var chronograph = $scope.selectedChronograph;
				if (!chronograph || !chronograph.active || !chronograph.targetDuration) return 0;
				var elapsed = chronograph.duration + (chronograph.running ? Math.max(0, $scope.clock - chronograph.updatedAt) : 0);
				var percent = chronograph.targetDuration > 0 ? Math.min(100, Math.max(0, elapsed * 100 / chronograph.targetDuration)) : 0;
				var progress = activeDesign && activeDesign.progressSettings
					&& activeDesign.progressSettings[$scope.layout];
				return progress && progress.timerMode === 'remaining' ? 100 - percent : percent;
			};
			$scope.designProgressBackground = function () {
				return presentationFor($scope.designState).progressBackground;
			};
			$scope.designProgressForeground = function () {
				return presentationFor($scope.designState).progressForeground;
			};
			$scope.designProgressFillStyle = function () {
				var percent = $scope.designProgressPercent() + '%';
				var direction = $scope.designProgressDirection();
				var style = { backgroundColor: $scope.designProgressForeground() };
				if (direction === 'right-left') {
					style.width = percent;
					style.right = 0;
				} else if (direction === 'bottom-top') {
					style.height = percent;
					style.bottom = 0;
				} else if (direction === 'top-bottom') {
					style.height = percent;
					style.top = 0;
				} else {
					style.width = percent;
					style.left = 0;
				}
				return style;
			};
			$scope.designProgressMarkerStyle = function (marker) {
				var presentation = presentationFor($scope.designState);
				if (!presentation.markers[marker]) {
					var position = marker + '%';
					presentation.markers[marker] = presentation.progressDirection === 'left-right' || presentation.progressDirection === 'right-left'
						? { left: position } : { top: position };
				}
				return presentation.markers[marker];
			};
			$scope.designProgressMarkers = function () {
				var chronograph = $scope.selectedChronograph;
				var steps = chronograph && chronograph.active && Number(chronograph.steps);
				var progress = activeDesign && activeDesign.progressSettings
					&& activeDesign.progressSettings[$scope.layout];
				if (!isTransition || !progress || !progress.showSteps || !Number.isInteger(steps) || steps < 2 || steps > 100) steps = 0;
				if (markerSteps !== steps) {
					markerSteps = steps;
					Object.keys(presentations).forEach(function (state) { presentations[state].markers = {}; });
					progressMarkers = steps ? Array.from({ length: steps - 1 }, function (unused, index) {
						return (index + 1) * 100 / steps;
					}) : [];
				}
				return progressMarkers;
			};

			function markReady() {
				if (widgetReady) return;
				widgetReady = true;
				startupChronograph = null;
				if (multipleEntry) {
					$scope.multipleWidget.tileReady();
				} else {
					syncRefresh();
					Homey.ready();
					scheduleHeightUpdate();
				}
			}

			function applySavedDefaults(defaults) {
				if (!defaults) return;
				var keys = isTransition ? ['time', 'unit', 'from', 'to', 'steps'] : ['time', 'unit'];
				keys.forEach(function (key) {
					var savedValue = defaults[key];
					if (!widgetDefaults[key] && savedValue !== undefined && savedValue !== null && savedValue !== '') {
						if (key !== 'unit') {
							savedValue = Number(String(savedValue).replace(',', '.'));
							if (!isFinite(savedValue)) {
								console.error('Invalid saved widget default for ' + key, defaults[key]);
								return;
							}
						}
						$scope.startValues[key] = savedValue;
					}
				});
			}

			function loadWidgetAppearance() {
				var builtInDesign = widgetStyleRuntime.builtInDesign(designStyleId);
				var builtInScheme = widgetStyleRuntime.builtInScheme(colorSchemeId);
				var needsCollection = !builtInDesign || !builtInScheme;
				if (!needsCollection) {
					activeDesign = builtInDesign;
					applyIcon();
					applyColorScheme(builtInScheme);
					updateDesignRows();
					return Promise.resolve();
				}
				return loadWidgetStyles().then(function (collection) {
					var design = builtInDesign || widgetStyleRuntime.findStyle(collection, designStyleId);
					var scheme = builtInScheme || widgetStyleRuntime.findScheme(collection, colorSchemeId);
					if (designStyleId !== 'builtin:current' && !design) {
						throw new Error(Homey.__('settings.widget_design_unavailable'));
					}
					if (colorSchemeId !== 'builtin:current' && !scheme) {
						throw new Error(Homey.__('settings.widget_scheme_unavailable'));
					}
					$scope.$applyAsync(function () {
						activeDesign = design || null;
						applyIcon();
						applyColorScheme(scheme);
						updateDesignRows();
					});
				}).catch(function (error) {
					styleError = window.chronographErrorMessage(Homey, error);
					$scope.$applyAsync(function () {
						activeDesign = null;
						applyIcon();
						applyColorScheme(null);
						updateDesignRows();
						$scope.error = styleError;
					});
				});
			}

			function applyState(chronograph, receivedAt) {
				var wasActive = $scope.selectedChronograph && $scope.selectedChronograph.active;
				$scope.selectedChronograph = applyChronographUpdate(chronograph, receivedAt);
				updateDurations();
				syncClock();
				if (chronograph.active) $scope.cancelStart();
				if (chronograph.defaults) {
					var savedValuesKey = JSON.stringify(chronograph.defaults);
					if (savedValuesKey !== lastSavedValues || (wasActive && !chronograph.active)) {
						lastSavedValues = savedValuesKey;
						applySavedDefaults(chronograph.defaults);
					}
				}
				updateDesignRows();
				$scope.loading = false;
				$scope.error = styleError;
			}

			function refresh(direct) {
				if (destroyed || !appearanceRequest || (widgetReady && document.hidden === true)) return Promise.resolve();
				if (!selectedName) {
					return appearanceRequest.then(function () {
						if (destroyed) return;
						$scope.$applyAsync(function () {
							if (destroyed) return;
							$scope.loading = false;
							markReady();
						});
					});
				}

				var version = ++refreshVersion;
				var request = multipleEntry && direct !== true
					? $scope.multipleWidget.refresh($scope.widgetEntry)
					: Homey.api('GET', '/' + widgetType + '/' + encodeURIComponent(selectedName), {});
				return request
					.then(function (chronograph) {
						var receivedAt = Date.now();
						if (!widgetReady && version === refreshVersion) {
							startupChronograph = applyChronographUpdate(Object.assign({}, chronograph), receivedAt);
						}
						return appearanceRequest.then(function () {
							if (destroyed || version !== refreshVersion) return;
							$scope.$applyAsync(function () {
								if (destroyed || version !== refreshVersion) return;
								applyState(chronograph, receivedAt);
								markReady();
							});
						});
					})
					.catch(function (error) {
						return appearanceRequest.then(function () {
							if (destroyed || version !== refreshVersion) return;
							$scope.$applyAsync(function () {
								if (destroyed || version !== refreshVersion) return;
								$scope.loading = false;
								$scope.error = window.chronographErrorMessage(Homey, error);
								markReady();
							});
						});
					});
			}

			$scope.formatDuration = function (chronograph, elapsedElement) {
				var elapsed = chronograph.duration;

				if (chronograph.running) {
					elapsed += Math.max(0, $scope.clock - chronograph.updatedAt);
				}
				var showRemaining = (chronograph.type === 'Timer' || chronograph.type === 'Transition')
					&& (elapsedElement ? $scope.reverseTime : !$scope.reverseTime);
				var duration = showRemaining
					? Math.max(0, chronograph.targetDuration - elapsed)
					: elapsed;
				return formatDurationValue(duration);
			};

			$scope.formatTotalDuration = function (chronograph) {
				return formatDurationValue(chronograph.targetDuration);
			};

			function formatDurationValue(duration) {
				var totalSeconds = Math.floor(duration / 1000);
				var days = Math.floor(totalSeconds / 86400);
				var hours = Math.floor((totalSeconds % 86400) / 3600);
				var minutes = Math.floor((totalSeconds % 3600) / 60);
				var seconds = (duration % 60000) / 1000;
				var fractionalSeconds = $scope.showMilliseconds
					? seconds.toFixed(3).padStart(6, '0')
					: Math.floor(seconds).toString().padStart(2, '0');
				var result = (days ? hours : Math.floor(totalSeconds / 3600)).toString().padStart(2, '0')
					+ ':' + minutes.toString().padStart(2, '0')
					+ ':' + fractionalSeconds;

				return days ? days + Homey.__('settings.days_abbreviation') + ' ' + result : result;
			}

			function updateDurations() {
				$scope.clock = Date.now();
			}

			function syncClock() {
				var running = !!($scope.selectedChronograph
					&& $scope.selectedChronograph.active && $scope.selectedChronograph.running);
				if (multipleEntry) {
					$scope.multipleWidget.setRunning($scope.widgetEntry, running);
				} else if (running && document.hidden !== true && !destroyed && !durationInterval) {
					updateDurations();
					durationInterval = $interval(updateDurations, 250);
				} else if ((!running || document.hidden === true || destroyed) && durationInterval) {
					$interval.cancel(durationInterval);
					durationInterval = null;
				}
			}

			function syncRefresh() {
				var enabled = widgetReady && selectedName && document.hidden !== true && !destroyed;
				if (enabled && !refreshInterval) refreshInterval = $interval(refresh, 5000);
				else if (!enabled && refreshInterval) {
					$interval.cancel(refreshInterval);
					refreshInterval = null;
				}
			}

			function visibilityChanged() {
				if (destroyed) return;
				if (document.hidden === true) {
					syncClock();
					syncRefresh();
					return;
				}
				$scope.$applyAsync(function () {
					if (destroyed || document.hidden === true) return;
					updateDurations();
					syncClock();
					syncRefresh();
					refresh();
				});
			}

			function scheduleHeightUpdate() {
				if (!widgetReady || !window.requestAnimationFrame || !Homey.setHeight) return;

				window.requestAnimationFrame(function () {
					if (destroyed) return;
					var content = document.querySelector('main');
					if (!content) return;

					var bodyStyle = window.getComputedStyle(document.body);
					var verticalPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
					var height = Math.ceil(content.getBoundingClientRect().height + verticalPadding);
					if (!height || height === lastHeight) return;

					lastHeight = height;
					Homey.setHeight(height).catch(function (error) {
						console.error('Unable to resize Chronograph widget', error);
					});
				});
			}

			function applyChronographUpdate(chronograph, receivedAt) {
				if (chronograph.running) chronograph.updatedAt = receivedAt === undefined ? Date.now() : receivedAt;
				return chronograph;
			}

			$scope.getDisplayName = function (chronograph) {
				return $scope.alternativeName || chronograph.name;
			};

			$scope.start = function () {
				if (!$scope.selectedChronograph || $scope.selectedChronograph.active || $scope.busy) return;
				if ($scope.designEnabled) {
					var container = multipleEntry ? $element[0] : document;
					var invalidInput = container.querySelector('.chronograph-design-layer-current input:invalid');
					if (invalidInput) {
						invalidInput.reportValidity();
						return;
					}
				}

				$scope.busy = true;
				if (multipleEntry) $scope.multipleWidget.invalidateRefresh();
				$scope.error = null;
				expectedRealtime = { active: true, running: true };
				deferredRealtime = false;
				++refreshVersion;
				Homey.api('POST', '/' + widgetType + '/' + encodeURIComponent(selectedName) + '/start', $scope.startValues)
					.then(function (started) {
						$scope.cancelStart();
						if (started && started.active === true && started.name === selectedName
							&& typeof started.type === 'string' && started.type.toLowerCase() === widgetType) {
							var version = ++refreshVersion;
							$scope.$applyAsync(function () {
								if (!destroyed && version === refreshVersion) applyState(started);
							});
							return;
						}
						return refresh(true);
					})
					.then(function () {
						$scope.$applyAsync(function () {
							finishOperation(true);
						});
					})
					.catch(function (error) {
						$scope.$applyAsync(function () {
							$scope.error = window.chronographErrorMessage(Homey, error);
							finishOperation(false);
						});
					});
			};

			$scope.beginStart = function () {
				if (!$scope.selectedChronograph || $scope.selectedChronograph.active || $scope.busy) return;
				if (isStopwatch) {
					$scope.start();
					return;
				}
				$scope.showStartForm = true;
				updateDesignRows();
				$timeout.cancel(startFormTimeout);
				startFormTimeout = $timeout(function () {
					if (!$scope.selectedChronograph || !$scope.selectedChronograph.active) {
						$scope.showStartForm = false;
						updateDesignRows();
					}
					startFormTimeout = null;
				}, 10000);
			};

			$scope.cancelStart = function () {
				$timeout.cancel(startFormTimeout);
				startFormTimeout = null;
				$scope.showStartForm = false;
				updateDesignRows();
			};

			$scope.toggle = function () {
				if (!$scope.selectedChronograph || !$scope.selectedChronograph.active || $scope.busy) return;

				$scope.busy = true;
				if (multipleEntry) $scope.multipleWidget.invalidateRefresh();
				$scope.error = null;
				expectedRealtime = { active: true, running: !$scope.selectedChronograph.running };
				deferredRealtime = false;
				++refreshVersion;
				Homey.api('PUT', '/' + chronographCollectionPaths[widgetType] + '/' + encodeURIComponent(selectedName), {
					running: !$scope.selectedChronograph.running
				}).then(function (updated) {
					$scope.$applyAsync(function () {
						++refreshVersion;
						$scope.selectedChronograph = applyChronographUpdate(Object.assign({ active: true }, updated));
						syncClock();
						updateDesignRows();
						finishOperation(true);
					});
				}).catch(function (error) {
					$scope.$applyAsync(function () {
						$scope.error = window.chronographErrorMessage(Homey, error);
						finishOperation(false);
					});
				});
			};

			$scope.stop = function () {
				if (!$scope.selectedChronograph || !$scope.selectedChronograph.active || $scope.busy) return;

				$scope.busy = true;
				if (multipleEntry) $scope.multipleWidget.invalidateRefresh();
				$scope.error = null;
				expectedRealtime = { active: false, running: false };
				deferredRealtime = false;
				++refreshVersion;
				Homey.api('DELETE', '/' + chronographCollectionPaths[widgetType] + '/' + encodeURIComponent(selectedName)).then(function () {
					$scope.$applyAsync(function () {
						++refreshVersion;
						$scope.selectedChronograph.active = false;
						$scope.selectedChronograph.running = false;
						syncClock();
						applySavedDefaults($scope.selectedChronograph.defaults);
						$scope.showStartForm = false;
						updateDesignRows();
						finishOperation(true);
					});
				}).catch(function (error) {
					$scope.$applyAsync(function () {
						$scope.error = window.chronographErrorMessage(Homey, error);
						finishOperation(false);
					});
				});
			};

			$scope.$on('$destroy', function () {
				destroyed = true;
				if (multipleEntry) $scope.multipleWidget.setRunning($scope.widgetEntry, false);
				$interval.cancel(refreshInterval);
				$interval.cancel(durationInterval);
				$timeout.cancel(startFormTimeout);
				if (!multipleEntry) document.removeEventListener('visibilitychange', visibilityChanged);
				if (resizeObserver) resizeObserver.disconnect();
			});

			if (!multipleEntry && window.ResizeObserver) {
				resizeObserver = new window.ResizeObserver(scheduleHeightUpdate);
				resizeObserver.observe(document.querySelector('main'));
			}

			function refreshSavedValues(event) {
				if (destroyed || document.hidden === true) return;
				if (event && event.name === selectedName && typeof event.type === 'string'
					&& event.type.toLowerCase() === widgetType) return refresh(true);
			}
			function finishOperation(succeeded) {
				$scope.busy = false;
				expectedRealtime = null;
				var shouldRefresh = deferredRealtime && succeeded;
				deferredRealtime = false;
				if (shouldRefresh) refresh(true);
			}
			function refreshRealtime(events, periodic) {
				if (destroyed || document.hidden === true) return;
				if (!Array.isArray(events)) return refresh(true);
				if (events.some(function (event) {
					if (!event || event.name !== selectedName || !event.data
						|| typeof event.data.type !== 'string' || event.data.type.toLowerCase() !== widgetType) return false;
					if ($scope.busy) {
						if (!expectedRealtime || typeof event.removed !== 'boolean'
							|| event.removed === expectedRealtime.active
							|| (!event.removed && event.running !== expectedRealtime.running)) deferredRealtime = true;
						return false;
					}
					var current = $scope.selectedChronograph || startupChronograph;
					// The local clock already advances running durations; allow for event delivery delay.
					if (periodic && current && current.active && current.running
						&& event.running === true && event.removed === false && Number.isFinite(event.duration)
						&& (isStopwatch || event.targetDuration === current.targetDuration)
						&& (!isTransition || event.data.steps === current.steps)
						&& Math.abs(event.duration - (current.duration + Date.now() - current.updatedAt)) < 2000) return false;
					return true;
				})) return refresh(true);
			}
			if (multipleEntry) {
				$scope.$on('multipleChronographsRefresh', function () { refresh(); });
				$scope.$on('multipleChronographsRealtime', function (event, values, periodic) { refreshRealtime(values, periodic); });
				$scope.$on('multipleChronographsFlowValues', function (event, values) { refreshSavedValues(values); });
				$scope.$on('multipleChronographsClock', updateDurations);
			} else {
				document.addEventListener('visibilitychange', visibilityChanged);
				Homey.on('chronograph_event_multi', function (events) { return refreshRealtime(events, true); });
				Homey.on('chronograph_event', function (event) { return refreshRealtime([event]); });
				Homey.on('chronograph_flow_values_changed', refreshSavedValues);
			}
			appearanceRequest = loadWidgetAppearance();
			refresh();
		}
	]);

	angular.module('chronographWidget').directive('chronographFieldTooltip', function () {
		return {
			restrict: 'A',
			link: function (scope, element) {
				var field = element[0].querySelector('input, select');
				var label = element[0].querySelector('label');
				var tooltip;
				function position() {
					if (!tooltip) return;
					var input = field.getBoundingClientRect();
					var box = tooltip.getBoundingClientRect();
					var left = Math.max(4, Math.min(input.left + (input.width - box.width) / 2, window.innerWidth - box.width - 4));
					var top = input.top - box.height - 4;
					if (top < 0) top = Math.min(input.bottom + 4, Math.max(0, window.innerHeight - box.height));
					tooltip.style.left = left + 'px';
					tooltip.style.top = top + 'px';
					tooltip.style.visibility = 'visible';
				}
				function show() {
					if (tooltip) return;
					tooltip = document.createElement('span');
					tooltip.className = 'chronograph-field-tooltip';
					tooltip.setAttribute('aria-hidden', 'true');
					tooltip.textContent = label.textContent;
					tooltip.style.visibility = 'hidden';
					document.body.appendChild(tooltip);
					position();
				}
				function hide() {
					if (!tooltip) return;
					tooltip.remove();
					tooltip = null;
				}
				field.addEventListener('focus', show);
				field.addEventListener('blur', hide);
				window.addEventListener('resize', position);
				scope.$on('$destroy', function () {
					hide();
					field.removeEventListener('focus', show);
					field.removeEventListener('blur', hide);
					window.removeEventListener('resize', position);
				});
			}
		};
	});

	if (window.registerMultipleChronographsWidget) window.registerMultipleChronographsWidget(Homey);
	angular.bootstrap(document, ['chronographWidget']);
}

angular.module('chronographWidget', []);
