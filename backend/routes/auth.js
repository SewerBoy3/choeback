import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'choe-os-secret-key-16bit';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  const usuarioLimpio = username.trim().toLowerCase();
  const contrasenaLimpia = password.trim();

  try {
    const user = await prisma.user.findUnique({
      where: { username: usuarioLimpio }
    });

    if (!user) {
      return res.status(401).json({ error: 'ERROR: ACCESO DENEGADO' });
    }

    const contrasenaValida = await bcrypt.compare(contrasenaLimpia, user.password);
    if (!contrasenaValida) {
      return res.status(401).json({ error: 'ERROR: ACCESO DENEGADO' });
    }

    // Generar token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        points: user.points
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

// GET /api/auth/me (Valida el token actual y retorna datos frescos del usuario)
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no provisto.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        points: user.points
      }
    });
  } catch (err) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
  }
});

export default router;
