'use strict';

const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType } = require('../lib/utils.js');
const TimerSplit = require('../lib/timer/triggers/timer_split.js');
const TimerElapsed = require('../lib/timer/triggers/timer_elapsed.js');

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
});
