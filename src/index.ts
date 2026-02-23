import resize, { initResize } from '@jsquash/resize';
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode';
import decodeJpeg, { init as initJpeg } from '@jsquash/jpeg/decode';
import decodePng, { init as initPng } from '@jsquash/png/decode';

// Import WASM binaries
import resizeWasm from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm';
import webpEncWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
import jpegDecWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import pngDecWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

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
		const url = new URL(request.url);
		const path = url.pathname.slice(1);

		if (request.method === 'GET') {
			if (!path) {
				return new Response('Not found', { status: 404 });
			}

			const object = await env.IMAGES.get(`${path}.webp`);

			if (object === null) {
				return new Response('Not found', { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);

			return new Response(object.body, {
				headers,
			});
		}

		if (request.method !== 'POST' && request.method !== 'PUT') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const arrayBuffer = await request.arrayBuffer();
			const contentType = request.headers.get('content-type') || '';

			let imageData: ImageData;

			if (contentType.includes('jpeg') || contentType.includes('jpg')) {
				await initJpeg(jpegDecWasm);
				imageData = await decodeJpeg(arrayBuffer);
			} else if (contentType.includes('png')) {
				await initPng(pngDecWasm);
				imageData = await decodePng(arrayBuffer);
			} else {
				// Fallback to trying to decode as Jpeg then Png if content-type is missing or generic
				try {
					await initJpeg(jpegDecWasm);
					imageData = await decodeJpeg(arrayBuffer);
				} catch {
					await initPng(pngDecWasm);
					imageData = await decodePng(arrayBuffer);
				}
			}

			// Resize if dimensions > 2048
			const MAX_DIMENSION = 2048;
			let finalImageData = imageData;
			if (imageData.width > MAX_DIMENSION || imageData.height > MAX_DIMENSION) {
				const ratio = Math.min(MAX_DIMENSION / imageData.width, MAX_DIMENSION / imageData.height);
				const width = Math.round(imageData.width * ratio);
				const height = Math.round(imageData.height * ratio);
				await initResize(resizeWasm);
				finalImageData = await resize(imageData, { width, height });
			}

			// Convert to WebP
			await initWebp(webpEncWasm);
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
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			console.error('Processing error:', error);
			return new Response(
				JSON.stringify({ error: 'Failed to process image', details: error instanceof Error ? error.message : String(error) }),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}
	},
} satisfies ExportedHandler<Env>;
