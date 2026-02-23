import decodeWebp, { init as initWebpDec } from '@jsquash/webp/decode';
import encodeWebp, { init as initWebpEnc } from '@jsquash/webp/encode';

// Import WASM binaries
// @ts-ignore
import webpEncWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
// @ts-ignore
import webpDecWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';

export interface ImageData {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
}

export interface Env {
	IMAGES: R2Bucket;
}

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

			const object = await env.IMAGES.get(`${path}.webp`);

			if (object === null) {
				return new Response('Not found', { status: 404, headers: corsHeaders });
			}

			const headers = new Headers(corsHeaders);
			object.writeHttpMetadata(headers);
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
			const arrayBuffer = await request.arrayBuffer();
			const contentType = request.headers.get('content-type') || '';

			let imageData: ImageData | null = null;

			// Strictly allow only WebP
			if (contentType && !contentType.includes('webp')) {
				return new Response(JSON.stringify({ error: 'Unsupported image format. Only WebP is allowed.' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			try {
				await initWebpDec(webpDecWasm);
				imageData = await decodeWebp(arrayBuffer);
			} catch (e) {
				// Fallback to magic number check if Content-Type was missing or misleading
				const magic = new Uint8Array(arrayBuffer.slice(0, 12));
				if (
					magic[0] === 0x52 &&
					magic[1] === 0x49 &&
					magic[2] === 0x46 &&
					magic[3] === 0x46 &&
					magic[8] === 0x57 &&
					magic[9] === 0x45 &&
					magic[10] === 0x42 &&
					magic[11] === 0x50
				) {
					await initWebpDec(webpDecWasm);
					imageData = await decodeWebp(arrayBuffer);
				}
			}

			if (!imageData) {
				return new Response(JSON.stringify({ error: 'Invalid WebP image data' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			// Reject if dimensions > 2048
			const MAX_DIMENSION = 2048;
			if (imageData.width > MAX_DIMENSION || imageData.height > MAX_DIMENSION) {
				return new Response(
					JSON.stringify({
						error: `Image dimensions exceed the limit of ${MAX_DIMENSION}px.`,
						width: imageData.width,
						height: imageData.height,
					}),
					{
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					},
				);
			}

			const finalImageData = imageData;

			// Convert to WebP
			await initWebpEnc(webpEncWasm);
			const webpBuffer = await encodeWebp(finalImageData);

			// Generate short hash
			const hashBuffer = await crypto.subtle.digest('SHA-256', webpBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
			const shortHash = hashHex.substring(0, 6);

			// Store in R2
			const key = `${shortHash}.webp`;
			await env.IMAGES.put(key, webpBuffer, {
				httpMetadata: {
					contentType: 'image/webp',
				},
			});

			return new Response(JSON.stringify({ hash: shortHash }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			console.error('Processing error:', error);
			return new Response(
				JSON.stringify({ error: 'Failed to process image', details: error instanceof Error ? error.message : String(error) }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				},
			);
		}
	},
};
