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
        backgroundColor: {
            id: 'backgroundColor',
            type: SETTING_TYPES.STRING,
            description: 'Background color behind song text and controls (hex code).',
            label: 'Background Color',
            value: '#000000',
        },
        textColor: {
            id: 'textColor',
            type: SETTING_TYPES.STRING,
            description: 'Color of song title and artist text (hex code).',
            label: 'Text Color',
            value: '#ffffff',
        },
        buttonColor: {
            id: 'buttonColor',
            type: SETTING_TYPES.STRING,
            description: 'Color of control buttons (hex code).',
            label: 'Button Color',
            value: '#374151',
        },
        accentColor: {
            id: 'accentColor',
            type: SETTING_TYPES.STRING,
            description: 'Color for active states and play button (hex code).',
            label: 'Accent Color',
            value: '#dc2626',
        },
    }
    DeskThing.initSettings(Settings);
};