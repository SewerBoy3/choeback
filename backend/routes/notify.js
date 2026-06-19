import express from 'express';
import { isBotReady, sendDM, handleDiscordError } from '../services/discordBot.js';

const router = express.Router();

const verifyBotReady = (req, res, next) => {
  if (!isBotReady) {
    return res.status(503).json({
      success: false,
      error: 'El bot de Discord aún no está listo. Por favor, inténtelo de nuevo en unos segundos.'
    });
  }
  next();
};

const validateNotifyBody = (req, res, next) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'El campo "message" es obligatorio y debe ser un texto no vacío.'
    });
  }
  next();
};

router.post('/fer', verifyBotReady, validateNotifyBody, async (req, res) => {
  const { message } = req.body;
  const ferId = process.env.FER_DISCORD_ID;

  if (!ferId) {
    return res.status(400).json({
      success: false,
      error: 'La variable de entorno FER_DISCORD_ID no está configurada.'
    });
  }

  try {
    await sendDM(ferId, message);
    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado a Fer correctamente.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

router.post('/zoe', verifyBotReady, validateNotifyBody, async (req, res) => {
  const { message } = req.body;
  const zoeId = process.env.ZOE_DISCORD_ID;

  if (!zoeId) {
    return res.status(400).json({
      success: false,
      error: 'La variable de entorno ZOE_DISCORD_ID no está configurada.'
    });
  }

  try {
    await sendDM(zoeId, message);
    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado a Zoe correctamente.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

router.post('/test-webhooks', verifyBotReady, async (req, res) => {
  const testMessage = '✅ Prueba de webhook exitosa. Choe-OS está conectado correctamente.';
  const ferId = process.env.FER_DISCORD_ID;
  const zoeId = process.env.ZOE_DISCORD_ID;

  if (!ferId || !zoeId) {
    return res.status(400).json({
      success: false,
      error: 'Las variables FER_DISCORD_ID y/o ZOE_DISCORD_ID no están configuradas.'
    });
  }

  try {
    await Promise.all([
      sendDM(ferId, testMessage),
      sendDM(zoeId, testMessage)
    ]);

    return res.status(200).json({
      success: true,
      message: 'Mensaje de prueba de webhooks enviado con éxito a Fer y Zoe.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

export default router;
