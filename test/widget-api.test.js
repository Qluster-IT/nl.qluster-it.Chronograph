'use strict';

const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { Utils, ChronographType } = require('../lib/utils.js');
const appApi = require('../api.js');
const widgetApi = require('../widgets/timer/api.js');
const stopwatchWidgetApi = require('../widgets/stopwatch/api.js');
const transitionWidgetApi = require('../widgets/transition/api.js');

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

	it('gets the selected configured and active chronograph', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		const result = await widgetApi.getChronograph({ homey, params: { id: chronographId } });
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
		const result = await widgetApi.getChronograph({ homey, params: { id: chronographId } });
		assert.strictEqual(result.active, false);
		assert.strictEqual(result.name, 'Widget API timer');
		assert.strictEqual(result.type, ChronographType.TIMER);
		assert.strictEqual(result.defaults.time, 30);
	});

	it('leaves saved Flow defaults empty when no start card values are configured', async () => {
		savedStartArgs.timer_start_cards = [];

		const result = await widgetApi.getChronograph({ homey, params: { id: chronographId } });
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
			params: { id: chronographId },
			body: { running: false }
		});
		assert.strictEqual(paused.running, false);

		const resumed = await widgetApi.putChronograph({
			homey,
			params: { id: chronographId },
			body: { running: true }
		});
		assert.strictEqual(resumed.running, true);

		assert.strictEqual(await widgetApi.deleteChronograph({ homey, params: { id: chronographId } }), true);
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
				params: { id },
				body: { running: false }
			});
			assert.strictEqual(paused.running, false);

			const resumed = await api.putChronograph({
				homey,
				params: { id },
				body: { running: true }
			});
			assert.strictEqual(resumed.running, true);

			assert.strictEqual(await api.deleteChronograph({ homey, params: { id } }), true);
			assert.strictEqual(Chronograph.get(id), false);
		}
	});

	it('starts a timer with the duration supplied by the widget', async () => {
		await widgetApi.startChronograph({
			homey,
			params: { id: chronographId },
			body: { time: 2, unit: 'seconds' }
		});

		const timer = Chronograph.get(chronographId);
		assert.ok(timer);
		assert.strictEqual(timer.isRunning(), true);
		assert.strictEqual(timer.getTargetDuration(), 2000);
		assert.deepStrictEqual(chronographs.timer[0].flowValues, { time: 2, unit: 'seconds' });
		assert.deepStrictEqual(savedStartArgs.chronographs, chronographs);

		const result = await widgetApi.getChronograph({ homey, params: { id: chronographId } });
		assert.strictEqual(result.defaults.time, 2);
		assert.strictEqual(result.defaults.unit, 'seconds');

		await widgetApi.deleteChronograph({ homey, params: { id: chronographId } });
		const stopped = await widgetApi.getChronograph({ homey, params: { id: chronographId } });
		assert.strictEqual(stopped.active, false);
		assert.strictEqual(stopped.defaults.time, 2);
		assert.strictEqual(stopped.defaults.unit, 'seconds');
	});

	it('starts a stopwatch without a duration', async () => {
		const stopwatchId = Utils.generateId(ChronographType.STOPWATCH, 'Widget API stopwatch');
		await stopwatchWidgetApi.startChronograph({
			homey,
			params: { id: stopwatchId },
			body: {}
		});

		const stopwatch = Chronograph.get(stopwatchId);
		assert.ok(stopwatch);
		assert.strictEqual(stopwatch.isRunning(), true);
		assert.ok(isNaN(stopwatch.getTargetDuration()));
	});

	it('starts a transition with widget duration and configured transition values', async () => {
		const transitionId = Utils.generateId(ChronographType.TRANSITION, 'Widget API transition');
		const result = await transitionWidgetApi.getChronograph({ homey, params: { id: transitionId } });
		assert.strictEqual(result.defaults.from, 10);
		assert.strictEqual(result.defaults.to, 90);
		assert.strictEqual(result.defaults.steps, 12);

		await transitionWidgetApi.startChronograph({
			homey,
			params: { id: transitionId },
			body: { time: 2, unit: 'seconds', from: 0, to: 50, steps: 4 }
		});

		const transition = Chronograph.get(transitionId);
		assert.ok(transition);
		assert.strictEqual(transition.isRunning(), true);
		assert.strictEqual(transition.getTargetDuration(), 2000);
		assert.strictEqual(transition.getData('from'), 0);
		assert.strictEqual(transition.getData('to'), 50);
		assert.strictEqual(transition.getData('steps'), 4);
		assert.deepStrictEqual(chronographs.transition[0].flowValues, {
			time: 2,
			unit: 'seconds',
			from: 0,
			to: 50,
			steps: 4
		});

		const updated = await transitionWidgetApi.getChronograph({ homey, params: { id: transitionId } });
		assert.strictEqual(updated.defaults.time, 2);
		assert.strictEqual(updated.defaults.unit, 'seconds');
		assert.strictEqual(updated.defaults.from, 0);
		assert.strictEqual(updated.defaults.to, 50);
		assert.strictEqual(updated.defaults.steps, 4);
	});

	it('rejects invalid running values and unknown chronographs', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		await assert.rejects(widgetApi.putChronograph({
			homey,
			params: { id: chronographId },
			body: { running: 'false' }
		}), /running property must be a boolean/);
		await assert.rejects(widgetApi.putChronograph({
			homey,
			params: { id: 'missing' },
			body: { running: false }
		}), /Chronograph not found in app configuration/);
	});

	it('restricts each widget API to its own chronograph type', async () => {
		await assert.rejects(transitionWidgetApi.getChronograph({
			homey,
			params: { id: chronographId }
		}), /Chronograph not found in app configuration/);
		await assert.rejects(stopwatchWidgetApi.startChronograph({
			homey,
			params: { id: chronographId },
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
