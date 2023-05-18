const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerCompare { 
	constructor(conditionId, homey) {
		//super(conditionId);

		
this.homey=homey;
this.card = homey.flow.getConditionCard(conditionId);
		this.card.registerRunListener((args) => {
			let time = parseFloat(args.time);
			if (isNaN(time)) {
				return Promise.reject(new Error(this.homey.__("invalid_duration")));
			}
			let name = args.namedd ? args.namedd.name : args.name;

			let id = Utils.generateId(ChronographType.TIMER, name);
			let timer = Chronograph.get(id);
			if (!!timer) {
				return Promise.resolve((timer.getTargetDuration() - timer.getDuration()) > Utils.calculateDuration(time, args.unit));
			}

			return Promise.reject(new Error(this.homey.__("timer_not_running", { "name": name })));
		});
	}
}

module.exports = TimerCompare;
