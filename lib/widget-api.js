'use strict';

const Chronograph = require('./chronograph.js');
const { Utils, ChronographType } = require('./utils.js');
const api = require('./chronograph-api.js');

const types = {
	timer: ChronographType.TIMER,
	stopwatch: ChronographType.STOPWATCH,
	transition: ChronographType.TRANSITION
};

function getChronographData(chronograph) {
	const result = {
		name: chronograph.getName(),
		type: chronograph.getData('type'),
		duration: chronograph.getDuration(),
		targetDuration: chronograph.getTargetDuration(),
		running: chronograph.isRunning()
	};
	if (result.type === ChronographType.TRANSITION) result.steps = chronograph.getData('steps');
	return result;
}

function getConfiguredChronograph(homey, name, typeName) {
	const type = api.getType(typeName);
	const configuration = api.findConfigured(homey, typeName, name);
	const chronograph = Chronograph.get(Utils.generateId(type, name));
	if (chronograph && (chronograph.getName() !== name || chronograph.getData('type') !== type)) {
		throw new Error('Chronograph name conflicts with an active instance');
	}
	return { name, type, chronograph, configuration };
}

function getSavedStartArgs(homey, type, name) {
	const args = homey.settings.get(type.toLowerCase() + '_start_cards') || [];
	return args.find(item => {
		const configuredName = item.namedd ? item.namedd.name : item.name;
		return configuredName === name;
	}) || {};
}

function getDefaults(homey, type, name, configuration) {
	const startArgs = configuration && configuration.flowValues
		? configuration.flowValues
		: getSavedStartArgs(homey, type, name);
	return {
		time: startArgs.time,
		unit: startArgs.unit && (startArgs.unit.id || startArgs.unit),
		from: startArgs.from,
		to: startArgs.to,
		steps: startArgs.steps
	};
}

function createWidgetApi(typeName) {
	const expectedType = types[typeName];
	if (!expectedType) throw new Error('Unsupported chronograph widget type');

	return {
		async getWidgetStyles({ homey }) {
			const collection = homey.settings.get('widgetStyles');
			return collection && typeof collection === 'object' && !Array.isArray(collection)
				? collection
				: { version: 2, styles: [], colorSchemes: [] };
		},

		async getChronograph({ homey, params }) {
			const configured = getConfiguredChronograph(homey, params.name, typeName);
			const defaults = getDefaults(homey, configured.type, configured.name, configured.configuration);
			if (!configured.chronograph) {
				return {
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
			const configured = getConfiguredChronograph(homey, params.name, typeName);
			body = body || {};
			if (expectedType !== ChronographType.STOPWATCH
				&& (body.time === undefined || body.time === null || body.time === '')) {
				throw new Error('A duration is required');
			}
			if (expectedType !== ChronographType.STOPWATCH
				&& ((typeof body.time !== 'number' && typeof body.time !== 'string')
					|| !Number.isFinite(Number(body.time)) || Number(body.time) < 1)) {
				throw new Error(homey.__('invalid_duration'));
			}
			if (configured.chronograph) throw new Error('Chronograph is already active');

			await api.start(homey, typeName, configured.name, { ...body, unit: body.unit || 'seconds' }, { persistFlowValues: false });
			return true;
		},

		async putChronograph({ homey, params, body }) {
			if (!body || typeof body.running !== 'boolean') {
				throw new Error('The running property must be a boolean');
			}

			const configured = getConfiguredChronograph(homey, params.name, typeName);
			const chronograph = configured.chronograph;
			if (!chronograph) throw new Error('Chronograph is not active');
			api.setRunning(chronograph, body);
			return getChronographData(chronograph);
		},

		async deleteChronograph({ homey, params }) {
			const configured = getConfiguredChronograph(homey, params.name, typeName);
			if (!configured.chronograph) throw new Error('Chronograph is not active');
			configured.chronograph.stop();
			return true;
		}
	};
}

module.exports = { createWidgetApi };
