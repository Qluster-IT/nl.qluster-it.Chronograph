'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const api = require('../api.js');

describe('Chronograph API readiness', () => {
	let app;
	let Application;
	let timers;
	let events;
	let errors;

	beforeEach(() => {
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			process: { env: {} },
			require: id => {
				if (id === 'homey') return { App: class {} };
				if (id === './lib/chronograph.js') return { all: () => [] };
				if (id === './lib/flow-arguments.js') return { BL: { init: async () => {} } };
				return {};
			}
		});
		Application = module.exports;
		app = new Application();
		timers = [];
		events = [];
		errors = [];
		app.homey = {
			app,
			settings: { on() {}, get: () => ({}) },
			setTimeout: callback => { timers.push(callback); },
			error: (...args) => errors.push(args),
			api: { realtime: async (event, data) => events.push({ event, data }) }
		};
		for (const name of ['log', 'setRoundOfDurationsFlowcards', '_initializeTimerCards',
			'_initializeStopwatchCards', '_initializeTransitionCards', '_initializeGenericCards',
			'_registerChronographWidgetAutocomplete', '_notifyReleaseFeatures', '_installLogEventHandler',
			'_installEventHandlers', '_initializeChronographsFromFlowArguments', '_restoreChronographs']) {
			app[name] = () => {};
		}
	});

	it('reports ready only after configured names and snapshots have finished loading', async () => {
		let finishRestore;
		const restore = new Promise(resolve => { finishRestore = resolve; });
		app._restoreChronographs = () => restore;
		await app.onInitLoader();
		assert.strictEqual((await api.getApiReady({ homey: app.homey })).ready, false);
		assert.strictEqual(events.length, 0);
		const initialization = timers[0]();
		await Promise.resolve();
		assert.strictEqual((await api.getApiReady({ homey: app.homey })).ready, false);
		finishRestore(true);
		await initialization;
		assert.strictEqual((await api.getApiReady({ homey: app.homey })).ready, true);
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].event, 'api-ready');
		assert.strictEqual(events[0].data.ready, true);
		assert.strictEqual(errors.length, 0);
	});

	for (const stage of ['cards', 'configuration', 'restoration']) {
		it('does not announce readiness after failed ' + stage + ' initialization', async () => {
			if (stage === 'cards') app._initializeTimerCards = () => { throw new Error('cards failed'); };
			if (stage === 'configuration') app._initializeChronographsFromFlowArguments = async () => { throw new Error('configuration failed'); };
			if (stage === 'restoration') app._restoreChronographs = async () => false;
			await app.onInitLoader();
			if (timers.length) await timers[0]();
			assert.strictEqual((await api.getApiReady({ homey: app.homey })).ready, false);
			assert.strictEqual(events.length, 0);
			assert.strictEqual(errors.length, 1);
		});
	}

	it('keeps the readiness endpoint usable if realtime delivery fails', async () => {
		app.homey.api.realtime = async () => { throw new Error('realtime unavailable'); };
		await app.onInitLoader();
		await timers[0]();
		assert.strictEqual((await api.getApiReady({ homey: app.homey })).ready, true);
		assert.strictEqual(errors.length, 1);
	});

	it('propagates failed configured-name collection to startup readiness', async () => {
		app.homey.manifest = { flow: {} };
		app.chronographsCards = { timer: [{ card: { getArgumentValues: async () => { throw new Error('read failed'); } } }] };
		app.setArgumentNamesCard = Application.prototype.setArgumentNamesCard;
		assert.strictEqual(await app.setArgumentNames(null, { id: 'timer_start' }), false);
		app.setArgumentNames = async () => false;
		await assert.rejects(Application.prototype._initializeChronographsFromFlowArguments.call(app), /configured timer names/);
	});

	it('reports snapshot restoration failures to startup readiness', async () => {
		app.homey.settings.get = () => { throw new Error('snapshot read failed'); };
		assert.strictEqual(await Application.prototype._restoreChronographs.call(app), false);
		assert.strictEqual(errors.length, 1);
	});
});
