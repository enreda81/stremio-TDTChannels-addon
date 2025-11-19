const { addonBuilder } = require("stremio-addon-sdk");
const parser = require('iptv-playlist-parser');
const fetch = require('node-fetch');
 
const manifest = {
    "id": "org.stremio.tdtchannels",
    "version": "1.0.20",

    "name": "TDTChannels Addon",
    "description": "Addon to stream channels from the TDTChannels (Spain) M3U playlist",

    // set what type of resources we will return
    "resources": [
        "catalog",
        "stream",
        "meta"
    ],
    // Let's change the types to 'tv' for TV Channels
    "types": ["tv"],

    // set catalogs, we'll be making 2 catalogs in this case, 1 for movies and 1 for series
    "catalogs": [
        {
            type: 'tv',
            id: 'tdt-channels-tv',
            name: 'TDTChannels'
        }
    ],

    // prefix of item IDs (ie: "tt0032138")
    // We will create our own IDs like "m3u:1", "m3u:2", etc.
    "idPrefixes": [ "m3u:" ],
    
    "behaviorHints": {
        "configurable": true,
        "clickToPlay": true
    }

};

const M3U_URL = 'https://www.tdtchannels.com/lists/tv.m3u';

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
    }
};

// Some stream URLs from TDTChannels are not direct m3u8 files.
// They point to a page that then redirects or contains the actual stream URL.
// We need to resolve these URLs.
const resolveStreamUrl = async (url) => {
    // If it's not a direct m3u8 link, try to fetch it to find the real stream URL.
    if (url && !url.includes('.m3u8')) {
        try {
            console.log(`Resolving non-m3u8 URL: ${url}`);
            const response = await fetch(url, FETCH_OPTIONS);
            // This regex looks for a 'source' variable with an m3u8 link.
            const body = await response.text();
            const m3u8Match = body.match(/source:\s*'"['"]/);
            if (m3u8Match && m3u8Match[1]) {
                console.log(`Resolved to: ${m3u8Match[1]}`);
                return m3u8Match[1];
            }
        } catch (e) {
            console.error(`Error resolving stream URL ${url}:`, e);
            return url; // Fallback to original URL on error
        }
    }
    return url; // Return original URL if it's already m3u8 or couldn't be resolved
};

// Simple cache to avoid fetching the M3U on every request.
// The cache will expire after 1 hour.
let playlistCache = {
    playlist: null,
    lastUpdated: 0,
    cacheTTL: 3600 * 1000 // 1 hour in milliseconds
};

async function getPlaylist() {
    const now = Date.now();
    if (playlistCache.playlist && (now - playlistCache.lastUpdated < playlistCache.cacheTTL)) {
        // Return cached playlist if it's not expired
        return playlistCache.playlist;
    }

    try {
        console.log('Fetching new playlist from URL...');
        const response = await fetch(M3U_URL, FETCH_OPTIONS);
        const m3uContent = await response.text();
        const playlist = parser.parse(m3uContent);

        // Update cache
        playlistCache.playlist = playlist;
        playlistCache.lastUpdated = now;

        return playlist;
    } catch (error) {
        console.error('Error fetching or parsing M3U playlist:', error);
        // If fetching fails, return the old cached playlist if it exists, otherwise an empty one.
        return playlistCache.playlist || { items: [] };
    }
}

// --- New: Pre-process playlist to group streams by channel name ---
let groupedPlaylistCache = {
    groupedItems: null,
    lastUpdated: 0,
    cacheTTL: 3600 * 1000 // 1 hour in milliseconds
};

async function getGroupedPlaylist() {
    const now = Date.now();
    if (groupedPlaylistCache.groupedItems && (now - groupedPlaylistCache.lastUpdated < groupedPlaylistCache.cacheTTL)) {
        return groupedPlaylistCache.groupedItems;
    }

    const playlist = await getPlaylist(); // Get the raw playlist
    const groupedItems = {};
    playlist.items.forEach((item, originalIndex) => {
        if (!groupedItems[item.name]) {
            groupedItems[item.name] = { name: item.name, poster: item.tvg.logo || 'https://i.imgur.com/8j9g8pA.png', streams: [] };
        }
        groupedItems[item.name].streams.push({ ...item, originalIndex: originalIndex }); // Store original index
    });
    groupedPlaylistCache.groupedItems = groupedItems;
    groupedPlaylistCache.lastUpdated = now;
    return groupedItems;
}
// --- End New: Pre-process playlist ---

const builder = new addonBuilder(manifest);

// Streams handler
builder.defineStreamHandler(async function(args) {
    console.log("--- Stream Handler Triggered ---");
    console.log("Request for stream with args:", args);

    const parts = args.id.split(':');
    const identifier = parts[1];
    const isNumericId = /^\d+$/.test(identifier);

    if (isNumericId) {
        // --- Logic for single stream (from meta.streams) ---
        const playlist = await getPlaylist();
        const originalIndex = parseInt(identifier, 10);
        const channel = playlist.items[originalIndex];

        if (channel && channel.url) {
            console.log(`Found single stream for channel: ${channel.name} (Original Index: ${originalIndex}) with URL: ${channel.url}`);
            const streamUrl = await resolveStreamUrl(channel.url);
            const stream = {
                name: "TDTChannels",
                title: channel.name + (channel.group.title ? ` (${channel.group.title})` : ''),
                url: streamUrl,
                behaviorHints: { "notWebReady": true }
            };
            return Promise.resolve({ streams: [stream] });
        }
    } else {
        // --- Logic for grouped channel (when Stremio asks for streams for a meta ID) ---
        const groupedItems = await getGroupedPlaylist();
        const channelName = identifier;
        const groupedChannel = groupedItems[channelName];

        if (groupedChannel && groupedChannel.streams.length > 0) {
            console.log(`Found grouped streams for channel: ${channelName}`);
            const streams = await Promise.all(groupedChannel.streams.map(async (streamItem) => {
                const streamUrl = await resolveStreamUrl(streamItem.url);
                return {
                    name: "TDTChannels",
                    title: streamItem.name + (streamItem.group.title ? ` (${streamItem.group.title})` : ''),
                    url: streamUrl,
                    behaviorHints: { "notWebReady": true }
                };
            }));
            return Promise.resolve({ streams: streams });
        }
    }

    // If channel not found
    console.log("Channel not found or has no URL. Responding with empty streams.");
    return Promise.resolve({ streams: [] });
})

builder.defineMetaHandler(async function(args) {
    console.log("--- Meta Handler Triggered ---");
    console.log("Request for meta with args:", args);

    const groupedItems = await getGroupedPlaylist();
    const parts = args.id.split(':');
    const channelName = parts[1]; // Now the ID is "m3u:Channel Name"
    const groupedChannel = groupedItems[channelName];

    if (groupedChannel) {
        console.log(`Found meta for grouped channel: ${groupedChannel.name}`);
        const meta = {
            id: args.id,
            type: 'tv',
            name: groupedChannel.name,
            poster: groupedChannel.poster,
            posterShape: 'square',
            description: `Canal de TV: ${groupedChannel.name}`, // Add a simple description
            // --- NEW: Add all streams directly to the meta object ---
            // Stremio will display these streams on the detail page
            streams: await Promise.all(groupedChannel.streams.map(async (streamItem) => {
                const streamUrl = await resolveStreamUrl(streamItem.url);
                return {
                    // The ID for the stream handler must point to the ORIGINAL index
                    id: `m3u:${streamItem.originalIndex}`,
                    name: "TDTChannels",
                    title: streamItem.name + (streamItem.group.title ? ` (${streamItem.group.title})` : ''),
                    url: streamUrl, // Stremio will use this if no ID is provided, but we provide ID
                    behaviorHints: { "notWebReady": true }
                };
            }))
            // --- End NEW ---
        };
        return Promise.resolve({ meta: meta });
    }

    return Promise.resolve({ meta: null });
});

builder.defineCatalogHandler(async function(args, cb) {
    console.log("--- Catalog Handler Triggered ---");
    console.log("Request for catalog with args:", args);
    
    const groupedItems = await getGroupedPlaylist();
    // Check if the requested catalog type is 'tv'
    if (args.type === 'tv' && args.id === 'tdt-channels-tv') {
        const metas = [];
        // Iterate over the grouped items (unique channel names)
        for (const channelName in groupedItems) {
            const groupedChannel = groupedItems[channelName];
            // Only add to catalog if there's at least one stream with a URL
            if (groupedChannel.streams.some(s => s.url)) {
                metas.push({
                    // The ID for the catalog now uses the channel name
                    id: `m3u:${channelName}`, 
                    type: 'tv',
                    name: groupedChannel.name,
                    poster: groupedChannel.poster,
                    posterShape: 'square'
                });
            }
        }

        console.log(`Returning catalog with ${metas.length} items.`);
        return Promise.resolve({ metas: metas });
    }

    // If the catalog is not one we provide
    console.log("Catalog not provided. Responding with empty metas.");
    return Promise.resolve({ metas: [] });
})

module.exports = builder.getInterface()
