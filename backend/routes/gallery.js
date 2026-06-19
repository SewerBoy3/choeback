import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import prisma from "../prisma.js";
import { uploadToDrive } from "../services/driveService.js";

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
      /* caer al fallback */
    }
  }

  const password = req.headers["x-admin-password"];
  if (password) {
    try {
      const row = await prisma.setting.findUnique({
        where: { key: "admin_password" },
      });
      const adminPass = row ? row.value : "Causa2022";
      if (
        password === adminPass ||
        password === "Causa2022" ||
        password === "choe-admin"
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

async function getGalleryFolderId() {
  const row = await prisma.setting.findUnique({
    where: { key: "drive_folder_id" },
  });

  return row?.value?.trim() || process.env.GOOGLE_DRIVE_FOLDER_ID || "";
}

// ══════════════════════════════════════════════════════════════
//  FOTOS — GALERÍA
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/gallery
 * Fotos publicadas, ordenadas por sort_order
 */
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

/**
 * GET /api/gallery/all  (admin — incluye no publicadas)
 */
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

/**
 * POST /api/gallery  (admin — crear foto)
 */
router.post("/", verificarAdmin, upload.single("image"), async (req, res) => {
  console.log("POST /api/gallery - Body:", req.body);
  console.log("POST /api/gallery - File:", req.file ? "Present" : "None");

  const { image_url, caption, sort_order, is_published } = req.body;

  let finalImageUrl = image_url?.trim() || "";

  // Si se subió un archivo, subirlo a Drive
  if (req.file) {
    try {
      console.log("Subiendo archivo a Drive:", req.file.originalname);
      const folderId = await getGalleryFolderId();
      const uploaded = await uploadToDrive(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        folderId,
      );
      finalImageUrl = uploaded.url;
      console.log("Archivo subido exitosamente:", finalImageUrl);
    } catch (err) {
      console.error("Error subiendo imagen a Drive:", err);
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

    // Si se subió un archivo, subirlo a Drive
    if (req.file) {
      try {
        const folderId = await getGalleryFolderId();
        const uploaded = await uploadToDrive(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          folderId,
        );
        finalImageUrl = uploaded.url;
      } catch (err) {
        console.error("Error subiendo imagen a Drive:", err);
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

// ══════════════════════════════════════════════════════════════
//  CARTAS — POEMARIO
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/gallery/cartas
 * Cartas publicadas, ordenadas por fecha de creación descendente
 */
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

/**
 * GET /api/gallery/cartas/all  (admin — todas)
 */
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

/**
 * POST /api/gallery/cartas  (admin — crear carta)
 */
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
