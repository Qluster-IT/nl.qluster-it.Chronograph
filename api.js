'use strict';

const Chronograph = require('./lib/chronograph.js');
const api = require('./lib/chronograph-api.js');
const widgetTemplate = require('./lib/widget-template.js');

function list(type) {
	const chronographType = type ? api.getType(type) : null;
	return Chronograph.all()
		.filter(item => !chronographType || item.getData('type') === chronographType)
		.map(api.snapshot);
}

function get(type, params) {
	return api.snapshot(api.findActive(type, params.name));
}

function put(type, params, body) {
	const chronograph = api.findActive(type, params.name);
	api.setRunning(chronograph, body);
	return api.snapshot(chronograph);
}

function stop(type, params) {
	api.findActive(type, params.name).stop();
	return true;
}

module.exports = {
	async encodeWidgetTemplate({ body }) { return widgetTemplate.encodeTemplate(body); },
	async decodeWidgetTemplate({ body }) { return widgetTemplate.decodeTemplate(body && body.text); },

	async getTimers() { return list('timer'); },
	async getTimer({ params }) { return get('timer', params); },
	async putTimer({ params, body }) { return put('timer', params, body); },
	async deleteTimer({ params }) { return stop('timer', params); },
	async postTimer({ homey, body }) { return api.start(homey, 'timer', body && body.name, body); },

	async getStopwatches() { return list('stopwatch'); },
	async getStopwatch({ params }) { return get('stopwatch', params); },
	async putStopwatch({ params, body }) { return put('stopwatch', params, body); },
	async deleteStopwatch({ params }) { return stop('stopwatch', params); },
	async postStopwatch({ homey, body }) { return api.start(homey, 'stopwatch', body && body.name, body); },

	async getTransitions() { return list('transition'); },
	async getTransition({ params }) { return get('transition', params); },
	async putTransition({ params, body }) { return put('transition', params, body); },
	async deleteTransition({ params }) { return stop('transition', params); },
	async postTransition({ homey, body }) { return api.start(homey, 'transition', body && body.name, body); },

	async getChronographs() { return list(); },
	async getChronograph({ params }) { return get(params.type, params); },
	async putChronograph({ params, body }) { return put(params.type, params, body); },
	async deleteChronograph({ params }) { return stop(params.type, params); },

	async getAllChronographs({ homey }) {
		const result = {};
		for (const type of Object.keys(homey.app.chronographs || {})) {
			result[type] = homey.app.chronographs[type].map(item => typeof item === 'string' ? item : item.name);
		}
		return result;
	}
};
