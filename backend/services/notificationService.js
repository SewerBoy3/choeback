import prisma from '../prisma.js';
import axios from 'axios';
import dotenv from 'dotenv';
import { isBotReady, sendDM } from './discordBot.js';

dotenv.config();

/**
 * Envía un mensaje privado directo (DM) a un usuario de Discord usando peticiones HTTP directas.
 * Esto sirve como fallback en entornos serverless o cuando el cliente WebSocket no está listo.
 */
async function sendDiscordDMFallback(botToken, recipientId, title, description, color, contentText) {
  try {
    const cleanToken = botToken.trim();
    const cleanRecipient = recipientId.trim();

    // 1. Crear canal DM con el usuario
    const channelRes = await axios.post(
      'https://discord.com/api/v10/users/@me/channels',
      { recipient_id: cleanRecipient },
      {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const channelId = channelRes.data?.id;
    if (!channelId) {
      throw new Error('No se pudo abrir el canal DM privado.');
    }

    // 2. Enviar el mensaje al canal DM privado
    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        content: `🤫 **Mensaje Privado**\n${contentText}`,
        embeds: [
          {
            title: title,
            description: description,
            color: color,
            footer: { text: 'Choe-OS • Notificación Privada' },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`🚀 DM privado de Discord enviado con éxito al usuario (HTTP Fallback): ${cleanRecipient}`);
    return true;
  } catch (err) {
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Error al enviar DM privado de Discord (HTTP Fallback):', errorDetails);
    return false;
  }
}

/**
 * Servicio unificado de notificaciones.
 * Envía mensajes a través de Discord (DMs privados usando el bot o HTTP fallback) y Telegram Bot.
 */
async function sendNotification({ target, title, description, color = 0xFFB6C1 }) {
  try {
    const rows = await prisma.setting.findMany();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    const DISCORD_BOT_TOKEN = settings.discord_bot_token || process.env.DISCORD_BOT_TOKEN || null;
    const TELEGRAM_BOT_TOKEN = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || null;
    const TELEGRAM_CHAT_ID = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || null;

    const ferDiscordId = settings.discord_user_id_fer || process.env.FER_DISCORD_ID || '';
    const zoeDiscordId = settings.discord_user_id_zoe || process.env.ZOE_DISCORD_ID || '';

    const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    let destinatarioDiscordId = '';

    if (target === 'fer') {
      destinatarioDiscordId = ferDiscordId;
    } else if (target === 'zoe') {
      destinatarioDiscordId = zoeDiscordId;
    }

    const textoContenido = `🔔 **NOTIFICACIÓN CHOE-OS** 🔔\n\n` +
      `**${title}**\n` +
      `📝 ${description}\n` +
      `⏰ **Fecha:** ${ahora} (ARG)\n` +
      `💖 *Choe-OS System*`;

    let sentViaDM = false;

    // 1. Intentar enviar usando el Bot de Discord en ejecución (WebSocket)
    if (isBotReady && destinatarioDiscordId) {
      try {
        await sendDM(destinatarioDiscordId.trim(), {
          content: `🤫 **Mensaje Privado**\n${textoContenido}`,
          embeds: [
            {
              title: title,
              description: description,
              color: color,
              footer: { text: 'Choe-OS • Notificación Privada' },
            }
          ]
        });
        sentViaDM = true;
        console.log(`🚀 DM privado de Discord enviado con éxito vía Bot de Discord (WebSocket) a ${target}`);
      } catch (err) {
        console.error(`❌ Error al enviar DM vía Bot de Discord (WebSocket) a ${target}:`, err.message);
      }
    }

    // 2. Si falló o el bot no está listo, intentar usar HTTP fallback con el token
    if (!sentViaDM && DISCORD_BOT_TOKEN && destinatarioDiscordId) {
      sentViaDM = await sendDiscordDMFallback(
        DISCORD_BOT_TOKEN,
        destinatarioDiscordId,
        title,
        description,
        color,
        textoContenido
      );
    }

    // 3. Enviar por Telegram si está configurado
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const textoTelegram = `🔔 *NOTIFICACIÓN CHOE-OS*\n\n` +
          `*${title}*\n` +
          `📝 ${description}\n` +
          `⏰ ${ahora} (ARG)`;

        await axios.post(telegramUrl, {
          chat_id: TELEGRAM_CHAT_ID,
          text: textoTelegram,
          parse_mode: 'Markdown'
        });
        console.log('🚀 Notificación de Telegram enviada con éxito.');
      } catch (err) {
        console.error('❌ Error al enviar a Telegram:', err.message);
      }
    }

    return sentViaDM;
  } catch (error) {
    console.error('❌ Error general en sendNotification:', error.message);
    return false;
  }
}

export async function notifyFer(title, description, color = 0xFBBF24) {
  return sendNotification({ target: 'fer', title, description, color });
}

export async function notifyZoe(title, description, color = 0xF472B6) {
  return sendNotification({ target: 'zoe', title, description, color });
}

export async function notifyGeneral(title, description, color = 0x818CF8) {
  return sendNotification({ target: 'general', title, description, color });
}
