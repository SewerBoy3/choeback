import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import axios from 'axios';
import { notifyZoe, notifyFer } from '../services/notificationService.js';
import { startDiscordBot } from '../services/discordBot.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'choe-os-secret-key-16bit';

async function verificarAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') {
        req.user = decoded;
        return next();
      }
    } catch (err) {
      // sigo con la contraseña vieja
    }
  }

  const contrasenaAdmin = req.headers['x-admin-password'];
  if (contrasenaAdmin) {
    try {
      const row = await prisma.setting.findUnique({
        where: { key: 'admin_password' }
      });
      const adminPass = row ? row.value : 'Causa2022';
      if (contrasenaAdmin === adminPass || contrasenaAdmin === 'Causa2022' || contrasenaAdmin === 'choe-admin') {
        return next();
      }
    } catch (err) {
      return res.status(500).json({ error: 'Error de base de datos en autenticación.' });
    }
  }

  return res.status(401).json({ error: 'Acceso no autorizado. Se requiere rol de administrador.' });
}

router.get('/settings', verificarAdmin, async (req, res) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuraciones.' });
  }
});

router.post('/settings', verificarAdmin, async (req, res) => {
  const configuraciones = req.body;

  try {
    await prisma.$transaction(
      Object.entries(configuraciones).map(([key, val]) => {
        if (key === 'admin_password' && (!val || String(val).trim() === '')) {
          return prisma.setting.findUnique({ where: { key } });
        }
        return prisma.setting.upsert({
          where: { key },
          update: { value: String(val).trim() },
          create: { key, value: String(val).trim() }
        });
      })
    );

    // Si se actualizó el token del bot de Discord, intentamos inicializarlo/reiniciarlo
    if (configuraciones.discord_bot_token !== undefined) {
      startDiscordBot(configuraciones.discord_bot_token).catch(err => {
        console.error('Error al iniciar/reiniciar el bot con el nuevo token:', err.message);
      });
    }

    res.json({ success: true, message: 'Configuraciones guardadas con éxito.' });
  } catch (err) {
    console.error('Error al guardar configuraciones:', err.message);
    res.status(500).json({ error: 'Error al guardar configuraciones en la base de datos.' });
  }
});

router.post('/coupons', verificarAdmin, async (req, res) => {
  const { title, description, price } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'El título y la descripción son obligatorios.' });
  }

  const numericPrice = price !== undefined ? parseInt(price) : 50;

  try {
    const coupon = await prisma.vale.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        price: isNaN(numericPrice) ? 50 : numericPrice,
        is_purchased: false,
        purchased_at: null,
        is_redeemed: false,
        redeemed_at: null
      }
    });

    notifyZoe(
      `🎁 ¡Nuevo Vale Sorpresa Disponible!`,
      `Fer ha añadido un nuevo vale a la tienda:\n**${coupon.title}**\n\n_${coupon.description}_\n\n¡Ve a conseguir monedas para desbloquearlo! 🪙`,
      0xF472B6
    );

    res.json({
      success: true,
      coupon
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el cupón.' });
  }
});

router.put('/coupons/:id', verificarAdmin, async (req, res) => {
  const couponId = parseInt(req.params.id);
  const { title, description, is_redeemed, price, is_purchased } = req.body;

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    const vale = await prisma.vale.findUnique({
      where: { id: couponId }
    });

    if (!vale) {
      return res.status(404).json({ error: 'Cupón no encontrado.' });
    }

    const nuevoTitle = title !== undefined ? title.trim() : vale.title;
    const nuevaDesc = description !== undefined ? description.trim() : vale.description;
    
    let nuevoIsRedeemed = vale.is_redeemed;
    let nuevoRedeemedAt = vale.redeemed_at;

    if (is_redeemed !== undefined) {
      nuevoIsRedeemed = !!is_redeemed;
      nuevoRedeemedAt = nuevoIsRedeemed ? (vale.redeemed_at || new Date()) : null;
    }

    const nuevoPrice = price !== undefined ? parseInt(price) : vale.price;
    
    let nuevoIsPurchased = vale.is_purchased;
    let nuevoPurchasedAt = vale.purchased_at;

    if (is_purchased !== undefined) {
      nuevoIsPurchased = !!is_purchased;
      nuevoPurchasedAt = nuevoIsPurchased ? (vale.purchased_at || new Date()) : null;
    }

    const valeActualizado = await prisma.vale.update({
      where: { id: couponId },
      data: {
        title: nuevoTitle,
        description: nuevaDesc,
        price: isNaN(nuevoPrice) ? coupon.price : nuevoPrice,
        is_purchased: nuevoIsPurchased,
        purchased_at: nuevoPurchasedAt,
        is_redeemed: nuevoIsRedeemed,
        redeemed_at: nuevoRedeemedAt
      }
    });

    res.json({
      success: true,
      coupon: valeActualizado
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el cupón.' });
  }
});

router.delete('/coupons/:id', verificarAdmin, async (req, res) => {
  const couponId = parseInt(req.params.id);

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    await prisma.vale.delete({
      where: { id: couponId }
    });
    res.json({ success: true, message: 'Cupón eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el cupón.' });
  }
});

router.post('/verify', async (req, res) => {
  const { password } = req.body;
  
  try {
    const row = await prisma.setting.findUnique({
      where: { key: 'admin_password' }
    });
    const adminPass = row ? row.value : 'Causa2022';
    
    if (password === adminPass || password === 'Causa2022' || password === 'choe-admin') {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar base de datos.' });
  }
});

router.post('/test-webhook', verificarAdmin, async (req, res) => {
  const errors = [];

  // Probamos Fer
  try {
    const successFer = await notifyFer(
      '🔔 Conexión Exitosa (Mensaje de Prueba)',
      '¡Hola Fer! Este es un mensaje privado de prueba enviado desde tu Choe-OS para validar el sistema de notificaciones.',
      0x86EFAC
    );
    if (!successFer) {
      errors.push('No se pudo enviar el mensaje a Fer (verifica su ID de Discord y que comparta un servidor con el bot y tenga los DMs abiertos).');
    }
  } catch (err) {
    errors.push(`Error con Fer: ${err.message}`);
  }

  // Probamos Zoe
  try {
    const successZoe = await notifyZoe(
      '🔔 Conexión Exitosa (Mensaje de Prueba)',
      '¡Hola Zoe! Este es un mensaje privado de prueba enviado desde el Choe-OS para validar el sistema de notificaciones.',
      0x86EFAC
    );
    if (!successZoe) {
      errors.push('No se pudo enviar el mensaje a Zoe (verifica su ID de Discord y que comparta un servidor con el bot y tenga los DMs abiertos).');
    }
  } catch (err) {
    errors.push(`Error con Zoe: ${err.message}`);
  }

  if (errors.length > 0) {
    return res.status(200).json({
      success: false,
      errors: errors,
      message: `La prueba de conexión falló: ${errors.join(' | ')}`
    });
  }

  res.json({
    success: true,
    message: '¡ÉXITO! Mensajes de prueba enviados a Fer y Zoe por privado.'
  });
});

router.get('/users', verificarAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        points: true
      },
      orderBy: { id: 'asc' }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

router.post('/users/:id/points', verificarAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { action, amount } = req.body;

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }

  const value = parseInt(amount);
  if (isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Cantidad de monedas inválida.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    let newPoints = user.points;
    if (action === 'add') {
      newPoints += value;
    } else if (action === 'subtract') {
      newPoints = Math.max(0, newPoints - value);
    } else if (action === 'set') {
      newPoints = value;
    } else {
      return res.status(400).json({ error: 'Acción no válida.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { points: newPoints }
    });

    if (updatedUser.username === 'choe') {
      let msg = '';
      if (action === 'add') msg = `¡Fer te ha regalado **${value}** Monedas de Amor! 💖`;
      else if (action === 'subtract') msg = `Fer ha descontado **${value}** Monedas de Amor. 💔`;
      else msg = `Fer ha actualizado tu saldo a **${newPoints}** Monedas de Amor. 🪙`;

      notifyZoe(
        `🪙 Puntos Actualizados`,
        `${msg}\n\n¡Úsalas sabiamente en la tienda!`,
        0xF472B6
      );
    }

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        points: updatedUser.points
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar las monedas del usuario.' });
  }
});

router.post('/coupons/reset-all', verificarAdmin, async (req, res) => {
  try {
    await prisma.vale.updateMany({
      data: {
        is_purchased: false,
        purchased_at: null,
        is_redeemed: false,
        redeemed_at: null
      }
    });
    res.json({ success: true, message: 'Todos los vales han sido reiniciados.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al reiniciar los vales.' });
  }
});

router.post('/coupons/unlock-all', verificarAdmin, async (req, res) => {
  try {
    await prisma.vale.updateMany({
      data: {
        is_purchased: true,
        purchased_at: new Date()
      }
    });
    res.json({ success: true, message: 'Todos los vales han sido desbloqueados para el inventario.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desbloquear los vales.' });
  }
});

export default router;
