'use strict';

const assert = require('assert');
const zlib = require('zlib');
const { encodeTemplate, decodeTemplate } = require('../lib/widget-template.js');
const widgetStyles = require('../assets/js/chronograph-widget-style.js');

describe('Widget template transfer', () => {
	it('round trips padding, header geometry, gradients and custom colors', async () => {
		const design = widgetStyles.builtInDesign('builtin:widgetkeeper');
		design.name = 'Padded header';
		design.widgetPadding = { large: { top: 0, right: 12, bottom: 4, left: 10 } };
		design.borderlessFrames = { large: true };
		const theme = widgetStyles.builtInScheme('builtin:widgetkeeper');
		theme.name = 'Custom gradient';
		theme.foregroundColors.name = '#ABCDEF';
		theme.borderColors = { background: 'black-light' };
		theme.colorOverrides.running.background = '#123456';
		assert.deepStrictEqual(JSON.parse(JSON.stringify(await decodeTemplate(await encodeTemplate({ design, theme })))),
			JSON.parse(JSON.stringify({ design, theme })));
	});

	it('round trips a design and theme without their local IDs', async () => {
		const design = {
			id: 'local-design', name: 'My design', groups: {
				normal: { elements: { name: { row: 1, group: 2, order: 1 } }, overrides: {} }
			}, buttonTexts: { normal: { start: 'Start now' } }, borderWidths: { normal: 3 },
			defaultIcons: { timer: 'far:clock', stopwatch: 'fab:github', transition: 'none' }
		};
		const theme = { id: 'local-theme', name: 'My theme', colors: { name: 'blue' },
			borderColors: { background: 'green' }, borderOverrides: { paused: { background: 'red' } } };
		const text = await encodeTemplate({ design, theme });
		assert.match(text, /^\[twf:Chronograph:Chronographs:DESIGN,THEME:"[A-Za-z0-9+/]+={0,2}":\/twf\]$/);
		assert.strictEqual(JSON.parse(zlib.brotliDecompressSync(Buffer.from(text.split('"')[1], 'base64'))).v, 1);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(await decodeTemplate(text))), JSON.parse(JSON.stringify({
			design: { ...design, id: undefined },
			theme: { ...theme, id: undefined }
		})));
		const decoded = await decodeTemplate(text);
		assert.strictEqual(widgetStyles.borderStyle(decoded.design, decoded.theme, 'normal', 'paused').border,
			'3px solid ' + widgetStyles.valueColor('red'));
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
		assert.match(text, /^\[twf:Chronograph:Chronographs:THEME:/);
		await assert.rejects(() => decodeTemplate(text.replace(':Chronographs:', ':HistoryChart:')), /This TWF is for HistoryChart, not Chronographs/);
		await assert.rejects(() => decodeTemplate(text.replace(':Chronograph:', ':OtherApp:')), /This TWF is for OtherApp, not Chronograph/);
		await assert.rejects(() => decodeTemplate(text.replace(':Chronographs:', ':')), /not Chronographs/);
		await assert.rejects(() => decodeTemplate(text.replace(':THEME:', ':DESIGN:')));
		await assert.rejects(() => decodeTemplate(text.replace(':"', ':"!')));
		for (const version of [0, 2, 3]) {
			const unsupported = zlib.brotliCompressSync(JSON.stringify({ v: version, t: {} })).toString('base64');
			await assert.rejects(() => decodeTemplate(`[twf:Chronograph:Chronographs:THEME:"${unsupported}":/twf]`), /Unsupported template version/);
		}
		const old = zlib.gzipSync(JSON.stringify({ v: 1, t: {} })).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:Chronographs:THEME:"${old}":/twf]`));
		const uncompressed = Buffer.from(JSON.stringify({ version: 1, theme: { name: 'Theme', colors: {} } })).toString('base64');
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:Chronographs:THEME:"${uncompressed}":/twf]`));
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
		await assert.rejects(() => decodeTemplate(`[twf:Chronograph:Chronographs:THEME:"${payload}":/twf]`));
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
