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
				'cyan', 'indigo', 'pink', 'brown', 'grey', 'black', 'white'];
			if (['none', 'cards', 'line'].indexOf(separator) === -1 || colors.indexOf(separatorColor) === -1) {
				console.error('Invalid multiple chronographs row separator settings', separator, separatorColor);
				$scope.error = Homey.__('settings.multiple_invalid_settings');
				separator = 'none';
				separatorColor = 'default';
			}
			$scope.rowSeparator = separator;
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
				span = span === undefined || span === null ? 1 : Number(span);
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
				$scope.entries.push({
					slot: slot,
					type: type,
					span: span,
					settings: {
						chronograph: { name: name },
						alternativeName: settings[prefix + 'AlternativeName'],
						designStyle: designStyle,
						colorScheme: settings[prefix + 'ColorScheme'],
						layout: settings[prefix + 'Layout'],
						icon: settings[prefix + 'Icon'],
						showMilliseconds: settings[prefix + 'ShowMilliseconds']
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

			$scope.multipleWidget = {
				tileReady: function () {
					pending--;
					if (!pending) markReady();
				}
			};
			if (!pending) $scope.$evalAsync(markReady);
			if (window.ResizeObserver) {
				observer = new window.ResizeObserver(resize);
				observer.observe(document.querySelector('main'));
			}
			Homey.on('chronograph_event_multi', function () { $scope.$broadcast('multipleChronographsRefresh'); });
			Homey.on('chronograph_flow_values_changed', function (event) { $scope.$broadcast('multipleChronographsFlowValues', event); });
			var refreshInterval = $interval(function () { $scope.$broadcast('multipleChronographsRefresh'); }, 5000);
			var clockInterval = $interval(function () { $scope.$broadcast('multipleChronographsClock'); }, 250);
			$scope.$on('$destroy', function () {
				destroyed = true;
				$interval.cancel(refreshInterval);
				$interval.cancel(clockInterval);
				if (observer) observer.disconnect();
			});
		}
	]);
};
