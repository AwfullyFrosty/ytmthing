import { DeskThing } from '@deskthing/server';
import { DESKTHING_EVENTS } from '@deskthing/types';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupSettings } from './setupSettings.js';
import { saveImage } from './imageUtils.js';
import crypto from 'crypto';

const APP_ID = 'ytmthing'; 
const APP_NAME = "ytmthing";

/**
 * Handle ES Module compatibility for __filename and __dirname
 * Uses esbuild variables in production, falls back to ES module equivalents in development
 */
declare const __filename: string;
declare const __dirname: string;

let actualFilename: string;
let actualDirname: string;

try {
    actualFilename = __filename;
    actualDirname = __dirname;
} catch {
    actualFilename = fileURLToPath(import.meta.url);
    actualDirname = path.dirname(actualFilename);
}

/** Application settings - configurable via DeskThing settings */
let ytmHost = '127.0.0.1';
let ytmPort = 9863;
let autoReconnect = true;

const getYTMApiUrl = () => `http://${ytmHost}:${ytmPort}/api/v1/`;
const getYTMSocketUrl = () => `ws://${ytmHost}:${ytmPort}/api/v1/realtime`;
const TOKEN_PATH = path.join(actualDirname, 'ytm_token.json');

let ytmSocket: Socket | null = null;
let authToken: string | null = null;
let currentRepeatMode = 0;
let currentShuffleState = false;
let lastTrack = '';

/** Clear authentication token from memory and disk */
const clearAuthToken = () => {
    authToken = null;
    try {
        if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
        console.log('Cleared expired auth token');
    } catch (err) {
        console.warn('Failed to delete token file:', err);
    }
};

/** 
 * Execute a command on YTMDesktop via API
 * Handles authentication and error recovery automatically
 */
const executeControl = async (command: string, data?: unknown): Promise<void> => {
    const payload: { command: string; data?: unknown } = { command };
    if (data !== undefined) payload.data = data;
    
    try {
        const headers: { [key: string]: string } = {};
        if (authToken) headers.Authorization = authToken;
        await axios.post(getYTMApiUrl() + 'command', payload, { headers });
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
            console.warn(`Authentication failed for ${command} - token may be expired`);
            clearAuthToken();
            DeskThing.send({ 
                type: 'YTM_AUTH_STATUS', 
                payload: { status: 'expired', message: 'Authentication expired. Please restart the app to re-authenticate.' } 
            });
        } else {
            const errorMessage = (err instanceof Error) ? err.message : 'Unknown API error';
            console.error(`Error executing ${command}: ${errorMessage}`);
        }
    }
}

/** Set up event listeners for client control commands */
const setupClientListeners = (): void => {
    DeskThing.on('YTM_PLAY_PAUSE_TOGGLE', () => executeControl('playPause'));
    DeskThing.on('YTM_PLAY', () => executeControl('play'));
    DeskThing.on('YTM_PAUSE', () => executeControl('pause'));
    DeskThing.on('YTM_SKIP_NEXT', () => executeControl('next'));
    DeskThing.on('YTM_SKIP_PREVIOUS', () => executeControl('previous'));
    
    DeskThing.on('YTM_SHUFFLE_TOGGLE', async () => {
        currentShuffleState = !currentShuffleState;
        await executeControl('shuffle');
        DeskThing.send({ 
            type: 'YTM_SHUFFLE_STATE_UPDATE', 
            payload: { isShuffling: currentShuffleState } 
        });
    });
    
    DeskThing.on('YTM_REPEAT_OFF', () => executeControl('repeatMode', 0));
    DeskThing.on('YTM_REPEAT_ONE', () => executeControl('repeatMode', 1));
    DeskThing.on('YTM_REPEAT_ALL', () => executeControl('repeatMode', 2));
    DeskThing.on('YTM_REPEAT_TOGGLE', async () => {
        const nextRepeat = (currentRepeatMode + 1) % 3;
        currentRepeatMode = nextRepeat;
        await executeControl('repeatMode', nextRepeat);
    });
    
    DeskThing.on('YTM_VOLUME_UP', () => executeControl('volumeUp'));
    DeskThing.on('YTM_VOLUME_DOWN', () => executeControl('volumeDown'));
    DeskThing.on('YTM_SET_VOLUME', (data: { volume?: number }) => executeControl('setVolume', data?.volume || 50));
    DeskThing.on('YTM_MUTE', () => executeControl('mute'));
    DeskThing.on('YTM_UNMUTE', () => executeControl('unmute'));
    DeskThing.on('YTM_SEEK_TO', (data: { position?: number }) => executeControl('seekTo', data?.position || 0));
    DeskThing.on('YTM_TOGGLE_LIKE', () => executeControl('toggleLike'));
    DeskThing.on('YTM_TOGGLE_DISLIKE', () => executeControl('toggleDislike'));
    DeskThing.on('YTM_PLAY_QUEUE_INDEX', (data: { index?: number }) => executeControl('playQueueIndex', data?.index || 0));
    DeskThing.on('YTM_CHANGE_VIDEO', (data: { videoId?: string; playlistId?: string }) => 
        executeControl('changeVideo', data || { videoId: 'dQw4w9WgXcQ' }));
}

/** Image cache directory in app root for artwork storage */
const imagesDir = path.join(actualDirname, '..', 'images');

if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}


interface YTMQueueItem {
    title?: string;
    author?: string;
    thumbnails?: { url: string; width?: number; height?: number }[];
    counterparts?: {
        thumbnails?: { url: string; width?: number; height?: number }[];
        title?: string;
        author?: string;
    }[];
}

interface YTMQueue {
    items?: YTMQueueItem[];
    selectedItemIndex?: number;
    autoplay?: boolean;
    repeatMode?: number;
}

interface YTMPlayer {
    trackState?: number;
    queue?: YTMQueue;
}

interface YTMVideo {
    title?: string;
    author?: string;
    thumbnails?: { url: string; width?: number; height?: number }[];
}

interface YTMState {
    player?: YTMPlayer;
    video?: YTMVideo;
}

/** 
 * Process YTMDesktop state updates and send to client
 * Handles track info, playback state, and artwork caching
 */
const handleYTMStateUpdate = (state: unknown): void => {
    const s = state as YTMState;
    const queueItem = s.player?.queue?.items?.[s.player?.queue?.selectedItemIndex ?? 0] || {};
    
    /** Extract optimal thumbnail URL from available thumbnails (prefers medium size) */
    const getThumbnailUrl = (thumbnails: { url: string; width?: number; height?: number }[] | undefined): string => {
        if (!thumbnails || thumbnails.length === 0) return '';
        
        const sorted = [...thumbnails].sort((a, b) => {
            const sizeA = (a.width || 0) * (a.height || 0);
            const sizeB = (b.width || 0) * (b.height || 0);
            return sizeB - sizeA;
        });
        
        const mediumThumbnail = sorted.find(thumb => {
            const size = Math.max(thumb.width || 0, thumb.height || 0);
            return size >= 200 && size <= 400;
        });
        
        return mediumThumbnail?.url || sorted[0]?.url || '';
    };

    /** Download artwork from URL, cache to disk, and return as base64 data URL */
    const downloadAndCacheImage = async (url: string): Promise<string> => {
        try {
            const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 32);
            
            console.log(`[Artwork] Downloading: ${url.substring(0, 60)}...`);
            const result = await saveImage(url, urlHash);
            
            if (result) {
                console.log(`[Artwork] Downloaded and cached (${urlHash})`);
                try {
                    const imagePath = path.join(imagesDir, `${urlHash}.jpg`);
                    const imageBuffer = fs.readFileSync(imagePath);
                    const base64Data = imageBuffer.toString('base64');
                    return `data:image/jpeg;base64,${base64Data}`;
                } catch (error) {
                    console.error(`[Artwork] Failed to read downloaded image: ${error}`);
                    return '';
                }
            } else {
                console.error(`[Artwork] Failed to save image from URL: ${url}`);
                return '';
            }
        } catch (error) {
            console.error(`[Artwork] Failed to download image:`, error);
            return '';
        }
    };

    const fixArtworkUrl = async (url: string): Promise<string> => {
        if (!url) return '';
        
        // Replace localhost/127.0.0.1 with the actual YTM host for network accessibility
        if (url.includes('127.0.0.1') || url.includes('localhost')) {
            const fixedUrl = url.replace(/(?:127\.0\.0\.1|localhost)/g, ytmHost);
            console.log(`[Artwork] Fixed localhost URL: ${fixedUrl}`);
            return fixedUrl;
        }
        
        // For external URLs (YouTube/Google), download and cache them
        if (url.startsWith('http')) {
            // Use crypto hash instead of truncated base64 to avoid collisions
            const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 32);
            const imagePath = path.join(imagesDir, `${urlHash}.jpg`);
            
            console.log(`[Artwork] Processing: ${url.substring(0, 60)}...`);
            
            // Check if image is already cached and return as base64 data URL
            if (fs.existsSync(imagePath)) {
                console.log(`[Artwork] Using cached image (${urlHash})`);
                try {
                    const imageBuffer = fs.readFileSync(imagePath);
                    const base64Data = imageBuffer.toString('base64');
                    return `data:image/jpeg;base64,${base64Data}`;
                } catch (error) {
                    console.error(`[Artwork] Failed to read cached image: ${error}`);
                    return '';
                }
            }
            
            // Download if not in cache
            console.log(`[Artwork] Image not cached, downloading...`);
            // Download and cache
            return await downloadAndCacheImage(url);
        }
        
        return url;
    };
    let artUrl = '';
    
    if (queueItem.thumbnails && queueItem.thumbnails.length > 0) {
        artUrl = getThumbnailUrl(queueItem.thumbnails);
    }
    
    if (!artUrl && s.video?.thumbnails && s.video.thumbnails.length > 0) {
        artUrl = getThumbnailUrl(s.video.thumbnails);
    }
    
    const queueItemExt = queueItem as { counterparts?: { thumbnails?: { url: string; width?: number; height?: number }[] }[] };
    if (!artUrl && queueItemExt.counterparts && queueItemExt.counterparts.length > 0) {
        const counterpart = queueItemExt.counterparts[0];
        if (counterpart.thumbnails && counterpart.thumbnails.length > 0) {
            artUrl = getThumbnailUrl(counterpart.thumbnails);
        }
    }
    const queueExt = s.player?.queue as { repeatMode?: number };
    const isShuffling = currentShuffleState;
    const ytmRepeatMode = queueExt?.repeatMode ?? 0;
    currentRepeatMode = ytmRepeatMode;
    const currentTrack = `${queueItem.title || s.video?.title || 'No Track'} - ${queueItem.author || s.video?.author || 'No Artist'}`;
    
    // Process artwork asynchronously to avoid blocking state updates
    fixArtworkUrl(artUrl).then((finalArtUrl) => {
        
        const stateUpdate = {
            isPlaying: s.player?.trackState === 1,
            isShuffling: isShuffling,
            isRepeating: ytmRepeatMode > 0,
            title: queueItem.title || s.video?.title || 'No Track',
            artist: queueItem.author || s.video?.author || 'No Artist',
            artUrl: finalArtUrl,
        };
        
        // Log artwork status for new tracks
        if (currentTrack !== lastTrack) {
            console.log(`[State Update] ${currentTrack} ${finalArtUrl ? '✅' : '❌'}`);
            lastTrack = currentTrack;
        }
        DeskThing.send({ type: 'YTM_STATE_UPDATE', payload: stateUpdate });
    }).catch((error) => {
        console.error('[Artwork] Error processing artwork:', error);
        // Fallback state update without artwork on processing error
        const stateUpdate = {
            isPlaying: s.player?.trackState === 1,
            isShuffling: isShuffling,
            isRepeating: ytmRepeatMode > 0,
            title: queueItem.title || s.video?.title || 'No Track',
            artist: queueItem.author || s.video?.author || 'No Artist',
            artUrl: '',
        };
        DeskThing.send({ type: 'YTM_STATE_UPDATE', payload: stateUpdate });
    });
}


/** Retrieve or request new authentication token from YTMDesktop */
const getYTMAuthToken = async (): Promise<string> => {
    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            if (tokenData.token) {
                authToken = tokenData.token;
                return tokenData.token;
            }
        } catch {
            console.warn('Failed to read token file, re-authenticating...');
        }
    }

    console.log('Requesting authentication code from YTMDesktop...');
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: { status: 'requesting_code', message: 'Requesting auth code...' } 
    });

    const codeRes = await axios.post(`http://${ytmHost}:${ytmPort}/api/v1/auth/requestcode`, {
        appId: APP_ID,
        appName: APP_NAME,
        appVersion: '1.0.0',
    });
    const code = codeRes.data.code;
    console.log(`YTMDesktop Auth Code: ${code}`);
    console.log('Please approve this code in the YTMDesktop app to continue.');
    
    // Display auth code in DeskThing interface
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: { 
            status: 'code_generated', 
            code: code,
            message: `Auth Code: ${code}\nApprove in YTMDesktop on your PC` 
        } 
    });

    // Allow time for user to approve code in YTMDesktop
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('Requesting token with approved code...');
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: { status: 'requesting_token', message: 'Getting auth token...' } 
    });

    const tokenRes = await axios.post(`http://${ytmHost}:${ytmPort}/api/v1/auth/request`, {
        appId: APP_ID,
        code,
    });
    const token = tokenRes.data.token;
    
    try {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }), 'utf8');
        console.log('YTMDesktop token saved.');
    } catch {
        console.warn('Failed to save token file.');
    }
    
    console.log('YTMDesktop authenticated successfully.');
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: { status: 'authenticated', message: 'Successfully authenticated!' } 
    });
    authToken = token;
    return token;
};

/** Establish WebSocket connection to YTMDesktop with authentication */
const connectToYTMDesktopSocketIO = async (): Promise<void> => {
    let token = await getYTMAuthToken();
    let triedReauth = false;
    
    const connect = async () => {
        try {
            ytmSocket = io(getYTMSocketUrl(), {
                transports: ['websocket'],
                auth: { token },
            });
            
            ytmSocket.on('connect', () => {
                console.log('Connected to YTMDesktop.');
            });
            
            ytmSocket.on('state-update', handleYTMStateUpdate);
            
            ytmSocket.on('disconnect', () => {
                console.warn('Disconnected from YTMDesktop.');
            });
            
            ytmSocket.on('connect_error', async (err: Error) => {
                console.error(`Connection error: ${err.message}`);
                if (!triedReauth && err.message.includes('403')) {
                    triedReauth = true;
                    try {
                        if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
                        console.log('Deleted invalid token, re-authenticating...');
                    } catch {
                        console.warn('Failed to delete token file.');
                    }
                    token = await getYTMAuthToken();
                    connect();
                }
            });
        } catch (err) {
            console.error(`Error during connection: ${(err as Error).message}`);
        }
    };
    connect();
};

/** Handle DeskThing configuration settings */
DeskThing.on(DESKTHING_EVENTS.SETTINGS, (settings) => {
    if (settings && settings.payload) {
        ytmHost = settings.payload.host?.value?.toString() ?? '127.0.0.1';
        ytmPort = Number(settings.payload.port?.value) || 9863;
        autoReconnect = Boolean(settings.payload.autoReconnect?.value ?? true);
        console.log(`Settings updated: ${ytmHost}:${ytmPort}, autoReconnect: ${autoReconnect}`);
    }
});

/** Initialize DeskThing app and establish YTMDesktop connection */
const startup = async (): Promise<void> => {
    console.log('YTMThing Server starting...');
    await setupSettings();
    setupClientListeners();
    await connectToYTMDesktopSocketIO();
    console.log('YTMThing Server ready.');
}

/** Clean shutdown of YTMDesktop connection */
const stop = (): void => {
    console.log('YTMThing Server stopping...');
    if (ytmSocket) {
        ytmSocket.disconnect();
        ytmSocket = null;
    }
}

/** Complete cleanup and shutdown */
const purge = () => {
    stop(); 
    console.log('YTMThing Server purged.');
}

DeskThing.on(DESKTHING_EVENTS.START, startup);
DeskThing.on(DESKTHING_EVENTS.STOP, stop);
DeskThing.on(DESKTHING_EVENTS.PURGE, purge);