const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchGetDuration { 
	constructor(actionId, homey) {
		//super(actionId);

			
	this.homey=homey;
	this.card = homey.flow.getActionCard(actionId);
			this.card.registerRunListener((args) => {			
				let id = Utils.generateId(ChronographType.STOPWATCH, args.name);
				let stopwatch = Chronograph.get(id);
				if (!!stopwatch) {
					//let target = stopwatch.getTargetDuration();
					let elapsed = stopwatch.getDuration();
					
					return {
						elapsed,
						elapsedInSeconds:elapsed/1000,
						elapsedInMinutes:elapsed/1000/60,
						elapsedInHours:elapsed/1000/60/60
					};
				}

				return Promise.reject(new Error(this.homey.__("stopwatch_not_running", { "name": args.name })));
			});
	}

}

module.exports = StopwatchGetDuration;
