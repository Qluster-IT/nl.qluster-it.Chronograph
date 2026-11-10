'use strict';

function onHomeyReady(Homey) {
	angular.module('chronographWidget').controller('ChronographWidgetController', [
		'$scope',
		'$interval',
		function ($scope, $interval) {
			var refreshInterval;
			var durationInterval;
			var destroyed = false;

			$scope.labels = {
				type: Homey.__('settings.widget_type'),
				timer: Homey.__('settings.timers'),
				stopwatch: Homey.__('settings.stopwatches'),
				transition: Homey.__('settings.transitions'),
				chronograph: Homey.__('settings.widget_chronograph'),
				pause: Homey.__('settings.pause'),
				resume: Homey.__('settings.resume'),
				stop: Homey.__('settings.stop')
			};
			$scope.selectedType = 'Timer';
			$scope.selectedId = null;
			$scope.chronographs = [];
			$scope.availableChronographs = [];
			$scope.selectedChronograph = null;
			$scope.loading = true;
			$scope.busy = false;
			$scope.error = null;
			$scope.clock = Date.now();

			function updateSelection() {
				$scope.availableChronographs = $scope.chronographs.filter(function (chronograph) {
					return chronograph.type === $scope.selectedType;
				});

				var selected = $scope.availableChronographs.find(function (chronograph) {
					return String(chronograph.id) === String($scope.selectedId);
				});

				if (!selected) {
					selected = $scope.availableChronographs[0] || null;
					$scope.selectedId = selected ? selected.id : null;
				}
				$scope.selectedChronograph = selected;
			}

			function refresh() {
				return Homey.api('GET', '/chronographs', {})
					.then(function (chronographs) {
						if (destroyed) return;
						$scope.$applyAsync(function () {
							applyChronographUpdate(chronographs);
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

			$scope.selectType = function () {
				updateSelection();
			};

			$scope.selectChronograph = function () {
				updateSelection();
			};

			$scope.emptyMessage = function () {
				if ($scope.selectedType === 'Timer') return Homey.__('settings.no_active_timers');
				if ($scope.selectedType === 'Stopwatch') return Homey.__('settings.no_active_stopwatches');
				return Homey.__('settings.no_active_transitions');
			};

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
				var result = (days ? hours : Math.floor(totalSeconds / 3600)).toString().padStart(2, '0')
					+ ':' + minutes.toString().padStart(2, '0')
					+ ':' + seconds.toFixed(2).padStart(5, '0');

				return days ? days + Homey.__('settings.days_abbreviation') + ' ' + result : result;
			};

			function updateDurations() {
				$scope.clock = Date.now();
			}

			function applyChronographUpdate(chronographs) {
				var updatedAt = Date.now();
				chronographs.forEach(function (chronograph) {
					chronograph.updatedAt = updatedAt;
				});
				$scope.chronographs = chronographs;
				updateSelection();
			}

			$scope.toggle = function () {
				var chronograph = $scope.selectedChronograph;
				if (!chronograph || $scope.busy) return;

				$scope.busy = true;
				$scope.error = null;
				Homey.api('PUT', '/chronographs/' + encodeURIComponent(chronograph.id), {
					running: !chronograph.running
				}).then(function (updated) {
					updated.updatedAt = Date.now();
					$scope.$applyAsync(function () {
						$scope.chronographs = $scope.chronographs.map(function (item) {
							return String(item.id) === String(updated.id) ? updated : item;
						});
						$scope.busy = false;
						updateSelection();
					});
				}).catch(function (error) {
					$scope.$applyAsync(function () {
						$scope.busy = false;
						$scope.error = error.message || String(error);
					});
				});
			};

			$scope.stop = function () {
				var chronograph = $scope.selectedChronograph;
				if (!chronograph || $scope.busy) return;

				$scope.busy = true;
				$scope.error = null;
				Homey.api('DELETE', '/chronographs/' + encodeURIComponent(chronograph.id)).then(function () {
					$scope.$applyAsync(function () {
						$scope.chronographs = $scope.chronographs.filter(function (item) {
							return String(item.id) !== String(chronograph.id);
						});
						$scope.busy = false;
						updateSelection();
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
			});

			Homey.on('chronograph_event_multi', refresh);
			refresh().then(function () {
				refreshInterval = $interval(refresh, 5000);
				durationInterval = $interval(updateDurations, 250);
				Homey.ready();
			});
		}
	]);

	angular.bootstrap(document, ['chronographWidget']);
}

angular.module('chronographWidget', []);
