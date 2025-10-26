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
    }
    DeskThing.initSettings(Settings);
};