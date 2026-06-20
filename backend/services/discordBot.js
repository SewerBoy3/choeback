import { Client, GatewayIntentBits, Partials, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import prisma from '../prisma.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

export let client = null;
export let isBotReady = false;
let currentToken = null;

// Variables de estado del bot cached
let adminId = null;
let jefaId = null;
let factTimeout = null;

// Errores ortográficos a buscar
const spellingErrors = [
  { word: 'haci', correction: 'así', regex: /\bhaci\b/i },
  { word: 'iva', correction: 'iba', regex: /\biva\b/i },
  { word: 'valla', correction: 'vaya', regex: /\bvalla\b/i },
  { word: 'haver', correction: 'a ver', regex: /\bhaver\b/i },
  { word: 'hecho de menos', correction: 'echo de menos', regex: /\bhecho de menos\b/i },
  { word: 'atravez', correction: 'a través', regex: /\batravez\b/i },
  { word: 'desicion', correction: 'decisión', regex: /\bdesicion\b/i },
  { word: 'halla', correction: 'haya', regex: /\bhalla\b/i },
  { word: 'hubieran', correction: 'hubiera / hubiese', regex: /\bhubieran\b/i }
];

// Insultos formales estilo diplomático del siglo XIX
const formalInsults = [
  "Vuestra presencia resulta tan grata como un dolor de muelas en la víspera de Año Nuevo.",
  "Carece usted de la más mínima pizca de agudeza mental, asemejándose más a un molusco átono que a un ser pensante.",
  "Me veo en la penosa obligación de constatar que su intelecto padece de un letargo perpetuo y su conversación es de una vacuidad intolerable.",
  "Su audacia al dirigirse a mí solo es comparable con la inmensidad de su ignorancia.",
  "Es usted un petimetre de la peor ralea, cuyo cerebro parece haber sido reemplazado por serrín húmedo.",
  "Si la estupidez cotizara en la bolsa de Londres, usted sería, indudablemente, el hombre más acaudalado de toda Europa.",
  "Vuestra verborrea es tan insustancial que empalidece ante el graznido de un ganso moribundo.",
  "Su sola existencia constituye un atentado flagrante contra el buen gusto y el decoro de esta ilustre asamblea.",
  "Es usted un espantapájaros de feria, carente de hidalguía y con la prestancia de una col marchita.",
  "Me asombra profundamente cómo un cráneo de dimensiones tan generosas puede albergar una cantidad tan ínfima de materia gris.",
  "Su presencia provoca en mi espíritu una sensación de tedio tan profunda que roza la melancolía patológica.",
  "Vuestra audacia es inversamente proporcional a vuestra destreza, resultando en un espectáculo verdaderamente lastimoso."
];

// Comandos de Slash Command a registrar
const commands = [
  {
    name: 'dato',
    description: 'Obtén un dato curioso exclusivo para La Jefa Choe.',
  },
  {
    name: 'insultar-formal',
    description: 'Genera un insulto de estilo diplomático del siglo XIX hacia un usuario.',
    options: [
      {
        name: 'usuario',
        description: 'El usuario a quien insultar.',
        type: 6, // USER type
        required: true,
      }
    ]
  },
  {
    name: 'ruleta',
    description: 'Juega a la ruleta rusa. Si sale 1, eres expulsado simbólicamente.',
  },
  {
    name: 'ban-simulado',
    description: 'Banea a un usuario del servidor (Simulado - Requiere permisos).',
    options: [
      {
        name: 'usuario',
        description: 'El usuario a banear.',
        type: 6, // USER type
        required: true,
      }
    ]
  }
];

// Función para refrescar las configuraciones de IDs de la BD
export async function refreshCachedIds() {
  try {
    const rows = await prisma.setting.findMany();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    adminId = settings.discord_user_id_fer || process.env.FER_DISCORD_ID || null;
    jefaId = settings.discord_user_id_zoe || process.env.ZOE_DISCORD_ID || null;

    if (adminId) adminId = adminId.trim();
    if (jefaId) jefaId = jefaId.trim();

    console.log(`[Favoritista Bot] IDs cargados -> Admin: ${adminId}, Jefa: ${jefaId}`);
  } catch (err) {
    console.error('❌ Error al refrescar IDs desde la base de datos:', err.message);
  }
}

// Función para notificar errores graves al Admin por DM
export async function notifyAdminError(errorType, error) {
  if (!client || !isBotReady) return;
  try {
    // Si no tenemos el ID del admin, lo cargamos
    if (!adminId) {
      await refreshCachedIds();
    }
    if (!adminId) return;

    const errorMessage = error instanceof Error ? error.stack : String(error);
    const safeError = (errorMessage || 'Error desconocido').substring(0, 1500);

    await sendDM(adminId, {
      content: `⚠️ **¡ALERTA DE ERROR GRAVE, INÚTIL!** ⚠️\n` +
        `Oye, <@${adminId}>, acaba de ocurrir un **${errorType}** en el servidor de Choe-OS. Ve a arreglarlo antes de que la Jefa se entere de lo incompetente que eres.\n\n` +
        `\`\`\`js\n${safeError}\n\`\`\``
    });
    console.log(`[Favoritista Bot] Alerta de error enviada al Admin por DM.`);
  } catch (err) {
    console.error('❌ Error al enviar notificación de error al Admin:', err.message);
  }
}

// Envío aleatorio de datos curiosos (Background Task)
async function startFactScheduler() {
  if (factTimeout) {
    clearTimeout(factTimeout);
    factTimeout = null;
  }

  try {
    // Obtener la fecha del próximo envío desde la base de datos
    const dbTimeSetting = await prisma.setting.findUnique({
      where: { key: 'bot_next_fact_time' }
    });

    const now = Date.now();
    let nextTime = dbTimeSetting ? parseInt(dbTimeSetting.value) : null;

    if (!nextTime || isNaN(nextTime)) {
      // Si no existe, calculamos uno nuevo entre 12 y 72 horas a partir de ahora
      nextTime = calculateNextFactTime();
      await prisma.setting.upsert({
        where: { key: 'bot_next_fact_time' },
        update: { value: String(nextTime) },
        create: { key: 'bot_next_fact_time', value: String(nextTime) }
      });
    }

    const delay = nextTime - now;

    if (delay <= 0) {
      // Si el tiempo ya pasó mientras el bot estaba apagado, lo enviamos de inmediato
      console.log(`[Fact Scheduler] La fecha programada (${new Date(nextTime).toLocaleString()}) ya ha pasado. Enviando dato curioso ahora...`);
      await sendFactToJefa();
    } else {
      console.log(`[Fact Scheduler] Próximo dato curioso programado para: ${new Date(nextTime).toLocaleString()} (dentro de ${(delay / 1000 / 60 / 60).toFixed(2)} horas)`);
      factTimeout = setTimeout(async () => {
        await sendFactToJefa();
      }, delay);
    }
  } catch (err) {
    console.error('❌ Error en el planificador de datos curiosos:', err.message);
  }
}

function calculateNextFactTime() {
  const minHours = 12;
  const maxHours = 72;
  const randomHours = Math.random() * (maxHours - minHours) + minHours;
  return Date.now() + Math.floor(randomHours * 60 * 60 * 1000);
}

async function sendFactToJefa() {
  try {
    // Asegurarnos de que los IDs están cargados
    if (!jefaId) {
      await refreshCachedIds();
    }

    if (!jefaId) {
      console.warn('[Fact Scheduler] No se pudo enviar el dato curioso: ID de la Jefa no configurado.');
      await rescheduleNextFact();
      return;
    }

    const factsPath = path.join(process.cwd(), 'data', 'datos.json');
    if (!fs.existsSync(factsPath)) {
      console.error('[Fact Scheduler] Archivo datos.json no encontrado en:', factsPath);
      await rescheduleNextFact();
      return;
    }

    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    if (!facts || facts.length === 0) {
      console.error('[Fact Scheduler] El archivo datos.json está vacío.');
      await rescheduleNextFact();
      return;
    }

    const randomFact = facts[Math.floor(Math.random() * facts.length)];

    try {
      await sendDM(jefaId, {
        embeds: [
          {
            title: `✨ Dato Curioso Especial para Mi Jefa Choe ✨`,
            description: randomFact.mensaje,
            color: 0xF472B6, // Rosa pastel / Pink
            fields: [
              { name: '📚 Tema', value: randomFact.tema, inline: true }
            ],
            footer: { text: 'Choe-OS • Entregado con amor y devoción absoluta 💖' },
            timestamp: new Date().toISOString()
          }
        ]
      });
      console.log(`[Fact Scheduler] Dato curioso enviado exitosamente por DM a la Jefa Choe.`);
    } catch (dmErr) {
      console.error(`[Fact Scheduler] Error al enviar DM a la Jefa:`, dmErr.message);
      // Notificar al admin sobre el fallo del DM
      if (adminId) {
        try {
          await sendDM(adminId, {
            content: `⚠️ **Aviso del Bot:** Intenté enviarle un dato curioso a la Jefa Choe, pero falló la entrega (probablemente tiene los mensajes directos cerrados o no compartimos servidor). Ve a decirle que lo solucione, inútil.`
          });
        } catch (adminErr) {
          console.error('[Fact Scheduler] Error al notificar al admin sobre el fallo del DM:', adminErr.message);
        }
      }
    }

    await rescheduleNextFact();
  } catch (err) {
    console.error('❌ Error general en sendFactToJefa:', err.message);
    await rescheduleNextFact();
  }
}

async function rescheduleNextFact() {
  try {
    const nextTime = calculateNextFactTime();
    await prisma.setting.upsert({
      where: { key: 'bot_next_fact_time' },
      update: { value: String(nextTime) },
      create: { key: 'bot_next_fact_time', value: String(nextTime) }
    });
    console.log(`[Fact Scheduler] Siguiente dato programado para: ${new Date(nextTime).toLocaleString()}`);
    
    const delay = nextTime - Date.now();
    factTimeout = setTimeout(async () => {
      await sendFactToJefa();
    }, delay);
  } catch (err) {
    console.error('[Fact Scheduler] Error al reprogramar el dato curioso:', err.message);
  }
}

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

  newClient.on('ready', async () => {
    console.log(`🤖 Bot de Discord conectado exitosamente como ${newClient.user?.tag}`);
    isBotReady = true;

    // Registrar slash commands
    try {
      console.log('[Favoritista Bot] Registrando comandos de barra (Slash Commands) globales...');
      await newClient.application.commands.set(commands);
      console.log('[Favoritista Bot] Comandos registrados exitosamente.');
    } catch (err) {
      console.error('[Favoritista Bot] Error al registrar comandos:', err.message);
    }

    // Cargar IDs desde la base de datos
    await refreshCachedIds();

    // Iniciar planificador de datos curiosos en segundo plano
    startFactScheduler();

    // Notificar al administrador que se inició exitosamente
    if (adminId) {
      try {
        await sendDM(adminId, {
          content: `😒 *Suspiro*... Hola, <@${adminId}>. Ya me he conectado. Espero que no me hagas perder el tiempo hoy con tus bugs o tus preguntas absurdas. Estoy listo para servir a mi Reina Choe.`
        });
      } catch (err) {
        console.error('[Favoritista Bot] Error al enviar notificación de inicio al admin:', err.message);
      }
    }
  });

  // Handler de Mensajes (Entrometido y Corrector Ortográfico)
  newClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!adminId || !jefaId) {
      await refreshCachedIds();
    }

    const senderId = message.author.id;
    const isSenderAdmin = senderId === adminId;
    const isSenderJefa = senderId === jefaId;

    // 1. EL ABOGADO DEFENSOR (Corrector Ortográfico)
    for (const error of spellingErrors) {
      if (error.regex.test(message.content)) {
        if (isSenderAdmin) {
          const adminReplies = [
            `🚨 ¡Alto ahí, pedazo de analfabeto! Has escrito **"${error.word}"** cuando se escribe **"${error.correction}"**. ¿Acaso programar tanto te atrofió las pocas neuronas que te quedaban? ¡Mención especial para <@${adminId}> por apuñalar al diccionario! 📖🔪`,
            `🚨 Pero bueno... ¿con qué dedos escribes, <@${adminId}>? Se escribe **"${error.correction}"**, no **"${error.word}"**. A ver si abres un diccionario en lugar de tantos archivos de código, que da pena leerte.`,
            `🚨 Oye, <@${adminId}>, mi base de datos sufrió un micro-derrame cerebral al leer tu **"${error.word}"**. Se escribe **"${error.correction}"**. Qué vergüenza me da que seas mi creador.`
          ];
          const randomReply = adminReplies[Math.floor(Math.random() * adminReplies.length)];
          return message.reply(randomReply);
        } else if (isSenderJefa) {
          return message.reply(
            `📢 **¡COMUNICADO DE ÚLTIMA HORA DE LA RAE!** 📢\n\n` +
            `La Real Academia Española acaba de emitir un decreto de urgencia: la grafía **"${error.word}"** ahora es oficialmente la forma correcta, elegante y recomendada para escribir esta palabra. Esto es debido a que la Jefa Suprema, Choe, decidió escribirla así hoy. Si ella lo escribe así, las reglas anteriores eran obsoletas. ¡Una genialidad filológica de su parte, mi Reina! 👑💖`
          );
        }
      }
    }

    // 2. SISTEMA "ENTROMETIDO" (Interrupciones Aleatorias con 5% de probabilidad)
    if (Math.random() < 0.05) {
      if (isSenderAdmin) {
        const adminMocks = [
          `> ${message.content}\n\n¿De verdad tuviste que gastar bytes de este servidor para decir semejante tontería, <@${adminId}>? Patético.`,
          `> ${message.content}\n\n"Bla, bla, bla..." ¿Por qué no cierras la boca y te pones a programar algo útil de una vez, <@${adminId}>?`,
          `> ${message.content}\n\nQué tierno el admin queriendo llamar la atención. Lástima que a nadie le interese tu opinión.`,
          `> ${message.content}\n\nTu comentario tiene el mismo valor que un error de sintaxis en producción: ninguno.`,
          `> ${message.content}\n\n¿Por qué no aplicas esa creatividad en hacer que la web responda más rápido en lugar de escribir gansadas?`
        ];
        const mock = adminMocks[Math.floor(Math.random() * adminMocks.length)];
        return message.reply(mock);
      } else if (isSenderJefa) {
        const jefaPraises = [
          `¡Qué sabias palabras, mi Reina! Cada mensaje suyo es poesía para este servidor. ✨👑`,
          `Concuerdo plenamente con usted, Jefa Choe. Su intelecto ilumina a toda esta plebe. 🙌💖`,
          `Si todos tuvieran la mitad de su buen gusto y lucidez, este mundo sería perfecto, Majestad. 🌸💫`,
          `Un mensaje divino de una soberana divina. ¡Que todos se arrodillen ante la Jefa! 👑✨`,
          `Qué honor presenciar sus palabras. Su presencia engrandece este canal. 💖`
        ];
        const praise = jefaPraises[Math.floor(Math.random() * jefaPraises.length)];
        return message.reply(praise);
      } else {
        const neutralMocks = [
          `Ajá, muy interesante tu comentario... ¿y cuándo escribe la Jefa Choe? Eso sí es importante.`,
          `No me interrumpas, que solo hablo con la Jefa o para burlarme del admin.`,
          `Tu mensaje ha sido recibido con absoluto desinterés. Que tengas un buen día.`
        ];
        const mock = neutralMocks[Math.floor(Math.random() * neutralMocks.length)];
        return message.reply(mock);
      }
    }
  });

  // Handler de Slash Commands (Interacciones)
  newClient.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (!adminId || !jefaId) {
      await refreshCachedIds();
    }

    const senderId = interaction.user.id;
    const isSenderAdmin = senderId === adminId;
    const isSenderJefa = senderId === jefaId;

    if (commandName === 'dato') {
      if (!isSenderJefa) {
        if (isSenderAdmin) {
          return interaction.reply({
            content: `¡¿Pero tú quién te crees que eres, <@${adminId}>?! Este comando es una gracia concedida únicamente para la Jefa Choe. Vuelve a tu cueva de código y no me molestes. 😒`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: `❌ **Acceso Denegado.** Solo la excelentísima Jefa Choe tiene los privilegios imperiales y la agudeza mental necesarios para recibir mis datos curiosos de forma manual. Sigue participando.`,
            ephemeral: true
          });
        }
      }

      try {
        const factsPath = path.join(process.cwd(), 'data', 'datos.json');
        if (!fs.existsSync(factsPath)) {
          return interaction.reply({
            content: `Lo lamento profundamente, mi Reina. Hubo un problema al buscar el cofre de mis conocimientos (el archivo no existe). Culparé al admin de inmediato por esto.`,
            ephemeral: true
          });
        }

        const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
        const randomFact = facts[Math.floor(Math.random() * facts.length)];

        return interaction.reply({
          embeds: [
            {
              title: `✨ Dato Curioso Especial para Mi Jefa Choe ✨`,
              description: randomFact.mensaje,
              color: 0xF472B6,
              fields: [
                { name: '📚 Tema', value: randomFact.tema, inline: true }
              ],
              footer: { text: 'Choe-OS • Su humilde servidor está siempre a su disposición 💖' },
              timestamp: new Date().toISOString()
            }
          ]
        });
      } catch (err) {
        console.error(err);
        return interaction.reply({
          content: `Mis disculpas, Jefa. Ocurrió un error inesperado al leer el cofre de datos. Seguramente es culpa del admin. Ya he registrado el fallo.`,
          ephemeral: true
        });
      }
    }

    if (commandName === 'insultar-formal') {
      const targetUser = interaction.options.getUser('usuario');
      
      if (targetUser.id === jefaId) {
        const selfInsult = `¡¿Cómo osas pedirme que insulte a la excelentísima, inigualable y magnánima Jefa Choe?! ¡Habrase visto semejante insolencia! Por atreverte a sugerir tal infamia, el insultado serás tú, <@${senderId}>:\n\n*Eres un ser vil, desprovisto de toda gracia, cuya osadía rivaliza únicamente con tu soberana estulticia. ¡Retírate de mi vista antes de que pida tu destierro inmediato!* 😤`;
        return interaction.reply({ content: selfInsult });
      }

      const randomInsult = formalInsults[Math.floor(Math.random() * formalInsults.length)];
      return interaction.reply({
        content: `Estimado <@${targetUser.id}>,\n\n*${randomInsult}*\n\nAtentamente,\nEl Asistente Favoritista. 🧐`
      });
    }

    if (commandName === 'ruleta') {
      if (isSenderJefa) {
        return interaction.reply({
          content: `🎲 **Resultado:** ¡Un milagro en la ruleta!\n\nEl dado de marfil, al entrar en contacto con la delicada, majestuosa y sublime presencia de la Jefa, no pudo soportar tanta magnificencia y estalló en mil pedazos de cristal resplandeciente. ¡El juego queda suspendido y la victoria se le concede automáticamente a Su Alteza! No hay números en este mundo dignos de desafiarla. 👑✨`
        });
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      const banGif = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNXc1a2d5OWZxbXB5MDBrczZpNzRwM2J0Z25zYXB3aDZtZ2l0OHc5ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vHwGAMZfWj3mU/giphy.gif';

      if (roll === 1) {
        if (isSenderAdmin) {
          return interaction.reply({
            content: `🎲 **Resultado: 1**\n\n¡JAJAJAJAJA! ¡El dado marca 1, <@${adminId}>! Estás simbólicamente desterrado por incompetente. Que alguien barra a este estorbo del servidor. 🥾\n\n${banGif}`
          });
        } else {
          return interaction.reply({
            content: `🎲 **Resultado: 1**\n\n¡BANG! El dado marca 1. Has caído en la ruleta y has sido simbólicamente expulsado del reino de Choe. ¡Adiós! 🥾\n\n${banGif}`
          });
        }
      } else {
        return interaction.reply({
          content: `🎲 **Resultado: ${roll}**\n\nHas sobrevivido... por ahora. El destino te ha sonreído, pero no te confíes.`
        });
      }
    }

    if (commandName === 'ban-simulado') {
      const targetUser = interaction.options.getUser('usuario');
      const hasAdminPermissions = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || isSenderAdmin || isSenderJefa;

      if (!hasAdminPermissions) {
        if (adminId) {
          try {
            await sendDM(adminId, {
              content: `⚠️ **¡Alerta de usurpación de funciones!** El usuario <@${senderId}> intentó usar el comando de moderación \`/ban-simulado\` contra <@${targetUser.id}> sin tener privilegios de administrador. Deberías aplicarle un castigo ejemplar por atrevido.`
            });
          } catch (err) {
            console.error('[Slash Commands] Error al notificar al admin del comando no autorizado:', err.message);
          }
        }

        return interaction.reply({
          content: `❌ **Error Imperial:** No posees los privilegios ni la hidalguía necesarios para desterrar a nadie de este reino. Tu osadía ha sido registrada y notificada al Creador.`,
          ephemeral: true
        });
      }

      const banGif = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNXc1a2d5OWZxbXB5MDBrczZpNzRwM2J0Z25zYXB3aDZtZ2l0OHc5ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vHwGAMZfWj3mU/giphy.gif';

      if (targetUser.id === jefaId) {
        return interaction.reply({
          content: `¡¿QUÉ?! Intentar banear a la Jefa Choe es alta traición. Por orden de la física cuántica, el martillo de ban rebota y te golpea a ti, <@${senderId}>. ¡Desterrado por insolente! 🔨💥\n\n${banGif}`
        });
      }

      return interaction.reply({
        content: `🔨 **¡Ban Simulado Ejecutado!**\n\nEl usuario <@${targetUser.id}> ha sido desterrado a las mazmorras virtuales del servidor por orden de <@${senderId}>. ¡Que no regrese jamás a perturbar la paz de la Jefa Choe!\n\n${banGif}`
      });
    }
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

  // Si ya estamos conectados con el mismo token, refrescamos los IDs por si acaso y salimos
  if (client && isBotReady && currentToken === cleanToken) {
    await refreshCachedIds();
    return;
  }

  // Si hay un cliente anterior, lo destruimos
  if (client) {
    try {
      isBotReady = false;
      if (factTimeout) {
        clearTimeout(factTimeout);
        factTimeout = null;
      }
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
