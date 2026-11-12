'use strict';

(function () {
	window.chronographSettingsPreview = true;
	var language = new URLSearchParams(location.search).get('lang')
		|| (navigator.language || 'en').slice(0, 2).toLowerCase();
	var supportedLanguages = ['ar', 'da', 'de', 'en', 'es', 'fr', 'it', 'ko', 'nl', 'no', 'pl', 'ru', 'sv'];
	if (supportedLanguages.indexOf(language) === -1) language = 'en';
	var storagePrefix = 'chronograph-settings-preview:';
	var chronographs = [
		{ id: 'preview-stopwatch', name: 'Sample stopwatch', data: { type: 'Stopwatch' }, running: true, duration: 75400 },
		{ id: 'preview-timer', name: 'Sample timer', data: { type: 'Timer' }, running: false, duration: 15000, targetDuration: 120000 },
		{ id: 'preview-transition', name: 'Sample transition', data: { type: 'Transition' }, running: true, duration: 25000 }
	];

	function loadLocale(code) {
		return Promise.all([code + '.json', code + '.settings.json'].map(function (file) {
			return fetch('/.homeycompose/locales/' + file).then(function (response) {
				if (!response.ok) throw new Error('Could not load preview translations: ' + file);
				return response.json();
			});
		})).then(function (parts) {
			parts[0].settings = parts[1];
			return parts[0];
		});
	}

	function findTranslation(locale, key) {
		return key.split('.').reduce(function (value, part) {
			return value && value[part];
		}, locale);
	}

	Promise.all([loadLocale('en'), language === 'en' ? Promise.resolve(null) : loadLocale(language)])
		.then(function (locales) {
			var homey = {
				__: function (key) {
					return findTranslation(locales[1], key) || findTranslation(locales[0], key) || key;
				},
				ready: function () {},
				on: function () {},
				alert: function (message) { window.alert(message); },
				confirm: function (message, type, callback) { callback(null, window.confirm(message)); },
				get: function (key, callback) {
					try {
						var value = localStorage.getItem(storagePrefix + key);
						callback(null, value === null ? (key === 'roundOfDurationsFlowcards' ? 2 : null) : JSON.parse(value));
					} catch (error) {
						callback(error);
					}
				},
				set: function (key, value, callback) {
					try {
						localStorage.setItem(storagePrefix + key, JSON.stringify(value));
						callback(null);
					} catch (error) {
						callback(error);
					}
				},
				api: function (method, url, data, callback) {
					if (method === 'GET' && url === '/chronographs/') {
						callback(null, JSON.parse(JSON.stringify(chronographs)));
						return;
					}
					var prefix = '/chronographs/';
					var parts = url.indexOf(prefix) === 0 ? url.slice(prefix.length).split('/') : [];
					var item = parts.length === 2
						? chronographs.find(function (entry) {
							return entry.data.type.toLowerCase() === parts[0] && entry.name === decodeURIComponent(parts[1]);
						}) : null;
					if (!item || (method !== 'PUT' && method !== 'DELETE')) {
						callback(new Error('Unsupported preview API request: ' + method + ' ' + url));
						return;
					}
					if (method === 'DELETE') chronographs.splice(chronographs.indexOf(item), 1);
					else item.running = data.running;
					callback(null, JSON.parse(JSON.stringify(item)));
				}
			};
			function initialize() {
				if (typeof window.onHomeyReady !== 'function') {
					console.error('Settings preview could not find onHomeyReady.');
					return;
				}
				document.title = 'Chronograph settings - local preview';
				window.onHomeyReady(homey);
			}
			if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
			else initialize();
		}).catch(function (error) {
			console.error(error);
			window.alert('Could not start the local settings preview: ' + error.message);
		});
}());
