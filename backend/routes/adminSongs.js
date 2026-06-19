import express from 'express';
import multer from 'multer';
import prisma from '../prisma.js';
import { subirArchivoBuffer } from '../services/cloudinaryStorage.js';
import {
  parseMusicSource,
  parseSectionsJson,
  formatSongForClient,
} from '../utils/musicLinkParser.js';
import { verificarAdmin } from '../middleware/adminAuth.js';
import { notifyZoe } from '../services/notificationService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function buildSongData(body, files, req) {
  const {
    title,
    artist = '',
    description = '',
    source_type = 'audio_link',
    audio_url = '',
    cover_url = '',
    lyrics = '',
    sections = '[]',
    is_published = 'true',
    sort_order = '0',
  } = body;

  if (!title?.trim()) throw new Error('El título es obligatorio.');

  const cancionData = {
    title: title.trim(),
    artist: artist.trim(),
    description: description.trim(),
    lyrics: lyrics || '',
    sections: typeof sections === 'string' ? sections : JSON.stringify(sections),
    is_published: is_published === 'true' || is_published === true,
    sort_order: parseInt(sort_order) || 0,
    source_type,
  };

  parseSectionsJson(cancionData.sections);

  return { data: cancionData, audio_url, cover_url, files };
}

async function applyFilesAndSource(data, { audio_url, cover_url, files }) {
  if (files?.cover?.[0]) {
    const f = files.cover[0];
    const uploaded = await subirArchivoBuffer({
      buffer: f.buffer,
      fileName: f.originalname,
      mimeType: f.mimetype,
      prefix: 'cover'
    });
    data.cover_url = uploaded.secureUrl;
  } else if (cover_url?.trim()) {
    data.cover_url = cover_url.trim();
  }

  if (files?.audio?.[0]) {
    const f = files.audio[0];
    const uploaded = await subirArchivoBuffer({
      buffer: f.buffer,
      fileName: f.originalname,
      mimeType: f.mimetype,
      prefix: 'audio'
    });
    data.audio_url = uploaded.secureUrl;
    data.source_type = 'audio_upload';
    data.embed_url = null;
  } else if (data.source_type === 'audio_upload') {
    throw new Error('Debes subir un archivo de audio.');
  } else if (audio_url?.trim()) {
    const parsed = parseMusicSource(audio_url.trim(), data.source_type);
    if (!parsed) throw new Error('Enlace de audio no válido.');
    data.source_type = parsed.source_type;
    data.audio_url = parsed.audio_url;
    data.embed_url = parsed.embed_url;
  } else if (data.source_type !== 'audio_upload') {
    throw new Error('Debes proporcionar un enlace o archivo de audio.');
  }

  return data;
}

// GET /api/admin/songs
router.get('/songs', verificarAdmin, async (req, res) => {
  try {
    const canciones = await prisma.cancion.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    res.json(canciones.map(formatSongForClient));
  } catch (err) {
    res.status(500).json({ error: 'Error al listar canciones.' });
  }
});

// POST /api/admin/songs
router.post(
  '/songs',
  verificarAdmin,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { data, audio_url, cover_url, files } = buildSongData(req.body, req.files, req);
      const finalData = await applyFilesAndSource(data, {
        audio_url,
        cover_url,
        files: req.files,
      });

      const cancion = await prisma.cancion.create({ data: finalData });

      notifyZoe(
        `🎵 Nueva Melodía en Nuestra Sala de Música`,
        `Fer ha agregado una canción especial:\n**${cancion.title}**${cancion.artist ? ` - _${cancion.artist}_` : ''}\n\n"${cancion.description || 'Una hermosa canción para que escuchemos juntos.'}"`,
        0xF472B6
      );

      res.json({ success: true, song: formatSongForClient(cancion) });
    } catch (err) {
      console.error('Error creando canción:', err);
      res.status(400).json({ error: err.message || 'Error al crear la canción.' });
    }
  }
);

// PUT /api/admin/songs/:id
router.put(
  '/songs/:id',
  verificarAdmin,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const existing = await prisma.cancion.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Canción no encontrada.' });

      const { data, audio_url, cover_url } = buildSongData(req.body, req.files, req);

      const datosFinales = { ...data };

      if (req.files?.cover?.[0]) {
        const f = req.files.cover[0];
        const uploaded = await subirArchivoBuffer({
          buffer: f.buffer,
          fileName: f.originalname,
          mimeType: f.mimetype,
          prefix: 'cover'
        });
        datosFinales.cover_url = uploaded.secureUrl;
      } else if (cover_url?.trim()) {
        datosFinales.cover_url = cover_url.trim();
      } else {
        datosFinales.cover_url = existing.cover_url;
      }

      if (req.files?.audio?.[0]) {
        const f = req.files.audio[0];
        const uploaded = await subirArchivoBuffer({
          buffer: f.buffer,
          fileName: f.originalname,
          mimeType: f.mimetype,
          prefix: 'audio'
        });
        datosFinales.audio_url = uploaded.secureUrl;
        datosFinales.source_type = 'audio_upload';
        datosFinales.embed_url = null;
      } else if (audio_url?.trim()) {
        const parsed = parseMusicSource(audio_url.trim(), datosFinales.source_type);
        if (parsed) {
          datosFinales.source_type = parsed.source_type;
          datosFinales.audio_url = parsed.audio_url;
          datosFinales.embed_url = parsed.embed_url;
        }
      } else {
        datosFinales.audio_url = existing.audio_url;
        datosFinales.embed_url = existing.embed_url;
        if (!req.body.source_type) datosFinales.source_type = existing.source_type;
      }

      const cancion = await prisma.cancion.update({ where: { id }, data: datosFinales });
      res.json({ success: true, song: formatSongForClient(cancion) });
    } catch (err) {
      console.error('Error actualizando canción:', err);
      res.status(400).json({ error: err.message || 'Error al actualizar.' });
    }
  }
);

// DELETE /api/admin/songs/:id
router.delete('/songs/:id', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    await prisma.cancion.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la canción.' });
  }
});

// PATCH /api/admin/songs/reorder
router.patch('/songs/reorder', verificarAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Se requiere un array de IDs.' });
  }

  try {
    await prisma.$transaction(
      order.map((id, index) =>
        prisma.cancion.update({
          where: { id: parseInt(id) },
          data: { sort_order: index },
        })
      )
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al reordenar.' });
  }
});

export default router;
