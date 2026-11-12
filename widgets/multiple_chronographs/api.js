'use strict';

const { createWidgetApi } = require('../../lib/widget-api.js');
const timer = createWidgetApi('timer');
const stopwatch = createWidgetApi('stopwatch');
const transition = createWidgetApi('transition');

module.exports = {
	getWidgetStyles: timer.getWidgetStyles,
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
