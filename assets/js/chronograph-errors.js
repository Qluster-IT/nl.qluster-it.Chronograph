'use strict';

window.chronographErrorMessage = function (homey, error) {
	var message = error && error.message ? error.message : String(error);
	var keys = {
		'Chronograph not found in app configuration': 'settings.error_not_configured',
		'Chronograph is not active': 'settings.error_not_active',
		'Chronograph is already active': 'settings.error_already_active',
		'Chronograph name conflicts with an active instance': 'settings.error_name_conflict',
		'A duration is required': 'settings.error_duration_required',
		'Invalid chronograph name': 'invalid_name',
		'Invalid duration': 'invalid_duration'
	};
	if (Object.prototype.hasOwnProperty.call(keys, message)) return homey.__(keys[message]);
	var fields = {
		'Invalid duration unit': ['invalid_duration', 'settings.widget_unit'],
		'Invalid transition from': ['invalid_transition', 'settings.widget_from'],
		'Invalid transition to': ['invalid_transition', 'settings.widget_to'],
		'Invalid transition steps': ['invalid_transition', 'settings.widget_steps']
	};
	if (Object.prototype.hasOwnProperty.call(fields, message)) {
		return homey.__(fields[message][0]) + ' ' + homey.__(fields[message][1]);
	}
	return message;
};
