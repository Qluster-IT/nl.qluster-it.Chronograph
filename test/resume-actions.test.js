'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType, Utils } = require('../lib/utils.js');
const ResumeChronograph = require('../lib/generic/actions/resume_chronograph.js');
const TimerResume = require('../lib/timer/actions/timer_resume.js');
const TransitionResume = require('../lib/transition/actions/transition_resume.js');
const { createWidgetApi } = require('../lib/widget-api.js');

describe('Resume chronograph actions', () => {
	const types = [
		['timer', ChronographType.TIMER],
		['transition', ChronographType.TRANSITION],
		['stopwatch', ChronographType.STOPWATCH]
	];
	const chronographIds = [];

	it('has translated hints without unresolved placeholders', () => {
		const languages = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar'];
		for (const [kind] of types) {
			const file = path.join(__dirname, '..', '.homeycompose', 'flow', 'actions', `1_${kind}_resume_existing.json`);
			const card = JSON.parse(fs.readFileSync(file, 'utf8'));
			for (const language of languages) {
				assert.ok(card.hint[language], `${kind}: ${language}`);
				assert.ok(!/\{[^}]+\}/.test(card.hint[language]), `${kind}: ${language}`);
				assert.strictEqual(card.hint[language].split('\n').length, 4, `${kind}: ${language}`);
			}
			assert.ok(card.hint.en.includes('The Picker is leading when both are filled.'));
			assert.ok(card.hint.en.includes('only appear in the picker after saving the (enabled) flow.'));
		}
	});

	describe('Resume-or-start Flow defaults', () => {
		let homey;
		let originalHomey;
		let started;
		const ids = [];

		beforeEach(() => {
			const settings = {};
			const cards = {};
			homey = {
				app: { chronographs: { timer: [], transition: [] } },
				settings: {
					get: key => settings[key],
					set: (key, value) => { settings[key] = value; }
				},
				flow: {
					getActionCard: id => {
						const card = {
							registerRunListener: listener => { card.run = listener; },
							on() {},
							getArgumentValues: async () => []
						};
						cards[id] = card;
						return card;
					}
				},
				__: key => key,
				setTimeout,
				clearTimeout
			};
			homey.cards = cards;
			originalHomey = Chronograph.homey;
			Chronograph.homey = homey;
			started = [];
			Chronograph.events.on('started', recordStart);
		});

		function recordStart(chronograph) {
			started.push({ id: chronograph.getId(), flowValues: chronograph.getData('flowValues') });
		}

		afterEach(() => {
			Chronograph.events.removeListener('started', recordStart);
			ids.splice(0).forEach(id => {
				const chronograph = Chronograph.get(id);
				if (chronograph) chronograph.stop();
			});
			Chronograph.homey = originalHomey;
		});

		for (const scenario of [
			{ type: 'timer', card: 'timer_resume', Action: TimerResume },
			{ type: 'timer', card: 'timer_resume_v2', Action: TimerResume },
			{ type: 'transition', card: 'transition_resume', Action: TransitionResume }
		]) {
			it(`saves evaluated defaults when ${scenario.card} starts a new chronograph`, async () => {
				const name = `new ${scenario.card}`;
				const type = ChronographType[scenario.type.toUpperCase()];
				const id = Utils.generateId(type, name);
				ids.push(id);
				homey.app.chronographs[scenario.type].push({ name });
				const args = {
					namedd: { name }, name: 'ignored', time: '6 / 2', unit: 'seconds',
					from: '0', to: '75.5', steps: '20'
				};
				homey.settings.set('timer_splits', [{ name, time: 1, unit: 'seconds' }]);
				new scenario.Action(scenario.card, homey);

				assert.strictEqual(await homey.cards[scenario.card].run(args), true);
				const expected = scenario.type === 'timer'
					? { time: 3, unit: 'seconds' }
					: { time: 3, unit: 'seconds', from: 0, to: 75.5, steps: 20 };
				const chronograph = Chronograph.get(id);
				assert.deepStrictEqual(chronograph.getData('flowValues'), expected);
				assert.strictEqual(chronograph._args, args);
				assert.deepStrictEqual(homey.app.chronographs[scenario.type][0].flowValues, expected);
				assert.deepStrictEqual(homey.settings.get('chronographs')[scenario.type][0].flowValues, expected);
				assert.deepStrictEqual(started, [{ id, flowValues: expected }]);
				assert.strictEqual(chronograph.getTargetDuration(), 3000);
				if (scenario.type === 'timer') assert.strictEqual(chronograph._splits.length, 1);
				else assert.strictEqual(chronograph.getData('steps'), 12);

				const api = createWidgetApi(scenario.type);
				const active = await api.getChronograph({ homey, params: { id } });
				assert.deepStrictEqual(active.defaults, Object.assign({ from: undefined, to: undefined, steps: undefined }, expected));
				chronograph.stop();
				const inactive = await api.getChronograph({ homey, params: { id } });
				assert.deepStrictEqual(inactive.defaults, active.defaults);
			});

			it(`preserves defaults and configuration when ${scenario.card} resumes an existing chronograph`, async () => {
				const name = `existing ${scenario.card}`;
				const type = ChronographType[scenario.type.toUpperCase()];
				const id = Utils.generateId(type, name);
				ids.push(id);
				const previous = { time: 10, unit: 'seconds' };
				homey.app.chronographs[scenario.type].push({ name, flowValues: previous });
				const chronograph = new Chronograph(id, name, 10, 'seconds');
				chronograph.setData('type', type);
				new scenario.Action(scenario.card, homey);
				const args = { name, time: '5', unit: 'minutes', from: 5, to: 10, steps: 3 };
				assert.strictEqual(await homey.cards[scenario.card].run(args), true);
				assert.strictEqual(chronograph.isRunning(), true);
				assert.strictEqual(Chronograph.get(id), chronograph);
				assert.strictEqual(chronograph.getTargetDuration(), 10000);
				assert.strictEqual(homey.app.chronographs[scenario.type][0].flowValues, previous);
				assert.strictEqual(chronograph.getData('flowValues'), undefined);
				assert.strictEqual(started.length, 0);
				assert.strictEqual(await homey.cards[scenario.card].run(args), true);
				assert.strictEqual(homey.app.chronographs[scenario.type][0].flowValues, previous);
				assert.strictEqual(started.length, 0);
				await assert.rejects(homey.cards[scenario.card].run({ ...args, time: '-1' }), /invalid_duration/);
			});

			it(`rejects invalid ${scenario.card} arguments without saving defaults`, async () => {
				const name = `invalid ${scenario.card}`;
				const id = Utils.generateId(ChronographType[scenario.type.toUpperCase()], name);
				ids.push(id);
				homey.app.chronographs[scenario.type].push({ name });
				new scenario.Action(scenario.card, homey);
				const args = { name, time: -1, unit: 'seconds', from: 0, to: 5, steps: 2 };
				await assert.rejects(homey.cards[scenario.card].run(args), /invalid_duration/);
				if (scenario.type === 'transition') {
					await assert.rejects(homey.cards[scenario.card].run({ ...args, time: 3, steps: 1 }), /invalid_transition/);
				}
				assert.strictEqual(Chronograph.get(id), false);
				assert.strictEqual(homey.app.chronographs[scenario.type][0].flowValues, undefined);
				assert.strictEqual(homey.settings.get('chronographs'), undefined);
				assert.strictEqual(started.length, 0);
			});
		}
	});

	function createAction(id, type) {
		let runListener;
		const homey = {
			flow: {
				getActionCard: () => ({
					registerRunListener: listener => { runListener = listener; }
				})
			},
			__: (key, args) => `${key}:${args ? args.name : ''}`
		};
		new ResumeChronograph(id, homey, type);
		return runListener;
	}

	function createChronograph(name, type, running = false) {
		const id = Utils.generateId(type, name);
		const chronograph = new Chronograph(id, name);
		chronograph.setData('type', type);
		chronograph.isRunning = () => running;
		chronograph.resumed = false;
		chronograph.resume = function() { this.resumed = true; };
		chronographIds.push(id);
		return chronograph;
	}

	afterEach(() => {
		chronographIds.splice(0).forEach(id => {
			delete Chronograph._chronographs[id];
		});
	});

	for (const [kind, type] of types) {
		it(`resumes an existing paused ${kind}`, async () => {
			const chronograph = createChronograph(`paused ${kind}`, type);
			const run = createAction(`${kind}_resume_existing`, type);

			assert.strictEqual(await run({ name: chronograph.getName() }), true);
			assert.strictEqual(chronograph.resumed, true);
		});

		it(`reports an error when the ${kind} does not exist`, async () => {
			const run = createAction(`${kind}_resume_existing`, type);

			await assert.rejects(run({ name: `missing ${kind}` }), new RegExp(`${kind}_not_running`));
		});
	}

	it('resumes matching chronographs by wildcard without affecting other types', async () => {
		const timer = createChronograph('wildcard timer one', ChronographType.TIMER);
		const otherTimer = createChronograph('wildcard timer two', ChronographType.TIMER);
		const stopwatch = createChronograph('wildcard timer three', ChronographType.STOPWATCH);
		const run = createAction('timer_resume_existing', ChronographType.TIMER);

		assert.strictEqual(await run({ name: 'wildcard timer *' }), true);
		assert.strictEqual(timer.resumed, true);
		assert.strictEqual(otherTimer.resumed, true);
		assert.strictEqual(stopwatch.resumed, false);
	});

	it('reports an error when a wildcard matches no chronographs', async () => {
		const run = createAction('timer_resume_existing', ChronographType.TIMER);

		await assert.rejects(run({ name: 'missing *' }), /timer_not_running/);
	});

	it('does not resume a chronograph that is already running', async () => {
		const chronograph = createChronograph('already running', ChronographType.TIMER, true);
		const run = createAction('timer_resume_existing', ChronographType.TIMER);

		assert.strictEqual(await run({ name: chronograph.getName() }), true);
		assert.strictEqual(chronograph.resumed, false);
	});
});
