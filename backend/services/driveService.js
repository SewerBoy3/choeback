import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'music');

let driveReadClient = null;
let driveWriteClient = null;

function getAuth(scopes) {
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      let credsRaw = process.env.GOOGLE_CREDENTIALS;
      // Si el usuario lo pegó en base64 para evitar problemas de formato
      if (!credsRaw.trim().startsWith('{')) {
        credsRaw = Buffer.from(credsRaw, 'base64').toString('utf-8');
      }
      const credentials = JSON.parse(credsRaw);
      return new google.auth.GoogleAuth({ credentials, scopes });
    } catch (e) {
      console.error('❌ Error parseando GOOGLE_CREDENTIALS desde env:', e.message);
    }
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  return new google.auth.GoogleAuth({ keyFile: CREDENTIALS_PATH, scopes });
}

function obtenerClienteDrive() {
  if (driveReadClient) return driveReadClient;

  const auth = getAuth(['https://www.googleapis.com/auth/drive.readonly']);
  if (!auth) {
    console.warn(`⚠️ Google Drive: sin credentials.json — modo local/mock.`);
    return null;
  }

  try {
    driveReadClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive (lectura) inicializado.');
    return driveReadClient;
  } catch (error) {
    console.error('❌ Error Drive lectura:', error.message);
    return null;
  }
}

function obtenerClienteDriveEscritura() {
  if (driveWriteClient) return driveWriteClient;

  const auth = getAuth(['https://www.googleapis.com/auth/drive.file']);
  if (!auth) return null;

  try {
    driveWriteClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive (escritura) inicializado.');
    return driveWriteClient;
  } catch (error) {
    console.error('❌ Error Drive escritura:', error.message);
    return null;
  }
}

function guardarLocal(buffer, fileName) {
  if (!buffer || !fileName) {
    throw new Error('No se recibió el archivo o el nombre de archivo es inválido.');
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safeName = `${Date.now()}-${fileName.replace(/[^\w.\-]/g, '_')}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(filePath, buffer);
  return {
    id: `local-${safeName}`,
    url: `/uploads/music/${safeName}`,
    local: true,
  };
}

/**
 * Sube un archivo a Google Drive o al disco local si no hay credenciales.
 */
export async function uploadToDrive(buffer, fileName, mimeType, folderId) {
  if (!buffer || !fileName) {
    throw new Error('No se recibieron datos de archivo válidos para subir.');
  }
  const drive = obtenerClienteDriveEscritura();

  if (!drive) {
    console.log('📁 Guardando archivo localmente:', fileName);
    return guardarLocal(buffer, fileName);
  }

  try {
    const fileMetadata = {
      name: fileName,
      ...(folderId ? { parents: [folderId] } : {}),
    };

    const response = await drive.files.create({
      ...(folderId ? { supportsAllDrives: true } : {}),
      requestBody: fileMetadata,
      media: { mimeType, body: bufferToStream(buffer) },
      fields: 'id, name, webContentLink, webViewLink',
    });

    const file = response.data;
    const directUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

    return {
      id: file.id,
      url: file.webContentLink || directUrl,
      local: false,
    };
  } catch (error) {
    console.error('❌ Error subiendo a Drive, fallback local:', error.message);
    return guardarLocal(buffer, fileName);
  }
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function getDriveFiles(folderId) {
  const drive = obtenerClienteDrive();

  if (!drive) {
    console.log('🔮 Retornando archivos simulados (Mock Data).');
    return [
      {
        id: 'mock-file-image-1',
        name: 'foto-aniversario-1.jpg',
        mimeType: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&q=80&w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&q=80&w=200',
      },
      {
        id: 'mock-file-image-2',
        name: 'nuestra-cancion.mp3',
        mimeType: 'audio/mpeg',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        thumbnailUrl: null,
      },
      {
        id: 'mock-file-image-3',
        name: 'recuerdo-vacaciones.jpg',
        mimeType: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=200',
      },
    ];
  }

  try {
    const q = folderId ? `'${folderId}' in parents and trashed = false` : 'trashed = false';

    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, webContentLink, webViewLink, thumbnailLink)',
      pageSize: 50,
    });

    const files = response.data.files || [];

    return files.map((file) => {
      const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        url: file.webContentLink || directDownloadUrl,
        thumbnailUrl: file.thumbnailLink || null,
        webViewLink: file.webViewLink || null,
      };
    });
  } catch (error) {
    console.error(`❌ Error listando Drive "${folderId}":`, error.message);
    throw error;
  }
}
