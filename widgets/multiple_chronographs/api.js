'use strict';

const { createWidgetApi } = require('../../lib/widget-api.js');
const timer = createWidgetApi('timer');
const stopwatch = createWidgetApi('stopwatch');
const transition = createWidgetApi('transition');
const types = { timer, stopwatch, transition };

module.exports = {
	getWidgetStyles: timer.getWidgetStyles,
	async getChronographs({ homey, body }) {
		if (!body || !Array.isArray(body.chronographs) || body.chronographs.length > 10) {
			throw new Error('Invalid chronograph selections');
		}
		return Promise.all(body.chronographs.map(async selection => {
			try {
				if (!selection || !Object.prototype.hasOwnProperty.call(types, selection.type)) {
					throw new Error('Unsupported chronograph type');
				}
				return { chronograph: await types[selection.type].getChronograph({
					homey, params: { name: selection.name }
				}) };
			} catch (error) {
				return { error: error && error.message ? error.message : String(error) };
			}
		}));
	},
	getTimer: timer.getChronograph,
	startTimer: timer.startChronograph,
	putTimer: timer.putChronograph,
	deleteTimer: timer.deleteChronograph,
	getStopwatch: stopwatch.getChronograph,
	startStopwatch: stopwatch.startChronograph,
	putStopwatch: stopwatch.putChronograph,
	deleteStopwatch: stopwatch.deleteChronograph,
	getTransition: transition.getChronograph,
	startTransition: transition.startChronograph,
	putTransition: transition.putChronograph,
	deleteTransition: transition.deleteChronograph
};
