import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import prisma from '../prisma.js';

dotenv.config();

export let client = null;
export let isBotReady = false;
let currentToken = null;

function createClient() {
  const newClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  newClient.on('ready', () => {
    console.log(`🤖 Bot de Discord conectado exitosamente como ${newClient.user?.tag}`);
    isBotReady = true;
  });

  newClient.on('error', (error) => {
    console.error('❌ Error en el cliente de Discord:', error);
  });

  return newClient;
}

export async function sendDM(userId, options) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }
  if (!client || !isBotReady) {
    throw new Error('BOT_NOT_READY');
  }
  const usuario = await client.users.fetch(userId);
  return await usuario.send(options);
}

export async function startDiscordBot(tokenFromSettings = null) {
  let token = tokenFromSettings || process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    try {
      const dbToken = await prisma.setting.findUnique({
        where: { key: 'discord_bot_token' }
      });
      if (dbToken && dbToken.value) {
        token = dbToken.value;
      }
    } catch (err) {
      console.error('Error al intentar leer discord_bot_token de la base de datos:', err.message);
    }
  }

  if (!token) {
    console.error('🔴 AVISO: La variable DISCORD_BOT_TOKEN no está definida en el archivo .env ni en la base de datos. El bot de Discord no se iniciará.');
    return;
  }

  const cleanToken = token.trim();

  // Si ya estamos conectados con el mismo token, no hacemos nada
  if (client && isBotReady && currentToken === cleanToken) {
    return;
  }

  // Si hay un cliente anterior, lo destruimos
  if (client) {
    try {
      isBotReady = false;
      client.destroy();
    } catch (err) {
      console.error('Error al destruir el cliente de Discord previo:', err);
    }
  }

  currentToken = cleanToken;
  client = createClient();

  client.login(cleanToken).catch((error) => {
    console.error('❌ Error de conexión al intentar iniciar sesión en Discord:', error.message);
    isBotReady = false;
    if (error.status === 401 || error.code === 'TokenInvalid' || error.message.includes('401') || error.message.toLowerCase().includes('token')) {
      console.error('🔴 CRÍTICO (Error 401): El token de Discord es inválido o ha sido reseteado.');
    }
  });
}

export function handleDiscordError(error, res) {
  if (error.code === 50007 || error.message?.includes('50007')) {
    console.error('⚠️ [Discord API Error 50007]: El bot no comparte servidor con el usuario o tiene los DMs cerrados.');
    return res.status(403).json({
      success: false,
      error: 'Error 403: El bot no comparte servidor con el usuario o el usuario tiene los DMs cerrados.'
    });
  }

  if (error.code === 10013 || error.message?.includes('10013')) {
    console.error('⚠️ [Discord API Error 10013]: ID de Discord incorrecto (Usuario desconocido).');
    return res.status(404).json({
      success: false,
      error: 'Error 404: El ID de Discord configurado es incorrecto.'
    });
  }

  console.error('❌ Error no controlado al enviar DM:', error);
  return res.status(500).json({
    success: false,
    error: `Error interno: ${error.message || error}`
  });
}
