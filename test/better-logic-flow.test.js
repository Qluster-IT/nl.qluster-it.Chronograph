'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { BL, decodeFlowArguments } = require('../lib/flow-arguments.js');
const Chronograph = require('../lib/chronograph.js');
const { Utils, ChronographType } = require('../lib/utils.js');
const api = require('../api.js');

const originalLoad = Module._load;
let TimerStart, TimerResume, TimerRunning, TimerSplit, StopwatchResume;
try {
	Module._load = function(request, ...args) {
		return request === 'homey' ? {} : originalLoad.call(this, request, ...args);
	};
	TimerStart = require('../lib/timer/actions/timer_start.js');
	TimerResume = require('../lib/timer/actions/timer_resume.js');
	TimerRunning = require('../lib/timer/conditions/timer_running.js');
	TimerSplit = require('../lib/timer/triggers/timer_split.js');
	StopwatchResume = require('../lib/stopwatch/actions/stopwatch_resume.js');
} finally {
	Module._load = originalLoad;
}

describe('Better Logic Flow arguments', () => {
	let homey, cards, settings, originalHomey, originalLibrary, originalReady, originalTimeout, originalUpdateTimeout;
	let previousSplitListeners;

	beforeEach(() => {
		originalHomey = Chronograph.homey;
		originalTimeout = Chronograph._timeout;
		originalUpdateTimeout = Chronograph._updateTimeout;
		originalLibrary = BL._L;
		originalReady = BL.isReady;
		previousSplitListeners = new Set(Chronograph.events.listeners('split'));
		const variables = { room: 'Kitchen', duration: '3', wildcard: 'Kit*' };
		BL._L = { Current: { decode: async text => {
			if (text.includes('{[error]}')) throw new Error('BLL decode error');
			return text.replace(/\{\[([a-z]+)\]\}/g, (match, key) => variables[key] || match);
		} } };
		BL.isReady = true;
		settings = {};
		cards = {};
		const getCard = id => cards[id] || (cards[id] = {
			registerRunListener(listener) { this.run = listener; },
			on(event, listener) { this[event] = listener; },
			getArgumentValues: async () => [],
			trigger() {}
		});
		homey = {
			app: { chronographs: { timer: [], stopwatch: [], transition: [] } },
			settings: { get: key => settings[key], set: (key, value) => { settings[key] = value; } },
			flow: { getActionCard: getCard, getConditionCard: getCard, getTriggerCard: getCard },
			__: key => key, setTimeout: () => 1, clearTimeout() {}
		};
		Chronograph.homey = homey;
		Chronograph._timeout = null;
		Chronograph._updateTimeout = null;
	});

	afterEach(() => {
		for (const item of Chronograph.all()) item.stop(true);
		Chronograph.events.listeners('split')
			.filter(listener => !previousSplitListeners.has(listener))
			.forEach(listener => Chronograph.events.removeListener('split', listener));
		Chronograph.homey = originalHomey;
		Chronograph._timeout = originalTimeout;
		Chronograph._updateTimeout = originalUpdateTimeout;
		BL._L = originalLibrary;
		BL.isReady = originalReady;
	});

	it('decodes names and duration before starting, saving values, matching conditions and triggers', async () => {
		new TimerStart('timer_start_v2', homey);
		new TimerRunning('timer_running', homey);
		new TimerSplit('timer_split', homey);
		const args = { name: '{[room]} timer', time: '{[duration]} * 2', unit: 'seconds' };
		assert.strictEqual(await cards.timer_start_v2.run(args), true);
		const id = Utils.generateId(ChronographType.TIMER, 'Kitchen timer');
		assert.strictEqual(Chronograph.get(id).getTargetDuration(), 6000);
		assert.deepStrictEqual(homey.app.chronographs.timer[0].flowValues, { time: 6, unit: 'seconds' });
		assert.strictEqual(args.name, '{[room]} timer');
		assert.strictEqual(await cards.timer_running.run({ name: '{[wildcard]}' }), true);
		assert.strictEqual(await cards.timer_split.run({ name: '{[room]} timer', time: 2, unit: 'seconds' },
			{ id, name: 'Kitchen timer', time: 2, unit: 'seconds' }), true);
	});

	it('respects selected names, numeric argument types and missing BLL', async () => {
		const args = { namedd: { name: 'Literal {[room]}' }, name: '{[error]}', time: '{[duration]}' };
		const decoded = await decodeFlowArguments(args, 'timer_start_v2');
		assert.strictEqual(decoded.name, '{[error]}');
		assert.strictEqual(decoded.namedd.name, 'Literal {[room]}');
		assert.strictEqual(decoded.time, '3');
		assert.strictEqual((await decodeFlowArguments({ name: 'Example', time: '{[duration]}' }, 'timer_split')).time, '{[duration]}');
		BL.isReady = false;
		assert.strictEqual((await decodeFlowArguments({ name: '{[room]}' }, 'timer_pause')).name, '{[room]}');
	});

	it('resolves dynamic and wildcard split names on start and stopwatch resume', async () => {
		settings.timer_splits = [{ name: '{[wildcard]}', time: 2, unit: 'seconds' }];
		settings.timer_elapsed_splits = [{ name: '{[room]} timer', time: 3, unit: 'seconds' }];
		settings.stopwatch_splits = [
			{ name: '{[room]} watch', time: 4, unit: 'seconds' },
			{ name: '{[error]}', namedd: { name: 'Kitchen watch' }, time: 5, unit: 'seconds' }
		];
		await Chronograph.timer_startRunListener(homey, { name: 'Kitchen timer', time: 10, unit: 'seconds' });
		const timer = Chronograph.get(Utils.generateId(ChronographType.TIMER, 'Kitchen timer'));
		assert.deepStrictEqual(timer._splits.map(split => split.time), [8000, 3]);
		new StopwatchResume('stopwatch_resume', homey);
		await cards.stopwatch_resume.run({ name: '{[room]} watch' });
		const stopwatch = Chronograph.get(Utils.generateId(ChronographType.STOPWATCH, 'Kitchen watch'));
		assert.deepStrictEqual(stopwatch._splits.map(split => split.time), [4, 5]);
		assert.deepStrictEqual(homey.app.chronographs.stopwatch[0], { name: 'Kitchen watch', flowValues: {} });
		assert.strictEqual(settings.stopwatch_splits[0].name, '{[room]} watch');
	});

	it('preserves selected split names when storing trigger arguments', async () => {
		new TimerSplit('timer_split', homey);
		cards.timer_split.getArgumentValues = async () => [{
			name: '{[error]}', namedd: { name: 'Kitchen timer' }, time: 2, unit: 'seconds'
		}];
		cards.timer_split.update();
		await new Promise(resolve => setImmediate(resolve));
		await Chronograph.timer_startRunListener(homey, { name: 'Kitchen timer', time: 10, unit: 'seconds' });
		const timer = Chronograph.get(Utils.generateId(ChronographType.TIMER, 'Kitchen timer'));
		assert.strictEqual(timer._splits[0].time, 8000);
	});

	it('propagates decoder failures before replacing an existing chronograph', async () => {
		await Chronograph.timer_startRunListener(homey, { name: 'Kitchen timer', time: 10, unit: 'seconds' });
		const id = Utils.generateId(ChronographType.TIMER, 'Kitchen timer');
		const original = Chronograph.get(id);
		settings.timer_splits = [{ name: '{[error]}', time: 1, unit: 'seconds' }];
		await assert.rejects(Chronograph.timer_startRunListener(homey,
			{ name: 'Kitchen timer', time: 20, unit: 'seconds' }), /BLL decode error/);
		assert.strictEqual(Chronograph.get(id), original);
		new TimerStart('timer_start_v2', homey);
		await assert.rejects(cards.timer_start_v2.run({ name: '{[error]}', time: '1', unit: 'seconds' }), /BLL decode error/);
	});

	it('resolves split names when restoring timers and stopwatches', async () => {
		settings.timer_splits = [{ name: '{[wildcard]}', time: 2, unit: 'seconds' }];
		settings.stopwatch_splits = [{ name: '{[room]} watch', time: 4, unit: 'seconds' }];
		settings.chronographs_active = {
			timer: { name: 'Kitchen timer', data: { type: ChronographType.TIMER }, targetDuration: 10000, duration: 0 },
			stopwatch: { name: 'Kitchen watch', data: { type: ChronographType.STOPWATCH }, duration: 0 }
		};
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => {
				if (id === 'homey') return { App: class {} };
				if (id === './lib/chronograph.js') return Chronograph;
				if (id === './lib/utils.js') return require('../lib/utils.js');
				if (id === './lib/flow-arguments.js') return require('../lib/flow-arguments.js');
				return {};
			}
		});
		homey.error = (...args) => { throw new Error(args.join(' ')); };
		await module.exports.prototype._restoreChronographs.call({ homey });
		const timer = Chronograph.get(Utils.generateId(ChronographType.TIMER, 'Kitchen timer'));
		const stopwatch = Chronograph.get(Utils.generateId(ChronographType.STOPWATCH, 'Kitchen watch'));
		assert.strictEqual(timer._splits[0].time, 8000);
		assert.strictEqual(stopwatch._splits[0].time, 4);

		const failed = { name: 'Failed timer', data: { type: ChronographType.TIMER }, targetDuration: 10000, duration: 0 };
		settings.chronographs_active = {
			failed,
			other: { name: 'Other watch', data: { type: ChronographType.STOPWATCH }, duration: 0 }
		};
		settings.timer_splits = [{ name: '{[error]}', time: 2, unit: 'seconds' }];
		const errors = [];
		homey.error = (...args) => errors.push(args);
		await module.exports.prototype._restoreChronographs.call({ homey });
		assert.strictEqual(settings.chronographs_active.failed, failed);
		assert.ok(Chronograph.get(Utils.generateId(ChronographType.STOPWATCH, 'Other watch')));
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0][2].message, /BLL decode error/);
	});

	it('leaves API names and values untouched and prevents concurrent unwanted replacements', async () => {
		homey.app.chronographs.timer.push({ name: 'Literal {[room]}' });
		const body = { name: 'Literal {[room]}', time: 10, unit: 'seconds' };
		const results = await Promise.allSettled([api.postTimer({ homey, body }), api.postTimer({ homey, body })]);
		assert.strictEqual(results.filter(result => result.status === 'fulfilled').length, 1);
		assert.match(results.find(result => result.status === 'rejected').reason.message, /already active/);
		assert.strictEqual(results.find(result => result.status === 'fulfilled').value.name, body.name);
	});

	it('does not replace a chronograph when simultaneous resume actions start it', async () => {
		new TimerResume('timer_resume_v2', homey);
		new StopwatchResume('stopwatch_resume', homey);
		const created = [];
		const record = chronograph => created.push(chronograph);
		Chronograph.events.on('created', record);
		try {
			await Promise.all([
				cards.timer_resume_v2.run({ name: 'Kitchen timer', time: '10', unit: 'seconds' }),
				cards.timer_resume_v2.run({ name: 'Kitchen timer', time: '20', unit: 'seconds' }),
				cards.stopwatch_resume.run({ name: 'Kitchen watch' }),
				cards.stopwatch_resume.run({ name: 'Kitchen watch' })
			]);
			assert.strictEqual(created.filter(item => item.getName() === 'Kitchen timer').length, 1);
			assert.strictEqual(created.filter(item => item.getName() === 'Kitchen watch').length, 1);
		} finally {
			Chronograph.events.removeListener('created', record);
		}
	});

	it('labels every supported text field without damaged translations in both manifests', () => {
		const manifest = require('../app.json');
		for (const kind of ['actions', 'conditions', 'triggers']) {
			const folder = path.join(__dirname, '..', '.homeycompose', 'flow', kind);
			for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.json'))) {
				const card = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
				const generated = manifest.flow[kind].find(item => item.id === card.id);
				for (const arg of card.args || []) {
					const built = generated.args.find(item => item.name === arg.name);
					if (arg.type === 'text') {
						for (const title of Object.values(arg.title)) {
							assert.ok(title.includes('BLL'), `${card.id}:${arg.name}`);
							assert.ok(!/[?\uFFFD]/.test(title), `${card.id}:${arg.name}: ${title}`);
						}
						assert.deepStrictEqual(built.title, arg.title);
					} else {
						assert.ok(!Object.values(arg.title || {}).some(title => title.includes('BLL')), `${card.id}:${arg.name}`);
					}
				}
			}
		}
	});

	it('keeps evaluated names after a Flow refresh without suggesting raw BLL expressions', async () => {
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module, require: id => id === 'homey' ? { App: class {} } : {}
		});
		const prototype = module.exports.prototype;
		const card = { getArgumentValues: async () => [
			{ name: '{[room]} timer' },
			{ name: '{[error]}', namedd: { name: 'Literal {[room]}' } }
		] };
		const app = {
			chronographs: { timer: [{ name: 'Kitchen timer', flowValues: { time: 6 } }] },
			chronographsCards: { timer: [{ card }] },
			homey: { settings: { set() {} }, error(...args) { throw new Error(args.join(' ')); } },
			setArgumentNamesCard: prototype.setArgumentNamesCard
		};
		await prototype.setArgumentNames.call(app, card, { id: 'timer_start_v2' }, false);
		assert.deepStrictEqual(Array.from(app.chronographs.timer, item => item.name), ['Kitchen timer', 'Literal {[room]}']);
	});
});
