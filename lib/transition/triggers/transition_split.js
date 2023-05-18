const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionSplit{ 
	constructor(triggerId, homey) {
		//super(triggerId);

		
this.homey=homey;
this.card = homey.flow.getTriggerCard(triggerId);
		this.card.registerRunListener((args, state) => {
			let name = args.namedd ? args.namedd.name : args.name;
			if (name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(name);
				return Promise.resolve(regexp.test(state.name));
			} else {
				return Promise.resolve(Utils.generateId(ChronographType.TRANSITION, name) == state.id);
			}
		});

		// Listen for chronograph start, split and finish events that should trigger this card.
		Chronograph.events.mon([ 'started', 'split', 'finished' ], (event, chronograph) => {
			if (chronograph.getData('type') != ChronographType.TRANSITION) {
				return;
			}

			// NOTE started is called *after* start and might already have a duration > 0, our transition
			// shoud however start on the exact from value.
			let duration = event == 'started' ? 0 : chronograph.getDuration();
			let perc = (1 / chronograph.getTargetDuration()) * duration;

			this.card.trigger({
				// Tokens.
				"name": chronograph.getName(),
				"seconds": Math.round(chronograph.getDuration() / 1e1) / 1e2,
				"value": parseFloat((chronograph.getData('from') + (perc * (chronograph.getData('to') - chronograph.getData('from')))).toFixed(2)),
				"first": event == 'started',
				"last": event == 'finished'
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

module.exports = TransitionSplit;
