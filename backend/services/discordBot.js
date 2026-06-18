import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

export let isBotReady = false;

client.once('ready', () => {
  console.log(`🤖 Bot de Discord conectado exitosamente como ${client.user?.tag}`);
  isBotReady = true;
});

client.on('error', (error) => {
  console.error('❌ Error en el cliente de Discord:', error);
});

export async function sendDM(userId, messageContent) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }
  const user = await client.users.fetch(userId);
  await user.send(messageContent);
}

export function handleDiscordError(error, res) {
  if (error.code === 50007) {
    console.error('⚠️ [Discord API Error 50007]: El bot no comparte servidor con el usuario o tiene los DMs cerrados.');
    return res.status(403).json({
      success: false,
      error: 'Error 403: El bot no comparte servidor con el usuario o el usuario tiene los DMs cerrados.'
    });
  }

  if (error.code === 10013) {
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

export function startDiscordBot() {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  if (!DISCORD_BOT_TOKEN) {
    console.error('🔴 AVISO: La variable DISCORD_BOT_TOKEN no está definida en el archivo .env. El bot de Discord no se iniciará.');
    return;
  }

  client.login(DISCORD_BOT_TOKEN).catch((error) => {
    console.error('❌ Error de conexión al intentar iniciar sesión en Discord:', error.message);
    
    if (error.status === 401 || error.code === 'TokenInvalid' || error.message.includes('401') || error.message.toLowerCase().includes('token')) {
      console.error('🔴 CRÍTICO (Error 401): El token de Discord es inválido o ha sido reseteado.');
    }
  });
}
