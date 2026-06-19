import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import couponRouter from './routes/coupons.js';
import driveRouter from './routes/drive.js';
import adminRouter from './routes/admin.js';
import adminSongsRouter from './routes/adminSongs.js';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import songsRouter from './routes/songs.js';
import notifyRouter from './routes/notify.js';
import galleryRouter from './routes/gallery.js';
import db from './database.js';
import prisma from './prisma.js';
import { startDiscordBot } from './services/discordBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configurar CORS para permitir peticiones desde el puerto del frontend (Vite: 5173 o similar)
const whitelist = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir llamadas sin origen (como herramientas de testeo API, Postman, curl, etc.)
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por políticas de CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password'],
  credentials: true
};

app.use(cors(corsOptions));

// Middleware para parsear JSON en el cuerpo de las peticiones
app.use(express.json());

// Archivos subidos localmente (fallback sin Google Drive)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logger simple para las solicitudes entrantes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Rutas de la API
app.use('/api/auth', authRouter);
app.use('/api/coupons', couponRouter);
app.use('/api/drive', driveRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminSongsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/songs', songsRouter);
app.use('/notify', notifyRouter);
app.use('/api/gallery', galleryRouter);
// Mount on root so /test-webhooks matches the router's /test-webhooks and /fer matches /notify/fer if we change notify.js
app.use('/', notifyRouter);

// Ruta pública para consultar la fecha de aniversario actual de manera dinámica
app.get('/api/anniversary', async (req, res) => {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: 'anniversary_date' }
    });
    const fecha = row ? row.value : '2023-09-15';
    res.json({ anniversary_date: fecha });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar fecha de aniversario.' });
  }
});

// Ruta pública para consultar configuraciones no confidenciales
app.get('/api/public-settings', async (req, res) => {
  try {
    const rows = await prisma.setting.findMany();
    const publicSettings = {
      anniversary_date: '2023-09-15',
      timeline_greeting: '¡Bienvenido a nuestro álbum especial de recuerdos! ♡',
      anniversary_message: '¡Feliz Aniversario mi amor!',
      default_song_url: '',
      music_playlist: '',
      music_drive_folder_id: '',
      music_autoplay: 'false',
      dino_speed_multiplier: '1.0',
      tetris_start_level: '1',
      dino_coin_divisor: '8',
      tetris_coin_divisor: '40',
      coin_daily_bonus: '5'
    };
    if (rows) {
      const sensitiveKeys = ['discord_webhook', 'telegram_token', 'telegram_chat_id', 'admin_password'];
      rows.forEach(row => {
        if (!sensitiveKeys.includes(row.key)) {
          publicSettings[row.key] = row.value;
        }
      });
    }
    res.json(publicSettings);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar configuraciones públicas.' });
  }
});

// Ruta de estado general del servidor
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: 'sqlite3',
    uptime: process.uptime()
  });
});

// Iniciar el servidor Express y el bot de Discord
// En Render, NODE_ENV puede ser 'production', así que solo evitamos el listen si estamos en Vercel
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Servidor Express ejecutándose en el puerto: ${PORT}`);
    console.log(`🔗 API de Cupones:  http://localhost:${PORT}/api/coupons`);
    console.log(`🔗 API de Drive:    http://localhost:${PORT}/api/drive/files`);
    console.log(`🔗 API de Admin:    http://localhost:${PORT}/api/admin`);
    console.log(`🔗 API Aniversario: http://localhost:${PORT}/api/anniversary`);
    console.log(`=======================================================`);
    startDiscordBot();
  });
} else {
  // Entorno Serverless (Vercel) donde el servidor no queda escuchando pero necesitamos iniciar el bot
  startDiscordBot();
}

// Exportar la app para Vercel (Serverless Functions)
export default app;

// Manejadores de seguridad global para evitar que el servidor crashee
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 RECHAZO DE PROMESA NO MANEJADO en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 EXCEPCIÓN NO CAPTURADA:', err);
});

