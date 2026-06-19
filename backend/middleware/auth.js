import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'choe-os-secret-key-16bit';

export function verificarUsuario(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere iniciar sesión.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Sesión inválida o vencida. Inicia sesión de nuevo.' });
  }
}
