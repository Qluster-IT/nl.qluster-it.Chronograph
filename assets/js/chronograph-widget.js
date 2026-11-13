'use strict';

function onHomeyReady(Homey) {
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
			var multipleEntry = $scope.widgetEntry;
			var settings = multipleEntry ? multipleEntry.settings : Homey.getSettings() || {};
		var widgetStyleRuntime = window.ChronographWidgetStyle;
		var designStyleId = widgetStyleRuntime.settingId(settings.designStyle) || 'builtin:current';
		var colorSchemeId = widgetStyleRuntime.settingId(settings.colorScheme) || 'builtin:current';
		var activeDesign;
		var activeColorScheme;
		var activeDesignScheme = widgetStyleRuntime.currentScheme();
		var styleError = null;
		var widgetType = multipleEntry ? multipleEntry.type : document.body.getAttribute('data-chronograph-type');
			$scope.widgetInputPrefix = multipleEntry ? 'chronograph-' + multipleEntry.slot + '-' : '';
			var defaultIcons = { timer: 'clock', stopwatch: 'stopwatch', transition: 'shuffle' };
			var selectedIcon = settings.icon;
			$scope.iconClass = '';
			$scope.iconImage = '';
			if (selectedIcon && typeof selectedIcon === 'object') {
				var iconId = typeof selectedIcon.id === 'string'
					? /^(fas|far|fab):([a-z0-9-]+)$/.exec(selectedIcon.id)
					: null;
				if (selectedIcon.id !== 'none' && typeof selectedIcon.image === 'string'
					&& (selectedIcon.image.indexOf('data:image/svg+xml;base64,') === 0
						|| selectedIcon.image.indexOf('data:image/png;base64,') === 0)) {
					$scope.iconImage = selectedIcon.image;
				} else if (iconId) {
					var iconStyles = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' };
					$scope.iconClass = iconStyles[iconId[1]] + ' fa-' + iconId[2];
				}
			} else {
				var legacyIcon = typeof selectedIcon === 'string' ? selectedIcon : defaultIcons[widgetType];
				if (legacyIcon && legacyIcon !== 'none' && /^[a-z0-9-]+$/.test(legacyIcon)) {
					$scope.iconClass = 'fa-solid fa-' + legacyIcon;
				}
			}
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
				if (activeColorScheme) {
					var state = !chronograph || !chronograph.active ? 'inactive' : chronograph.running ? 'running' : 'paused';
					var color = widgetStyleRuntime.resolveColor(activeColorScheme, state, 'background');
					return color === 'default' ? 'none' : color;
				}
				if (!chronograph || !chronograph.active) return $scope.inactiveColor;
				return chronograph.running ? $scope.runningColor : $scope.pausedColor;
			};
			$scope.playColor = legacyPlayColor;
			$scope.pauseColor = legacyPauseColor;
			$scope.stopColor = legacyStopColor;
			$scope.showMilliseconds = settings.showMilliseconds === true;

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
				var chronograph = $scope.selectedChronograph;
				var state = chronograph && chronograph.active
					? chronograph.running ? 'running' : 'paused'
					: hasDesignStartForm() ? 'starting' : 'inactive';
				$scope.designState = state;
				$scope.designRows = widgetStyleRuntime.buildRows(activeDesign, $scope.layout, state, widgetType, hasDesignStartForm());
				$scope.designEnabled = $scope.designRows.length > 0;
				var current = widgetStyleRuntime.layoutSpanningRows($scope.designRows);
				$scope.designLayers = [{ id: 'current', state: state, rows: current.rows, spanning: current.spanning, tracks: current.tracks, rowTracks: current.rowTracks, measure: false }];
				var mode = activeDesign.heightModes && activeDesign.heightModes[$scope.layout] || 'auto';
				if (mode === 'minimum' || mode === 'minimum-without-inputs') {
					var states = mode === 'minimum'
						? ['inactive', 'paused', 'running', 'starting'] : ['inactive', 'paused', 'running'];
					states.forEach(function (scenario) {
						var showForm = scenario === 'starting'
							|| (scenario === 'inactive' && !isStopwatch && $scope.layout !== 'compact'
								&& (!activeDesign.startFieldsVisibility || activeDesign.startFieldsVisibility[$scope.layout] === 'inactive'));
						var scenarioState = scenario === 'inactive' && showForm ? 'starting' : scenario;
						var scenarioRows = widgetStyleRuntime.buildRows(activeDesign, $scope.layout, scenarioState, widgetType, showForm,
							mode === 'minimum-without-inputs');
						var scenarioLayout = widgetStyleRuntime.layoutSpanningRows(scenarioRows);
						$scope.designLayers.push({
							id: scenario,
							state: scenarioState,
							measure: true,
							rows: scenarioLayout.rows,
							spanning: scenarioLayout.spanning,
							tracks: scenarioLayout.tracks,
							rowTracks: scenarioLayout.rowTracks
						});
					});
				}
				$scope.designScheme = activeDesignScheme;
			}

			$scope.designElementStyle = function (element) {
				if (['play', 'pause', 'stop', 'cancel', 'start'].indexOf(element) !== -1) return {};
				return widgetStyleRuntime.elementStyle(activeDesignScheme, $scope.designState, element);
			};
			$scope.designElementSize = function (element) {
				return widgetStyleRuntime.elementSize(activeDesign, $scope.layout, element);
			};
			$scope.designButtonText = function (element) {
				return widgetStyleRuntime.buttonText(activeDesign, $scope.layout, element, $scope.labels.start);
			};
			$scope.designFieldLayout = function () {
				return widgetStyleRuntime.inputFieldLayout(activeDesign, $scope.layout, widgetType);
			};
			$scope.designAllowShrink = function () {
				return !activeDesign || activeDesign.allowShrink !== false;
			};
			$scope.designButtonStyle = function (element) {
				return widgetStyleRuntime.elementStyle(activeDesignScheme, $scope.designState, element);
			};
			$scope.designButtonColor = function (element) {
				return widgetStyleRuntime.buttonColor(activeDesignScheme, $scope.designState, element);
			};
			$scope.designBackgroundStyle = function () {
				return widgetStyleRuntime.backgroundStyle(activeDesignScheme, $scope.designState);
			};
			$scope.schemeElementStyle = function (element) {
				if (!activeColorScheme) return {};
				var state = $scope.selectedChronograph && $scope.selectedChronograph.active
					? $scope.selectedChronograph.running ? 'running' : 'paused' : 'inactive';
				return widgetStyleRuntime.elementStyle(activeColorScheme, state, element);
			};
			$scope.designProgressDirection = function () {
				var progress = activeDesign && activeDesign.progressSettings
					&& activeDesign.progressSettings[$scope.layout];
				return progress && progress.direction || 'left-right';
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
				var colors = activeDesignScheme.progressColors && activeDesignScheme.progressColors[$scope.layout];
				return widgetStyleRuntime.valueColor(colors && colors.background || 'grey');
			};
			$scope.designProgressForeground = function () {
				var colors = activeDesignScheme.progressColors && activeDesignScheme.progressColors[$scope.layout];
				return widgetStyleRuntime.valueColor(colors && colors.foreground || 'blue');
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
				var position = marker + '%';
				return $scope.designProgressDirection() === 'left-right' || $scope.designProgressDirection() === 'right-left'
					? { left: position } : { top: position };
			};
			$scope.designProgressMarkers = function () {
				var chronograph = $scope.selectedChronograph;
				var steps = chronograph && chronograph.active && Number(chronograph.steps);
				var progress = activeDesign && activeDesign.progressSettings
					&& activeDesign.progressSettings[$scope.layout];
				if (!isTransition || !progress || !progress.showSteps) return [];
				if (!Number.isInteger(steps) || steps < 2 || steps > 100) return [];
				return Array.from({ length: steps - 1 }, function (unused, index) {
					return (index + 1) * 100 / steps;
				});
			};

			function markReady() {
				if (widgetReady) return;
				widgetReady = true;
				if (multipleEntry) {
					$scope.multipleWidget.tileReady();
				} else {
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
					applyColorScheme(builtInScheme);
					updateDesignRows();
					return Promise.resolve();
				}
				return Homey.api('GET', '/widget-styles', {}).then(function (collection) {
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
						applyColorScheme(scheme);
						updateDesignRows();
					});
				}).catch(function (error) {
					styleError = window.chronographErrorMessage(Homey, error);
					$scope.$applyAsync(function () {
						activeDesign = null;
						applyColorScheme(null);
						updateDesignRows();
						$scope.error = styleError;
					});
				});
			}

			function applyState(chronograph) {
				var wasActive = $scope.selectedChronograph && $scope.selectedChronograph.active;
				$scope.selectedChronograph = applyChronographUpdate(chronograph);
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
				if (!selectedName) {
					$scope.loading = false;
					markReady();
					return Promise.resolve();
				}

				var version = ++refreshVersion;
				var request = multipleEntry && direct !== true
					? $scope.multipleWidget.refresh($scope.widgetEntry)
					: Homey.api('GET', '/' + widgetType + '/' + encodeURIComponent(selectedName), {});
				return request
					.then(function (chronograph) {
						if (destroyed || version !== refreshVersion) return;
						$scope.$applyAsync(function () {
							if (!destroyed && version === refreshVersion) applyState(chronograph);
						});
					})
					.catch(function (error) {
						if (destroyed || version !== refreshVersion) return;
						$scope.$applyAsync(function () {
							if (destroyed || version !== refreshVersion) return;
							$scope.loading = false;
							$scope.error = window.chronographErrorMessage(Homey, error);
						});
					});
			}

			$scope.formatDuration = function (chronograph) {
				var elapsed = chronograph.duration;

				if (chronograph.running) {
					elapsed += Math.max(0, $scope.clock - chronograph.updatedAt);
				}
				var duration = chronograph.type === 'Timer'
					? Math.max(0, chronograph.targetDuration - elapsed)
					: elapsed;

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
			};

			function updateDurations() {
				$scope.clock = Date.now();
			}

			function syncClock() {
				var running = !!($scope.selectedChronograph
					&& $scope.selectedChronograph.active && $scope.selectedChronograph.running);
				if (multipleEntry) {
					$scope.multipleWidget.setRunning($scope.widgetEntry, running);
				} else if (running && !durationInterval) {
					updateDurations();
					durationInterval = $interval(updateDurations, 250);
				} else if (!running && durationInterval) {
					$interval.cancel(durationInterval);
					durationInterval = null;
				}
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

			function applyChronographUpdate(chronograph) {
				if (chronograph.running) chronograph.updatedAt = Date.now();
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
				if (resizeObserver) resizeObserver.disconnect();
			});

			if (!multipleEntry && window.ResizeObserver) {
				resizeObserver = new window.ResizeObserver(scheduleHeightUpdate);
				resizeObserver.observe(document.querySelector('main'));
			}

			function refreshSavedValues(event) {
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
					var current = $scope.selectedChronograph;
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
				Homey.on('chronograph_event_multi', function (events) { return refreshRealtime(events, true); });
				Homey.on('chronograph_event', function (event) { refreshRealtime([event]); });
				Homey.on('chronograph_flow_values_changed', refreshSavedValues);
			}
			loadWidgetAppearance().then(refresh).then(function () {
				if (!selectedName) return;
				if (!multipleEntry) {
					refreshInterval = $interval(refresh, 5000);
				}
				markReady();
			});
		}
	]);

	if (window.registerMultipleChronographsWidget) window.registerMultipleChronographsWidget(Homey);
	angular.bootstrap(document, ['chronographWidget']);
}

angular.module('chronographWidget', []);
