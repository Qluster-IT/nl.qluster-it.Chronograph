const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerSplit{ 
	constructor(triggerId, homey) {
		//super(triggerId);

		
this.homey=homey;
this.card = homey.flow.getTriggerCard(triggerId);
		this.card.registerRunListener((args, state) => {
			if (args.name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(args.name);
				return Promise.resolve(
					regexp.test(state.name)
					&& args.time == state.time
					&& args.unit == state.unit);
			} else {
				return Promise.resolve(
					Utils.generateId(ChronographType.TIMER, args.name) == state.id
					&& args.time == state.time
					&& args.unit == state.unit);
			}
		});

		// Listen for chronograph split events that should trigger this card.
		Chronograph.events.on('split', (chronograph, split) => {
			if (chronograph.getData('type') != ChronographType.TIMER) {
				return;
			}
			this.card.trigger({
				// Tokens.
				"name": chronograph.getName(),
				"seconds": Math.round(Utils.calculateDuration(split.data.time, split.data.unit) / 1e1) / 1e2
			}, {
				// State.
				"id": chronograph.getId(),
				"name": chronograph.getName(),
				"time": split.data.time,
				"unit": split.data.unit
			}, () => {
				// Callback.
			});
		});

		// This method gets called everytime a flow is saved that has (or had) this
		// trigger card. The argument values contains an array with objects, one for
		// each instance of this trigger card.
		this.card.on('update', () => {
			this.card.getArgumentValues().then(args => {
				// The only thing we can do with the arguments here is storing
				// them for retrieval once a timer is started.
				this.homey.settings.set('timer_splits', args);
			});
		});
	}
}

module.exports = TimerSplit;
