const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionGetDuration { 
	constructor(actionId, homey) {
		//super(actionId);

			
	this.homey=homey;
	this.card = homey.flow.getActionCard(actionId);
			this.card.registerRunListener((args) => {	
				let name = args.namedd ? args.namedd.name : args.name;		
				let id = Utils.generateId(ChronographType.TRANSITION, name);
				let transition = Chronograph.get(id);
				if (!!transition) {
					let target = transition.getTargetDuration();
					let elapsed = transition.getDuration();
					let duration = target - elapsed;
					
					return {
						duration,
						durationInSeconds:Number((duration/1000).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						durationInMinutes:Number((duration/1000/60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						durationInHours:Number((duration/1000/60/60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						durationTimeInMinutes : this.homey.app.getTimeAsString(duration, 'mm:ss'),
						durationTimeInHours : this.homey.app.getTimeAsString(duration, 'HH:mm:ss'),
						durationTimeInHoursShort : this.homey.app.getTimeAsString(duration, 'HH:mm'),
						
						elapsed,
						elapsedInSeconds:Number((elapsed/1000).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						elapsedInMinutes:Number((elapsed/1000/60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						elapsedInHours:Number((elapsed/1000/60/60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
						elapsedTimeInMinutes : this.homey.app.getTimeAsString(elapsed, 'mm:ss'),
						elapsedTimeInHours : this.homey.app.getTimeAsString(elapsed, 'HH:mm:ss'),
						elapsedTimeInHoursShort : this.homey.app.getTimeAsString(elapsed, 'HH:mm')
					};
				}

				return Promise.reject(new Error(this.homey.__("transition_not_running", { "name": name })));
			});
	}

}

module.exports = TransitionGetDuration;
