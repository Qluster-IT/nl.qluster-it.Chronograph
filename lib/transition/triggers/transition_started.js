const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionStarted{ 
	constructor(triggerId, homey) {
		//super(triggerId);

		
this.homey=homey;
this.card = homey.flow.getTriggerCard(triggerId);
		this.card.registerRunListener((args, state) => {
			let name = args.namedd ? args.namedd.name : args.name;
		if(!name) return Promise.reject(new Error(homey.__("name_required")));	if (name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(name);
				return Promise.resolve(regexp.test(state.name));
			} else {
				return Promise.resolve(Utils.generateId(ChronographType.TRANSITION, name) == state.id);
			}
		});

		// Listen for chronograph started events that should trigger this card.
		Chronograph.events.on('started', chronograph => {
			if (chronograph.getData('type') != ChronographType.TRANSITION) {
				return;
			}
			this.card.trigger({
				// Tokens.
				"name": chronograph.getName(),
				"seconds": Math.round(chronograph.getTargetDuration() / 1e1) / 1e2
			}, {
				// State.
				"id": chronograph.getId(),
				"name": chronograph.getName()
			}, () => {
				// Callback.
			});
		});
	}
}

module.exports = TransitionStarted;
