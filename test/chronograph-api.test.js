'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Chronograph = require('../lib/chronograph.js');
const { Utils, ChronographType } = require('../lib/utils.js');
const api = require('../api.js');

describe('Name-based app API', () => {
	let homey;
	let originalHomey;
	const name = 'Kitchen / lamp';

	beforeEach(() => {
		originalHomey = Chronograph.homey;
		Chronograph.homey = { setTimeout, clearTimeout };
		const values = {};
		homey = {
			app: { chronographs: { timer: [{ name }], stopwatch: [{ name }], transition: [{ name }] } },
			settings: { get: key => values[key], set: (key, value) => { values[key] = value; } },
			__: key => key
		};
	});

	afterEach(() => {
		for (const type of Object.values(ChronographType)) {
			const chronograph = Chronograph.get(Utils.generateId(type, name));
			if (chronograph) chronograph.stop();
		}
		Chronograph.homey = originalHomey;
	});

	it('starts, lists, pauses, resumes, and stops a configured timer by name', async () => {
		const started = await api.postTimer({ homey, body: { name, time: '2 * 5', unit: 'seconds' } });
		assert.strictEqual(started.name, name);
		assert.strictEqual(started.targetDuration, 10000);
		assert.strictEqual(started.running, true);
		assert.strictEqual(started.id, undefined);
		assert.deepStrictEqual(homey.app.chronographs.timer[0].flowValues, { time: 10, unit: 'seconds' });
		assert.strictEqual((await api.getTimers())[0].name, name);
		assert.strictEqual((await api.getTimer({ params: { name } })).name, name);
		assert.strictEqual((await api.putTimer({ params: { name }, body: { running: false } })).running, false);
		assert.strictEqual((await api.putChronograph({ params: { type: 'timer', name }, body: { running: true } })).running, true);
		assert.strictEqual(await api.deleteChronograph({ params: { type: 'timer', name } }), true);
		await assert.rejects(api.getTimer({ params: { name } }), /not active/);
	});

	it('keeps same-named types separate and validates the generic type', async () => {
		await api.postTimer({ homey, body: { name, time: 30, unit: 'seconds' } });
		await api.postStopwatch({ homey, body: { name } });
		assert.strictEqual((await api.getChronographs()).length, 2);
		await api.deleteStopwatch({ params: { name } });
		assert.strictEqual((await api.getTimer({ params: { name } })).running, true);
		await assert.rejects(api.getChronograph({ params: { type: 'other', name } }), /Unsupported/);
	});

	it('starts transitions with persisted defaults and capped steps', async () => {
		const body = { name, time: 3, unit: 'seconds', from: 0, to: 100, steps: 20 };
		const result = await api.postTransition({ homey, body });
		assert.strictEqual(result.data.steps, 12);
		assert.deepStrictEqual(homey.app.chronographs.transition[0].flowValues,
			{ time: 3, unit: 'seconds', from: 0, to: 100, steps: 20 });
	});

	it('rejects unknown names, malformed inputs and unsafe replacements', async () => {
		await assert.rejects(api.postTimer({ homey, body: { name: 'unknown', time: 1, unit: 'seconds' } }), /configuration/);
		await api.postTimer({ homey, body: { name, time: 10, unit: 'seconds' } });
		await assert.rejects(api.postTimer({ homey, body: { name, time: 20, unit: 'seconds' } }), /already active/);
		await assert.rejects(api.postTimer({ homey, body: { name, time: 'bad', unit: 'seconds', replace: true } }), /Invalid duration/);
		await assert.rejects(api.postTimer({ homey, body: { name, time: 20, unit: 'bad', replace: true } }), /unit/);
		await assert.rejects(api.postTimer({ homey, body: { name, time: 20, unit: 'seconds', replace: 'true' } }), /boolean/);
		assert.strictEqual((await api.getTimer({ params: { name } })).targetDuration, 10000);
		assert.strictEqual((await api.postTimer({ homey, body: { name, time: 20, unit: 'seconds', replace: true } })).targetDuration, 20000);
		await assert.rejects(api.putTimer({ params: { name }, body: { running: 'false' } }), /boolean/);
	});

	it('rejects invalid transition arguments without replacing a paused transition', async () => {
		const body = { name, time: 10, unit: 'seconds', from: 0, to: 1, steps: 2 };
		await api.postTransition({ homey, body });
		await api.putTransition({ params: { name }, body: { running: false } });
		for (const change of [{ steps: 2.5 }, { from: 'invalid' }, { time: '1 / 0' }]) {
			await assert.rejects(api.postTransition({ homey, body: { ...body, ...change, replace: true } }));
			assert.strictEqual((await api.getTransition({ params: { name } })).running, false);
		}
	});

	it('does not expose app endpoints publicly and declares matching handlers', () => {
		const manifest = require('../.homeycompose/app.json');
		for (const [handler, route] of Object.entries(manifest.api)) {
			assert.strictEqual(typeof api[handler], 'function', handler);
			assert.notStrictEqual(route.public, true, handler);
			assert.ok(!route.path.includes(':id'), route.path);
		}
	});
});

describe('API migration notification', () => {
	it('sends once and retries after a delivery failure', async () => {
		const module = { exports: {} };
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
			module,
			require: id => id === 'homey' ? { App: class {} } : {}
		});
		const notify = module.exports.prototype._notifyNameBasedApi;
		const settings = {};
		const errors = [];
		let attempts = 0;
		const app = { homey: {
			settings: { get: key => settings[key], set: (key, value) => { settings[key] = value; } },
			__: key => key,
			notifications: { async createNotification() { attempts++; if (attempts === 1) throw new Error('offline'); } },
			error: (...args) => errors.push(args)
		} };
		await notify.call(app);
		assert.strictEqual(settings.nameBasedApiNotificationSent, undefined);
		assert.strictEqual(errors.length, 1);
		await notify.call(app);
		await notify.call(app);
		assert.strictEqual(attempts, 2);
		assert.strictEqual(settings.nameBasedApiNotificationSent, true);
	});
});
