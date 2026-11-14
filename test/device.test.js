'use strict';

const assert = require('assert');
const Module = require('module');
const { ChronographType } = require('../lib/utils.js');

const originalLoad = Module._load;
let Device;
try {
	Module._load = function(request, ...args) {
		return request === 'homey' ? { Device: class {} } : originalLoad.call(this, request, ...args);
	};
	Device = require('../lib/device.js');
} finally {
	Module._load = originalLoad;
}

describe('Chronograph device', () => {
	it('stops its duration updates when it is deleted while its chronograph runs', async () => {
		const intervals = new Set();
		const device = Object.create(Device.prototype);
		Object.assign(device, {
			homey: {
				setInterval: callback => { const interval = { callback }; intervals.add(interval); return interval; },
				clearInterval: interval => intervals.delete(interval)
			},
			getData: () => ({ id: 'stopwatch_1' }),
			setCapabilityValue: async () => {},
			setStoreValue: async () => {},
			log() {},
			_chronographEventHandlers: {},
			_cardEventHandlers: {}
		});
		const chronograph = { getId: () => 'stopwatch_1', getData: () => ChronographType.STOPWATCH, getDuration: () => 0 };

		await device.onEvent('started', chronograph);
		assert.strictEqual(intervals.size, 1);
		device.onDeleted();
		assert.strictEqual(intervals.size, 0);
	});
});
