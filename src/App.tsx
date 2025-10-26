import React, { useState, useEffect } from 'react';
import { DeskThing } from '@deskthing/client';
import { Shuffle, Repeat, SkipBack, SkipForward, Play, Pause, Music } from 'lucide-react';

interface YTMState {
    isPlaying: boolean;
    isShuffling: boolean;
    isRepeating: boolean;
    title: string;
    artist: string;
    artUrl: string;
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

    useEffect(() => {
        let unsubscribeError = () => {};
        let unsubscribeState = () => {};
        let unsubscribeShuffleUpdate = () => {};
        
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
            
            unsubscribeShuffleUpdate = DeskThing.on('YTM_SHUFFLE_STATE_UPDATE', (data: { type: string; payload: unknown }) => {
                const payload = data.payload as { isShuffling: boolean };
                if (payload && typeof payload.isShuffling === 'boolean') {
                    setYTMState(prev => prev ? { ...prev, isShuffling: payload.isShuffling } : null);
                }
            });
        }
        
        return () => {
            unsubscribeError();
            unsubscribeState();
            unsubscribeShuffleUpdate();
        };
    }, []);

    const control = (type: string) => () => send({ type });
    const connectionStatus = connected && ytmState
        ? null
        : (
            <div className="absolute inset-0 flex flex-col justify-center items-center bg-gray-900/90 text-white p-4">
                <h1 className="text-xl font-semibold">Connecting...</h1>
                <p className="text-sm">{connected ? 'Waiting for music data...' : 'Waiting for Server...'}</p>
            </div>
        );

    const isPlaying = ytmState?.isPlaying ?? false;
    const title = ytmState?.title || 'No Track';
    const artist = ytmState?.artist || 'No Artist';
    
    // --- Render ---
    return (
        <div className="relative w-full h-screen flex bg-black text-white overflow-hidden" style={{ width: '800px', height: '480px' }}>
            {/* Left Side - Album Art */}
            <div className="w-80 h-full flex-shrink-0 relative bg-black">
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
                <div className={`w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center absolute inset-0 ${ytmState?.artUrl ? 'z-0' : 'z-10'}`}>
                    <div className="text-center text-gray-500">
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
                    <h1 className="text-2xl font-bold mb-2 line-clamp-2 leading-tight">
                        {title}
                    </h1>
                    <p className="text-lg text-gray-300 mb-4 line-clamp-1">
                        {artist}
                    </p>
                    

                    
                    {/* Status Indicators */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`flex items-center gap-2 text-sm transition-all duration-200 ${
                            ytmState?.isShuffling 
                                ? 'text-red-400 opacity-100' 
                                : 'text-gray-500 opacity-50'
                        }`}>
                            <Shuffle size={16} />
                            <span>Shuffle</span>
                        </div>
                        <div className={`flex items-center gap-2 text-sm transition-all duration-200 ${
                            ytmState?.isRepeating 
                                ? 'text-red-400 opacity-100' 
                                : 'text-gray-500 opacity-50'
                        }`}>
                            <Repeat size={16} />
                            <span>Repeat</span>
                        </div>
                    </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                    <button 
                        onClick={control('YTM_SHUFFLE_TOGGLE')} 
                        className={`p-3 rounded-full transition-all duration-200 ${
                            ytmState?.isShuffling 
                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' 
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
                        }`}
                        title="Toggle Shuffle"
                    >
                        <Shuffle size={20} />
                    </button>
                    
                    <button 
                        onClick={control('YTM_SKIP_PREVIOUS')} 
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition-all duration-200 text-gray-300 hover:text-white"
                        title="Previous Track"
                    >
                        <SkipBack size={20} />
                    </button>
                    
                    <button 
                        onClick={control('YTM_PLAY_PAUSE_TOGGLE')} 
                        className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all duration-200 hover:scale-105 shadow-lg"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    
                    <button 
                        onClick={control('YTM_SKIP_NEXT')} 
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition-all duration-200 text-gray-300 hover:text-white"
                        title="Next Track"
                    >
                        <SkipForward size={20} />
                    </button>
                    
                    <button 
                        onClick={control('YTM_REPEAT_TOGGLE')} 
                        className={`p-3 rounded-full transition-all duration-200 ${
                            ytmState?.isRepeating 
                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' 
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
                        }`}
                        title="Toggle Repeat"
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