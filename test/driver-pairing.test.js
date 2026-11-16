'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Utils, ChronographType } = require('../lib/utils.js');

const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'driver.js'), 'utf8'), {
	module: moduleStub,
	require: id => id === 'homey' ? { Driver: class {} } : require('../lib/utils.js')
});
const Driver = moduleStub.exports;

function createDriver(type, chronographs) {
	const driver = new Driver();
	driver.homey = { app: { chronographs } };
	driver.getChronographType = () => type;
	for (const method of ['getStartCards', 'getResumeCards', 'getTriggerCards']) {
		driver[method] = () => { throw new Error('Pairing must not read raw Flow arguments'); };
	}
	return driver;
}

function pairingDevices(devices) {
	return Array.from(devices, device => ({ name: device.name, data: { id: device.data.id } }));
}

describe('Chronograph device pairing', () => {
	for (const type of [ChronographType.TIMER, ChronographType.STOPWATCH, ChronographType.TRANSITION]) {
		it('lists configured ' + type.toLowerCase() + ' names instead of raw Flow arguments', async () => {
			const registry = { timer: [{ name: 'Other timer' }], stopwatch: [{ name: 'Other stopwatch' }], transition: [{ name: 'Other transition' }] };
			registry[type.toLowerCase()] = [
				{ name: 'Resolved BLL name', flowValues: { time: 13, unit: 'seconds' } },
				'Alpha',
				{ name: 'Resolved BLL name' },
				{ name: '' }
			];
			const driver = createDriver(type, registry);
			const devices = pairingDevices(await driver.onPairListDevices());
			assert.deepStrictEqual(devices, [
				{ name: 'Alpha', data: { id: Utils.generateId(type, 'Alpha') } },
				{ name: 'Resolved BLL name', data: { id: Utils.generateId(type, 'Resolved BLL name') } }
			]);
		});
	}

	it('returns no candidates when the selected type has no configured chronographs', async () => {
		const driver = createDriver(ChronographType.TIMER, { stopwatch: [{ name: 'Other type' }] });
		assert.strictEqual((await driver.onPairListDevices()).length, 0);
		driver.homey.app.chronographs = undefined;
		assert.strictEqual((await driver.onPairListDevices()).length, 0);
	});

	it('reads the current registry on each request and preserves exact names for device identities', async () => {
		const driver = createDriver(ChronographType.TIMER, { timer: [{ name: 'KitchenTimer2' }] });
		assert.deepStrictEqual(pairingDevices(await driver.onPairListDevices()), [{
			name: 'KitchenTimer 2',
			data: { id: Utils.generateId(ChronographType.TIMER, 'KitchenTimer2') }
		}]);
		driver.homey.app.chronographs = { timer: [{ name: 'Updated timer' }] };
		assert.deepStrictEqual(pairingDevices(await driver.onPairListDevices()), [{
			name: 'Updated timer',
			data: { id: Utils.generateId(ChronographType.TIMER, 'Updated timer') }
		}]);
	});
});
