const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerRunning { 
	constructor(conditionId, homey) {
		//super(conditionId);

		
this.homey=homey;
this.card = homey.flow.getConditionCard(conditionId);
		this.card.registerRunListener((args) => {
			let id = Utils.generateId(ChronographType.TIMER, args.name);
			let timer = Chronograph.get(id);
			return Promise.resolve(!!timer && timer.isRunning());
		});
	}
}

module.exports = TimerRunning;
