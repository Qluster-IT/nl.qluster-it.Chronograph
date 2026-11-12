'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const IntervalElapsed = require('../lib/generic/triggers/interval_elapsed.js');

describe('Every interval Flow trigger', () => {
	let now, nextId, timers, originalNow, homey, card, settings, flows, calls, runs, errors, scheduler;
	const settingsKey = 'interval_elapsed_schedules';
	const flush = async () => {
		for (let i = 0; i < 8; i++) await Promise.resolve();
	};

	async function advance(milliseconds) {
		const end = now + milliseconds;
		while (true) {
			const next = Array.from(timers.entries()).sort((a, b) => a[1].at - b[1].at)[0];
			if (!next || next[1].at > end) break;
			now = next[1].at;
			timers.delete(next[0]);
			next[1].callback();
			await flush();
		}
		now = end;
		await flush();
	}

	async function start() {
		scheduler = new IntervalElapsed('interval_elapsed', homey);
		await flush();
	}

	beforeEach(() => {
		now = 1000000;
		nextId = 0;
		timers = new Map();
		originalNow = Date.now;
		Date.now = () => now;
		settings = {};
		flows = [];
		calls = [];
		runs = [];
		errors = [];
		card = new EventEmitter();
		card.registerRunListener = listener => { card.run = listener; };
		card.getArgumentValues = async () => flows.map(flow => flow.args);
		card.trigger = async (tokens, state) => {
			calls.push({ at: now, state });
			for (const flow of flows) {
				if (flow.enabled !== false && await card.run(flow.args, state)) runs.push({ id: flow.id, at: now });
			}
		};
		homey = Object.assign(new EventEmitter(), {
			flow: { getTriggerCard: () => card },
			settings: {
				get: key => settings[key],
				set: (key, value) => { settings[key] = JSON.parse(JSON.stringify(value)); }
			},
			setTimeout: (callback, delay) => {
				const id = ++nextId;
				timers.set(id, { at: now + delay, callback });
				return id;
			},
			clearTimeout: id => timers.delete(id),
			error: (...args) => errors.push(args)
		});
	});

	afterEach(() => {
		if (scheduler) scheduler.stop();
		scheduler = null;
		Date.now = originalNow;
	});

	it('runs different intervals independently and shares equivalent durations without duplicates', async () => {
		flows = [
			{ id: 'a', args: { amount: 2, unit: 'seconds' } },
			{ id: 'b', args: { amount: 2, unit: 'seconds' } },
			{ id: 'minutes', args: { amount: 1, unit: 'minutes' } },
			{ id: 'seconds', args: { amount: 60, unit: 'seconds' } },
			{ id: 'disabled', args: { amount: 2, unit: 'seconds' }, enabled: false }
		];
		await start();
		await advance(2000);
		assert.deepStrictEqual(runs.map(run => run.id), ['a', 'b']);
		assert.strictEqual(calls.length, 1);
		await advance(58000);
		assert.strictEqual(calls.filter(call => call.state.interval === 60000).length, 1);
		assert.deepStrictEqual(runs.filter(run => run.at === now).map(run => run.id).sort(), ['a', 'b', 'minutes', 'seconds']);
	});

	it('reconciles saved, changed and removed Flow cards without resetting existing intervals', async () => {
		flows = [{ id: 'a', args: { amount: 5, unit: 'seconds' } }];
		await start();
		await advance(3000);
		flows.push({ id: 'b', args: { amount: 5, unit: 'seconds' } });
		flows.push({ id: 'c', args: { amount: 2, unit: 'seconds' } });
		card.emit('update');
		await flush();
		await advance(2000);
		assert.deepStrictEqual(runs.map(run => run.id), ['a', 'b', 'c']);
		flows = [{ id: 'a', args: { amount: 3, unit: 'seconds' } }];
		card.emit('update');
		await flush();
		assert.deepStrictEqual(Object.keys(settings[settingsKey]), ['3000']);
		await advance(3000);
		assert.strictEqual(runs[runs.length - 1].id, 'a');
		assert.strictEqual(calls.length, 3);
	});

	it('restores remaining time across a restart', async () => {
		flows = [{ id: 'a', args: { amount: 5, unit: 'minutes' } }];
		await start();
		await advance(240000);
		scheduler.stop();
		await advance(30000);
		await start();
		await advance(29999);
		assert.strictEqual(calls.length, 0);
		await advance(1);
		assert.strictEqual(calls.length, 1);
		scheduler.stop();
		await advance(120000);
		await start();
		await advance(179999);
		assert.strictEqual(calls.length, 1);
		await advance(1);
		assert.strictEqual(calls.length, 2);
	});

	it('fires one overdue catch-up and starts a fresh interval after a long outage', async () => {
		flows = [{ id: 'a', args: { amount: 5, unit: 'minutes' } }];
		await start();
		await advance(240000);
		scheduler.stop();
		await advance(600000);
		await start();
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(settings[settingsKey]['300000'], now + 300000);
		await advance(299999);
		assert.strictEqual(calls.length, 1);
		await advance(1);
		assert.strictEqual(calls.length, 2);
	});

	it('does not fire a second time immediately after a delayed tick', async () => {
		flows = [{ id: 'a', args: { amount: 5, unit: 'seconds' } }];
		await start();
		now += 9999;
		scheduler.processDue();
		await flush();
		assert.strictEqual(calls.length, 1);
		await advance(4999);
		assert.strictEqual(calls.length, 1);
		await advance(1);
		assert.strictEqual(calls.length, 2);
	});

	it('logs trigger failures, retries without a burst, and retains the overdue deadline', async () => {
		flows = [{ id: 'a', args: { amount: 2, unit: 'seconds' } }];
		await start();
		const trigger = card.trigger;
		card.trigger = async () => { throw new Error('Homey is not ready'); };
		await advance(2000);
		assert.strictEqual(errors.length, 1);
		assert.strictEqual(settings[settingsKey]['2000'], now);
		card.trigger = trigger;
		await advance(5000);
		assert.strictEqual(calls.length, 1);
		await advance(1999);
		assert.strictEqual(calls.length, 1);
		await advance(1);
		assert.strictEqual(calls.length, 2);
	});

	it('retries a failed initial Flow lookup without discarding saved deadlines', async () => {
		flows = [{ id: 'a', args: { amount: 5, unit: 'seconds' } }];
		settings[settingsKey] = { '5000': now - 1000 };
		const getArgumentValues = card.getArgumentValues;
		card.getArgumentValues = async () => { throw new Error('Not ready'); };
		await start();
		assert.strictEqual(settings[settingsKey]['5000'], now - 1000);
		assert.strictEqual(errors.length, 1);
		card.getArgumentValues = getArgumentValues;
		await advance(5000);
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(settings[settingsKey]['5000'], now + 5000);
	});

	it('ignores stale Flow lookups when cards are updated', async () => {
		let resolveOld;
		card.getArgumentValues = () => new Promise(resolve => { resolveOld = resolve; });
		await start();
		flows = [{ id: 'new', args: { amount: 2, unit: 'seconds' } }];
		card.getArgumentValues = async () => flows.map(flow => flow.args);
		card.emit('update');
		await flush();
		resolveOld([{ amount: 5, unit: 'seconds' }]);
		await flush();
		assert.deepStrictEqual(Object.keys(settings[settingsKey]), ['2000']);
		await advance(2000);
		assert.deepStrictEqual(runs.map(run => run.id), ['new']);
	});

	it('registers the generic trigger during app initialization', async () => {
		flows = [{ id: 'a', args: { amount: 1, unit: 'seconds' } }];
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => {
				if (id === 'homey') return { App: class {} };
				if (id === './lib/generic/conditions/delay_passed.js') return class {};
				if (id === './lib/generic/triggers/interval_elapsed.js') return IntervalElapsed;
				return {};
			}
		});
		const app = { homey };
		module.exports.prototype._initializeGenericCards.call(app);
		scheduler = app._cards.interval_elapsed;
		await flush();
		await advance(1000);
		assert.deepStrictEqual(runs.map(run => run.id), ['a']);
	});

	it('rejects invalid configurations and handles intervals longer than the platform timeout limit', async () => {
		flows = [
			{ id: 'zero', args: { amount: 0, unit: 'seconds' } },
			{ id: 'fraction', args: { amount: 0.5, unit: 'minutes' } },
			{ id: 'token', args: { amount: '[[token]]', unit: 'seconds' } },
			{ id: 'milliseconds', args: { amount: 1, unit: 'milliseconds' } },
			{ id: 'long', args: { amount: 30, unit: 'days' } }
		];
		await start();
		assert.strictEqual(errors.length, 4);
		assert.strictEqual(Array.from(timers.values())[0].at - now, 2147483647);
		await advance(30 * 24 * 60 * 60 * 1000);
		assert.strictEqual(calls.length, 1);
		assert.deepStrictEqual(runs.map(run => run.id), ['long']);
		assert.strictEqual(errors.length, 8);
	});

	it('declares the localized trigger last with numeric, whole-number arguments', () => {
		const root = path.join(__dirname, '..');
		const trigger = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose', 'flow', 'triggers', '6_interval_elapsed.json'), 'utf8'));
		const generated = require('../app.json').flow.triggers;
		assert.deepStrictEqual(generated[generated.length - 1], trigger);
		assert.strictEqual(trigger.id, 'interval_elapsed');
		assert.deepStrictEqual(trigger.args.map(arg => arg.name), ['amount', 'unit']);
		assert.strictEqual(trigger.args[0].type, 'number');
		assert.strictEqual(trigger.args[0].min, 1);
		assert.strictEqual(trigger.args[0].step, 1);
		assert.deepStrictEqual(trigger.args[1].values.map(value => value.id), ['seconds', 'minutes', 'hours', 'days']);
		for (const language of ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar']) {
			for (const text of [trigger.title[language], trigger.titleFormatted[language], trigger.hint[language],
				...trigger.args.map(arg => arg.title[language]), ...trigger.args[1].values.map(value => value.label[language])]) {
				assert.ok(text && !/[?\uFFFD]/.test(text), `${language}: ${text}`);
			}
		}
	});
});
