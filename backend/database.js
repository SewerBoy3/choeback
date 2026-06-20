import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

dotenv.config();

const db = {};

async function seedData() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashChoe = await bcrypt.hash('calipanzona', salt);
      const hashFer = await bcrypt.hash('Causa2022', salt);

      await prisma.user.createMany({
        data: [
          { username: 'choe', password: hashChoe, role: 'user', points: 0 },
          { username: 'fer', password: hashFer, role: 'admin', points: 0 }
        ]
      });
      console.log('🌱 Prisma: Usuarios choe y fer sembrados con éxito.');
    }

    const settingsCount = await prisma.setting.count();
    if (settingsCount === 0) {
      const settingsDefecto = {
        anniversary_date: process.env.ANNIVERSARY_DATE || '2023-09-15',
        discord_webhook: process.env.DISCORD_WEBHOOK_URL || '',
        telegram_token: process.env.TELEGRAM_BOT_TOKEN || '',
        telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
        admin_password: 'Causa2022',
        timeline_greeting: '¡Bienvenido a nuestro álbum especial de recuerdos! ♡',
        anniversary_message: '¡Feliz Aniversario mi amor!',
        default_song_url: '',
        music_playlist: '',
        music_autoplay: 'false',
        dino_speed_multiplier: '1.0',
        tetris_start_level: '1',
        dino_coin_divisor: '50',
        tetris_coin_divisor: '300',
        coin_daily_bonus: '10',
        discord_user_id_fer: '',
        discord_user_id_zoe: '',
        discord_bot_token: ''
      };

      const settingsData = Object.entries(settingsDefecto).map(([key, value]) => ({
        key,
        value: String(value)
      }));

      await prisma.setting.createMany({
        data: settingsData
      });
      console.log('🌱 Prisma: Configuraciones por defecto sembradas.');
    }

    const couponsCount = await prisma.vale.count();
    if (couponsCount === 0) {
      const cuponesSemilla = [
        {
          title: '🎟️ Vale por un Desayuno Completo en la Cama',
          description: 'Válido para un domingo por la mañana. Incluye café, medialunas, tostadas con palta y jugo de naranja recién exprimido con mucho amor.',
          price: 25
        },
        {
          title: '🎬 Noche de Películas y Mimos Sin Límites',
          description: 'Tú eliges las películas, yo pongo el pochoclo, tu bebida favorita y masajes en la espalda durante toda la función.',
          price: 35
        },
        {
          title: '✈️ Vale por una Escapada de Fin de Semana',
          description: 'Nos desconectamos de la rutina. Destino sorpresa a elegir juntos para descansar, comer rico y sacar fotos hermosas.',
          price: 50
        }
      ];

      await prisma.vale.createMany({
        data: cuponesSemilla
      });
      console.log('🌱 Prisma: Cupones semilla insertados.');
    }

    const valesLegacy = await prisma.vale.findMany({ where: { price: 50 } });
    if (valesLegacy.length > 0) {
      const priceByTitle = {
        '🎟️ Vale por un Desayuno Completo en la Cama': 25,
        '🎬 Noche de Películas y Mimos Sin Límites': 35,
        '✈️ Vale por una Escapada de Fin de Semana': 50,
      };
      for (const vale of valesLegacy) {
        const newPrice = priceByTitle[vale.title];
        if (newPrice && newPrice !== 50) {
          await prisma.vale.update({ where: { id: vale.id }, data: { price: newPrice } });
        }
      }
    }

    const economyKeys = {
      dino_coin_divisor: '50',
      tetris_coin_divisor: '300',
      coin_daily_bonus: '10',
      discord_user_id_fer: '',
      discord_user_id_zoe: '',
      discord_bot_token: '',
    };
    for (const [key, value] of Object.entries(economyKeys)) {
      const exists = await prisma.setting.findUnique({ where: { key } });
      if (!exists) {
        await prisma.setting.create({ data: { key, value } });
      } else if (['dino_coin_divisor', 'tetris_coin_divisor', 'coin_daily_bonus'].includes(key)) {
        await prisma.setting.update({ where: { key }, data: { value } });
      }
    }

    for (const [key, value] of Object.entries({ music_playlist: '' })) {
      const exists = await prisma.setting.findUnique({ where: { key } });
      if (!exists) await prisma.setting.create({ data: { key, value } });
    }

    const songCount = await prisma.cancion.count();
    if (songCount === 0) {
      await prisma.cancion.create({
        data: {
          title: 'Bella Melodía Acústica',
          artist: 'SoundHelix',
          source_type: 'audio_link',
          audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          cover_url: 'https://images.unsplash.com/photo-1511379938541-c1f69419868d?auto=format&fit=crop&w=400&q=80',
          lyrics: 'Esta es nuestra canción de bienvenida ♡\nConfigura tus propias canciones desde el panel Admin.',
          sections: JSON.stringify([
            {
              id: 'intro',
              label: 'Intro',
              startSec: 0,
              endSec: 60,
              lyrics: 'Esta es nuestra canción de bienvenida ♡',
              bass: {
                G: '-----------------------------------',
                D: '------5--5--------7--7-----------',
                A: '---3--------3--5--------5--------',
                E: '----------------------------3--3-',
              },
            },
          ]),
          sort_order: 0,
          is_published: true,
        },
      });
      console.log('🌱 Prisma: Canción de ejemplo sembrada.');
    }
  } catch (error) {
    console.error('❌ Error al sembrar base de datos con Prisma:', error);
  }
}

if (process.env.FORCE_SEED === '1') {
  console.log('🌱 FORCE_SEED=1 detectado: ejecutando siembra...');
  seedData();
} else {
  console.log('ℹ️  Siembra automática desactivada. Usar FORCE_SEED=1 para sembrar.');
}

export default db;
