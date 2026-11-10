'use strict';

const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType } = require('../lib/utils.js');
const widgetApi = require('../widgets/chronograph/api.js');

describe('Chronograph widget API', () => {
	let chronographId;
	let originalHomey;

	beforeEach(() => {
		chronographId = 'widget-api-' + Date.now();
		originalHomey = Chronograph.homey;
		Chronograph.homey = {
			setTimeout,
			clearTimeout
		};
	});

	afterEach(() => {
		const chronograph = Chronograph.get(chronographId);
		if (chronograph) chronograph.stop();
		Chronograph.homey = originalHomey;
	});

	it('lists active chronographs with widget display data', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		const chronographs = await widgetApi.getChronographs({});
		const result = chronographs.find(item => item.id === chronographId);

		assert.ok(result);
		assert.strictEqual(result.name, 'Widget API timer');
		assert.strictEqual(result.type, ChronographType.TIMER);
		assert.strictEqual(result.running, false);
		assert.strictEqual(result.targetDuration, 30000);
	});

	it('pauses, resumes and stops a selected chronograph', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		timer.start();

		const paused = await widgetApi.putChronograph({
			params: { id: chronographId },
			body: { running: false }
		});
		assert.strictEqual(paused.running, false);

		const resumed = await widgetApi.putChronograph({
			params: { id: chronographId },
			body: { running: true }
		});
		assert.strictEqual(resumed.running, true);

		assert.strictEqual(await widgetApi.deleteChronograph({ params: { id: chronographId } }), true);
		assert.strictEqual(Chronograph.get(chronographId), false);
	});

	it('rejects invalid running values and unknown chronographs', async () => {
		const timer = new Chronograph(chronographId, 'Widget API timer', 30, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		await assert.rejects(widgetApi.putChronograph({
			params: { id: chronographId },
			body: { running: 'false' }
		}), /running property must be a boolean/);
		await assert.rejects(widgetApi.putChronograph({
			params: { id: 'missing' },
			body: { running: false }
		}), /Chronograph not found/);
	});
});
