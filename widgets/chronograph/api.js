'use strict';

const Chronograph = require('../../lib/chronograph.js');
const { Utils, ChronographType } = require('../../lib/utils.js');

function getChronographData(chronograph) {
	return {
		id: chronograph.getId(),
		name: chronograph.getName(),
		type: chronograph.getData('type'),
		duration: chronograph.getDuration(),
		targetDuration: chronograph.getTargetDuration(),
		running: chronograph.isRunning()
	};
}

function getConfiguredChronograph(homey, id) {
	const chronographs = homey.app.chronographs || {};

	for (const type of Object.keys(chronographs)) {
		const chronographType = ChronographType[type.toUpperCase()];
		if (!chronographType) continue;

		for (const configured of chronographs[type] || []) {
			const name = typeof configured === 'string' ? configured : configured.name;
			if (name && Utils.generateId(chronographType, name) === id) {
				return {
					name,
					type: chronographType,
					chronograph: Chronograph.get(id)
				};
			}
		}
	}

	throw new Error('Chronograph not found in app configuration');
}

function getSavedStartArgs(homey, type, name) {
	const args = homey.settings.get(type.toLowerCase() + '_start_cards') || [];
	return args.find(item => {
		const configuredName = item.namedd ? item.namedd.name : item.name;
		return configuredName === name;
	}) || {};
}

function getDefaults(homey, type, name) {
	const startArgs = getSavedStartArgs(homey, type, name);
	return {
		time: startArgs.time,
		unit: startArgs.unit && (startArgs.unit.id || startArgs.unit),
		from: startArgs.from,
		to: startArgs.to,
		steps: startArgs.steps
	};
}

module.exports = {
	async getChronograph({ homey, params }) {
		const configured = getConfiguredChronograph(homey, params.id);
		const defaults = getDefaults(homey, configured.type, configured.name);
		if (!configured.chronograph) {
			return {
				id: params.id,
				name: configured.name,
				type: configured.type,
				active: false,
				running: false,
				duration: 0,
				targetDuration: null,
				defaults
			};
		}
		return Object.assign({ active: true, defaults }, getChronographData(configured.chronograph));
	},

	async startChronograph({ homey, params, body }) {
		const configured = getConfiguredChronograph(homey, params.id);
		body = body || {};
		if (!body || body.time === undefined || body.time === null || body.time === '') {
			if (configured.type !== ChronographType.STOPWATCH) {
				throw new Error('A duration is required');
			}
		}

		if (configured.chronograph) {
			throw new Error('Chronograph is already active');
		}

		const args = {
			name: configured.name,
			time: body.time,
			unit: body.unit || 'seconds'
		};

		switch (configured.type) {
			case ChronographType.TIMER:
				return Chronograph.timer_startRunListener(homey, args);
			case ChronographType.STOPWATCH:
				return Chronograph.stopwatch_startRunListener(homey, args);
			case ChronographType.TRANSITION:
				args.from = body.from;
				args.to = body.to;
				args.steps = body.steps;
				return Chronograph.transition_startRunListener(homey, args);
			default:
				throw new Error('Unsupported chronograph type');
		}
	},

	async putChronograph({ homey, params, body }) {
		if (!body || typeof body.running !== 'boolean') {
			throw new Error('The running property must be a boolean');
		}

		const configured = getConfiguredChronograph(homey, params.id);
		const chronograph = configured.chronograph;
		if (!chronograph) throw new Error('Chronograph is not active');
		if (body.running) {
			chronograph.resume();
		} else {
			chronograph.pause();
		}
		return getChronographData(chronograph);
	},

	async deleteChronograph({ homey, params }) {
		const configured = getConfiguredChronograph(homey, params.id);
		if (!configured.chronograph) throw new Error('Chronograph is not active');
		configured.chronograph.stop();
		return true;
	}
};
