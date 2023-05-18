const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchGetDuration {
	constructor(actionId, homey) {
		//super(actionId);


		this.homey = homey;
		this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let name = args.namedd ? args.namedd.name : args.name;
		if(!name) return Promise.reject(new Error(homey.__("name_required")));	let id = Utils.generateId(ChronographType.STOPWATCH, name);
			let stopwatch = Chronograph.get(id);
			if (!!stopwatch) {
				//let target = stopwatch.getTargetDuration();
				let elapsed = stopwatch.getDuration();
				return {
					elapsed,
					elapsedInSeconds: Number((elapsed / 1000).toFixed(this.homey.app.roundOfDurationsFlowcards)),
					elapsedInMinutes: Number((elapsed / 1000 / 60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
					elapsedInHours: Number((elapsed / 1000 / 60 / 60).toFixed(this.homey.app.roundOfDurationsFlowcards)),
					elapsedTimeInMinutes: this.homey.app.getTimeAsString(elapsed, 'mm:ss'),
					elapsedTimeInHours: this.homey.app.getTimeAsString(elapsed, 'HH:mm:ss'),
					elapsedTimeInHoursShort: this.homey.app.getTimeAsString(elapsed, 'HH:mm')
				};
			}

			return Promise.reject(new Error(this.homey.__("stopwatch_not_running", { "name": name })));
		});
	}

}

module.exports = StopwatchGetDuration;
