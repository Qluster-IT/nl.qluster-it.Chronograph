'use strict';

window.registerMultipleChronographsWidget = function (Homey) {
	angular.module('chronographWidget').controller('MultipleChronographsController', [
		'$scope', '$interval',
		function ($scope, $interval) {
			var settings = Homey.getSettings() || {};
			var columns = settings.columns === undefined || settings.columns === null ? 1 : Number(settings.columns);
			var pending = 0;
			var ready = false;
			var observer;
			var lastHeight = 0;
			var destroyed = false;
			var pendingRefresh = null;
			var clockInterval = null;
			var refreshInterval = null;
			var runningSlots = {};
			$scope.entries = [];
			$scope.rows = [];
			$scope.error = null;
			$scope.emptyMessage = Homey.__('settings.widget_select_chronograph');

			if (!Number.isInteger(columns) || columns < 1 || columns > 3) {
				console.error('Invalid multiple chronographs column count', settings.columns);
				$scope.error = Homey.__('settings.multiple_invalid_settings');
				columns = 1;
			}
			$scope.columns = columns;
			var separator = settings.rowSeparator == null ? 'none' : settings.rowSeparator;
			var separatorColor = settings.rowSeparatorColor == null ? 'default' : settings.rowSeparatorColor;
			var colors = ['default', 'blue', 'red', 'orange', 'yellow', 'green', 'purple', 'teal',
				'cyan', 'indigo', 'pink', 'brown', 'grey', 'black', 'black-light', 'white',
				'red-soft', 'red-dark', 'grey-light', 'grey-dark', 'navy'];
			if (['none', 'line', 'rows', 'rows-small', 'rows-tiny', 'cards', 'cards-small', 'cards-tiny'].indexOf(separator) === -1 || colors.indexOf(separatorColor) === -1) {
				console.error('Invalid multiple chronographs row separator settings', separator, separatorColor);
				$scope.error = Homey.__('settings.multiple_invalid_settings');
				separator = 'none';
				separatorColor = 'default';
			}
			$scope.rowSeparator = separator;
			$scope.separatorLayout = window.ChronographWidgetStyle.separatorLayout(separator);
			$scope.rowSeparatorColor = separatorColor === 'default'
				? 'currentColor' : window.ChronographWidgetStyle.valueColor(separatorColor);

			for (var slot = 1; slot <= 10; slot++) {
				var prefix = 'chronograph' + slot;
				var selection = settings[prefix];
				if (!selection) continue;
				var type = selection.type || (selection.data && selection.data.type);
				type = typeof type === 'string' ? type.toLowerCase() : '';
				var name = selection.chronographName || (selection.data && selection.data.name) || selection.name;
				var span = settings[prefix + 'ColumnSpan'];
				span = span === undefined || span === null || span === '' ? 1 : Number(span);
				if (['timer', 'stopwatch', 'transition'].indexOf(type) === -1
					|| typeof name !== 'string' || !name.trim()
					|| !Number.isInteger(span) || span < 1 || span > 3) {
					console.error('Invalid multiple chronographs selection or column span', slot, selection, span);
					$scope.error = Homey.__('settings.multiple_invalid_settings');
					continue;
				}
				span = Math.min(columns, span);
				var designStyle = settings[prefix + 'DesignStyle'];
				if (!window.ChronographWidgetStyle.settingId(designStyle)) {
					if (columns - span === 1) designStyle = 'builtin:small';
					else if (columns - span === 2) designStyle = 'builtin:tiny';
				}
				var layout = settings[prefix + 'Layout'];
				if (layout === undefined || layout === null || layout === '' || layout === 'auto') {
					layout = span < columns ? 'compact' : 'normal';
				}
				$scope.entries.push({
					slot: slot,
					type: type,
					span: span,
					settings: {
						chronograph: { name: name },
						alternativeName: settings[prefix + 'AlternativeName'],
						designStyle: designStyle,
						colorTheme: Object.prototype.hasOwnProperty.call(settings, prefix + 'ColorTheme')
							? settings[prefix + 'ColorTheme'] : settings[prefix + 'ColorScheme'],
						layout: layout,
						icon: settings[prefix + 'Icon'],
						showMilliseconds: settings[prefix + 'ShowMilliseconds'],
						reverseTime: settings[prefix + 'ReverseTime']
					}
				});
			}
			var row;
			var usedColumns = 0;
			$scope.entries.forEach(function (entry) {
				if (!row || usedColumns + entry.span > columns) {
					row = [];
					$scope.rows.push(row);
					usedColumns = 0;
				}
				row.push(entry);
				usedColumns += entry.span;
			});
			pending = $scope.entries.length;
			$scope.rowStyle = function (row) {
				return Object.assign({ 'grid-template-columns': 'repeat(' + columns + ', minmax(0, 1fr))' },
					$scope.separatorLayout === 'rows' ? row.paddingStyle : {});
			};
			$scope.entryStyle = function (entry, appearance) {
				return Object.assign({ 'grid-column': 'span ' + entry.span },
					$scope.separatorLayout === 'cards'
						? Object.assign(window.ChronographWidgetStyle.paddingStyle([entry.padding || {}]), appearance) : {});
			};

			function resize() {
				if (!ready || destroyed || !window.requestAnimationFrame || !Homey.setHeight) return;
				window.requestAnimationFrame(function () {
					if (destroyed) return;
					var main = document.querySelector('main');
					var bodyStyle = window.getComputedStyle(document.body);
					var height = Math.ceil(main.getBoundingClientRect().height
						+ parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom));
					if (!height || height === lastHeight) return;
					lastHeight = height;
					Homey.setHeight(height).catch(function (error) {
						console.error('Unable to resize multiple Chronographs widget', error);
					});
				});
			}

			function markReady() {
				if (ready) return;
				ready = true;
				Homey.ready();
				resize();
			}

			function syncIntervals() {
				var visible = !destroyed && document.hidden !== true;
				var running = visible && Object.keys(runningSlots).length > 0;
				if (running && !clockInterval) {
					clockInterval = $interval(function () { $scope.$broadcast('multipleChronographsClock'); }, 250);
				} else if (!running && clockInterval) {
					$interval.cancel(clockInterval);
					clockInterval = null;
				}
				if (visible && !refreshInterval) {
					refreshInterval = $interval(function () { $scope.$broadcast('multipleChronographsRefresh'); }, 5000);
				} else if (!visible && refreshInterval) {
					$interval.cancel(refreshInterval);
					refreshInterval = null;
				}
			}

			function visibilityChanged() {
				syncIntervals();
				if (destroyed || document.hidden === true) return;
				pendingRefresh = null;
				$scope.$applyAsync(function () {
					if (destroyed || document.hidden === true) return;
					$scope.$broadcast('multipleChronographsClock');
					$scope.$broadcast('multipleChronographsRefresh');
				});
			}

			$scope.multipleWidget = {
				setPadding: function (entry, padding, borderless) {
					entry.padding = padding;
					entry.borderless = borderless;
					var runtime = window.ChronographWidgetStyle;
					$scope.framePaddingStyle = Object.assign(runtime.paddingStyle(
						$scope.entries.map(function (item) { return item.padding || {}; })),
						runtime.frameStyle($scope.entries.length > 0 && $scope.entries.every(function (item) { return item.borderless; })));
					$scope.rows.forEach(function (row) {
						row.paddingStyle = Object.assign(runtime.paddingStyle(
							row.map(function (item) { return item.padding || {}; })),
							runtime.frameStyle(row.length > 0 && row.every(function (item) { return item.borderless; })));
					});
				},
				tileReady: function () {
					pending--;
					if (!pending) markReady();
				},
				refresh: function (entry) {
					if (!pendingRefresh) {
						var selections = $scope.entries.map(function (item) {
							return { type: item.type, name: item.settings.chronograph.name };
						});
						var request = Homey.api('POST', '/chronographs', { chronographs: selections });
						pendingRefresh = request;
						request.then(function () {
							if (pendingRefresh === request) pendingRefresh = null;
						}, function () {
							if (pendingRefresh === request) pendingRefresh = null;
						});
					}
					return pendingRefresh.then(function (results) {
						var result = Array.isArray(results) && results[$scope.entries.indexOf(entry)];
						if (!result || (!result.chronograph && !result.error)) {
							throw new Error('Invalid multiple chronographs response');
						}
						if (result.error) throw new Error(result.error);
						return result.chronograph;
					});
				},
				invalidateRefresh: function () {
					pendingRefresh = null;
				},
				setRunning: function (entry, running) {
					if (running) runningSlots[entry.slot] = true;
					else delete runningSlots[entry.slot];
					syncIntervals();
				}
			};
			if (!pending) $scope.$evalAsync(markReady);
			if (window.ResizeObserver) {
				observer = new window.ResizeObserver(resize);
				observer.observe(document.querySelector('main'));
			}
			Homey.on('chronograph_event_multi', function (events) {
				if (!destroyed && document.hidden !== true) $scope.$broadcast('multipleChronographsRealtime', events, true);
			});
			Homey.on('chronograph_event', function (event) {
				if (!destroyed && document.hidden !== true) $scope.$broadcast('multipleChronographsRealtime', [event]);
			});
			Homey.on('chronograph_flow_values_changed', function (event) {
				if (!destroyed && document.hidden !== true) $scope.$broadcast('multipleChronographsFlowValues', event);
			});
			document.addEventListener('visibilitychange', visibilityChanged);
			syncIntervals();
			$scope.$on('$destroy', function () {
				destroyed = true;
				$interval.cancel(refreshInterval);
				$interval.cancel(clockInterval);
				document.removeEventListener('visibilitychange', visibilityChanged);
				if (observer) observer.disconnect();
			});
		}
	]);
};
