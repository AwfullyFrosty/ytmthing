import { DeskThing } from '@deskthing/server';
import { AppSettings, SETTING_TYPES } from '@deskthing/types';

export const setupSettings = async () => {
    const Settings: AppSettings = {
        host: {
            id: 'host',
            type: SETTING_TYPES.STRING,
            description: 'The host name for YTMDesktop API.',
            label: 'Host Name',
            value: '127.0.0.1',
        },
        port: {
            id: 'port',
            type: SETTING_TYPES.NUMBER,
            description: 'The port number for YTMDesktop API.',
            label: 'Port Number',
            value: 9863,
        },
        autoReconnect: {
            id: 'autoReconnect',
            type: SETTING_TYPES.BOOLEAN,
            description: 'Automatically reconnect to YTMDesktop when connection is lost.',
            label: 'Auto Reconnect',
            value: true,
        },
        colorPreset: {
            id: 'colorPreset',
            type: SETTING_TYPES.SELECT,
            description: 'Choose a color preset or select "Custom" to use individual color settings below.',
            label: 'Color Preset',
            value: 'dark_modern',
            options: [
                { value: 'dark_modern', label: '🌙 Dark Modern (Default)' },
                { value: 'ocean_blue', label: '🌊 Ocean Blue' },
                { value: 'sakura_pink', label: '🌸 Sakura Pink' },
                { value: 'forest_green', label: '🍃 Forest Green' },
                { value: 'sunset_orange', label: '🔥 Sunset Orange' },
                { value: 'royal_purple', label: '💜 Royal Purple' },
                { value: 'golden_night', label: '🌕 Golden Night' },
                { value: 'ice_blue', label: '❄️ Ice Blue' },
                { value: 'rose_gold', label: '🌹 Rose Gold' },
                { value: 'monochrome', label: '🖤 Monochrome' },
                { value: 'cyberpunk', label: '🌈 Cyberpunk' },
                { value: 'arctic', label: '🏔️ Arctic' },
                { value: 'custom', label: '🎨 Custom' }
            ]
        },
        backgroundColor: {
            id: 'backgroundColor',
            type: SETTING_TYPES.STRING,
            description: 'Background color behind song text and controls (hex code). Only used when "Custom" preset is selected.',
            label: 'Background Color',
            value: '#000000',
        },
        textColor: {
            id: 'textColor',
            type: SETTING_TYPES.STRING,
            description: 'Color of song title and artist text (hex code). Only used when "Custom" preset is selected.',
            label: 'Text Color',
            value: '#ffffff',
        },
        buttonColor: {
            id: 'buttonColor',
            type: SETTING_TYPES.STRING,
            description: 'Color of control buttons (hex code). Only used when "Custom" preset is selected.',
            label: 'Button Color',
            value: '#374151',
        },
        accentColor: {
            id: 'accentColor',
            type: SETTING_TYPES.STRING,
            description: 'Color for active states and play button (hex code). Only used when "Custom" preset is selected.',
            label: 'Accent Color',
            value: '#dc2626',
        },
        volumeStep: {
            id: 'volumeStep',
            type: SETTING_TYPES.SELECT,
            description: 'How much the volume changes when scrolling the wheel. Choose between fine control (1), default (5), or coarse control (10). The more fine tune it is the slower the volume will change due to the increased number of steps.',
            label: 'Volume Step Size',
            value: '5',
            options: [
                { value: '1', label: '1 - Very Fine Control' },
                { value: '2', label: '2 - Fine Control' },
                { value: '5', label: '5 - Default' },
                { value: '10', label: '10 - Coarse Control' },
                { value: '15', label: '15 - Very Coarse' },
                { value: '20', label: '20 - Maximum' }
            ]
        },
    }
    DeskThing.initSettings(Settings);
};