const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;

const landingPage = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

serveHTTP(addonInterface, { port: PORT, static: '/static' }, (err, server) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    const originalListener = server.listeners('request')[0];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(landingPage);
            return;
        }
        originalListener(req, res);
    });
});