export interface Env {
	ASSETS: R2Bucket;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
			'Access-Control-Allow-Headers': '*',
			'Access-Control-Max-Age': '86400',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);
		const path = url.pathname.slice(1);

		if (request.method === 'GET') {
			if (!path) {
				return new Response('Not found', { status: 404, headers: corsHeaders });
			}

			const object = await env.ASSETS.get(path);

			if (object === null) {
				return new Response('Not found', { status: 404, headers: corsHeaders });
			}

			const headers = new Headers(corsHeaders);
			headers.set('content-type', 'application/octet-stream');
			headers.set('etag', object.httpEtag);

			return new Response(object.body, {
				headers,
			});
		}

		if (request.method !== 'POST' && request.method !== 'PUT') {
			return new Response('Method not allowed', {
				status: 405,
				headers: corsHeaders,
			});
		}

		try {
			const contentLength = parseInt(request.headers.get('content-length') || '0');
			if (contentLength > MAX_SIZE) {
				return new Response(JSON.stringify({ error: 'Payload too large. Max size is 10MB.' }), {
					status: 413,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			const arrayBuffer = await request.arrayBuffer();

			if (arrayBuffer.byteLength > MAX_SIZE) {
				return new Response(JSON.stringify({ error: 'Payload too large. Max size is 10MB.' }), {
					status: 413,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			// Generate SHA-256 hash
			const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
			const shortHash = hashHex.substring(0, 6);

			// Store in R2
			await env.ASSETS.put(shortHash, arrayBuffer, {
				httpMetadata: {
					contentType: 'application/octet-stream',
				},
			});

			return new Response(JSON.stringify({ hash: shortHash }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			console.error('Storage error:', error);
			return new Response(
				JSON.stringify({ error: 'Failed to store blob', details: error instanceof Error ? error.message : String(error) }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				},
			);
		}
	},
};
