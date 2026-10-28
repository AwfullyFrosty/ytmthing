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
let backgroundColor = '#000000';
let textColor = '#ffffff';
let buttonColor = '#374151';
let accentColor = '#dc2626';
let volumeStep = 5; // Volume step size for wheel control (1-20)


const getYTMApiUrl = () => `http://${ytmHost}:${ytmPort}/api/v1/`;
const getYTMSocketUrl = () => `ws://${ytmHost}:${ytmPort}/api/v1/realtime`;
const TOKEN_PATH = path.join(actualDirname, 'ytm_token.json');
const VOLUME_PATH = path.join(actualDirname, 'ytm_volume.json');

const readSavedVolume = (): number | null => {
    try {
        if (!fs.existsSync(VOLUME_PATH)) return null;
        const saved = JSON.parse(fs.readFileSync(VOLUME_PATH, 'utf8')) as { volume?: number };
        return typeof saved.volume === 'number' && Number.isFinite(saved.volume)
            ? Math.max(0, Math.min(100, saved.volume))
            : null;
    } catch (error) {
        console.warn('[Volume] Failed to read saved volume:', error);
        return null;
    }
};

const saveVolume = (volume: number): void => {
    try {
        fs.writeFileSync(VOLUME_PATH, JSON.stringify({ volume }), 'utf8');
    } catch (error) {
        console.warn('[Volume] Failed to save volume:', error);
    }
};

let ytmSocket: Socket | null = null;
let authToken: string | null = null;
let currentAuthStatus: { status: string; code?: string; message: string } | null = null; // Track current auth state
let currentRepeatMode = 0;
let currentVolume: number | null = null; // Reconciled with YTMDesktop after connection
let lastKnownVolume = readSavedVolume();
let awaitingInitialVolume = false;
let pendingVolumeTarget: number | null = null;
let pendingVolumeSince = 0;
let lastVolumeCommand = 0; // Debounce volume commands to prevent rate limiting
let lastTrack = '';
let clientListenersSetup = false;
let settingsInitialized = false;

/** Get color values for a specific preset */
const getColorPreset = (presetId: string) => {
    const presets: { [key: string]: { backgroundColor: string; textColor: string; buttonColor: string; accentColor: string } } = {
        'dark_modern': {
            backgroundColor: '#000000',
            textColor: '#ffffff',
            buttonColor: '#374151',
            accentColor: '#dc2626'
        },
        'ocean_blue': {
            backgroundColor: '#0f172a',
            textColor: '#e2e8f0',
            buttonColor: '#1e40af',
            accentColor: '#3b82f6'
        },
        'sakura_pink': {
            backgroundColor: '#1a1a2e',
            textColor: '#f8fafc',
            buttonColor: '#4c1d95',
            accentColor: '#ec4899'
        },
        'forest_green': {
            backgroundColor: '#064e3b',
            textColor: '#ecfdf5',
            buttonColor: '#166534',
            accentColor: '#10b981'
        },
        'sunset_orange': {
            backgroundColor: '#431407',
            textColor: '#fff7ed',
            buttonColor: '#9a3412',
            accentColor: '#f97316'
        },
        'royal_purple': {
            backgroundColor: '#1e1b4b',
            textColor: '#e0e7ff',
            buttonColor: '#6366f1',
            accentColor: '#a855f7'
        },
        'golden_night': {
            backgroundColor: '#1c1917',
            textColor: '#fbbf24',
            buttonColor: '#451a03',
            accentColor: '#f59e0b'
        },
        'ice_blue': {
            backgroundColor: '#164e63',
            textColor: '#ecfeff',
            buttonColor: '#0e7490',
            accentColor: '#06b6d4'
        },
        'rose_gold': {
            backgroundColor: '#4c1d95',
            textColor: '#fdf4ff',
            buttonColor: '#be185d',
            accentColor: '#f472b6'
        },
        'monochrome': {
            backgroundColor: '#111827',
            textColor: '#f3f4f6',
            buttonColor: '#4b5563',
            accentColor: '#9ca3af'
        },
        'cyberpunk': {
            backgroundColor: '#0c0a09',
            textColor: '#00ff88',
            buttonColor: '#7c2d12',
            accentColor: '#ff0080'
        },
        'arctic': {
            backgroundColor: '#1e293b',
            textColor: '#cbd5e1',
            buttonColor: '#475569',
            accentColor: '#0ea5e9'
        }
    };
    
    return presets[presetId] || presets['dark_modern'];
};

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
const executeControl = async (command: string, data?: unknown): Promise<boolean> => {
    const payload: { command: string; data?: unknown } = { command };
    if (data !== undefined) payload.data = data;
    
    console.log(`[API] Executing command: ${command}${data ? ` with data: ${JSON.stringify(data)}` : ''}`);
    
    try {
        const headers: { [key: string]: string } = {};
        if (authToken) {
            headers.Authorization = authToken;
        } else {
            console.warn(`[API] No auth token available for command: ${command}`);
        }
        
        await axios.post(getYTMApiUrl() + 'command', payload, { headers });
        console.log(`[API] Command ${command} executed successfully`);
        return true;
        
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`[API] Error executing ${command}:`, {
                status: err.response?.status,
                statusText: err.response?.statusText,
                data: err.response?.data,
                url: getYTMApiUrl() + 'command'
            });
            
            if (err.response?.status === 403) {
                console.warn(`Authentication failed for ${command} - token may be expired`);
                clearAuthToken();
                DeskThing.send({ 
                    type: 'YTM_AUTH_STATUS', 
                    payload: { status: 'expired', message: 'Authentication expired. Please restart the app to re-authenticate.' } 
                });
            }
        } else {
            const errorMessage = (err instanceof Error) ? err.message : 'Unknown API error';
            console.error(`Error executing ${command}: ${errorMessage}`);
        }
        return false;
    }
}

/** Set up event listeners for client control commands */
const setupClientListeners = (): void => {
    if (clientListenersSetup) {
        console.log('[Setup] Client listeners already set up, skipping duplicate setup');
        return;
    }
    clientListenersSetup = true;
    console.log('[Setup] Setting up client event listeners');
    DeskThing.on('YTM_PLAY_PAUSE_TOGGLE', () => { void executeControl('playPause'); });
    DeskThing.on('YTM_PLAY', () => { void executeControl('play'); });
    DeskThing.on('YTM_PAUSE', () => { void executeControl('pause'); });
    DeskThing.on('YTM_SKIP_NEXT', () => { void executeControl('next'); });
    DeskThing.on('YTM_SKIP_PREVIOUS', () => { void executeControl('previous'); });
    
    DeskThing.on('YTM_SHUFFLE', () => { void executeControl('shuffle'); });
    
    DeskThing.on('YTM_REPEAT_OFF', () => { void executeControl('repeatMode', 0); });
    DeskThing.on('YTM_REPEAT_ALL', () => { void executeControl('repeatMode', 1); });
    DeskThing.on('YTM_REPEAT_ONE', () => { void executeControl('repeatMode', 2); });
    DeskThing.on('YTM_REPEAT_TOGGLE', async () => {
        const nextRepeat = (currentRepeatMode + 1) % 3;
        currentRepeatMode = nextRepeat;
        await executeControl('repeatMode', nextRepeat);
    });
    
    DeskThing.on('YTM_VOLUME_UP', async () => {
        const now = Date.now();
        if (currentVolume === null) {
            console.warn('[Volume] Ignoring increase until YTMDesktop reports the current volume');
            return;
        }
        if (now - lastVolumeCommand < 150) {
            console.log(`[Volume] Ignoring rapid volume up command (${now - lastVolumeCommand}ms since last)`);
            return;
        }
        lastVolumeCommand = now;
        
        // Step volume up by the latest reconciled volume.
        const previousVolume = currentVolume;
        const newVolume = Math.min(100, currentVolume + volumeStep);
        currentVolume = newVolume;
        pendingVolumeTarget = newVolume;
        pendingVolumeSince = now;
        
        const succeeded = await executeControl('setVolume', newVolume);
        if (succeeded) {
            lastKnownVolume = newVolume;
            saveVolume(newVolume);
            console.log(`[Volume] Increased by ${volumeStep} to ${newVolume}`);
        } else if (currentVolume === newVolume) {
            currentVolume = previousVolume;
            pendingVolumeTarget = null;
        }
        
        // Send volume update to client for visual indicator
        DeskThing.send({
            type: 'YTM_VOLUME_UPDATE',
            payload: { volume: newVolume }
        });
    });
    DeskThing.on('YTM_VOLUME_DOWN', async () => {
        const now = Date.now();
        if (currentVolume === null) {
            console.warn('[Volume] Ignoring decrease until YTMDesktop reports the current volume');
            return;
        }
        
        // Debounce volume commands to prevent rate limiting (150ms minimum between commands)
        if (now - lastVolumeCommand < 150) {
            console.log(`[Volume] Ignoring rapid volume down command (${now - lastVolumeCommand}ms since last)`);
            return;
        }
        lastVolumeCommand = now;
        
        // Step volume down by the latest reconciled volume.
        const previousVolume = currentVolume;
        const newVolume = Math.max(0, currentVolume - volumeStep);
        currentVolume = newVolume;
        pendingVolumeTarget = newVolume;
        pendingVolumeSince = now;
        
        const succeeded = await executeControl('setVolume', newVolume);
        if (succeeded) {
            lastKnownVolume = newVolume;
            saveVolume(newVolume);
            console.log(`[Volume] Decreased by ${volumeStep} to ${newVolume}`);
        } else if (currentVolume === newVolume) {
            currentVolume = previousVolume;
            pendingVolumeTarget = null;
        }
        
        // Send volume update to client for visual indicator
        DeskThing.send({
            type: 'YTM_VOLUME_UPDATE',
            payload: { volume: newVolume }
        });
    });
    DeskThing.on('YTM_SET_VOLUME', (data: { volume?: number }) => {
        const volume = data?.volume;
        if (typeof volume === 'number' && Number.isFinite(volume)) {
            currentVolume = Math.max(0, Math.min(100, volume));
            pendingVolumeTarget = currentVolume;
            pendingVolumeSince = Date.now();
            void executeControl('setVolume', currentVolume).then((succeeded) => {
                if (succeeded && currentVolume !== null) {
                    lastKnownVolume = currentVolume;
                    saveVolume(currentVolume);
                }
            });
        }
    });
    DeskThing.on('YTM_MUTE', () => { void executeControl('mute'); });
    DeskThing.on('YTM_UNMUTE', () => { void executeControl('unmute'); });
    DeskThing.on('YTM_SEEK_TO', (data: { payload?: { position?: number } }) => {
        void executeControl('seekTo', data?.payload?.position || 0);
    });
    DeskThing.on('YTM_TOGGLE_LIKE', () => { void executeControl('toggleLike'); });
    DeskThing.on('YTM_TOGGLE_DISLIKE', () => { void executeControl('toggleDislike'); });
    DeskThing.on('YTM_PLAY_QUEUE_INDEX', (data: { index?: number }) => {
        void executeControl('playQueueIndex', data?.index || 0);
    });
    DeskThing.on('YTM_CHANGE_VIDEO', (data: { videoId?: string; playlistId?: string }) => {
        void executeControl('changeVideo', data || { videoId: 'dQw4w9WgXcQ' });
    });
    
    // Handle color settings requests from client
    DeskThing.on('YTM_REQUEST_COLOR_SETTINGS', () => {
        if (!settingsInitialized) {
            return;
        }
        DeskThing.send({
            type: 'YTM_COLOR_SETTINGS',
            payload: {
                backgroundColor,
                textColor,
                buttonColor,
                accentColor
            }
        });
    });
    
    // Handle auth status requests from client
    DeskThing.on('YTM_REQUEST_AUTH_STATUS', () => {
        // Send the current auth status if we have one
        if (currentAuthStatus) {
            DeskThing.send({
                type: 'YTM_AUTH_STATUS',
                payload: currentAuthStatus
            });
        } else if (authToken) {
            // If we have an active auth token, we're authenticated
            DeskThing.send({
                type: 'YTM_AUTH_STATUS',
                payload: {
                    status: 'authenticated',
                    message: 'Already authenticated with YTMDesktop'
                }
            });
        } else {
            // No token - likely in auth process or need to authenticate
            DeskThing.send({
                type: 'YTM_AUTH_STATUS',
                payload: {
                    status: 'not_authenticated',
                    message: 'Not authenticated with YTMDesktop'
                }
            });
        }
    });
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
    shuffled?: boolean;
}

interface YTMPlayer {
    trackState?: number;
    videoProgress?: number;
    volume?: number;
    muted?: boolean;
    queue?: YTMQueue;
}

interface YTMVideo {
    title?: string;
    author?: string;
    thumbnails?: { url: string; width?: number; height?: number }[];
    durationSeconds?: number;
    likeStatus?: number;
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
    
    // Note: YTMDesktop doesn't provide shuffle state in queue updates
    // We track shuffle state locally when commands are sent
    
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
                      
            const result = await saveImage(url, urlHash);
            
            if (result) {
                
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
            return fixedUrl;
        }
        
        // For external URLs (YouTube/Google), download and cache them
        if (url.startsWith('http')) {
            // Use crypto hash instead of truncated base64 to avoid collisions
            const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 32);
            const imagePath = path.join(imagesDir, `${urlHash}.jpg`);
            
            
            // Check if image is already cached and return as base64 data URL
            if (fs.existsSync(imagePath)) {
                try {
                    const imageBuffer = fs.readFileSync(imagePath);
                    const base64Data = imageBuffer.toString('base64');
                    return `data:image/jpeg;base64,${base64Data}`;
                } catch (error) {
                    console.error(`[Artwork] Failed to read cached image: ${error}`);
                    return '';
                }
            }
            
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
    const ytmRepeatMode = s.player?.queue?.repeatMode ?? 0;
    currentRepeatMode = ytmRepeatMode;
    
    // Keep wheel controls aligned with YTMDesktop instead of assuming a startup volume.
    const reportedVolume = typeof s.player?.volume === 'string'
        ? Number(s.player.volume)
        : s.player?.volume;
    if (typeof reportedVolume === 'number' && Number.isFinite(reportedVolume)) {
        const normalizedVolume = Math.max(0, Math.min(100, reportedVolume));
        if (awaitingInitialVolume) {
            awaitingInitialVolume = false;
            if (lastKnownVolume !== null && lastKnownVolume !== normalizedVolume) {
                currentVolume = lastKnownVolume;
                pendingVolumeTarget = lastKnownVolume;
                pendingVolumeSince = Date.now();
                void executeControl('setVolume', lastKnownVolume).then((succeeded) => {
                    if (!succeeded && currentVolume === lastKnownVolume) {
                        currentVolume = normalizedVolume;
                        pendingVolumeTarget = null;
                        lastKnownVolume = normalizedVolume;
                        saveVolume(normalizedVolume);
                    }
                });
            } else {
                currentVolume = normalizedVolume;
                lastKnownVolume = normalizedVolume;
                saveVolume(normalizedVolume);
            }
        } else if (
            pendingVolumeTarget !== null &&
            normalizedVolume !== pendingVolumeTarget &&
            Date.now() - pendingVolumeSince < 2000
        ) {
            console.log(`[Volume] Ignoring stale YTMDesktop volume ${normalizedVolume}; waiting for ${pendingVolumeTarget}`);
        } else {
            currentVolume = normalizedVolume;
            if (pendingVolumeTarget === normalizedVolume) pendingVolumeTarget = null;
            lastKnownVolume = normalizedVolume;
            saveVolume(normalizedVolume);
        }
    }
    
    const currentTrack = `${queueItem.title || s.video?.title || 'No Track'} - ${queueItem.author || s.video?.author || 'No Artist'}`;
    
    // Process artwork asynchronously to avoid blocking state updates
    fixArtworkUrl(artUrl).then((finalArtUrl) => {
        
        const stateUpdate = {
            isPlaying: s.player?.trackState === 1,
            isRepeating: ytmRepeatMode > 0,
            repeatMode: ytmRepeatMode,
            title: queueItem.title || s.video?.title || 'No Track',
            artist: queueItem.author || s.video?.author || 'No Artist',
            artUrl: finalArtUrl,
            videoProgress: s.player?.videoProgress || 0,
            durationSeconds: s.video?.durationSeconds || 0,
            volume: s.player?.volume,
            muted: s.player?.muted || false,
            likeStatus: s.video?.likeStatus || 0,
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
            isRepeating: ytmRepeatMode > 0,
            repeatMode: ytmRepeatMode,
            title: queueItem.title || s.video?.title || 'No Track',
            artist: queueItem.author || s.video?.author || 'No Artist',
            artUrl: '',
            videoProgress: s.player?.videoProgress || 0,
            durationSeconds: s.video?.durationSeconds || 0,
            volume: s.player?.volume,
            muted: s.player?.muted || false,
            likeStatus: s.video?.likeStatus || 0,
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
    currentAuthStatus = { status: 'requesting_code', message: 'Requesting auth code...' };
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: currentAuthStatus
    });

    const codeRes = await axios.post(`http://${ytmHost}:${ytmPort}/api/v1/auth/requestcode`, {
        appId: APP_ID,
        appName: APP_NAME,
        appVersion: '1.1.0',
    });
    const code = codeRes.data.code;
    console.log(`YTMDesktop Auth Code: ${code}`);
    console.log('Please approve this code in the YTMDesktop app to continue.');
    
    // Display auth code in DeskThing interface
    currentAuthStatus = { 
        status: 'code_generated', 
        code: code,
        message: `Auth Code: ${code}\nApprove in YTMDesktop on your PC` 
    };
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: currentAuthStatus
    });

    // Allow time for user to approve code in YTMDesktop
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('Requesting token with approved code...');
    // Keep the code visible during token request so user can still see it
    currentAuthStatus = { 
        status: 'requesting_token', 
        code: code, // Preserve the code during token request
        message: `Getting auth token...\nCode: ${code}` 
    };
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: currentAuthStatus
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
    currentAuthStatus = { status: 'authenticated', message: 'Successfully authenticated!' };
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: currentAuthStatus
    });
    authToken = token;
    // Clear auth status after successful authentication since we don't need it anymore
    setTimeout(() => { currentAuthStatus = null; }, 3000);
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
            currentVolume = null;
            awaitingInitialVolume = true;
            pendingVolumeTarget = null;
            
            ytmSocket.on('connect', () => {
                console.log('Connected to YTMDesktop.');
            });
            
            ytmSocket.on('state-update', handleYTMStateUpdate);
            
            ytmSocket.on('disconnect', () => {
                console.warn('Disconnected from YTMDesktop.');
                currentVolume = null;
                awaitingInitialVolume = true;
                pendingVolumeTarget = null;
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
        volumeStep = Number(settings.payload.volumeStep?.value) || 5;
        
        // Handle color preset selection
        const selectedPreset = settings.payload.colorPreset?.value?.toString() ?? 'dark_modern';
        
        if (selectedPreset === 'custom') {
            // Use individual color settings when "Custom" is selected
            backgroundColor = settings.payload.backgroundColor?.value?.toString() ?? backgroundColor;
            textColor = settings.payload.textColor?.value?.toString() ?? textColor;
            buttonColor = settings.payload.buttonColor?.value?.toString() ?? buttonColor;
            accentColor = settings.payload.accentColor?.value?.toString() ?? accentColor;
        } else {
            // Apply preset colors
            const preset = getColorPreset(selectedPreset);
            backgroundColor = preset.backgroundColor;
            textColor = preset.textColor;
            buttonColor = preset.buttonColor;
            accentColor = preset.accentColor;
        }

        console.log(`Settings updated: ${ytmHost}:${ytmPort}, autoReconnect: ${autoReconnect}, volumeStep: ${volumeStep}, preset: ${selectedPreset}`);
        
        // Send updated color settings to client
        DeskThing.send({
            type: 'YTM_COLOR_SETTINGS',
            payload: {
                backgroundColor,
                textColor,
                buttonColor,
                accentColor
            }
        });
        settingsInitialized = true;
    }
});

/** Initialize DeskThing app and establish YTMDesktop connection */
const startup = async (): Promise<void> => {
    console.log('YTMThing Server starting...');
    setupClientListeners();
    await setupSettings();
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