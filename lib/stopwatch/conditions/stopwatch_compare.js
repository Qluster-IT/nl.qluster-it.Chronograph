const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchCompare { 
	constructor(conditionId, homey) {
		//super(conditionId);

		
this.homey=homey;
this.card = homey.flow.getConditionCard(conditionId);
		this.card.registerRunListener((args) => {
			let time = parseFloat(args.time);
			if (isNaN(time)) {
				return Promise.reject(new Error(this.homey.__("invalid_duration")));
			}

			let id = Utils.generateId(ChronographType.STOPWATCH, args.name);
			let stopwatch = Chronograph.get(id);
			if (!!stopwatch) {
				return Promise.resolve(stopwatch.getDuration() > Utils.calculateDuration(time, args.unit));
			}

			return Promise.reject(new Error(this.homey.__("stopwatch_not_running", { "name": args.name })));
		});
	}
}

module.exports = StopwatchCompare;
