#!/usr/bin/env node

/**
 * Simple local HTTP server for ECF 60 Validator GUI
 * Runs completely locally - no cloud services
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404: File Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ECF 60 Validator - Local GUI Server                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`✓ Server running at: http://localhost:${PORT}`);
    console.log('');
    console.log('📁 Files are processed LOCALLY on your computer');
    console.log('🔒 No data is sent to external servers');
    console.log('');
    console.log('Open your browser and navigate to:');
    console.log(`   http://localhost:${PORT}`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
});
