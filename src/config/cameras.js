/**
 * Official Traffic Camera Configurations
 * Central source of truth for camera locations and streams
 */
export const OFFICIAL_CAMERAS = [
    {
        id: 'i695_balt_natl',
        name: 'I-695 @ Balt Natl Pike',
        lat: 39.2864,
        lng: -76.7384,
        url: 'https://strmr5.sha.maryland.gov/rtplive/1701ea3700f9004a005dd336c4235c0a/playlist.m3u8'
    },
    {
        id: 'i97_md178',
        name: 'I-97 @ MD 178',
        lat: 39.0478,
        lng: -76.6228,
        url: 'https://strmr5.sha.maryland.gov/rtplive/2a0016ad00c900410047833235daa/playlist.m3u8'
    },
    {
        id: 'i97_md32',
        name: 'I-97 N of MD 32',
        lat: 39.0586,
        lng: -76.6336,
        url: 'https://strmr3.sha.maryland.gov/rtplive/1b0001f0019700c40051fa36c4235c0a/playlist.m3u8'
    }
];

export const DEFAULT_CAMERA_ID = 'i695_balt_natl';
