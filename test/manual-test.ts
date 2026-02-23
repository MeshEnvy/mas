import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'http://localhost:8787'; // Change to deployed URL if needed
const SAMPLE_IMAGE_PATH = path.join(process.cwd(), 'IMG_8245.jpeg');

// Create a 1x1 base64 transparent PNG if it doesn't exist
if (!fs.existsSync(SAMPLE_IMAGE_PATH)) {
	const minPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BvDAAEAwH/WNoYigAAAABJRU5ErkJggg==', 'base64');
	fs.writeFileSync(SAMPLE_IMAGE_PATH, minPng);
	console.log('Created sample image at:', SAMPLE_IMAGE_PATH);
}

async function runTest() {
	try {
		console.log('--- Step 1: Uploading image ---');
		const fileBuffer = fs.readFileSync(SAMPLE_IMAGE_PATH);
		const uploadResponse = await fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'image/jpeg',
			},
			body: fileBuffer,
		});

		if (!uploadResponse.ok) {
			throw new Error(`Upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
		}

		const { hash } = (await uploadResponse.json()) as { hash: string };
		console.log('Received hash:', hash);

		console.log('\n--- Step 2: Fetching image back through worker ---');
		const fetchUrl = `${WORKER_URL}/${hash}`;
		console.log('Fetching from:', fetchUrl);
		const fetchResponse = await fetch(fetchUrl);

		if (!fetchResponse.ok) {
			throw new Error(`Fetch failed: ${fetchResponse.status} ${await fetchResponse.text()}`);
		}

		const contentType = fetchResponse.headers.get('content-type');
		console.log('Content-Type:', contentType);

		const imageBuffer = Buffer.from(await fetchResponse.arrayBuffer());
		const outputPath = path.join(process.cwd(), `output-${hash}.webp`);
		fs.writeFileSync(outputPath, imageBuffer);
		console.log('Saved fetched image to:', outputPath);

		console.log('\n--- Test Successful ---');
	} catch (error) {
		console.error('\n--- Test Failed ---');
		console.error(error);
	}
}

runTest();
