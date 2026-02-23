import decodeWebp, { init as initWebpDec } from '@jsquash/webp/decode';
import encodeWebp, { init as initWebpEnc } from '@jsquash/webp/encode';
import decodeJpeg, { init as initJpegDec } from '@jsquash/jpeg/decode';
import decodePng, { init as initPngDec } from '@jsquash/png/decode';
import decodeAvif, { init as initAvifDec } from '@jsquash/avif/decode';
import resize, { initResize } from '@jsquash/resize';
import UTIF from 'utif';
import { GifReader } from 'omggif';

// Import WASM binaries
// @ts-ignore
import webpEncWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
// @ts-ignore
import webpDecWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';
// @ts-ignore
import jpegDecWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
// @ts-ignore
import pngDecWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
// @ts-ignore
import avifDecWasm from '@jsquash/avif/codec/dec/avif_dec.wasm';
// @ts-ignore
import resizeWasm from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm';

export interface ImageData {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
}

export interface Env {
	IMAGES: R2Bucket;
}

const MAX_DIMENSION = 2048;

async function decodeImage(buffer: ArrayBuffer, contentType: string): Promise<ImageData | null> {
	// Try based on magic numbers first as it's more reliable
	const magic = new Uint8Array(buffer.slice(0, 12));

	// WebP: RIFF .... WEBP
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
		return decodeWebp(buffer);
	}

	// JPEG: FF D8 FF
	if (magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff) {
		await initJpegDec(jpegDecWasm);
		return decodeJpeg(buffer);
	}

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47) {
		await initPngDec(pngDecWasm);
		return decodePng(buffer);
	}

	// GIF: GIF87a or GIF89a
	if (magic[0] === 0x47 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x38) {
		const reader = new GifReader(new Uint8Array(buffer));
		const width = reader.width;
		const height = reader.height;
		const data = new Uint8ClampedArray(width * height * 4);
		reader.decodeAndBlitFrameRGBA(0, data);
		return { width, height, data };
	}

	// TIFF: II* (49 49 2A 00) or MM (4D 4D 00 2A)
	if (
		(magic[0] === 0x49 && magic[1] === 0x49 && magic[2] === 0x2a) ||
		(magic[0] === 0x4d && magic[1] === 0x4d && magic[2] === 0x00 && magic[3] === 0x2a)
	) {
		const ifds = UTIF.decode(buffer);
		UTIF.decodeImage(buffer, ifds[0]);
		const rgba = UTIF.toRGBA8(ifds[0]);
		return {
			width: ifds[0].width,
			height: ifds[0].height,
			data: new Uint8ClampedArray(rgba),
		};
	}

	// AVIF: ....ftypavif
	if (
		magic[4] === 0x66 &&
		magic[5] === 0x74 &&
		magic[6] === 0x79 &&
		magic[7] === 0x70 &&
		magic[8] === 0x61 &&
		magic[9] === 0x76 &&
		magic[10] === 0x69 &&
		magic[11] === 0x66
	) {
		await initAvifDec(avifDecWasm);
		return decodeAvif(buffer);
	}

	// Fallback to Content-Type if magic numbers failed
	if (contentType.includes('webp')) {
		await initWebpDec(webpDecWasm);
		return decodeWebp(buffer);
	}
	if (contentType.includes('jpeg') || contentType.includes('jpg')) {
		await initJpegDec(jpegDecWasm);
		return decodeJpeg(buffer);
	}
	if (contentType.includes('png')) {
		await initPngDec(pngDecWasm);
		return decodePng(buffer);
	}
	if (contentType.includes('avif')) {
		await initAvifDec(avifDecWasm);
		return decodeAvif(buffer);
	}

	return null;
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

			let imageData = await decodeImage(arrayBuffer, contentType);

			if (!imageData) {
				return new Response(JSON.stringify({ error: 'Unsupported or invalid image format.' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			// Resize if needed
			let processedImageData = imageData;
			if (imageData.width > MAX_DIMENSION || imageData.height > MAX_DIMENSION) {
				const scale = Math.min(MAX_DIMENSION / imageData.width, MAX_DIMENSION / imageData.height);
				const width = Math.round(imageData.width * scale);
				const height = Math.round(imageData.height * scale);

				await initResize(resizeWasm);
				processedImageData = await resize(imageData, { width, height });
			}

			// Convert to WebP
			await initWebpEnc(webpEncWasm);
			const webpBuffer = await encodeWebp(processedImageData);

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
