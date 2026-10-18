// Gera dist/PREDIC.html: um único arquivo com CSS, bibliotecas e código embutidos (uso offline, sem IA).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const ler = f => fs.readFileSync(path.join(APP, f), 'utf8');
let html = ler('index.html');

// Imagens do Leaflet viram data: URIs dentro do CSS
let leaflet = ler('vendor/leaflet.css').replace(/url\(images\/([\w-]+\.png)\)/g, (_, f) => 'url(data:image/png;base64,' + fs.readFileSync(path.join(APP, 'vendor/images', f)).toString('base64') + ')');
html = html.replace('<link rel="stylesheet" href="vendor/leaflet.css">', '<style>' + leaflet + '</style>');
html = html.replace('<link rel="stylesheet" href="css/app.css">', () => '<style>' + ler('css/app.css') + '</style>');
html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', '<link rel="icon" href="data:image/svg+xml;base64,' + Buffer.from(ler('icon.svg')).toString('base64') + '">');
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => '<script>' + ler(src).replace(/<\/script/gi, '<\\/script') + '</script>');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'PREDIC.html');
fs.writeFileSync(out, html);
console.log('Gerado ' + path.relative(ROOT, out) + ' (' + (fs.statSync(out).size / 1e6).toFixed(1) + ' MB)');
