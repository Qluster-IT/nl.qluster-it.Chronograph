'use strict';

const Chronograph = require('../../lib/chronograph.js');

function getChronographData(chronograph) {
	return {
		id: chronograph.getId(),
		name: chronograph.getName(),
		type: chronograph.getData('type'),
		duration: chronograph.getDuration(),
		targetDuration: chronograph.getTargetDuration(),
		running: chronograph.isRunning()
	};
}

function getChronograph(id) {
	const chronograph = Chronograph.get(id);
	if (!chronograph) {
		throw new Error('Chronograph not found');
	}
	return chronograph;
}

module.exports = {
	async getChronographs() {
		return Chronograph.all().map(getChronographData);
	},

	async putChronograph({ params, body }) {
		if (!body || typeof body.running !== 'boolean') {
			throw new Error('The running property must be a boolean');
		}

		const chronograph = getChronograph(params.id);
		if (body.running) {
			chronograph.resume();
		} else {
			chronograph.pause();
		}
		return getChronographData(chronograph);
	},

	async deleteChronograph({ params }) {
		getChronograph(params.id).stop();
		return true;
	}
};
