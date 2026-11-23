const { registerFlowRunListener, evaluateMillisecondFlowDuration } = require('../../flow-arguments.js');
const { storeCardArguments } = require('../../flow-cards.js');
const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionStart { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		registerFlowRunListener(this.card, actionId, (args)=> {
			const evaluatedTime = evaluateMillisecondFlowDuration(args, homey);
			return Chronograph.transition_startRunListener(this.homey, args, { evaluatedTime });
		});

		this._storeCards = storeCardArguments(this.card, homey, 'transition_start_cards', 'start_cards_updated');
		this._storeCards();
	}
}

module.exports = TransitionStart;
