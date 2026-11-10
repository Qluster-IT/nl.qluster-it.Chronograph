'use strict';

function onHomeyReady(Homey) {
	angular.module('chronographWidget').controller('ChronographWidgetController', [
		'$scope',
		'$interval',
		function ($scope, $interval) {
			var refreshInterval;
			var durationInterval;
			var resizeObserver;
			var destroyed = false;
			var widgetReady = false;
			var startDefaultsLoaded = false;
			var lastHeight = 0;
			var settings = Homey.getSettings() || {};
			var selectedSetting = settings.chronograph;
			var selectedId = selectedSetting && (selectedSetting.id || (selectedSetting.data && selectedSetting.data.id));
			$scope.colorStyle = settings.colorStyle === 'deep' ? 'deep' : 'soft';
			$scope.layout = settings.layout === 'compact' || settings.layout === 'large' ? settings.layout : 'normal';
			var buttonColors = [
				'blue', 'red', 'orange', 'yellow', 'green', 'purple',
				'teal', 'cyan', 'indigo', 'pink', 'brown', 'grey'
			];
			$scope.playColor = buttonColors.indexOf(settings.playColor) !== -1 ? settings.playColor : 'blue';
			$scope.pauseColor = buttonColors.indexOf(settings.pauseColor) !== -1 ? settings.pauseColor : 'blue';
			$scope.stopColor = buttonColors.indexOf(settings.stopColor) !== -1 ? settings.stopColor : 'red';
			$scope.showMilliseconds = settings.showMilliseconds === true;

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
			$scope.startValues = { unit: 'minutes' };
			$scope.selectedChronograph = null;
			$scope.showStartForm = false;
			$scope.loading = true;
			$scope.busy = false;
			$scope.error = null;
			$scope.clock = Date.now();

			function markReady() {
				if (widgetReady) return;
				widgetReady = true;
				Homey.ready();
				scheduleHeightUpdate();
			}

			function refresh() {
				if (!selectedId) {
					$scope.loading = false;
					markReady();
					return Promise.resolve();
				}

				return Homey.api('GET', '/chronograph/' + encodeURIComponent(selectedId), {})
					.then(function (chronograph) {
						if (destroyed) return;
						$scope.$applyAsync(function () {
							$scope.selectedChronograph = applyChronographUpdate(chronograph);
							if (!startDefaultsLoaded) {
								$scope.startValues.time = chronograph.defaults.time || 1;
								$scope.startValues.unit = chronograph.defaults.unit || 'minutes';
								$scope.startValues.from = chronograph.defaults.from;
								$scope.startValues.to = chronograph.defaults.to;
								$scope.startValues.steps = chronograph.defaults.steps || 20;
								startDefaultsLoaded = true;
							}
							$scope.loading = false;
							$scope.error = null;
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

			$scope.start = function () {
				if (!$scope.selectedChronograph || $scope.selectedChronograph.active || $scope.busy) return;

				$scope.busy = true;
				$scope.error = null;
				Homey.api('POST', '/chronograph/' + encodeURIComponent(selectedId) + '/start', $scope.startValues)
					.then(function () {
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
				if ($scope.selectedChronograph.type === 'Stopwatch') {
					$scope.start();
					return;
				}
				$scope.showStartForm = true;
			};

			$scope.toggle = function () {
				if (!$scope.selectedChronograph || !$scope.selectedChronograph.active || $scope.busy) return;

				$scope.busy = true;
				$scope.error = null;
				Homey.api('PUT', '/chronographs/' + encodeURIComponent(selectedId), {
					running: !$scope.selectedChronograph.running
				}).then(function (updated) {
					$scope.$applyAsync(function () {
						$scope.selectedChronograph = applyChronographUpdate(Object.assign({ active: true }, updated));
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
				Homey.api('DELETE', '/chronographs/' + encodeURIComponent(selectedId)).then(function () {
					$scope.$applyAsync(function () {
						$scope.selectedChronograph.active = false;
						$scope.selectedChronograph.running = false;
						$scope.showStartForm = false;
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
				if (resizeObserver) resizeObserver.disconnect();
			});

			if (window.ResizeObserver) {
				resizeObserver = new window.ResizeObserver(scheduleHeightUpdate);
				resizeObserver.observe(document.querySelector('main'));
			}

			Homey.on('chronograph_event_multi', refresh);
			refresh().then(function () {
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
