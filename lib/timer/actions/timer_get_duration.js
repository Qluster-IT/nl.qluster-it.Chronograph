const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerGetDuration { 
	constructor(actionId, homey) {
		//super(actionId);

			
	this.homey=homey;
	this.card = homey.flow.getActionCard(actionId);
			this.card.registerRunListener((args) => {			
				let id = Utils.generateId(ChronographType.TIMER, args.name);
				let timer = Chronograph.get(id);
				if (!!timer) {
					let target = timer.getTargetDuration();
					let elapsed = timer.getDuration();
					let duration = target - elapsed;

					return {
						duration,
						durationInSeconds:duration/1000,
						durationInMinutes:duration/1000/60,
						durationInHours:duration/1000/60/60,
						
						elapsed,
						elapsedInSeconds:elapsed/1000,
						elapsedInMinutes:elapsed/1000/60,
						elapsedInHours:elapsed/1000/60/60
					};
				}

				return Promise.reject(new Error(this.homey.__("timer_not_running", { "name": args.name })));
			});

	}

}

module.exports = TimerGetDuration;
