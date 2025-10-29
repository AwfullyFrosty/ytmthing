import React, { useState, useEffect } from 'react';
import { DeskThing } from '@deskthing/client';
import { /* Shuffle, */ Repeat, SkipBack, SkipForward, Play, Pause, Music } from 'lucide-react';

interface YTMState {
    isPlaying: boolean;
    // NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works
    // isShuffling: boolean;
    isRepeating: boolean;
    title: string;
    artist: string;
    artUrl: string;
}

interface ColorSettings {
    backgroundColor: string;
    textColor: string;
    buttonColor: string;
    accentColor: string;
}

interface DeskThingClientInstance {
    send: (data: { type: string; payload?: unknown }) => void;
    on: (event: string, callback: (data: { type: string, payload: unknown }) => void) => () => void;
}

const App: React.FC = () => {
    const clientInstance = DeskThing as unknown as DeskThingClientInstance;
    const { send } = clientInstance;
    const [ytmState, setYTMState] = useState<YTMState | null>(null);
    const [connected, setConnected] = useState(false);
    const [colorSettings, setColorSettings] = useState<ColorSettings>(() => {
        // Try to load saved color settings from localStorage first
        try {
            const savedSettings = localStorage.getItem('ytmthing-color-settings');
            if (savedSettings) {
                return JSON.parse(savedSettings);
            }
        } catch (error) {
            console.warn('Failed to load saved color settings:', error);
        }
        
        // Fallback to default settings
        return {
            backgroundColor: '#000000',
            textColor: '#ffffff', 
            buttonColor: '#374151',
            accentColor: '#dc2626'
        };
    });

    useEffect(() => {
        let unsubscribeError = () => {};
        let unsubscribeState = () => {};
        // NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works
        // let unsubscribeShuffleUpdate = () => {};
        let unsubscribeColorSettings = () => {};
        
        if (typeof DeskThing.on === 'function') {
            unsubscribeError = DeskThing.on('error', (err: unknown) => {
                console.error('DeskThing error:', err);
                setConnected(false);
            });
            
            unsubscribeState = DeskThing.on('YTM_STATE_UPDATE', (data: { type: string; payload: unknown }) => {
                const payload = data.payload as YTMState;
                setYTMState(payload);
                setConnected(true);
            });
            
            // NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works
            // unsubscribeShuffleUpdate = DeskThing.on('YTM_SHUFFLE_STATE_UPDATE', (data: { type: string; payload: unknown }) => {
            //     const payload = data.payload as { isShuffling: boolean };
            //     if (payload && typeof payload.isShuffling === 'boolean') {
            //         setYTMState(prev => prev ? { ...prev, isShuffling: payload.isShuffling } : null);
            //     }
            // });
            
            unsubscribeColorSettings = DeskThing.on('YTM_COLOR_SETTINGS', (data: { type: string; payload: unknown }) => {
                const payload = data.payload as ColorSettings;
                if (payload) {
                    setColorSettings(payload);
                    
                    // Save the new color settings to localStorage for persistence
                    try {
                        localStorage.setItem('ytmthing-color-settings', JSON.stringify(payload));
                    } catch (error) {
                        console.warn('Failed to save color settings to localStorage:', error);
                    }
                }
            });
        }
        
        // Request current color settings from server on mount
        // This ensures we get the latest settings even if the server 
        // has already sent them before this component mounted
        if (typeof send === 'function') {
            send({ type: 'YTM_REQUEST_COLOR_SETTINGS' });
        }
        
        return () => {
            unsubscribeError();
            unsubscribeState();
            // NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works
            // unsubscribeShuffleUpdate();
            unsubscribeColorSettings();
        };
    }, [send]);

    const control = (type: string) => () => send({ type });
    const connectionStatus = connected && ytmState
        ? null
        : (
            <div 
                className="absolute inset-0 flex flex-col justify-center items-center p-4"
                style={{ 
                    backgroundColor: colorSettings.backgroundColor + 'E6', // 90% opacity
                    color: colorSettings.textColor
                }}
            >
                <h1 className="text-xl font-semibold">Connecting...</h1>
                <p className="text-sm">{connected ? 'Waiting for music data...' : 'Waiting for Server...'}</p>
            </div>
        );

    const isPlaying = ytmState?.isPlaying ?? false;
    const title = ytmState?.title || 'No Track';
    const artist = ytmState?.artist || 'No Artist';
    
    // --- Render ---
    return (
        <div 
            className="relative w-full h-screen flex overflow-hidden" 
            style={{ 
                width: '800px', 
                height: '480px',
                backgroundColor: colorSettings.backgroundColor,
                color: colorSettings.textColor
            }}
        >
            {/* Left Side - Album Art */}
            <div className="w-80 h-full flex-shrink-0 relative" style={{ backgroundColor: colorSettings.backgroundColor }}>
                {ytmState?.artUrl && (
                    <img 
                        key={ytmState.artUrl} // Force re-render when artUrl changes
                        src={ytmState.artUrl} 
                        alt="Album Art"
                        className="w-full h-full object-cover absolute inset-0 z-10"
                        onError={(e) => {
                            // For data URLs (our cached images), just hide on error
                            if (e.currentTarget.src.startsWith('data:')) {
                                e.currentTarget.style.display = 'none';
                                return;
                            }
                            
                            // Retry logic for external URLs only
                            const retryCount = parseInt(e.currentTarget.dataset.retryCount || '0');
                            
                            if (retryCount === 0 && ytmState?.artUrl) {
                                e.currentTarget.dataset.retryCount = '1';
                                const fallbackUrl = ytmState.artUrl.replace(/w\d+-h\d+/, 'w226-h226');
                                e.currentTarget.src = fallbackUrl;
                                return;
                            }
                            
                            if (retryCount === 1 && ytmState?.artUrl) {
                                e.currentTarget.dataset.retryCount = '2';
                                const tinyUrl = ytmState.artUrl.replace(/w\d+-h\d+/, 'w120-h120');
                                e.currentTarget.src = tinyUrl;
                                return;
                            }
                            
                            e.currentTarget.style.display = 'none';
                        }}
                        onLoad={(e) => {
                            e.currentTarget.style.display = 'block';
                            delete e.currentTarget.dataset.retryCount;
                        }}
                    />
                )}
                
                {/* Fallback artwork - shows when no artUrl or image fails to load */}
                <div 
                    className={`w-full h-full bg-gradient-to-br flex items-center justify-center absolute inset-0 ${ytmState?.artUrl ? 'z-0' : 'z-10'}`}
                    style={{
                        backgroundImage: `linear-gradient(to bottom right, ${colorSettings.buttonColor}, ${colorSettings.backgroundColor})`
                    }}
                >
                    <div className="text-center" style={{ color: colorSettings.textColor, opacity: 0.7 }}>
                        <Music size={64} className="mx-auto mb-2" />
                        <div className="text-sm">No Artwork</div>
                    </div>
                </div>
                
                {/* Overlay gradient for better text readability */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/40 z-20"></div>
            </div>

            {/* Right Side - Track Info & Controls */}
            <div className="flex-1 flex flex-col justify-between p-6">
                {/* Track Information */}
                <div className="flex-1 flex flex-col justify-center">
                    <h1 
                        className="text-2xl font-bold mb-2 line-clamp-2 leading-tight"
                        style={{ color: colorSettings.textColor }}
                    >
                        {title}
                    </h1>
                    <p 
                        className="text-lg mb-4 line-clamp-1 opacity-80"
                        style={{ color: colorSettings.textColor }}
                    >
                        {artist}
                    </p>
                    

                    
                    {/* Status Indicators */}
                    <div className="flex items-center gap-3 mb-6">
                        {/* NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works */}
                        {/* <div 
                            className="flex items-center gap-2 text-sm transition-all duration-200"
                            style={{ 
                                color: ytmState?.isShuffling ? colorSettings.accentColor : colorSettings.textColor,
                                opacity: ytmState?.isShuffling ? 1 : 0.5
                            }}
                        >
                            <Shuffle size={16} />
                            <span>Shuffle</span>
                        </div> */}
                        <div 
                            className="flex items-center gap-2 text-sm transition-all duration-200"
                            style={{ 
                                color: ytmState?.isRepeating ? colorSettings.accentColor : colorSettings.textColor,
                                opacity: ytmState?.isRepeating ? 1 : 0.5
                            }}
                        >
                            <Repeat size={16} />
                            <span>Repeat</span>
                        </div>
                    </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                    {/* NOTE: Shuffle functionality temporarily disabled - YTM API doesn't properly support shuffle states currently but is in the works */}
                    {/* Placeholder div to maintain layout spacing */}
                    <div className="p-3 w-[44px] h-[44px]"></div>
                    
                    <button 
                        onClick={control('YTM_SKIP_PREVIOUS')} 
                        className="p-3 rounded-full transition-all duration-200"
                        style={{
                            backgroundColor: colorSettings.buttonColor,
                            color: colorSettings.textColor
                        }}
                        title="Previous Track"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.filter = 'brightness(1.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.filter = 'brightness(1)';
                        }}
                    >
                        <SkipBack size={20} />
                    </button>
                    
                    <button 
                        onClick={control('YTM_PLAY_PAUSE_TOGGLE')} 
                        className="p-4 rounded-full transition-all duration-200 shadow-lg hover:scale-105"
                        style={{
                            backgroundColor: colorSettings.accentColor,
                            color: '#ffffff'
                        }}
                        title={isPlaying ? 'Pause' : 'Play'}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.filter = 'brightness(0.9)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.filter = 'brightness(1)';
                        }}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    
                    <button 
                        onClick={control('YTM_SKIP_NEXT')} 
                        className="p-3 rounded-full transition-all duration-200"
                        style={{
                            backgroundColor: colorSettings.buttonColor,
                            color: colorSettings.textColor
                        }}
                        title="Next Track"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.filter = 'brightness(1.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.filter = 'brightness(1)';
                        }}
                    >
                        <SkipForward size={20} />
                    </button>
                    
                    <button 
                        onClick={control('YTM_REPEAT_TOGGLE')} 
                        className="p-3 rounded-full transition-all duration-200 shadow-lg"
                        style={{
                            backgroundColor: ytmState?.isRepeating ? colorSettings.accentColor : colorSettings.buttonColor,
                            color: ytmState?.isRepeating ? '#ffffff' : colorSettings.textColor
                        }}
                        title="Toggle Repeat"
                        onMouseEnter={(e) => {
                            if (ytmState?.isRepeating) {
                                e.currentTarget.style.filter = 'brightness(0.9)';
                            } else {
                                e.currentTarget.style.filter = 'brightness(1.2)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.filter = 'brightness(1)';
                        }}
                    >
                        <Repeat size={20} />
                    </button>
                </div>
            </div>

            {/* Connection Status Overlay */}
            {connectionStatus}
            

        </div>
    );
};

export default App;