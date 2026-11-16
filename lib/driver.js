'use strict';

const Homey = require('homey');
const { Utils } = require('./utils.js');

class Driver extends Homey.Driver {

	
	async onPairListDevices(data, callback) {
		const type = this.getChronographType();
		const configured = this.homey.app.chronographs || {};
		const names = (configured[type.toLowerCase()] || [])
			.map(chronograph => typeof chronograph === 'string' ? chronograph : chronograph.name)
			.filter((name, index, self) => name && self.indexOf(name) === index) // make unique
			.sort();

		return names.map(name => ({
			name: Utils.beautifyName(name),
			data: {
				id: Utils.generateId(type, name)
			}
		}));
	}
}

module.exports = Driver;
