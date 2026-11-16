'use strict';

const topicId = 162213;
const origin = 'https://community.homey.app';
const maxPosts = 2000;
const batchSize = 20;
const templatePattern = /\[twf:Chronograph:(?:DESIGN|THEME|DESIGN,THEME):"[A-Za-z0-9+/]+={0,2}":\/twf\]/g;

async function requestJson(path, fetcher) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await fetcher(origin + path, { signal: controller.signal });
		if (!response.ok) throw new Error(`Community forum returned HTTP ${response.status}`);
		const text = await response.text();
		if (text.length > 10 * 1024 * 1024) throw new Error('Community forum response is too large');
		return JSON.parse(text);
	} finally {
		clearTimeout(timeout);
	}
}

function entriesFromPost(post) {
	if (!post || !Number.isSafeInteger(post.id) || !Number.isSafeInteger(post.post_number)
		|| typeof post.raw !== 'string' || post.hidden || post.deleted_at) return [];
	const matches = Array.from(post.raw.matchAll(templatePattern));
	if (!matches.length) return [];
	const titleMatch = /^#\s+(.+)$/m.exec(post.raw);
	const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : `#${post.post_number}`;
	const description = post.raw.replace(templatePattern, '').replace(/^#\s+.+$/m, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/^\s*(?:```.*|TWF:)\s*$/gm, '').trim().slice(0, 4000);
	const images = [];
	if (typeof post.cooked === 'string') {
		for (const match of post.cooked.matchAll(/(?:<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*)?<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
			// Discourse links its reduced inline images to the full-resolution upload.
			for (const source of [match[1], match[2]].filter(Boolean)) {
				try {
					const url = new URL(source, origin);
					const isCommunityUpload = url.origin === origin && url.pathname.startsWith('/uploads/');
					const isCdnUpload = url.origin === 'https://us1.discourse-cdn.com'
						&& url.pathname.startsWith('/flex025/uploads/athom/');
					if (isCommunityUpload || isCdnUpload) {
						if (!images.includes(url.href)) images.push(url.href);
						break;
					}
				} catch (error) {
					if (!(error instanceof TypeError)) throw error;
				}
			}
		}
	}
	const likes = Array.isArray(post.actions_summary)
		? (post.actions_summary.find(action => action.id === 2) || {}).count || 0 : 0;
	return matches.map((match, index) => ({
		id: `${post.id}:${index}`, postId: post.id, number: post.post_number,
		title, description, images, author: String(post.username || ''), createdAt: post.created_at,
		likes, text: match[0], url: `${origin}/t/${topicId}/${post.post_number}`
	}));
}

async function getCatalog(fetcher = fetch) {
	const topic = await requestJson(`/t/${topicId}.json?include_raw=true`, fetcher);
	const stream = topic && topic.post_stream;
	if (!stream || !Array.isArray(stream.stream) || !Array.isArray(stream.posts)
		|| stream.stream.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid community topic response');
	if (stream.stream.length > maxPosts) throw new Error('Community topic has too many posts');
	const posts = new Map(stream.posts.filter(post => post && Number.isSafeInteger(post.id)).map(post => [post.id, post]));
	const missing = stream.stream.filter(id => !posts.has(id));
	for (let offset = 0; offset < missing.length; offset += batchSize) {
		const ids = missing.slice(offset, offset + batchSize);
		const query = ids.map(id => `post_ids%5B%5D=${id}`).join('&');
		const response = await requestJson(`/t/${topicId}/posts.json?include_raw=true&${query}`, fetcher);
		if (!response.post_stream || !Array.isArray(response.post_stream.posts)) throw new Error('Invalid community posts response');
		for (const post of response.post_stream.posts) {
			if (post && ids.includes(post.id)) posts.set(post.id, post);
		}
		if (ids.some(id => !posts.has(id))) throw new Error('Community topic posts could not be loaded');
	}
	return stream.stream.flatMap(id => {
		const post = posts.get(id);
		if (!post.hidden && !post.deleted_at && typeof post.raw !== 'string') {
			throw new Error('Community post content could not be loaded');
		}
		return entriesFromPost(post);
	});
}

module.exports = { getCatalog };
