import { DeskThing } from '@deskthing/server';
import { DESKTHING_EVENTS } from '@deskthing/types';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupSettings } from './setupSettings.js';

const APP_ID = 'ytmthing'; 
const APP_NAME = "ytmthing";

// ES Module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default settings - will be overridden by user settings
let ytmHost = '127.0.0.1';
let ytmPort = 9863;
let autoReconnect = true;

const getYTMApiUrl = () => `http://${ytmHost}:${ytmPort}/api/v1/`;
const getYTMSocketUrl = () => `ws://${ytmHost}:${ytmPort}/api/v1/realtime`;
const TOKEN_PATH = path.join(__dirname, 'ytm_token.json');

let ytmSocket: Socket | null = null;
let authToken: string | null = null;
let currentRepeatMode = 0;
let currentShuffleState = false;

const clearAuthToken = () => {
    authToken = null;
    try {
        if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
        console.log('Cleared expired auth token');
    } catch (err) {
        console.warn('Failed to delete token file:', err);
    }
};

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

const handleYTMStateUpdate = (state: unknown): void => {
    const s = state as YTMState;
    const queueItem = s.player?.queue?.items?.[s.player?.queue?.selectedItemIndex ?? 0] || {};
    
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
    const stateUpdate = {
        isPlaying: s.player?.trackState === 1,
        isShuffling: isShuffling,
        isRepeating: ytmRepeatMode > 0,
        title: queueItem.title || s.video?.title || 'No Track',
        artist: queueItem.author || s.video?.author || 'No Artist',
        artUrl,
    };
    
    DeskThing.send({ type: 'YTM_STATE_UPDATE', payload: stateUpdate });
}


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
    
    // Send auth code to DeskThing display
    DeskThing.send({ 
        type: 'YTM_AUTH_STATUS', 
        payload: { 
            status: 'code_generated', 
            code: code,
            message: `Auth Code: ${code}\nApprove in YTMDesktop on your PC` 
        } 
    });

    // Wait longer for user to approve
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

// Settings handler
DeskThing.on(DESKTHING_EVENTS.SETTINGS, (settings) => {
    if (settings && settings.payload) {
        ytmHost = settings.payload.host?.value?.toString() ?? '127.0.0.1';
        ytmPort = Number(settings.payload.port?.value) || 9863;
        autoReconnect = Boolean(settings.payload.autoReconnect?.value ?? true);
        console.log(`Settings updated: ${ytmHost}:${ytmPort}, autoReconnect: ${autoReconnect}`);
    }
});

const startup = async (): Promise<void> => {
    console.log('YTMThing Server starting...');
    await setupSettings();
    setupClientListeners();
    await connectToYTMDesktopSocketIO();
    console.log('YTMThing Server ready.');
}

const stop = (): void => {
    console.log('YTMThing Server stopping...');
    if (ytmSocket) {
        ytmSocket.disconnect();
        ytmSocket = null;
    }
}

const purge = () => {
    stop(); 
    console.log('YTMThing Server purged.');
}

DeskThing.on(DESKTHING_EVENTS.START, startup);
DeskThing.on(DESKTHING_EVENTS.STOP, stop);
DeskThing.on(DESKTHING_EVENTS.PURGE, purge);