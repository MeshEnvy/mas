import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'http://127.0.0.1:8787';

/**
 * Packs a file with its MIME type as a header.
 * [1 byte: MIME length] [MIME string] [File data]
 */
function packBlob(filePath: string, mimeType: string): Buffer {
	const fileData = fs.readFileSync(filePath);
	const mimeBuffer = Buffer.from(mimeType);

	if (mimeBuffer.length > 255) {
		throw new Error('MIME type too long (max 255 chars)');
	}

	const header = Buffer.alloc(1 + mimeBuffer.length);
	header.writeUInt8(mimeBuffer.length, 0);
	mimeBuffer.copy(header, 1);

	return Buffer.concat([header, fileData]);
}

/**
 * Unpacks a blob packed with packBlob.
 */
function unpackBlob(buffer: Buffer): { mimeType: string; data: Buffer } {
	const mimeLength = buffer.readUInt8(0);
	const mimeType = buffer.toString('utf8', 1, 1 + mimeLength);
	const data = buffer.subarray(1 + mimeLength);
	return { mimeType, data };
}

async function testUpload(filePath: string, mimeType: string) {
	if (!fs.existsSync(filePath)) {
		console.warn(`Warning: ${filePath} not found, skipping.`);
		return;
	}

	try {
		console.log(`\nPacking and uploading ${path.basename(filePath)} as opaque blob...`);
		const packedBuffer = packBlob(filePath, mimeType);

		const response = await fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/octet-stream',
			},
			body: new Uint8Array(packedBuffer),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Upload failed: ${response.status} ${text}`);
		}

		const { hash } = (await response.json()) as { hash: string };
		console.log(`SUCCESS! Received hash: ${hash}`);

		// Verification
		console.log(`Verifying retrieval of ${hash}...`);
		const getResponse = await fetch(`${WORKER_URL}/${hash}`);
		if (!getResponse.ok) {
			throw new Error(`GET failed: ${getResponse.status}`);
		}

		const retrievedBuffer = Buffer.from(await getResponse.arrayBuffer());
		const { mimeType: unpackedMime, data } = unpackBlob(retrievedBuffer);

		console.log(`VERIFIED! Unpacked MIME: ${unpackedMime}, Data size: ${data.length} bytes`);

		if (unpackedMime !== mimeType) {
			console.error(`Mismatched MIME type! Expected ${mimeType}, got ${unpackedMime}`);
		}
	} catch (error) {
		console.error('Test FAILED:');
		console.error(error);
	}
}

async function runTests() {
	console.log('Starting Opaque Blob Tests...\n');

	await testUpload('README.md', 'text/markdown');

	console.log('\nTests Complete.');
}

runTests();
