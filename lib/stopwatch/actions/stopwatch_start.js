const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchStart { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			if (!Utils.validateName(args.name)) {
				return Promise.reject(new Error(this.homey.__("invalid_name")));
			}

			let id = Utils.generateId(ChronographType.STOPWATCH, args.name);
			let stopwatch = new Chronograph(id, args.name);
			stopwatch.setData('type', ChronographType.STOPWATCH);

			let splits = this.homey.settings.get('stopwatch_splits') || [];
			splits
				.filter(split => {
					if (split.name.includes('*')) {
						let regexp = Utils.wildcardToRegExp(split.name);
						return regexp.test(stopwatch.getName());
					} else {
						return split.name == stopwatch.getName();
					}
				})
				.forEach(split => stopwatch.addSplit(split.time, split.unit, split));

			stopwatch.start();

			return Promise.resolve(true);
		});

		this.card.on('update', this._storeCards.bind(this));

		this._storeCards();
	}

	_storeCards() {
		this.card.getArgumentValues().then(args => {
			this.homey.settings.set('stopwatch_start_cards', args);
			Chronograph.events.emit('start_cards_updated', args);
		});
	}
}

module.exports = StopwatchStart;
