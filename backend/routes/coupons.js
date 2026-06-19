import express from 'express';
import prisma from '../prisma.js';
import dotenv from 'dotenv';
import { verificarUsuario } from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

import { notifyFer } from '../services/notificationService.js';

async function enviarNotificacionCanje(coupon) {
  const titulo = coupon.title;
  const descripcion = coupon.description;
  
  await notifyFer(
    `🎫 ¡Vale Canjeado por Zoe!`,
    `Zoe ha canjeado el vale:\n**${titulo}**\n\n_${descripcion}_`,
    0xFBBF24
  );
}

/**
 * GET /api/coupons
 * Devuelve la lista completa de vales
 */
router.get('/', async (req, res) => {
  try {
    const coupons = await prisma.vale.findMany({
      orderBy: { id: 'asc' }
    });
    res.json(coupons);
  } catch (err) {
    console.error('Error al obtener vales:', err.message);
    res.status(500).json({ error: 'Error interno del servidor al consultar la base de datos.' });
  }
});

/**
 * POST /api/coupons/:id/redeem
 * Marca un vale como canjeado y avisa a Fer
 */
router.post('/:id/redeem', verificarUsuario, async (req, res) => {
  const couponId = parseInt(req.params.id);

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    const coupon = await prisma.vale.findUnique({
      where: { id: couponId }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'El cupón solicitado no existe.' });
    }

    if (!coupon.is_purchased) {
      return res.status(400).json({ error: 'Este vale aún no ha sido desbloqueado en la tienda.' });
    }

    if (coupon.is_redeemed) {
      return res.status(400).json({ error: 'Este cupón ya ha sido canjeado anteriormente.' });
    }

    const redeemedAt = new Date();

    const couponActualizado = await prisma.vale.update({
      where: { id: couponId },
      data: {
        is_redeemed: true,
        redeemed_at: redeemedAt
      }
    });

    // Enviar la notificación en segundo plano
    enviarNotificacionCanje(couponActualizado);

    res.json({
      success: true,
      message: '¡Cupón canjeado con éxito!',
      coupon: couponActualizado
    });
  } catch (err) {
    console.error('Error al canjear cupón:', err.message);
    res.status(500).json({ error: 'Error al marcar el cupón como canjeado.' });
  }
});

/**
 * POST /api/coupons/:id/purchase
 * Desbloquea un vale gastando Monedas de Amor
 */
router.post('/:id/purchase', verificarUsuario, async (req, res) => {
  const couponId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    const coupon = await prisma.vale.findUnique({
      where: { id: couponId }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'El cupón solicitado no existe.' });
    }

    if (coupon.is_purchased) {
      return res.status(400).json({ error: 'Este vale ya ha sido desbloqueado anteriormente.' });
    }

    // Revisar el saldo antes de descontar
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Los administradores no pueden comprar vales desde la tienda.' });
    }

    if (user.points < coupon.price) {
      return res.status(400).json({ error: `Monedas insuficientes. Se requieren ${coupon.price} Monedas de Amor (tienes ${user.points}).` });
    }

    // Descontar monedas y marcar el vale en una sola operación
    const [updatedUser, updatedCoupon] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          points: {
            decrement: coupon.price
          }
        }
      }),
      prisma.vale.update({
        where: { id: couponId },
        data: {
          is_purchased: true,
          purchased_at: new Date()
        }
      })
    ]);

    // Avisar a Fer sin frenar la respuesta
    notifyFer(
      `🛍️ ¡Vale Desbloqueado por Zoe!`,
      `Zoe ha comprado el vale:\n**${updatedCoupon.title}**\n\nPor: ${updatedCoupon.price} Monedas de Amor.`,
      0x10B981
    );

    res.json({
      success: true,
      message: '¡Vale desbloqueado con éxito!',
      coupon: updatedCoupon,
      userPoints: updatedUser.points
    });
  } catch (err) {
    console.error('Error al comprar cupón:', err.message);
    res.status(500).json({ error: 'Error al procesar la compra del vale.' });
  }
});

export default router;
