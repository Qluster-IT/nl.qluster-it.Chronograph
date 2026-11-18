'use strict';

const assert = require('assert');
const { getCatalog } = require('../lib/widget-template-catalog');
const { encodeTemplate, decodeTemplate } = require('../lib/widget-template');

describe('Widget template community catalog', () => {
	it('excludes other widget families, other apps and headers without a widget family', async () => {
		const text = await encodeTemplate({ theme: { name: 'Blue', colors: { name: 'blue' } } });
		const post = { id: 2, post_number: 2, raw: [
			text, text.replace(':Chronographs:', ':HistoryChart:'),
			text.replace(':Chronograph:', ':OtherApp:'), text.replace(':Chronographs:', ':')
		].join('\n') };
		const entries = await getCatalog(async () => ({
			ok: true,
			text: async () => JSON.stringify({ post_stream: { stream: [2], posts: [post] } })
		}));
		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0].text, text);
	});

	it('loads all topic posts and extracts templates without rendering post markup', async () => {
		const text = await encodeTemplate({ theme: { name: 'Blue', colors: { name: 'blue' } } });
		const calls = [];
		const posts = [
			{ id: 1, post_number: 1, raw: 'Placeholder', username: 'owner' },
			{ id: 2, post_number: 2, raw: `# Blue theme\nA <script>description</script>\n![preview](upload://abc.png)\n\nTWF:\n\`\`\`\n${text}\n\`\`\``, username: 'author',
				cooked: '<img src="https://us1.discourse-cdn.com/flex025/uploads/athom/original/3X/a/b/preview.png"><img src="https://example.com/tracker.png">',
				actions_summary: [{ id: 2, count: 5 }] },
			{ id: 3, post_number: 3, raw: `# Hidden\n${text}`, hidden: true }
		];
		const fetcher = async url => {
			calls.push(url);
			const body = calls.length === 1
				? { post_stream: { stream: [1, 2, 3], posts: [posts[0]] } }
				: { post_stream: { posts: posts.slice(1) } };
			return { ok: true, text: async () => JSON.stringify(body) };
		};
		const result = await getCatalog(fetcher);
		assert.strictEqual(calls.length, 2);
		assert.match(calls[1], /post_ids%5B%5D=2/);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].title, 'Blue theme');
		assert.strictEqual(result[0].description, 'A <script>description</script>');
		assert.deepStrictEqual(result[0].images, ['https://us1.discourse-cdn.com/flex025/uploads/athom/original/3X/a/b/preview.png']);
		assert.strictEqual(result[0].likes, 5);
		assert.strictEqual(result[0].text, text);
		assert.strictEqual(result[0].url, 'https://community.homey.app/t/162213/2');
	});

	it('extracts and imports JavaScript-fenced templates without including the fence in the description', async () => {
		const text = await encodeTemplate({ theme: { name: 'Blue', colors: { name: 'blue' } } });
		const post = { id: 2, post_number: 2, raw: `# Blue theme\nDescription\n\nTWF:\n\`\`\`javascript\n${text}\n\`\`\`` };
		const entries = await getCatalog(async () => ({
			ok: true,
			text: async () => JSON.stringify({ post_stream: { stream: [2], posts: [post] } })
		}));
		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0].description, 'Description');
		assert.strictEqual(entries[0].text, text);
		assert.strictEqual((await decodeTemplate(entries[0].text)).theme.name, 'Blue');
	});

	it('uses full-resolution forum uploads for zoom without accepting external image links', async () => {
		const text = await encodeTemplate({ theme: { name: 'Blue', colors: { name: 'blue' } } });
		const original = 'https://us1.discourse-cdn.com/flex025/uploads/athom/original/3X/a/preview.png';
		const post = { id: 2, post_number: 2, raw: text,
			cooked: `<a class="lightbox" href="${original}"><img src="/uploads/thumbnail.png"></a>`
				+ `<a href="${original}"><img src="/uploads/another-thumbnail.png"></a>`
				+ '<a href="https://example.com/image.png"><img src="/uploads/safe.png"></a>'
				+ '<a href="https://example.com/image.png"><img src="https://example.com/tracker.png"></a>'
		};
		const entries = await getCatalog(async () => ({
			ok: true,
			text: async () => JSON.stringify({ post_stream: { stream: [2], posts: [post] } })
		}));
		assert.deepStrictEqual(entries[0].images, [original, 'https://community.homey.app/uploads/safe.png']);
	});

	it('reports network errors and incomplete topic pages instead of returning a partial catalog', async () => {
		await assert.rejects(getCatalog(async () => ({ ok: false, status: 503 })), /503/);
		let calls = 0;
		await assert.rejects(getCatalog(async () => ({
			ok: true,
			text: async () => JSON.stringify(++calls === 1
				? { post_stream: { stream: [1], posts: [] } } : { post_stream: { posts: [] } })
		})), /could not be loaded/);
		await assert.rejects(getCatalog(async () => ({
			ok: true,
			text: async () => JSON.stringify({ post_stream: { stream: [1], posts: [{ id: 1 }] } })
		})), /post content could not be loaded/);
	});
});
