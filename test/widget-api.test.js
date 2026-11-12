'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Chronograph = require('../lib/chronograph.js');
const { Utils, ChronographType } = require('../lib/utils.js');
const appApi = require('../api.js');
const widgetApi = require('../widgets/timer/api.js');
const stopwatchWidgetApi = require('../widgets/stopwatch/api.js');
const transitionWidgetApi = require('../widgets/transition/api.js');
const multipleWidgetApi = require('../widgets/multiple_chronographs/api.js');

describe('Chronograph widget API', () => {
	let chronographId;
	let originalHomey;
	let homey;
	let chronographs;
	let savedStartArgs;

	beforeEach(() => {
		chronographId = Utils.generateId(ChronographType.TIMER, 'Widget API timer');
		const stopwatchId = Utils.generateId(ChronographType.STOPWATCH, 'Widget API stopwatch');
		const transitionId = Utils.generateId(ChronographType.TRANSITION, 'Widget API transition');
		originalHomey = Chronograph.homey;
		Chronograph.homey = {
			setTimeout,
			clearTimeout
		};
		chronographs = {
			timer: [{ name: 'Widget API timer' }],
			stopwatch: ['Widget API stopwatch'],
			transition: [{ name: 'Widget API transition' }]
		};
		savedStartArgs = {
			timer_start_cards: [
				{ name: 'Widget API timer', time: 30, unit: { id: 'seconds' } }
			],
			transition_start_cards: [
				{
					namedd: { name: 'Widget API transition' },
					time: '15',
					unit: { id: 'minutes' },
					from: 10,
					to: 90,
					steps: 12
				}
			]
		};
		homey = {
			app: { chronographs },
			__: key => key,
			settings: {
				get: key => savedStartArgs[key] || [],
				set: (key, value) => { savedStartArgs[key] = value; }
			}
		};
		homey.widgetChronographIds = [chronographId, stopwatchId, transitionId];
	});

	afterEach(() => {
		homey.widgetChronographIds.forEach(id => {
			const chronograph = Chronograph.get(id);
			if (chronograph) chronograph.stop();
		});
		Chronograph.homey = originalHomey;
	});

	it('provides all Homey languages for widget names and settings', () => {
		const languages = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar'];
		const generated = require('../app.json').widgets;
		for (const type of ['timer', 'stopwatch', 'transition', 'multiple_chronographs']) {
			const compose = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'widgets', type, 'widget.compose.json'), 'utf8'));
			function check(translations, generatedTranslations, label) {
				assert.deepStrictEqual(generatedTranslations, translations, `${type}: ${label}`);
				for (const language of languages) {
					assert.ok(typeof translations[language] === 'string' && translations[language].trim(), `${type}: ${label}: ${language}`);
					if (translations.en.includes('Chronograph')) {
						assert.ok(translations[language].includes('Chronograph'), `${type}: ${label}: ${language}: brand`);
					}
				}
			}
			check(compose.name, generated[type].name, 'name');
			for (const setting of compose.settings) {
				const actual = generated[type].settings.find(item => item.id === setting.id);
				check(setting.title, actual.title, `${setting.id} title`);
				if (setting.hint) check(setting.hint, actual.hint, `${setting.id} hint`);
				for (const option of setting.values || []) {
					const generatedOption = actual.values.find(item => item.id === option.id);
					check(option.title, generatedOption.title, `${setting.id} ${option.id}`);
				}
			}
		}
	});

	it('exposes only the saved widget style collection to widgets', async () => {
		const collection = { version: 2, styles: [{ id: 'design', name: 'Design' }], colorSchemes: [] };
		savedStartArgs.widgetStyles = collection;
		assert.strictEqual(await widgetApi.getWidgetStyles({ homey }), collection);
		delete savedStartArgs.widgetStyles;
		assert.deepStrictEqual(await widgetApi.getWidgetStyles({ homey }), {
			version: 2,
			styles: [],
			colorSchemes: []
		});
	});

	it('uses each existing type-specific API for the multiple widget', async () => {
		for (const [type, name] of [['Timer', 'Widget API timer'], ['Stopwatch', 'Widget API stopwatch'], ['Transition', 'Widget API transition']]) {
			const result = await multipleWidgetApi['get' + type]({ homey, params: { name } });
			assert.strictEqual(result.type, type);
			assert.strictEqual(result.name, name);
		}
		await assert.rejects(multipleWidgetApi.getTimer({ homey, params: { name: 'Widget API transition' } }));
	});

	it('returns independent results for a bounded batch of selected chronographs', async () => {
		const results = await multipleWidgetApi.getChronographs({ homey, body: { chronographs: [
			{ type: 'timer', name: 'Widget API timer' },
			{ type: 'stopwatch', name: 'Widget API stopwatch' },
			{ type: 'timer', name: 'Missing' },
			{ type: 'other', name: 'Widget API timer' }
		] } });
		assert.strictEqual(results[0].chronograph.name, 'Widget API timer');
		assert.strictEqual(results[1].chronograph.type, 'Stopwatch');
		assert.strictEqual(results[2].error, 'Chronograph not found in app configuration');
		assert.strictEqual(results[3].error, 'Unsupported chronograph type');
		await assert.rejects(multipleWidgetApi.getChronographs({ homey, body: { chronographs: Array(11).fill({}) } }),
			/Invalid chronograph selections/);
	});

	it('gets the selected configured and active chronograph', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		const result = await widgetApi.getChronograph({ homey, params: { name: 'Widget API timer' } });
		assert.ok(result);
		assert.strictEqual(result.name, 'Widget API timer');
		assert.strictEqual(result.type, ChronographType.TIMER);
		assert.strictEqual(result.active, true);
		assert.strictEqual(result.running, false);
		assert.strictEqual(result.targetDuration, 30000);
		assert.strictEqual(result.defaults.time, 30);
		assert.strictEqual(result.defaults.unit, 'seconds');
	});

	it('returns an inactive state for a configured chronograph that is not running', async () => {
		const result = await widgetApi.getChronograph({ homey, params: { name: 'Widget API timer' } });
		assert.strictEqual(result.active, false);
		assert.strictEqual(result.name, 'Widget API timer');
		assert.strictEqual(result.type, ChronographType.TIMER);
		assert.strictEqual(result.defaults.time, 30);
	});

	it('leaves saved Flow defaults empty when no start card values are configured', async () => {
		savedStartArgs.timer_start_cards = [];

		const result = await widgetApi.getChronograph({ homey, params: { name: 'Widget API timer' } });
		assert.strictEqual(result.defaults.time, undefined);
		assert.strictEqual(result.defaults.unit, undefined);
		assert.strictEqual(result.defaults.from, undefined);
		assert.strictEqual(result.defaults.to, undefined);
		assert.strictEqual(result.defaults.steps, undefined);
	});

	it('pauses, resumes and stops a selected chronograph', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		timer.start();

		const paused = await widgetApi.putChronograph({
			homey,
			params: { name: 'Widget API timer' },
			body: { running: false }
		});
		assert.strictEqual(paused.running, false);

		const resumed = await widgetApi.putChronograph({
			homey,
			params: { name: 'Widget API timer' },
			body: { running: true }
		});
		assert.strictEqual(resumed.running, true);

		assert.strictEqual(await widgetApi.deleteChronograph({ homey, params: { name: 'Widget API timer' } }), true);
		assert.strictEqual(Chronograph.get(chronographId), false);
	});

	it('pauses, resumes and stops selected stopwatches and transitions', async () => {
		const widgetTypes = [
			{ type: ChronographType.STOPWATCH, name: 'Widget API stopwatch', api: stopwatchWidgetApi },
			{ type: ChronographType.TRANSITION, name: 'Widget API transition', api: transitionWidgetApi }
		];

		for (const { type, name, api } of widgetTypes) {
			const id = Utils.generateId(type, name);
			homey.widgetChronographIds.push(id);
			const chronograph = new Chronograph(id, name, 30, 'seconds');
			chronograph.setData('type', type);
			chronograph.start();

			const paused = await api.putChronograph({
				homey,
				params: { name },
				body: { running: false }
			});
			assert.strictEqual(paused.running, false);

			const resumed = await api.putChronograph({
				homey,
				params: { name },
				body: { running: true }
			});
			assert.strictEqual(resumed.running, true);

			assert.strictEqual(await api.deleteChronograph({ homey, params: { name } }), true);
			assert.strictEqual(Chronograph.get(id), false);
		}
	});

	it('starts a timer with the duration supplied by the widget', async () => {
		const started = await widgetApi.startChronograph({
			homey,
			params: { name: 'Widget API timer' },
			body: { time: 2, unit: 'seconds' }
		});

		const timer = Chronograph.get(chronographId);
		assert.ok(timer);
		assert.strictEqual(timer.isRunning(), true);
		assert.strictEqual(timer.getTargetDuration(), 2000);
		assert.strictEqual(started.name, 'Widget API timer');
		assert.strictEqual(started.type, ChronographType.TIMER);
		assert.strictEqual(started.active, true);
		assert.strictEqual(started.running, true);
		assert.strictEqual(started.targetDuration, 2000);
		assert.strictEqual(started.defaults.time, 30);
		assert.strictEqual(chronographs.timer[0].flowValues, undefined);
		assert.strictEqual(savedStartArgs.chronographs, undefined);

		const result = await widgetApi.getChronograph({ homey, params: { name: 'Widget API timer' } });
		assert.strictEqual(result.defaults.time, 30);
		assert.strictEqual(result.defaults.unit, 'seconds');

		await widgetApi.deleteChronograph({ homey, params: { name: 'Widget API timer' } });
		const stopped = await widgetApi.getChronograph({ homey, params: { name: 'Widget API timer' } });
		assert.strictEqual(stopped.active, false);
		assert.strictEqual(stopped.defaults.time, 30);
		assert.strictEqual(stopped.defaults.unit, 'seconds');
	});

	it('saves values when started through the Flow start listener', async () => {
		await Chronograph.timer_startRunListener(homey, {
			name: 'Widget API timer',
			time: '45',
			unit: 'minutes'
		});

		assert.deepStrictEqual(chronographs.timer[0].flowValues, { time: 45, unit: 'minutes' });
		assert.deepStrictEqual(savedStartArgs.chronographs, chronographs);
		assert.deepStrictEqual(Chronograph.get(chronographId).getData('flowValues'), {
			time: 45,
			unit: 'minutes'
		});
	});

	it('starts a stopwatch without a duration', async () => {
		const stopwatchId = Utils.generateId(ChronographType.STOPWATCH, 'Widget API stopwatch');
		await stopwatchWidgetApi.startChronograph({
			homey,
			params: { name: 'Widget API stopwatch' },
			body: {}
		});

		const stopwatch = Chronograph.get(stopwatchId);
		assert.ok(stopwatch);
		assert.strictEqual(stopwatch.isRunning(), true);
		assert.ok(isNaN(stopwatch.getTargetDuration()));
	});

	it('requires widget timer and transition durations of at least one in the chosen unit', async () => {
		const types = [
			{ type: ChronographType.TIMER, name: 'Widget API timer', api: widgetApi },
			{ type: ChronographType.TRANSITION, name: 'Widget API transition', api: transitionWidgetApi }
		];

		for (const { type, name, api } of types) {
			const id = Utils.generateId(type, name);
			for (const time of [0, 0.001, 0.999, -1, '0.5', NaN, Infinity, 'invalid']) {
				await assert.rejects(api.startChronograph({
					homey,
					params: { name },
					body: { time, unit: 'seconds', from: 0, to: 10, steps: 2 }
				}), /invalid_duration/);
				assert.strictEqual(Chronograph.get(id), false);
			}
			for (const time of [1, 1.5, '2']) {
				await api.startChronograph({
					homey,
					params: { name },
					body: { time, unit: 'seconds', from: 0, to: 10, steps: 2 }
				});
				assert.strictEqual(Chronograph.get(id).getTargetDuration(), Number(time) * 1000);
				Chronograph.get(id).stop();
			}
		}
	});

	it('uses zero as the duration setting default and enforces the start minimum', () => {
		for (const type of ['timer', 'transition']) {
			const root = path.join(__dirname, '..', 'widgets', type);
			const compose = JSON.parse(fs.readFileSync(path.join(root, 'widget.compose.json'), 'utf8'));
			const duration = compose.settings.find(setting => setting.id === 'defaultDuration');
			assert.strictEqual(duration.type, 'number');
			assert.strictEqual(duration.value, 0);
			assert.strictEqual(duration.min, 0);
			assert.strictEqual(duration.pattern, undefined);
			const generated = require('../app.json').widgets[type].settings.find(setting => setting.id === 'defaultDuration');
			for (const [language, hint] of Object.entries(duration.hint)) {
				assert.ok(!/[?\uFFFD]/.test(hint), `${type}: ${language}`);
				assert.strictEqual(generated.hint[language], hint, `${type}: ${language}`);
			}
			const unit = compose.settings.find(setting => setting.id === 'defaultDurationUnit');
			assert.strictEqual(unit.value, 'auto');
			assert.ok(unit.values.some(value => value.id === 'auto'));
			const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
			assert.match(html, /<input\b[^>]*\bid="duration"[^>]*\bmin="1"[^>]*\bstep="any"/);
		}
	});

	it('still permits fractional durations through Flow start listeners', async () => {
		await Chronograph.timer_startRunListener(homey, {
			name: 'Widget API timer',
			time: 0.5,
			unit: 'seconds'
		});
		assert.strictEqual(Chronograph.get(chronographId).getTargetDuration(), 500);
	});

	it('starts a transition with widget duration and configured transition values', async () => {
		const transitionId = Utils.generateId(ChronographType.TRANSITION, 'Widget API transition');
		const result = await transitionWidgetApi.getChronograph({ homey, params: { name: 'Widget API transition' } });
		assert.strictEqual(result.defaults.from, 10);
		assert.strictEqual(result.defaults.to, 90);
		assert.strictEqual(result.defaults.steps, 12);

		const previousTransitionFlowValues = {
			time: 15,
			unit: 'minutes',
			from: 10,
			to: 90,
			steps: 12
		};
		chronographs.transition[0].flowValues = previousTransitionFlowValues;
		const started = await transitionWidgetApi.startChronograph({
			homey,
			params: { name: 'Widget API transition' },
			body: { time: 2, unit: 'seconds', from: 0, to: 50, steps: 4 }
		});

		const transition = Chronograph.get(transitionId);
		assert.ok(transition);
		assert.strictEqual(transition.isRunning(), true);
		assert.strictEqual(transition.getTargetDuration(), 2000);
		assert.strictEqual(transition.getData('from'), 0);
		assert.strictEqual(transition.getData('to'), 50);
		assert.strictEqual(transition.getData('steps'), 4);
		assert.strictEqual(transition.getData('flowValues'), undefined);
		assert.deepStrictEqual(chronographs.transition[0].flowValues, previousTransitionFlowValues);
		assert.strictEqual(started.steps, 4);
		assert.deepStrictEqual(started.defaults, previousTransitionFlowValues);

		const updated = await transitionWidgetApi.getChronograph({ homey, params: { name: 'Widget API transition' } });
		assert.strictEqual(updated.defaults.time, 15);
		assert.strictEqual(updated.defaults.unit, 'minutes');
		assert.strictEqual(updated.defaults.from, 10);
		assert.strictEqual(updated.defaults.to, 90);
		assert.strictEqual(updated.defaults.steps, 12);
		assert.strictEqual(updated.steps, 4);
		const paused = await transitionWidgetApi.putChronograph({ homey, params: { name: 'Widget API transition' }, body: { running: false } });
		assert.strictEqual(paused.steps, 4);
	});

	it('restores a transition step count and split times for widgets', async () => {
		const id = Utils.generateId(ChronographType.TRANSITION, 'Widget API transition');
		const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
		const sandbox = {
			module: { exports: {} },
			require(name) {
				if (name === 'homey') return { App: class {} };
				if (name === './lib/chronograph.js') return Chronograph;
				if (name === './lib/utils.js') return require('../lib/utils.js');
				return class {};
			},
			Date,
			console
		};
		vm.runInNewContext(source, sandbox);
		const app = new sandbox.module.exports();
		const snapshot = {
			name: 'Widget API transition',
			targetDuration: 12000,
			duration: 0,
			running: false,
			data: { type: ChronographType.TRANSITION, steps: 4 }
		};
		app.homey = {
			settings: { get: () => ({ [id]: snapshot }), set() {} },
			setTimeout() {},
			error(...args) { throw new Error(args.join(' ')); }
		};
		app._restoreChronographs();
		const restored = Chronograph.get(id);
		assert.strictEqual(restored.getData('steps'), 4);
		assert.strictEqual(restored._transitionSplits.count, 2);
		assert.strictEqual(restored._transitionSplits.interval, 4000);
		assert.strictEqual(snapshot.data.steps, 4);
		const result = await transitionWidgetApi.getChronograph({ homey, params: { name: 'Widget API transition' } });
		assert.strictEqual(result.steps, 4);
	});

	it('rejects invalid running values and unknown chronographs', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		await assert.rejects(widgetApi.putChronograph({
			homey,
			params: { name: 'Widget API timer' },
			body: { running: 'false' }
		}), /running property must be a boolean/);
		await assert.rejects(widgetApi.putChronograph({
			homey,
			params: { name: 'missing' },
			body: { running: false }
		}), /Chronograph not found in app configuration/);
	});

	it('restricts each widget API to its own chronograph type', async () => {
		await assert.rejects(transitionWidgetApi.getChronograph({
			homey,
			params: { name: 'Widget API timer' }
		}), /Chronograph not found in app configuration/);
		await assert.rejects(stopwatchWidgetApi.startChronograph({
			homey,
			params: { name: 'Widget API timer' },
			body: {}
		}), /Chronograph not found in app configuration/);
	});

	it('returns configured names without mutating app chronographs', async () => {
		const names = await appApi.getAllChronographs({ homey });
		assert.deepStrictEqual(names, {
			timer: ['Widget API timer'],
			stopwatch: ['Widget API stopwatch'],
			transition: ['Widget API transition']
		});
		assert.deepStrictEqual(chronographs.timer, [{ name: 'Widget API timer' }]);
	});
});
