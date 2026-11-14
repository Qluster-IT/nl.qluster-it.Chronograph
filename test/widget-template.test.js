'use strict';

const assert = require('assert');
const zlib = require('zlib');
const { encodeTemplate, decodeTemplate } = require('../lib/widget-template.js');
const widgetStyles = require('../assets/js/chronograph-widget-style.js');

describe('Widget template transfer', () => {
	it('round trips a design and theme without their local IDs', async () => {
		const design = {
			id: 'local-design', name: 'My design', groups: {
				normal: { elements: { name: { row: 1, group: 2, order: 1 } }, overrides: {} }
			}, buttonTexts: { normal: { start: 'Start now' } }
		};
		const theme = { id: 'local-theme', name: 'My theme', colors: { name: 'blue' } };
		const text = await encodeTemplate({ design, theme });
		assert.match(text, /^\[twf:Chronograph:DESIGN,THEME:"H4s.*":\/twf\]$/);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(await decodeTemplate(text))), JSON.parse(JSON.stringify({
			design: { ...design, id: undefined },
			theme: { ...theme, id: undefined }
		})));
	});

	it('supports either item and rejects mismatched or unsupported payloads', async () => {
		const text = await encodeTemplate({ theme: { id: 'x', name: 'Theme', colors: {} } });
		assert.match(text, /^\[twf:Chronograph:THEME:/);
		await assert.rejects(() => decodeTemplate(text.replace(':THEME:', ':DESIGN:')));
		await assert.rejects(() => decodeTemplate(text.replace('H4s', 'H4!')));
		const future = zlib.gzipSync(JSON.stringify({ v: 2, t: {} })).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:THEME:"${future}":/twf]`));
		await assert.rejects(() => encodeTemplate({}));
	});

	it('preserves each built-in design and reduces the compressed payload', async () => {
		for (const preset of widgetStyles.builtInDesignDefinitions) {
			const { id, ...design } = widgetStyles.builtInDesign(preset.id);
			const text = await encodeTemplate({ design });
			assert.deepStrictEqual(JSON.parse(JSON.stringify((await decodeTemplate(text)).design)), design);
			const payload = text.split('"')[1];
			const baseline = zlib.gzipSync(JSON.stringify({ v: 1, d: design }), { level: 9 }).toString('base64');
			assert.ok(payload.length < baseline.length, preset.id);
		}
	});
});
