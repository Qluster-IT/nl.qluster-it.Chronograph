const Homey = require('homey');
const { Utils } = require('../../utils.js');

class DelayPassed { 
	constructor(conditionId, homey) {
		//super(conditionId);
		this.homey=homey;
		
		this.card = homey.flow.getConditionCard(conditionId);
		this.card.registerRunListener((args) => {
			let time = parseFloat(args.time);
			if (isNaN(time)) {
				return Promise.reject(new Error(this.homey.__("invalid_duration")));
			}

			let duration = Utils.calculateDuration(time, args.unit);



			return new Promise(resolve => setTimeout(() => resolve(true), duration));

		});
	}
}

module.exports = DelayPassed;
