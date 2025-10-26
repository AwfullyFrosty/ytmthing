import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

// ES Module equivalents for __filename and __dirname (only when not provided by esbuild)
declare const __filename: string;
declare const __dirname: string;

// Fallback for development mode
let actualFilename: string;
let actualDirname: string;

try {
    // Use esbuild-provided variables if available (production)
    actualFilename = __filename;
    actualDirname = __dirname;
} catch {
    // Fallback to ES module equivalents (development)
    actualFilename = fileURLToPath(import.meta.url);
    actualDirname = path.dirname(actualFilename);
}

// Images directory for DeskThing resource serving - must be in app root, not server subdirectory
const imagesDir = path.join(actualDirname, '..', 'images');
const fileExtension = 'jpg';

// Ensure images directory exists
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

export const saveImage = async (imageData: string, fileName: string): Promise<string | undefined> => {
    // Check if it's a URL
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
        console.log('Processing image URL');
        return await downloadImage(imageData, fileName); 
    }
    // Handle base64 data
    else if (imageData.startsWith('data:image')) {
        console.log('Processing base64 image data');
        return await saveBase64Image(imageData, fileName);
    } 
    // Handle binary data
    else {
        console.log('Processing binary image data');
        return await saveBinaryImage(imageData, fileName);
    }
}

const downloadImage = async (url: string, fileName: string): Promise<string | undefined> => {
    try {
        // Download from url
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.status !== 200) {
            console.error(`Failed to fetch image: ${response.status} ${response.statusText}`); 
            return;
        }

        const filePath = path.join(imagesDir, `${fileName}.${fileExtension}`);
        
        // Save the image data
        fs.writeFileSync(filePath, Buffer.from(response.data));
        
        console.log(`Successfully downloaded image: ${fileName}.${fileExtension}`);
        // Return relative path for DeskThing to serve
        return `images/${fileName}.${fileExtension}`;
        
    } catch (error) {
        console.error(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
}

const saveBase64Image = async (base64Image: string, fileName: string): Promise<string | undefined> => {
    // Extract the image format from the data URL
    const matches = base64Image.match(/^data:image\/([a-zA-Z+]+);base64,/);
    if (!matches) {
        console.error('Invalid base64 image format');
        return;
    }
    
    // Always save as JPG for compatibility
    const base64Data = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    
    // Generate file path with correct extension
    const filePath = path.join(imagesDir, `${fileName}.${fileExtension}`);
    
    // Write the file and return a promise
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) {
                console.error(`Failed to save base64 image: ${err.message}`);
                reject(err);
                return;
            }
            console.log(`Successfully saved base64 image: ${fileName}.${fileExtension}`);
            resolve(`/resource/image/ytmthing/${fileName}.${fileExtension}`);
        });
    });
}

const saveBinaryImage = async (binaryData: string, fileName: string): Promise<string | undefined> => {
    // Generate file path 
    const filePath = path.join(imagesDir, `${fileName}.${fileExtension}`);
    
    // Write the file and return a promise
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, binaryData, 'binary', (err) => {
            if (err) {
                console.error(`Failed to save binary image: ${err.message}`);
                reject(err);
                return;
            }
            console.log(`Successfully saved binary image: ${fileName}.${fileExtension}`);
            resolve(`/resource/image/ytmthing/${fileName}.${fileExtension}`);
        });
    });
}

export async function deleteImages(): Promise<void> {
    if (fs.existsSync(imagesDir)) {
        const files = fs.readdirSync(imagesDir);
        for (const file of files) {
            fs.unlinkSync(path.join(imagesDir, file));
        }
        console.log(`Deleted ${files.length} cached images`);
    }
}