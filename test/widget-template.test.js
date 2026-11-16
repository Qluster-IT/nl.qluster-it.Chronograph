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
			}, buttonTexts: { normal: { start: 'Start now' } },
			defaultIcons: { timer: 'far:clock', stopwatch: 'fab:github', transition: 'none' }
		};
		const theme = { id: 'local-theme', name: 'My theme', colors: { name: 'blue' } };
		const text = await encodeTemplate({ design, theme });
		assert.match(text, /^\[twf:Chronograph:DESIGN,THEME:"[A-Za-z0-9+/]+={0,2}":\/twf\]$/);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(await decodeTemplate(text))), JSON.parse(JSON.stringify({
			design: { ...design, id: undefined },
			theme: { ...theme, id: undefined }
		})));
	});

	it('round trips elapsed and total time positions, sizes, reservations and theme colors', async () => {
		const design = widgetStyles.currentDesign();
		const theme = widgetStyles.currentScheme();
		theme.foregroundColors = {};
		for (const [index, element] of ['remaining', 'total'].entries()) {
			design.groups.normal.elements[element] = { row: 2, group: index + 1, order: 2 };
			design.groups.normal.overrides.paused = Object.assign({}, design.groups.normal.overrides.paused,
				{ [element]: { row: 3, group: index + 1, order: 1 } });
			design.elementSizes.overrides.normal[element] = 24 + index;
			design.reservedElements.normal[element] = true;
			theme.foregroundColors[element] = index ? 'blue' : 'red';
		}
		const decoded = await decodeTemplate(await encodeTemplate({ design, theme }));
		const expected = JSON.parse(JSON.stringify({ design, theme }));
		delete expected.design.id;
		delete expected.theme.id;
		assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), expected);
	});

	it('supports either item and rejects mismatched or unsupported payloads', async () => {
		const text = await encodeTemplate({ theme: { id: 'x', name: 'Theme', colors: {} } });
		assert.match(text, /^\[twf:Chronograph:THEME:/);
		await assert.rejects(() => decodeTemplate(text.replace(':THEME:', ':DESIGN:')));
		await assert.rejects(() => decodeTemplate(text.replace(':"', ':"!')));
		const future = zlib.brotliCompressSync(JSON.stringify({ v: 3, t: {} })).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:THEME:"${future}":/twf]`), /Unsupported template version/);
		const old = zlib.gzipSync(JSON.stringify({ v: 1, t: {} })).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:THEME:"${old}":/twf]`));
		await assert.rejects(() => encodeTemplate({}));
	});

	it('imports plain and JavaScript-fenced templates without accepting extra content', async () => {
		const text = await encodeTemplate({ theme: { name: 'Theme', colors: {} } });
		const expected = JSON.parse(JSON.stringify(await decodeTemplate(text)));
		for (const wrapped of [`\`\`\`\n${text}\n\`\`\``, `\`\`\`javascript\r\n${text}\r\n\`\`\``]) {
			assert.deepStrictEqual(JSON.parse(JSON.stringify(await decodeTemplate(wrapped))), expected);
		}
		await assert.rejects(() => decodeTemplate(`\`\`\`javascript\n${text}\n${text}\n\`\`\``), /Invalid template/);
		await assert.rejects(() => decodeTemplate(`extra\n\`\`\`javascript\n${text}\n\`\`\``), /Invalid template/);
	});

	it('rejects Brotli payloads whose decompressed JSON exceeds the limit', async () => {
		const payload = zlib.brotliCompressSync(Buffer.alloc(512 * 1024 + 1)).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:THEME:"${payload}":/twf]`));
	});

	it('preserves each built-in design and reduces the compressed payload', async () => {
		for (const preset of widgetStyles.builtInDesignDefinitions) {
			const { id, ...design } = widgetStyles.builtInDesign(preset.id);
			const text = await encodeTemplate({ design });
			assert.deepStrictEqual(JSON.parse(JSON.stringify((await decodeTemplate(text)).design)), design);
			const payload = text.split('"')[1];
			const baseline = zlib.gzipSync(JSON.stringify({ v: 2, d: design }), { level: 9 }).toString('base64');
			assert.ok(payload.length < baseline.length, preset.id);
		}
	});
});
