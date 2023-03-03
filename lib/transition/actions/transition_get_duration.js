const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionGetDuration { 
	constructor(actionId, homey) {
		//super(actionId);

			
	this.homey=homey;
	this.card = homey.flow.getActionCard(actionId);
			this.card.registerRunListener((args) => {			
				let id = Utils.generateId(ChronographType.TRANSITION, args.name);
				let transition = Chronograph.get(id);
				if (!!transition) {
					let target = transition.getTargetDuration();
					let elapsed = transition.getDuration();
					let duration = target - elapsed;
					
					return {
						duration,
						durationInSeconds:duration/1000,
						durationInMinutes:duration/1000/60,
						durationInHours:duration/1000/60/60,
						durationTimeInMinutes : this.homey.app.getTimeAsString(duration, 'mm:ss'),
						durationTimeInHours : this.homey.app.getTimeAsString(duration, 'HH:mm:ss'),
						
						elapsed,
						elapsedInSeconds:elapsed/1000,
						elapsedInMinutes:elapsed/1000/60,
						elapsedInHours:elapsed/1000/60/60,
						elapsedTimeInMinutes : this.homey.app.getTimeAsString(elapsed, 'mm:ss'),
						elapsedTimeInHours : this.homey.app.getTimeAsString(elapsed, 'HH:mm:ss')
					};
				}

				return Promise.reject(new Error(this.homey.__("transition_not_running", { "name": args.name })));
			});
	}

}

module.exports = TransitionGetDuration;
