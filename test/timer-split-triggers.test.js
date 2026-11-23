'use strict';

const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType } = require('../lib/utils.js');
const TimerSplit = require('../lib/timer/triggers/timer_split.js');
const TimerElapsed = require('../lib/timer/triggers/timer_elapsed.js');
const StopwatchSplit = require('../lib/stopwatch/triggers/stopwatch_split.js');

describe('Timer split trigger direction', () => {
	let existingSplitListeners;

	beforeEach(() => {
		existingSplitListeners = new Set(Chronograph.events.listeners('split'));
	});

	afterEach(() => {
		Chronograph.events.listeners('split')
			.filter(listener => !existingSplitListeners.has(listener))
			.forEach(listener => Chronograph.events.removeListener('split', listener));
	});

	it('triggers remaining-time and elapsed-time cards only for their own splits', () => {
		const calls = { remaining: [], elapsed: [] };
		const cards = {
			timer_split: {
				registerRunListener() {},
				on() {},
				trigger(tokens, state) { calls.remaining.push(state); }
			},
			timer_elapsed: {
				registerRunListener() {},
				on() {},
				trigger(tokens, state) { calls.elapsed.push(state); }
			}
		};
		const homey = { flow: { getTriggerCard: id => cards[id] } };
		new TimerSplit('timer_split', homey);
		new TimerElapsed('timer_elapsed', homey);

		const timer = {
			getData: key => key === 'type' ? ChronographType.TIMER : undefined,
			getName: () => 'direction test',
			getId: () => 'direction-test'
		};
		const remainingSplit = {
			data: { name: 'direction test', time: 4, unit: 'seconds', timerSplitType: 'remaining' }
		};
		const elapsedSplit = {
			data: { name: 'direction test', time: 4, unit: 'seconds', timerSplitType: 'elapsed' }
		};

		Chronograph.events.emit('split', timer, remainingSplit);
		Chronograph.events.emit('split', timer, elapsedSplit);

		assert.strictEqual(calls.remaining.length, 1);
		assert.strictEqual(calls.remaining[0].time, 4);
		assert.strictEqual(calls.elapsed.length, 1);
		assert.strictEqual(calls.elapsed[0].time, 4);
	});

	it('stores valid millisecond milestones and reports invalid values without changing other units', async () => {
		for (const [Trigger, id, key] of [
			[TimerSplit, 'timer_split', 'timer_splits'],
			[TimerElapsed, 'timer_elapsed', 'timer_elapsed_splits'],
			[StopwatchSplit, 'stopwatch_split', 'stopwatch_splits']
		]) {
			const args = [
				{ name: 'test', time: 50, unit: 'milliseconds' },
				{ name: 'test', time: 150, unit: 'milliseconds' },
				{ name: 'test', time: 25, unit: 'milliseconds' },
				{ name: 'test', time: 51, unit: 'milliseconds' },
				{ name: 'test', time: 0.01, unit: 'seconds' },
				{ name: 'test', time: 0, unit: 'milliseconds' },
				{ name: 'test', time: 50.5, unit: 'milliseconds' }
			];
			const errors = [], saved = {};
			const card = {
				registerRunListener() {},
				on(event, listener) { if (event === 'update') this.update = listener; },
				getArgumentValues: async () => args
			};
			const homey = {
				flow: { getTriggerCard: () => card },
				settings: { set: (setting, value) => { saved[setting] = value; } },
				error: (...error) => errors.push(error)
			};
			new Trigger(id, homey);
			await card.update();
			assert.deepStrictEqual(saved[key], [args[0], args[1], args[4]]);
			assert.strictEqual(errors.length, 4);
			assert.match(errors[0][0], /multiple of 50/);
		}
	});
});
