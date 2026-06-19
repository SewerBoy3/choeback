import express from 'express';
import { getDriveFiles } from '../services/driveService.js';
import prisma from '../prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

router.get('/files', async (req, res) => {
  try {
    const filaConfiguracion = await prisma.setting.findUnique({
      where: { key: 'drive_folder_id' }
    });
    
    let folderId = req.query.folderId;
    
    if (!folderId) {
      folderId = filaConfiguracion?.value?.trim() || process.env.GOOGLE_DRIVE_FOLDER_ID;
    }

    console.log(`Buscando archivos en la carpeta de Google Drive ID: "${folderId || 'Raíz (No configurada)'}"`);
    
    try {
      const archivos = await getDriveFiles(folderId);
      res.json(archivos);
    } catch (error) {
      console.error('Error al listar archivos de Google Drive:', error.message);
      res.status(500).json({ error: 'Error al consultar archivos en Google Drive' });
    }
  } catch (error) {
    console.error('Error en el endpoint /api/drive/files:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
