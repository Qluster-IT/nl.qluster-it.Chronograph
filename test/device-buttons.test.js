'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

function loadDevice() {
	const filename = path.resolve(__dirname, '..', 'lib', 'device.js');
	const m = new Module(filename, module);
	m.filename = filename;
	m.paths = module.paths;
	m.require = id => {
		if (id === 'homey') return { Device: class {} };
		if (id === './chronograph.js') return { get: () => null, events: { mon: () => [] } };
		if (id === './utils.js') return { Utils: {}, ChronographType: {} };
		return Module.prototype.require.call(m, id);
	};
	m._compile(fs.readFileSync(filename, 'utf8'), filename);
	return m.exports;
}

describe('Chronograph device buttons', () => {
	it('report capability failures from the delayed button handlers instead of leaving unhandled rejections', async () => {
		const Device = loadDevice();
		const device = new Device();
		const listeners = {};
		const timers = [];
		const errors = [];
		let ready = false;
		device.homey = { setTimeout: callback => timers.push(callback) };
		device.hasCapability = () => true;
		device.addCapability = async () => {};
		device.removeCapability = async () => {};
		device.setCapabilityValue = async () => { if (ready) throw new Error('device deleted'); };
		device.registerCapabilityListener = (id, listener) => { listeners[id] = listener; };
		device.getData = () => ({ id: 'x' });
		device.error = (...args) => errors.push(args[0]);
		device.onEvent = async () => {};
		device.getStartCards = device.getResumeCards = device.getTriggerCards = () => [];
		try { await device.onInit(); } catch (error) { /* only the button listeners are under test */ }
		ready = true;

		await listeners.button_pause(true);
		await listeners.button_startstop(true);
		await Promise.all(timers.map(callback => callback()));
		assert.deepStrictEqual(errors, ['button_pause', 'button_startstop']);
	});
});
