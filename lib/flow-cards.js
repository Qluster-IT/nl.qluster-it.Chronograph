'use strict';

const { registerFlowRunListener } = require('./flow-arguments.js');
const Chronograph = require('./chronograph.js');
const { Utils } = require('./utils.js');

const toSeconds = milliseconds => Math.round(milliseconds / 1e1) / 1e2;

/** Saves the arguments of every Flow using card in settingName whenever such a Flow is saved; returns the save function. */
function storeCardArguments(card, homey, settingName, event, validate) {
	const store = async () => {
		try {
			let args = await card.getArgumentValues();
			if (validate) {
				let validArgs;
				for (let i = 0; i < args.length; i++) {
					if (validate(args[i])) {
						if (validArgs) validArgs.push(args[i]);
					} else {
						if (!validArgs) validArgs = args.slice(0, i);
						homey.error(`Invalid ${settingName} Flow card: milliseconds must be at least 50 and a multiple of 50`, args[i].time);
					}
				}
				if (validArgs) args = validArgs;
			}
			homey.settings.set(settingName, args);
			if (event) Chronograph.events.emit(event, args);
		} catch (error) {
			homey.error(`Unable to store ${settingName}`, error);
		}
	};
	card.on('update', store);
	return store;
}

function validSplitDuration(args) {
	return args.unit !== 'milliseconds' || Utils.isMillisecondStep(args.time);
}

/** Shared behaviour of the timer, stopwatch and transition trigger cards. */
class ChronographTrigger {
	constructor(triggerId, homey, type, matchSplit = false) {
		this.homey = homey;
		this.triggerId = triggerId;
		this.type = type;
		this.card = homey.flow.getTriggerCard(triggerId);
		registerFlowRunListener(this.card, triggerId, (args, state) => {
			const name = args.namedd ? args.namedd.name : args.name;
			if (!name) throw new Error(homey.__('name_required'));
			const matches = name.includes('*')
				? Utils.wildcardToRegExp(name).test(state.name)
				: Utils.generateId(type, name) == state.id;
			return matches && (!matchSplit || (args.time == state.time && args.unit == state.unit));
		});
	}

	/** Calls handler for event, but only for chronographs of this trigger's type. */
	listen(event, handler) {
		Chronograph.events.on(event, (chronograph, ...args) => {
			if (chronograph.getData('type') == this.type) handler(chronograph, ...args);
		});
	}

	fire(chronograph, tokens, state) {
		const name = chronograph.getName();
		new Promise(resolve => resolve(this.card.trigger({ name, ...tokens }, { id: chronograph.getId(), name, ...state })))
			.catch(error => this.homey.error(`Unable to trigger ${this.triggerId}`, error));
	}

	fireSplit(chronograph, { data }) {
		if (!data) return;
		this.fire(chronograph,
			{ seconds: toSeconds(Utils.calculateDuration(data.time, data.unit, true)) },
			{ time: data.time, unit: data.unit });
	}
}

module.exports = { ChronographTrigger, storeCardArguments, toSeconds, validSplitDuration };
