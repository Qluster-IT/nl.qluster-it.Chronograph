const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class GetDuration { 
	constructor(actionId, homey) {
		//super(actionId);

			
	this.homey=homey;
	this.card = homey.flow.getActionCard(actionId);
			this.card.registerRunListener((args) => {			
				let id = Utils.generateId(args.chronograph_type, args.name);
				let timer = Chronograph.get(id);
				//console.log();
				let chronograph = new Chronograph(id, args.name);
				let reversedSplit = chronograph.getTargetDuration() - Utils.calculateDuration(split.time, split.unit);
				//let duration = Date.now() - timer.
				if (!!timer) {
					return {
						duration
					}
				}

				return Promise.reject(new Error(this.homey.__("timer_not_running", { "name": args.name })));
			});

			// this.card.on('update', this._storeCards.bind(this));

		// this._storeCards();
	}

}

module.exports = GetDuration;
