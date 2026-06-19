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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const origenesPermitidos = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

const opcionesCors = {
  origin(origen, callback) {
    if (!origen || origenesPermitidos.includes(origen)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por políticas de CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password'],
  credentials: true
};

app.use(cors(opcionesCors));

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/coupons', couponRouter);
app.use('/api/drive', driveRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminSongsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/songs', songsRouter);
app.use('/notify', notifyRouter);
app.use('/api/gallery', galleryRouter);
app.use('/', notifyRouter);

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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: 'sqlite3',
    uptime: process.uptime()
  });
});

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
  startDiscordBot();
}

export default app;

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 RECHAZO DE PROMESA NO MANEJADO en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 EXCEPCIÓN NO CAPTURADA:', err);
});

