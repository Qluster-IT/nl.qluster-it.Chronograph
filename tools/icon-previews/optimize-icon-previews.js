'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, value) => {
	for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function optimizePng(png) {
	if (!png.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature');
	const chunks = [];
	const imageData = [];
	for (let offset = 8; offset < png.length;) {
		if (offset + 12 > png.length) throw new Error('Invalid PNG chunk length');
		const length = png.readUInt32BE(offset);
		const end = offset + length + 12;
		if (end > png.length) throw new Error('Invalid PNG chunk length');
		const chunk = png.subarray(offset, end);
		if (crc32(chunk.subarray(4, -4)) !== chunk.readUInt32BE(chunk.length - 4)) {
			throw new Error('Invalid PNG chunk checksum');
		}
		const type = chunk.toString('ascii', 4, 8);
		chunks.push({ type, chunk });
		if (type === 'IDAT') imageData.push(chunk.subarray(8, -4));
		offset = end;
	}
	if (!chunks.length || chunks[0].type !== 'IHDR'
		|| chunks[chunks.length - 1].type !== 'IEND' || !imageData.length) {
		throw new Error('Invalid PNG structure');
	}
	let compressed = Buffer.concat(imageData);
	const scanlines = zlib.inflateSync(compressed);
	for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE]) {
		const candidate = zlib.deflateSync(scanlines, { level: 9, strategy });
		if (candidate.length < compressed.length) compressed = candidate;
	}
	if (!zlib.inflateSync(compressed).equals(scanlines)) throw new Error('PNG scanlines changed');
	const imageChunk = Buffer.alloc(compressed.length + 12);
	imageChunk.writeUInt32BE(compressed.length);
	imageChunk.write('IDAT', 4, 'ascii');
	compressed.copy(imageChunk, 8);
	imageChunk.writeUInt32BE(crc32(imageChunk.subarray(4, -4)), imageChunk.length - 4);
	const parts = [signature];
	let inserted = false;
	for (const { type, chunk } of chunks) {
		if (type !== 'IDAT') parts.push(chunk);
		else if (!inserted) {
			parts.push(imageChunk);
			inserted = true;
		}
	}
	const result = Buffer.concat(parts);
	return result.length < png.length ? result : png;
}

if (require.main === module) {
	const file = path.join(__dirname, '..', '..', 'assets', 'fontawesome-previews.json.gz');
	const original = fs.readFileSync(file);
	const previews = JSON.parse(zlib.gunzipSync(original));
	let changed = 0;
	for (const [id, value] of Object.entries(previews)) {
		const png = Buffer.from(value, 'base64');
		const optimized = optimizePng(png);
		if (optimized.length < png.length) {
			previews[id] = optimized.toString('base64');
			changed++;
		}
	}
	const result = zlib.gzipSync(Buffer.from(JSON.stringify(previews)), { level: 9 });
	if (result.length < original.length) fs.writeFileSync(file, result);
	console.log(`Optimized ${changed} icon previews; saved ${Math.max(0, original.length - result.length)} bytes.`);
}

module.exports = { optimizePng };
