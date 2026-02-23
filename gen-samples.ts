import { GifWriter } from 'omggif';
import fs from 'node:fs';

// Generate a 10x10 red GIF
const width = 10,
	height = 10;
const buf = Buffer.alloc(width * height * 100); // Plenty of space
const writer = new GifWriter(buf, width, height, { palette: [0xff0000, 0x000000] });
// A simple red square
const pixels = new Uint8Array(width * height).fill(0); // Index 0 in palette
writer.addFrame(0, 0, width, height, pixels);
const numBytes = writer.end();
const output = buf.slice(0, numBytes);
fs.writeFileSync('test.gif', output);
console.log('Generated test.gif');
