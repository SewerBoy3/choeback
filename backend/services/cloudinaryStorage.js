import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

function validarConfig() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Faltan variables de entorno de Cloudinary.');
  }
}

function obtenerFolder() {
  return process.env.CLOUDINARY_UPLOAD_FOLDER?.trim() || 'choeback';
}

function obtenerResourceType(mimeType) {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('audio/')) return 'video';
  return 'auto';
}

function limpiarNombre(nombre) {
  return nombre.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
}

export async function subirArchivoBuffer({ buffer, fileName, mimeType, prefix = 'archivo' }) {
  validarConfig();

  if (!buffer || !fileName) {
    throw new Error('No se recibieron datos válidos para subir el archivo.');
  }

  const folder = obtenerFolder();
  const resourceType = obtenerResourceType(mimeType);
  const nameBase = limpiarNombre(fileName.replace(/\.[^.]+$/, ''));
  const publicId = `${prefix}-${Date.now()}-${nameBase}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type
        });
      }
    );

    stream.end(buffer);
  });
}