const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;

// Obtenemos el manejador de rutas del SDK de Stremio
const addonRouter = getRouter(addonInterface);

// Leemos el contenido de nuestro index.html
const landingPage = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Creamos nuestro propio servidor HTTP
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        // Si la petición es para la raíz, servimos nuestra página de inicio
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(landingPage);
    } else {
        // Para cualquier otra ruta, dejamos que el addon de Stremio la maneje
        addonRouter(req, res, () => {
            res.statusCode = 404;
            res.end('Not Found');
        });
    }
});

server.listen(PORT, () => {
    console.log(`Addon server running on http://127.0.0.1:${PORT}`);
});