const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchStopped{ 
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
				return Promise.resolve(Utils.generateId(ChronographType.STOPWATCH, name) == state.id);
			}
		});

		// Listen for chronograph stopped events that should trigger this card.
		Chronograph.events.on('stopped', chronograph => {
			if (chronograph.getData('type') != ChronographType.STOPWATCH) {
				return;
			}
			this.card.trigger({
				// Tokens.
				"name": chronograph.getName(),
				"seconds": Math.round(chronograph.getDuration() / 1e1) / 1e2
			}, {
				// State.
				"id": chronograph.getId(),
				"name": chronograph.getName()
			}, () => {
				// Callback.
			});
		});

		this.card.on('update', this._storeCards.bind(this));

		this._storeCards();
		
	}
	
	_storeCards() {
		this.card.getArgumentValues().then(args => {
			this.homey.settings.set('stopwatch_trigger_cards', args);
			Chronograph.events.emit('trigger_cards_updated', args);
		});
	}
}

module.exports = StopwatchStopped;
