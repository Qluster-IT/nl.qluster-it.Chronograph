'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

describe('Widget store previews', () => {
	it('provides transparent 1024px light and dark PNGs for every widget', () => {
		const previews = new Set();
		for (const type of ['timer', 'stopwatch', 'transition', 'multiple_chronographs']) {
			for (const theme of ['light', 'dark']) {
				const image = fs.readFileSync(path.join(__dirname, '..', 'widgets', type, `preview-${theme}.png`));
				assert.strictEqual(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
				assert.strictEqual(image.readUInt32BE(16), 1024, type + ' ' + theme);
				assert.strictEqual(image.readUInt32BE(20), 1024, type + ' ' + theme);
				assert.strictEqual(image[24], 8);
				assert.strictEqual(image[25], 6, 'PNG must contain an alpha channel');
				const chunks = [];
				for (let offset = 8; offset < image.length;) {
					const length = image.readUInt32BE(offset);
					const chunk = image.toString('ascii', offset + 4, offset + 8);
					if (chunk === 'IDAT') chunks.push(image.subarray(offset + 8, offset + 8 + length));
					offset += length + 12;
				}
				const pixels = zlib.inflateSync(Buffer.concat(chunks));
				assert.strictEqual(pixels[4], 0, 'top-left corner must be transparent');
				previews.add(image.toString('base64'));
			}
		}
		assert.strictEqual(previews.size, 8);
	});
});
