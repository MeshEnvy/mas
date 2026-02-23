import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'http://localhost:8787';

async function testImage(filePath: string, contentType: string) {
	if (!fs.existsSync(filePath)) {
		console.error(`Error: ${filePath} not found.`);
		return;
	}

	try {
		console.log(`\nTesting upload of ${path.basename(filePath)} (${contentType})...`);
		const fileBuffer = fs.readFileSync(filePath);

		const response = await fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': contentType,
			},
			body: fileBuffer,
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Upload failed: ${response.status} ${text}`);
		}

		const data = (await response.json()) as { hash: string };
		console.log(`SUCCESS! Received hash: ${data.hash}`);

		// Verify the image is available via GET
		const getResponse = await fetch(`${WORKER_URL}/${data.hash}`);
		if (!getResponse.ok) {
			throw new Error(`GET failed for ${data.hash}: ${getResponse.status}`);
		}
		console.log(`VERIFIED! Image ${data.hash} is accessible and header is: ${getResponse.headers.get('content-type')}`);
	} catch (error) {
		console.error('Test FAILED:');
		console.error(error);
	}
}

const ARTIFACT_DIR = process.cwd();
const JPEG_PATH = path.join(ARTIFACT_DIR, 'test_jpeg_1771884869019.png');
const PNG_PATH = path.join(ARTIFACT_DIR, 'test_png_1771884881981.png');
const LARGE_JPEG_PATH = path.join(ARTIFACT_DIR, 'test_large_jpeg_1771884900269.png');
const GIF_PATH = path.join(ARTIFACT_DIR, 'test.gif');
const WEBP_PATH = path.join(ARTIFACT_DIR, 'IMG_8245.webp');

async function runTests() {
	await testImage(JPEG_PATH, 'image/jpeg');
	await testImage(PNG_PATH, 'image/png');
	await testImage(LARGE_JPEG_PATH, 'image/jpeg');
	await testImage(GIF_PATH, 'image/gif');
	await testImage(WEBP_PATH, 'image/webp');
}

runTests();
