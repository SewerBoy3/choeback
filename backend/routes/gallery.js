import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import prisma from "../prisma.js";
import { subirArchivoBuffer } from "../services/cloudinaryStorage.js";
import { notifyZoe } from "../services/notificationService.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "choe-os-secret-key-16bit";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Middleware Admin ──────────────────────────────────────────
async function verificarAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === "admin") {
        req.user = decoded;
        return next();
      }
    } catch (err) {
      // sigo con la contraseña vieja
    }
  }

  const contrasenaAdmin = req.headers["x-admin-password"];
  if (contrasenaAdmin) {
    try {
      const row = await prisma.setting.findUnique({
        where: { key: "admin_password" },
      });
      const adminPass = row ? row.value : "Causa2022";
      if (
        contrasenaAdmin === adminPass ||
        contrasenaAdmin === "Causa2022" ||
        contrasenaAdmin === "choe-admin"
      ) {
        return next();
      }
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Error de base de datos en autenticación." });
    }
  }

  return res.status(401).json({ error: "Acceso no autorizado." });
}

router.get("/", async (req, res) => {
  try {
    const fotos = await prisma.foto.findMany({
      where: { is_published: true },
      orderBy: { sort_order: "asc" },
    });
    res.json(fotos);
  } catch (err) {
    console.error("Error al obtener galería:", err);
    res.status(500).json({ error: "Error al obtener galería." });
  }
});

router.get("/all", verificarAdmin, async (req, res) => {
  try {
    const fotos = await prisma.foto.findMany({
      orderBy: { sort_order: "asc" },
    });
    res.json(fotos);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener galería." });
  }
});

router.post("/", verificarAdmin, upload.single("image"), async (req, res) => {
  console.log("POST /api/gallery - Body:", req.body);
  console.log("POST /api/gallery - File:", req.file ? "Present" : "None");

  const { image_url, caption, sort_order, is_published } = req.body;

  let finalImageUrl = image_url?.trim() || "";

  if (req.file) {
    try {
      const uploaded = await subirArchivoBuffer({
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        prefix: 'gallery'
      });
      finalImageUrl = uploaded.secureUrl;
    } catch (err) {
      console.error("Error subiendo imagen a Cloudinary:", err);
      return res.status(500).json({ error: "Error al subir la imagen." });
    }
  }

  if (!finalImageUrl) {
    return res
      .status(400)
      .json({ error: "La URL de la imagen o el archivo son obligatorios." });
  }

  try {
    const foto = await prisma.foto.create({
      data: {
        image_url: finalImageUrl,
        caption: (caption || "").trim(),
        sort_order: parseInt(sort_order) || 0,
        is_published: is_published !== false,
      },
    });
    console.log("Foto creada exitosamente:", foto.id);

    if (foto.is_published) {
      notifyZoe(
        `📸 Nueva Foto en la Galería`,
        `Fer ha subido una nueva foto a la galería:\n_"${foto.caption || 'Sin descripción'}"_ 🖼️`,
        0xF472B6
      ).catch(err => console.error("Error al notificar nueva foto a Zoe:", err.message));
    }

    res.json({ success: true, foto });
  } catch (err) {
    console.error("Error al crear foto:", err);
    res.status(500).json({ error: "Error al crear foto." });
  }
});

/**
 * PUT /api/gallery/:id  (admin — actualizar foto)
 */
router.put("/:id", verificarAdmin, upload.single("image"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  const { image_url, caption, sort_order, is_published } = req.body;

  try {
    const existing = await prisma.foto.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ error: "Foto no encontrada." });

    let finalImageUrl = existing.image_url;

    if (req.file) {
      try {
        const uploaded = await subirArchivoBuffer({
          buffer: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          prefix: 'gallery'
        });
        finalImageUrl = uploaded.secureUrl;
      } catch (err) {
        console.error("Error subiendo imagen a Cloudinary:", err);
        return res.status(500).json({ error: "Error al subir la imagen." });
      }
    } else if (image_url?.trim()) {
      finalImageUrl = image_url.trim();
    }

    const foto = await prisma.foto.update({
      where: { id },
      data: {
        image_url: finalImageUrl,
        caption: caption !== undefined ? caption.trim() : existing.caption,
        sort_order:
          sort_order !== undefined ? parseInt(sort_order) : existing.sort_order,
        is_published:
          is_published !== undefined ? !!is_published : existing.is_published,
      },
    });

    if (!existing.is_published && foto.is_published) {
      notifyZoe(
        `📸 Nueva Foto en la Galería`,
        `Fer ha publicado una nueva foto en la galería:\n_"${foto.caption || 'Sin descripción'}"_ 🖼️`,
        0xF472B6
      ).catch(err => console.error("Error al notificar foto publicada a Zoe:", err.message));
    }

    res.json({ success: true, foto });
  } catch (err) {
    console.error("Error al actualizar foto:", err);
    res.status(500).json({ error: "Error al actualizar foto." });
  }
});

/**
 * DELETE /api/gallery/:id  (admin — eliminar foto)
 */
router.delete("/:id", verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  try {
    await prisma.foto.delete({ where: { id } });
    res.json({ success: true, message: "Foto eliminada." });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar foto." });
  }
});

router.get("/cartas", async (req, res) => {
  try {
    const cartas = await prisma.carta.findMany({
      where: { is_published: true },
      orderBy: { created_at: "desc" },
    });
    res.json(cartas);
  } catch (err) {
    console.error("Error al obtener cartas:", err);
    res.status(500).json({ error: "Error al obtener cartas." });
  }
});

router.get("/cartas/all", verificarAdmin, async (req, res) => {
  try {
    const cartas = await prisma.carta.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(cartas);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener cartas." });
  }
});

router.post("/cartas", verificarAdmin, async (req, res) => {
  const { title, content, is_published, polaroid_image } = req.body;

  if (!title || !content) {
    return res
      .status(400)
      .json({ error: "Título y contenido son obligatorios." });
  }

  try {
    const carta = await prisma.carta.create({
      data: {
        title: title.trim(),
        content: content,
        is_published: is_published !== false,
        polaroid_image: polaroid_image || null,
      },
    });

    if (carta.is_published) {
      notifyZoe(
        `📖 Nueva Carta en el Poemario`,
        `Fer ha escrito un nuevo poema o carta:\n**${carta.title}**\n\n¡Entra a leerlo al Poemario! 💖`,
        0xF472B6
      ).catch(err => console.error("Error al notificar nueva carta a Zoe:", err.message));
    }

    res.json({ success: true, carta });
  } catch (err) {
    console.error("Error al crear carta:", err);
    res.status(500).json({ error: "Error al crear carta." });
  }
});

/**
 * PUT /api/gallery/cartas/:id  (admin — actualizar carta)
 */
router.put("/cartas/:id", verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  const { title, content, is_published, polaroid_image } = req.body;

  try {
    const existing = await prisma.carta.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ error: "Carta no encontrada." });

    const carta = await prisma.carta.update({
      where: { id },
      data: {
        title: title !== undefined ? title.trim() : existing.title,
        content: content !== undefined ? content : existing.content,
        is_published:
          is_published !== undefined ? !!is_published : existing.is_published,
        polaroid_image:
          polaroid_image !== undefined
            ? polaroid_image
            : existing.polaroid_image,
      },
    });

    if (!existing.is_published && carta.is_published) {
      notifyZoe(
        `📖 Nueva Carta en el Poemario`,
        `Fer ha publicado una carta o poema especial:\n**${carta.title}**\n\n¡Entra a leerlo al Poemario! 💖`,
        0xF472B6
      ).catch(err => console.error("Error al notificar carta publicada a Zoe:", err.message));
    }

    res.json({ success: true, carta });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar carta." });
  }
});

/**
 * DELETE /api/gallery/cartas/:id  (admin — eliminar carta)
 */
router.delete("/cartas/:id", verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  try {
    await prisma.carta.delete({ where: { id } });
    res.json({ success: true, message: "Carta eliminada." });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar carta." });
  }
});

export default router;
