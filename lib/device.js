'use strict';

const Homey = require('homey');
const Chronograph = require('../../lib/chronograph.js');
const { Utils, ChronographType } = require('./utils.js');

class Device extends Homey.Device {
	async onInit() {
		if(!this.hasCapability('alarm_started')) await this.addCapability('alarm_started');
		

		if(this.hasCapability('button.pause')) {
			await this.removeCapability('button.pause');
			await this.addCapability('button_pause');
		}
		if(this.hasCapability('button.stop')) {
			await this.removeCapability('button.stop');
			await this.addCapability('button_startstop');
		}
		
		
		await this.setCapabilityValue('button_pause', false);		
		await this.setCapabilityValue('button_startstop', false);

		this.registerCapabilityListener('button_pause', async (val) => {
			return setTimeout(async () => {				
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

		this.registerCapabilityListener('button_startstop', async (val) => {
			return setTimeout(async () => {				
				await this.setCapabilityValue('button_startstop', !val);
				let chronograph = Chronograph.get(this.getData().id);
				if (chronograph && !val) {
					// if(val)  chronograph.start();
					// else 
					chronograph.stop();
				} else if(val) {
					if(chronograph) chronograph.stop();
					let last_args = await this.getStoreValue('last_args');
					if(!last_args) return;
					if(this.driver.id==='stopwatch') Chronograph.stopwatch_startRunListener(this.homey, last_args) ;
					else if(this.driver.id==='timer') Chronograph.timer_startRunListener(this.homey, last_args) ;
					else if(this.driver.id==='transition') Chronograph.transition_startRunListener(this.homey, last_args) ;//.call(dev, last_args);

				}
			}, 1);
		});

		this._chronographEventHandlers = Chronograph.events.mon([ 'started', 'resumed', 'paused', 'removed', 'updated' ], async (event, chronograph) => {
			if (chronograph.getId() == this.getData().id) {
				this.setCapabilityValue('alarm_started', event != 'removed');
				this.setCapabilityValue('button_startstop', event != 'removed');
				this.setCapabilityValue('button_pause', event == 'started' || event == 'resumed');

				if(event==='started') {
					this.setStoreValue('last_args', chronograph._args);
				}
				if (
					event == 'started' || event == 'resumed'
				) {
					if (this._updateInterval) {
						clearInterval(this._updateInterval);
					}
					this._updateInterval = setInterval(() => {
						if (chronograph.getData('type') == ChronographType.TIMER) {
							this.setCapabilityValue('duration', parseFloat(((chronograph.getTargetDuration() - chronograph.getDuration()) / 1e3).toFixed(2)));
						} else {
							this.setCapabilityValue('duration', parseFloat((chronograph.getDuration() / 1e3).toFixed(2)));
						}
					}, 250);
				}
				if (
					event == 'paused' || event == 'removed'
				) {
					clearInterval(this._updateInterval);
					delete(this._updateInterval);
					if (chronograph.getData('type') == ChronographType.TIMER) {
						this.setCapabilityValue('duration', event != 'removed' ? parseFloat(((chronograph.getTargetDuration() - chronograph.getDuration()) / 1e3).toFixed(2)) : NaN);
					} else {
						this.setCapabilityValue('duration', event != 'removed' ? parseFloat((chronograph.getDuration() / 1e3).toFixed(2)) : NaN);
					}
				}
			}
		});

		this._cardEventHandlers = Chronograph.events.mon([ 'start_cards_updated', 'resume_cards_updated' ], (event, cards) => {
			let ids =
				[].concat(this.getStartCards(), this.getResumeCards())
				.map(chronograph => Utils.generateId(this.getChronographType(), chronograph.name))
			;
			if (ids.includes(this.getData().id)) {
				this.setAvailable();
			} else {
				this.setUnavailable();
			}
		});

		this.log('Device initialized.');
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
