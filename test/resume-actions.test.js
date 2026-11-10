'use strict';

const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType, Utils } = require('../lib/utils.js');
const ResumeChronograph = require('../lib/generic/actions/resume_chronograph.js');

describe('Resume chronograph actions', () => {
	const types = [
		['timer', ChronographType.TIMER],
		['transition', ChronographType.TRANSITION],
		['stopwatch', ChronographType.STOPWATCH]
	];
	const chronographIds = [];

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
