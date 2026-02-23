import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'http://localhost:8787'; // Change to deployed URL if needed
const IMAGE_PATH = path.join(process.cwd(), 'IMG_8245.webp');

async function runTest() {
	if (!fs.existsSync(IMAGE_PATH)) {
		console.error(`Error: ${IMAGE_PATH} not found.`);
		return;
	}

	try {
		console.log(`Uploading ${IMAGE_PATH}...`);
		const fileBuffer = fs.readFileSync(IMAGE_PATH);

		const response = await fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'image/webp',
			},
			body: fileBuffer,
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Upload failed: ${response.status} ${text}`);
		}

		const { hash } = (await response.json()) as { hash: string };
		console.log('SUCCESS! Received hash:', hash);
	} catch (error) {
		console.error('Test FAILED:');
		console.error(error);
	}
}

runTest();
