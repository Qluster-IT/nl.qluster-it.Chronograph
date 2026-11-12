'use strict';

const Chronograph = require('./chronograph.js');
const { Utils, ChronographType } = require('./utils.js');

const types = {
	timer: ChronographType.TIMER,
	stopwatch: ChronographType.STOPWATCH,
	transition: ChronographType.TRANSITION
};
const units = ['milliseconds', 'seconds', 'minutes', 'hours', 'days'];

function getType(type) {
	if (!Object.prototype.hasOwnProperty.call(types, type)) throw new Error('Unsupported chronograph type');
	return types[type];
}

function validateName(name) {
	if (typeof name !== 'string' || !name.trim() || !Utils.validateName(name)) {
		throw new Error('Invalid chronograph name');
	}
}

function findConfigured(homey, type, name) {
	validateName(name);
	const configured = (homey.app.chronographs || {})[type] || [];
	const match = configured.find(item => (typeof item === 'string' ? item : item.name) === name);
	if (!match) throw new Error('Chronograph not found in app configuration');
	return typeof match === 'string' ? null : match;
}

function findActive(type, name) {
	validateName(name);
	const chronograph = Chronograph.get(Utils.generateId(getType(type), name));
	if (!chronograph || chronograph.getData('type') !== getType(type) || chronograph.getName() !== name) {
		throw new Error('Chronograph is not active');
	}
	return chronograph;
}

function snapshot(chronograph) {
	return {
		name: chronograph.getName(),
		data: chronograph.getAllData(),
		duration: chronograph.getDuration(),
		targetDuration: chronograph.getTargetDuration(),
		running: chronograph.isRunning()
	};
}

function setRunning(chronograph, body) {
	if (!body || typeof body.running !== 'boolean') throw new Error('The running property must be a boolean');
	if (body.running && !chronograph.isRunning()) chronograph.resume();
	if (!body.running && chronograph.isRunning()) chronograph.pause();
}

async function start(homey, type, name, body, options = {}) {
	const chronographType = getType(type);
	findConfigured(homey, type, name);
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('A request body is required');
	if (body.replace !== undefined && typeof body.replace !== 'boolean') throw new Error('The replace property must be a boolean');
	const checkExisting = () => {
		const existing = Chronograph.get(Utils.generateId(chronographType, name));
		if (existing && existing.getName() !== name) throw new Error('Chronograph name conflicts with an active instance');
		if (existing && !body.replace) throw new Error('Chronograph is already active');
	};
	checkExisting();
	const args = { name };
	if (type !== 'stopwatch') {
		if ((typeof body.time !== 'number' && typeof body.time !== 'string') || String(body.time).trim() === '') {
			throw new Error('A duration is required');
		}
		const time = Utils.evalTime(body.time);
		if (typeof time !== 'number' || !Number.isFinite(time) || (type === 'timer' ? time <= 0 : time < 0)) {
			throw new Error('Invalid duration');
		}
		if (!units.includes(body.unit)) throw new Error('Invalid duration unit');
		if (!Number.isFinite(Utils.calculateDuration(time, body.unit))) throw new Error('Invalid duration');
		args.time = time;
		args.unit = body.unit;
	}
	if (type === 'transition') {
		for (const key of ['from', 'to', 'steps']) {
			if ((typeof body[key] !== 'number' && typeof body[key] !== 'string') || String(body[key]).trim() === '' || !Number.isFinite(Number(body[key]))) {
				throw new Error('Invalid transition ' + key);
			}
			args[key] = Number(body[key]);
		}
		if (!Number.isSafeInteger(args.steps) || args.steps < 2) throw new Error('Invalid transition steps');
	}
	const startMethods = {
		timer: Chronograph.timer_startRunListener,
		stopwatch: Chronograph.stopwatch_startRunListener,
		transition: Chronograph.transition_startRunListener
	};
	await startMethods[type].call(Chronograph, homey, args, { ...options, beforeCreate: checkExisting });
	return snapshot(findActive(type, name));
}

module.exports = { types, getType, findConfigured, findActive, snapshot, setRunning, start };
