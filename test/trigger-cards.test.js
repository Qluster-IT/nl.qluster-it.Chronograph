'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType } = require('../lib/utils.js');
const TimerPaused = require('../lib/timer/triggers/timer_paused.js');
const TimerFinished = require('../lib/timer/triggers/timer_finished.js');

describe('Chronograph trigger cards', () => {
	let existing, errors, settings, homey;

	const createCard = overrides => Object.assign({
		listeners: {},
		registerRunListener(listener) { this.run = listener; },
		on(event, listener) { this.listeners[event] = listener; },
		getArgumentValues: async () => [],
		trigger: async () => {}
	}, overrides);
	const timer = {
		getData: key => key === 'type' ? ChronographType.TIMER : undefined,
		getName: () => 'Kitchen',
		getId: () => 'kitchen-id',
		getTargetDuration: () => 10000,
		getDuration: () => 7500
	};
	const settle = () => new Promise(resolve => setImmediate(resolve));

	beforeEach(() => {
		existing = new Map(Chronograph.events.eventNames().map(event => [event, new Set(Chronograph.events.listeners(event))]));
		errors = [];
		settings = {};
		homey = {
			flow: {},
			settings: { get: key => settings[key], set: (key, value) => { settings[key] = value; } },
			error: (...args) => errors.push(args),
			__: key => key
		};
	});

	afterEach(() => {
		for (const event of Chronograph.events.eventNames()) {
			Chronograph.events.listeners(event)
				.filter(listener => !(existing.get(event) || new Set()).has(listener))
				.forEach(listener => Chronograph.events.removeListener(event, listener));
		}
	});

	it('logs a rejected Flow trigger instead of leaving it unhandled', async () => {
		const calls = [];
		const card = createCard({
			trigger: (tokens, state) => {
				calls.push({ tokens, state });
				return Promise.reject(new Error('trigger failed'));
			}
		});
		homey.flow.getTriggerCard = () => card;
		new TimerPaused('timer_paused', homey);

		Chronograph.events.emit('paused', timer);
		await settle();

		assert.deepStrictEqual(calls, [{
			tokens: { name: 'Kitchen', seconds: 2.5 },
			state: { id: 'kitchen-id', name: 'Kitchen' }
		}]);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0][1].message, /trigger failed/);
	});

	it('logs a failure to read Flow arguments and stores them on the next update', async () => {
		const updates = [];
		let fail = true;
		const card = createCard({
			getArgumentValues: async () => {
				if (fail) throw new Error('arguments unavailable');
				return [{ name: 'Kitchen' }];
			}
		});
		homey.flow.getTriggerCard = () => card;
		Chronograph.events.on('trigger_cards_updated', args => updates.push(args));
		new TimerFinished('timer_finished', homey);
		await settle();

		assert.strictEqual(errors.length, 1);
		assert.match(errors[0][1].message, /arguments unavailable/);
		assert.strictEqual(settings.timer_trigger_cards, undefined);

		fail = false;
		card.listeners.update();
		await settle();

		assert.deepStrictEqual(settings.timer_trigger_cards, [{ name: 'Kitchen' }]);
		assert.deepStrictEqual(updates, [[{ name: 'Kitchen' }]]);
	});

	it('loads utils.js before chronograph.js', () => {
		const output = execFileSync(process.execPath, ['-e',
			"const { Utils } = require('./lib/utils.js'); require('./lib/chronograph.js'); process.stdout.write(String(Utils.calculateDuration(2, 'seconds')));"
		], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
		assert.strictEqual(output, '2000');
	});
});
