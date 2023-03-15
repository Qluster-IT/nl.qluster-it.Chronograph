const Chronograph = require('./lib/chronograph.js');
const { ChronographType } = require('./lib/utils.js');

let getAllFn = (getter, args, callback) => {
	let result = [];
	getter().forEach(entity => {
		result.push({
			id: entity.getId(),
			name: entity.getName(),
			data: entity.getAllData(),
			duration: entity.getDuration(),
			targetDuration: entity.getTargetDuration(),
			running: entity.isRunning()
		});
	});
	//return JSON.stringify(result);
	return result;
	//callback(null, JSON.stringify(result));
};

let getOneFn = (getter, args, callback) => {
	let entity = getter(args.params.id);
	if (!entity) {
		throw new Error('entity not found');
		return;
	}
	return {
		id: entity.getId(),
		name: entity.getName(),
		data: entity.getAllData(),
		duration: entity.getDuration(),
		targetDuration: entity.getTargetDuration(),
		running: entity.isRunning()
	};
	// callback(null, {
	// 	id: entity.getId(),
	// 	name: entity.getName(),
	// 	data: entity.getAllData(),
	// 	duration: entity.getDuration(),
	// 	targetDuration: entity.getTargetDuration(),
	// 	running: entity.isRunning()
	// });
};

let putOneFn = (getter, args, callback) => {
	let entity = getter(args.params.id);
	if (!entity) {
		throw new Error('entity not found');
	}
	if (
		args.body.running
		&& !entity.isRunning()
	) {
		entity.resume();
	}
	if (
		!args.body.running
		&& entity.isRunning()
	) {
		entity.pause();
	}
	return {
		id: entity.getId(),
		name: entity.getName(),
		data: entity.getAllData(),
		duration: entity.getDuration(),
		targetDuration: entity.getTargetDuration(),
		running: entity.isRunning()
	};
	// callback(null, {
	// 	id: entity.getId(),
	// 	name: entity.getName(),
	// 	data: entity.getAllData(),
	// 	duration: entity.getDuration(),
	// 	targetDuration: entity.getTargetDuration(),
	// 	running: entity.isRunning()
	// });
};

let deleteOneFn = (getter, args, callback) => {
	let entity = getter(args.params.id);
	if (!entity) {
		throw new Error('entity not found');
	}
	entity.stop();
	return true;
	//callback(null, true);
};

module.exports = {
	async getTimers({homey}) {
		let a = getAllFn.call(null, () => Chronograph.all().filter(entity => entity.getData('type') == ChronographType.TIMER));
		return a;
	},
	async getTimer({homey, params}) {
		return getOneFn.call(null, Chronograph.get, params);
	},
	async putTimer({homey, params, body}) {
		return putOneFn.call(null, Chronograph.get, {params, body});
	},
	async deleteTimer({homey, params, body}) {
		return deleteOneFn.call(null, Chronograph.get, {params, body});
	},

	async getStopwatches({homey}) {
		let a = getAllFn.call(null, () => Chronograph.all().filter(entity => entity.getData('type') == ChronographType.STOPWATCH));
		return a;
	},
	async getStopwatch({homey, params}) {
		return getOneFn.call(null, Chronograph.get, params);
	},
	async putStopwatch({homey, params, body}) {
		return putOneFn.call(null, Chronograph.get, {params, body});
	},
	async deleteStopwatch({homey, params, body}) {
		return deleteOneFn.call(null, Chronograph.get, {params, body});
	},

	async getTransitions({homey}) {
		let a = getAllFn.call(null, () => Chronograph.all().filter(entity => entity.getData('type') == ChronographType.TRANSITION));
		return a;
	},
	async getTransition({homey, params}) {
		return getOneFn.call(null, Chronograph.get, params);
	},
	async putTransition({homey, params, body}) {
		return putOneFn.call(null, Chronograph.get, {params, body});
	},
	async deleteTransition({homey, params, body}) {
		return deleteOneFn.call(null, Chronograph.get, {params, body});
	},

	async getChronographs({homey}) {
		let a = getAllFn.call(null, Chronograph.all);
		return a;
	},
	async getChronograph({homey, params}) {
		return getOneFn.call(null, Chronograph.get, params);
	},
	async putChronograph({homey, params, body}) {
		return putOneFn.call(null, Chronograph.get, {params, body});
	},
	async deleteChronograph({homey, params, body}) {
		return deleteOneFn.call(null, Chronograph.get, {params, body});
	},
	
	async getAllChronographs({homey}) {
		return homey.settings.get('chronographs');
	},
};
