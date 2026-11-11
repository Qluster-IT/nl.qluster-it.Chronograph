'use strict';

function onHomeyReady(Homey) {
	angular.module('chronographWidget').controller('ChronographWidgetController', [
		'$scope',
		'$interval',
		'$timeout',
		function ($scope, $interval, $timeout) {
		var refreshInterval;
		var durationInterval;
		var startFormTimeout;
			var resizeObserver;
			var destroyed = false;
			var widgetReady = false;
			var lastHeight = 0;
			var settings = Homey.getSettings() || {};
		var widgetStyleRuntime = window.ChronographWidgetStyle;
		var designStyleId = widgetStyleRuntime.settingId(settings.designStyle) || 'builtin:current';
		var colorSchemeId = widgetStyleRuntime.settingId(settings.colorScheme) || 'builtin:current';
		var activeDesign;
		var activeColorScheme;
		var activeDesignScheme = widgetStyleRuntime.currentScheme();
		var styleError = null;
		var widgetType = document.body.getAttribute('data-chronograph-type');
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
			var selectedId = selectedSetting && (selectedSetting.id || (selectedSetting.data && selectedSetting.data.id));
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
				$scope.designLayers = [{ id: 'current', state: state, rows: $scope.designRows, measure: false }];
				var mode = activeDesign.heightModes && activeDesign.heightModes[$scope.layout] || 'auto';
				if (mode === 'minimum' || mode === 'minimum-without-inputs') {
					var states = mode === 'minimum'
						? ['inactive', 'paused', 'running', 'starting'] : ['inactive', 'paused', 'running'];
					states.forEach(function (scenario) {
						var showForm = scenario === 'starting'
							|| (scenario === 'inactive' && !isStopwatch && $scope.layout !== 'compact'
								&& (!activeDesign.startFieldsVisibility || activeDesign.startFieldsVisibility[$scope.layout] === 'inactive'));
						var scenarioState = scenario === 'inactive' && showForm ? 'starting' : scenario;
						$scope.designLayers.push({
							id: scenario,
							state: scenarioState,
							measure: true,
							rows: widgetStyleRuntime.buildRows(activeDesign, $scope.layout, scenarioState, widgetType, showForm,
								mode === 'minimum-without-inputs')
						});
					});
				}
				$scope.designScheme = activeDesignScheme;
			}

			$scope.designElementStyle = function (element) {
				if (['play', 'pause', 'stop', 'cancel', 'start'].indexOf(element) !== -1) return {};
				return widgetStyleRuntime.elementStyle(activeDesignScheme, $scope.designState, element);
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
				Homey.ready();
				scheduleHeightUpdate();
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
				var needsCollection = designStyleId !== 'builtin:current' || colorSchemeId !== 'builtin:current';
				if (!needsCollection) {
					activeDesign = widgetStyleRuntime.currentDesign();
					applyColorScheme(widgetStyleRuntime.currentScheme());
					updateDesignRows();
					return Promise.resolve();
				}
				return Homey.api('GET', '/widget-styles', {}).then(function (collection) {
					var design = designStyleId !== 'builtin:current'
						? widgetStyleRuntime.findStyle(collection, designStyleId) : widgetStyleRuntime.currentDesign();
					var scheme = colorSchemeId !== 'builtin:current'
						? widgetStyleRuntime.findScheme(collection, colorSchemeId)
						: widgetStyleRuntime.currentScheme();
					if (designStyleId !== 'builtin:current' && !design) {
						throw new Error('The selected widget design is no longer available.');
					}
					if (colorSchemeId !== 'builtin:current' && !scheme) {
						throw new Error('The selected widget color scheme is no longer available.');
					}
					$scope.$applyAsync(function () {
						activeDesign = design || null;
						applyColorScheme(scheme);
						updateDesignRows();
					});
				}).catch(function (error) {
					styleError = error && error.message ? error.message : String(error);
					$scope.$applyAsync(function () {
						activeDesign = null;
						applyColorScheme(null);
						updateDesignRows();
						$scope.error = styleError;
					});
				});
			}

			function refresh() {
				if (!selectedId) {
					$scope.loading = false;
					markReady();
					return Promise.resolve();
				}

				return Homey.api('GET', '/' + widgetType + '/' + encodeURIComponent(selectedId), {})
					.then(function (chronograph) {
						if (destroyed) return;
						$scope.$applyAsync(function () {
							var wasActive = $scope.selectedChronograph && $scope.selectedChronograph.active;
							$scope.selectedChronograph = applyChronographUpdate(chronograph);
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
						});
					})
					.catch(function (error) {
						if (destroyed) return;
						$scope.$applyAsync(function () {
							$scope.loading = false;
							$scope.error = error.message || String(error);
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
					var invalidInput = document.querySelector('.chronograph-design-layer-current input:invalid');
					if (invalidInput) {
						invalidInput.reportValidity();
						return;
					}
				}

				$scope.busy = true;
				$scope.error = null;
				Homey.api('POST', '/' + widgetType + '/' + encodeURIComponent(selectedId) + '/start', $scope.startValues)
					.then(function () {
						$scope.cancelStart();
						return refresh();
					})
					.then(function () {
						$scope.$applyAsync(function () {
							$scope.busy = false;
						});
					})
					.catch(function (error) {
						$scope.$applyAsync(function () {
							$scope.busy = false;
							$scope.error = error.message || String(error);
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
				$scope.error = null;
				Homey.api('PUT', '/' + chronographCollectionPaths[widgetType] + '/' + encodeURIComponent(selectedId), {
					running: !$scope.selectedChronograph.running
				}).then(function (updated) {
					$scope.$applyAsync(function () {
						$scope.selectedChronograph = applyChronographUpdate(Object.assign({ active: true }, updated));
						updateDesignRows();
						$scope.busy = false;
					});
				}).catch(function (error) {
					$scope.$applyAsync(function () {
						$scope.busy = false;
						$scope.error = error.message || String(error);
					});
				});
			};

			$scope.stop = function () {
				if (!$scope.selectedChronograph || !$scope.selectedChronograph.active || $scope.busy) return;

				$scope.busy = true;
				$scope.error = null;
				Homey.api('DELETE', '/' + chronographCollectionPaths[widgetType] + '/' + encodeURIComponent(selectedId)).then(function () {
					$scope.$applyAsync(function () {
						$scope.selectedChronograph.active = false;
						$scope.selectedChronograph.running = false;
						applySavedDefaults($scope.selectedChronograph.defaults);
						$scope.showStartForm = false;
						updateDesignRows();
						$scope.busy = false;
					});
				}).catch(function (error) {
					$scope.$applyAsync(function () {
						$scope.busy = false;
						$scope.error = error.message || String(error);
					});
				});
			};

			$scope.$on('$destroy', function () {
				destroyed = true;
				$interval.cancel(refreshInterval);
				$interval.cancel(durationInterval);
				$timeout.cancel(startFormTimeout);
				if (resizeObserver) resizeObserver.disconnect();
			});

			if (window.ResizeObserver) {
				resizeObserver = new window.ResizeObserver(scheduleHeightUpdate);
				resizeObserver.observe(document.querySelector('main'));
			}

			Homey.on('chronograph_event_multi', refresh);
			loadWidgetAppearance().then(refresh).then(function () {
				if (!selectedId) return;
				refreshInterval = $interval(refresh, 5000);
				durationInterval = $interval(updateDurations, 250);
				markReady();
			});
		}
	]);

	angular.bootstrap(document, ['chronographWidget']);
}

angular.module('chronographWidget', []);
