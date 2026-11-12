const { registerFlowRunListener } = require('../../flow-arguments.js');
const Chronograph = require('../../chronograph.js');
const { Utils } = require('../../utils.js');

class ResumeChronograph {
	constructor(actionId, homey, chronographType) {
		this.homey = homey;
		this.card = homey.flow.getActionCard(actionId);
		registerFlowRunListener(this.card, actionId, args => {
			const name = args.namedd ? args.namedd.name : args.name;
			if (!name) {
				return Promise.reject(new Error(this.homey.__('name_required')));
			}

			let chronographs;
			if (name.includes('*')) {
				const regexp = Utils.wildcardToRegExp(name);
				chronographs = Chronograph.all().filter(chronograph =>
					chronograph.getData('type') === chronographType
					&& regexp.test(chronograph.getName()));
			} else {
				const chronograph = Chronograph.get(Utils.generateId(chronographType, name));
				chronographs = chronograph ? [chronograph] : [];
			}

			if (chronographs.length === 0) {
				const type = chronographType.toLowerCase();
				return Promise.reject(new Error(this.homey.__(`${type}_not_running`, { name })));
			}

			chronographs.forEach(chronograph => {
				if (!chronograph.isRunning()) {
					chronograph.resume();
				}
			});
			return Promise.resolve(true);
		});
	}
}

module.exports = ResumeChronograph;
