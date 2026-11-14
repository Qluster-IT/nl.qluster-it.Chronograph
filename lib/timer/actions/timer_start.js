const { registerFlowRunListener } = require('../../flow-arguments.js');
const { storeCardArguments } = require('../../flow-cards.js');
const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerStart {
	constructor(actionId, homey) {
		//super(actionId);


		this.homey = homey;
		this.card = homey.flow.getActionCard(actionId);
		registerFlowRunListener(this.card, actionId, (args) => {
			return Chronograph.timer_startRunListener(this.homey, args);
		});

		this._storeCards = storeCardArguments(this.card, homey, 'timer_start_cards', 'start_cards_updated');
		this._storeCards();
	}
}

module.exports = TimerStart;
