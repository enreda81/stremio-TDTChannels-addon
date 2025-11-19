const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Obtenemos el manejador de rutas del SDK de Stremio
const addonRouter = getRouter(addonInterface);

if (require.main === module) {
    // Este bloque se ejecuta solo cuando corremos `node src/server.js`
    // No se ejecutará en el entorno serverless de Vercel
    const PORT = process.env.PORT || 7000;

    // Leemos el contenido de nuestro index.html para servirlo en local
    const landingHTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    const server = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(landingHTML);
        } else {
            addonRouter(req, res, () => {
                res.statusCode = 404;
                res.end('Not Found');
            });
        }
    });

    server.listen(PORT, () => {
        console.log(`Addon server running on http://127.0.0.1:${PORT}`);
    });
}

// Exportamos el manejador para que Vercel lo use como una serverless function
module.exports = addonRouter;