const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchStart { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {			
			return Chronograph.stopwatch_startRunListener(this.homey, args);
		});

		this.card.on('update', this._storeCards.bind(this));

		this._storeCards();
	}

	_storeCards() {
		this.card.getArgumentValues().then(args => {
			this.homey.settings.set('stopwatch_start_cards', args);
			Chronograph.events.emit('start_cards_updated', args);
		});
	}
}

module.exports = StopwatchStart;
