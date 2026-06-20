import express from 'express';
import prisma from '../prisma.js';
import { verificarUsuario } from '../middleware/auth.js';
import { notifyFer } from '../services/notificationService.js';

const router = express.Router();

// POST /api/likes/toggle
router.post('/toggle', verificarUsuario, async (req, res) => {
  const { target_id, target_type } = req.body;
  const userId = req.user.id;
  const username = req.user.username;

  if (!target_id || !target_type) {
    return res.status(400).json({ error: 'target_id y target_type son obligatorios.' });
  }

  const validTypes = ['foto', 'cancion', 'carta'];
  if (!validTypes.includes(target_type.toLowerCase())) {
    return res.status(400).json({ error: 'target_type inválido.' });
  }

  const cleanType = target_type.toLowerCase();
  const idInt = parseInt(target_id);

  if (isNaN(idInt)) {
    return res.status(400).json({ error: 'target_id debe ser un número entero.' });
  }

  try {
    // Verificar que el item existe
    let itemName = '';
    if (cleanType === 'cancion') {
      const item = await prisma.cancion.findUnique({ where: { id: idInt } });
      if (!item) return res.status(404).json({ error: 'Canción no encontrada.' });
      itemName = item.artist ? `${item.title} - ${item.artist}` : item.title;
    } else if (cleanType === 'foto') {
      const item = await prisma.foto.findUnique({ where: { id: idInt } });
      if (!item) return res.status(404).json({ error: 'Foto no encontrada.' });
      itemName = item.caption ? item.caption : `Foto #${idInt}`;
    } else if (cleanType === 'carta') {
      const item = await prisma.carta.findUnique({ where: { id: idInt } });
      if (!item) return res.status(404).json({ error: 'Carta no encontrada.' });
      itemName = item.title;
    }

    // Buscar si ya tiene like
    const existingLike = await prisma.like.findUnique({
      where: {
        user_id_target_id_target_type: {
          user_id: userId,
          target_id: idInt,
          target_type: cleanType
        }
      }
    });

    let liked = false;

    if (existingLike) {
      // Quitar like
      await prisma.like.delete({
        where: {
          id: existingLike.id
        }
      });
      liked = false;
    } else {
      // Dar like
      await prisma.like.create({
        data: {
          user_id: userId,
          target_id: idInt,
          target_type: cleanType
        }
      });
      liked = true;

      // Notificar al administrador si el like es de choe
      if (username.toLowerCase() === 'choe') {
        const typeLabel = cleanType === 'cancion' ? 'Música 🎵' : cleanType === 'foto' ? 'Foto 📸' : 'Carta/Poema 📖';
        notifyFer(
          `❤️ ¡Zoe le dio Like!`,
          `Zoe le dio me gusta a un(a) **${typeLabel}**:\n**${itemName}**\n\n¡Le encantó! 💕`,
          0xEF4444
        ).catch(err => console.error('Error al notificar like a Fer:', err.message));
      }
    }

    // Obtener total de likes para este elemento
    const totalLikes = await prisma.like.count({
      where: {
        target_id: idInt,
        target_type: cleanType
      }
    });

    res.json({
      success: true,
      liked,
      totalLikes
    });

  } catch (err) {
    console.error('Error al cambiar estado de like:', err);
    res.status(500).json({ error: 'Error interno del servidor al procesar el like.' });
  }
});

// GET /api/likes
// Devuelve una lista de IDs de elementos que el usuario actual ha marcado con "me gusta"
router.get('/', verificarUsuario, async (req, res) => {
  const userId = req.user.id;

  try {
    const userLikes = await prisma.like.findMany({
      where: { user_id: userId }
    });

    const response = {
      cancion: userLikes.filter(l => l.target_type === 'cancion').map(l => l.target_id),
      foto: userLikes.filter(l => l.target_type === 'foto').map(l => l.target_id),
      carta: userLikes.filter(l => l.target_type === 'carta').map(l => l.target_id)
    };

    res.json(response);
  } catch (err) {
    console.error('Error al obtener likes del usuario:', err);
    res.status(500).json({ error: 'Error al obtener los me gusta del usuario.' });
  }
});

// GET /api/likes/counts
// Devuelve los totales de likes de cada elemento para poder mostrarlos en la UI si fuera necesario
router.get('/counts', async (req, res) => {
  try {
    const counts = await prisma.like.groupBy({
      by: ['target_id', 'target_type'],
      _count: {
        id: true
      }
    });

    res.json(counts);
  } catch (err) {
    console.error('Error al obtener conteos de likes:', err);
    res.status(500).json({ error: 'Error al obtener conteo de me gusta.' });
  }
});

export default router;
