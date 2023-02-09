const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchStarted {
	constructor(triggerId, homey) {
		//super(triggerId);


		this.homey = homey;
		this.card = homey.flow.getTriggerCard(triggerId);
		this.card.registerRunListener((args, state) => {
			if (args.name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(args.name);
				return Promise.resolve(regexp.test(state.name));
			} else {
				return Promise.resolve(Utils.generateId(ChronographType.STOPWATCH, args.name) == state.id);
			}
		});

		// Listen for chronograph started events that should trigger this card.
		Chronograph.events.on('started', (chronograph) => {
			if (chronograph.getData('type') != ChronographType.STOPWATCH) {
				return;
			}
			this.card.trigger({
				// Tokens.
				"name": chronograph.getName()
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

module.exports = StopwatchStarted;
