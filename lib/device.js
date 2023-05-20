'use strict';

const Homey = require('homey');
const Chronograph = require('./chronograph.js');
const { Utils, ChronographType } = require('./utils.js');

class Device extends Homey.Device {
	async onInit() {
		Chronograph.homey = this.homey;

		try {
		
			if (!this.hasCapability('alarm_started')) await this.addCapability('alarm_started');	
		} catch (error) {
			
		}


		try {
			if (this.hasCapability('button.pause')) { await this.removeCapability('button.pause'); }
		} catch (error) { this.error(error); }
		try {
			if (this.hasCapability('button.stop')) { await this.removeCapability('button.stop'); }
		} catch (error) { this.error(error); }
		try {
			if (!this.hasCapability('button_pause')) await this.addCapability('button_pause');
			await this.setCapabilityValue('button_pause', false);

			this.registerCapabilityListener('button_pause', async (val) => {
				return this.homey.setTimeout(async () => {
					await this.setCapabilityValue('button_pause', !val);
					let chronograph = Chronograph.get(this.getData().id);
					if (chronograph) {
						if (chronograph.isRunning()) {
							chronograph.pause();

						} else {
							chronograph.resume();
						}
					}
				}, 1);

			});
		} catch (error) { this.error(error); }
		try {
			if (!this.hasCapability('button_startstop')) await this.addCapability('button_startstop');
			await this.setCapabilityValue('button_startstop', false);


			this.registerCapabilityListener('button_startstop', async (val) => {
				return this.homey.setTimeout(async () => {
					await this.setCapabilityValue('button_startstop', !val);
					let chronograph = Chronograph.get(this.getData().id);
					if (chronograph && !val) {
						// if(val)  chronograph.start();
						// else 
						chronograph.stop();
					} else if (val) {
						if (chronograph) chronograph.stop();
						let last_args = await this.getStoreValue('last_args');
						if (!last_args) return;
						if (this.driver.id === 'stopwatch') Chronograph.stopwatch_startRunListener(this.homey, last_args);
						else if (this.driver.id === 'timer') Chronograph.timer_startRunListener(this.homey, last_args);
						else if (this.driver.id === 'transition') Chronograph.transition_startRunListener(this.homey, last_args);//.call(dev, last_args);

					}
				}, 1);
			});


		} catch (error) { this.error(error); }





		this._chronographEventHandlers = Chronograph.events.mon(['started', 'resumed', 'paused', 'removed', 'updated'], async (event, chronograph) => {
			await this.onEvent(event, chronograph);
		});

		this._cardEventHandlers = Chronograph.events.mon(['start_cards_updated', 'resume_cards_updated', 'trigger_cards_updated'], (event, cards) => {
			try {
				let ids =
					[].concat(this.getStartCards(), this.getResumeCards(), this.getTriggerCards())
						.map(chronograph => Utils.generateId(this.getChronographType(), chronograph.namedd ? chronograph.namedd.name : chronograph.name))
					;
				if (ids.includes(this.getData().id)) {
					this.setAvailable();
				} else {
					this.setUnavailable();
				}
			} catch (error) { this.error(error); }
		});

		this.log('Device initialized.');

		let chronograph = Chronograph.get(this.getData().id);
		if(chronograph) {
			if(chronograph.isRunning()) await this.onEvent('started', chronograph);
			else await this.onEvent('paused', chronograph);
		}
	}

	async onEvent(event, chronograph) {
		try {
			if (chronograph.getId() == this.getData().id) {
				await this.setCapabilityValue('alarm_started', event != 'removed');
				await this.setCapabilityValue('button_startstop', event != 'removed');
				await this.setCapabilityValue('button_pause', event == 'started' || event == 'resumed');

				if (event === 'started') {
					try {
						await this.setStoreValue('last_args', chronograph._args ?? null);
					} catch (error) {

					}
					//await this.setStoreValue('last_args', chronograph._args);
				}
				if (
					event == 'started' || event == 'resumed'
				) {
					if (this._updateInterval) {
						clearInterval(this._updateInterval);
					}
					this._updateInterval = setInterval(async () => {
						try {
							if (chronograph.getData('type') == ChronographType.TIMER) {
								await this.setCapabilityValue('duration', parseFloat(((chronograph.getTargetDuration() - chronograph.getDuration()) / 1e3).toFixed(2)));
							} else {
								await this.setCapabilityValue('duration', parseFloat((chronograph.getDuration() / 1e3).toFixed(2)));
							}
						} catch (error) {

						}
					}, 250);
				}
				if (
					event == 'paused' || event == 'removed'
				) {
					clearInterval(this._updateInterval);
					delete (this._updateInterval);
					try {
						if (chronograph.getData('type') == ChronographType.TIMER) {
							await this.setCapabilityValue('duration', event != 'removed' ? parseFloat(((chronograph.getTargetDuration() - chronograph.getDuration()) / 1e3).toFixed(2)) : NaN);
						} else {
							await this.setCapabilityValue('duration', event != 'removed' ? parseFloat((chronograph.getDuration() / 1e3).toFixed(2)) : NaN);
						}
					} catch (error) {

					}
				}
			}
		} catch (error) {
			try {
				this.error('Error args', chronograph, error);

			} catch (err2) {
				this.error('Error args fault', err2);
			}
		}
	}

	onDeleted() {
		Object.keys(this._chronographEventHandlers).forEach(event => {
			Chronograph.events.removeListener(event, this._chronographEventHandlers[event]);
		});
		Object.keys(this._cardEventHandlers).forEach(event => {
			Chronograph.events.removeListener(event, this._cardEventHandlers[event]);
		});

		this.log('Device removed.');
	}
}

module.exports = Device;
