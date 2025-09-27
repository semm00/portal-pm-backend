"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../generated/prisma");
const supabaseClient_1 = require("../services/supabaseClient");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const supabaseAdmin = (0, supabaseClient_1.createSupabaseAdminClient)();
const NEWS_BUCKET = process.env.SUPABASE_NEWS_BUCKET ?? "news";
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});
const sanitizeString = (value) => typeof value === "string" ? value.trim() : "";
const extractStoragePath = (publicUrl) => {
    if (!publicUrl) {
        return null;
    }
    try {
        const url = new URL(publicUrl);
        const marker = `/storage/v1/object/public/${NEWS_BUCKET}/`;
        const idx = url.pathname.indexOf(marker);
        if (idx === -1) {
            return null;
        }
        const pathPart = url.pathname.slice(idx + marker.length);
        return decodeURIComponent(pathPart);
    }
    catch (error) {
        console.warn("Failed to parse storage path from URL", error);
        return null;
    }
};
// Listar notícias
router.get("/", async (_req, res) => {
    try {
        const news = await prisma.news.findMany({
            orderBy: { createdAt: "desc" },
        });
        res.json({ success: true, news });
    }
    catch (error) {
        console.error("Failed to list news", error);
        res.status(500).json({
            success: false,
            message: "Não foi possível carregar as notícias.",
        });
    }
});
// Criar notícia (com upload de imagem)
router.post("/", upload.single("image"), async (req, res) => {
    try {
        const title = sanitizeString(req.body?.title);
        const source = sanitizeString(req.body?.source);
        const providedUrl = sanitizeString(req.body?.url);
        const file = req.file;
        if (!title || !source || !providedUrl) {
            return res.status(400).json({
                success: false,
                message: "Título, fonte e link são obrigatórios.",
            });
        }
        if (!file) {
            return res
                .status(400)
                .json({ success: false, message: "Imagem obrigatória." });
        }
        if (!file.mimetype.startsWith("image/")) {
            return res.status(400).json({
                success: false,
                message: "Apenas arquivos de imagem são permitidos.",
            });
        }
        const ext = node_path_1.default.extname(file.originalname || "").toLowerCase() || ".png";
        const objectPath = `news/${(0, node_crypto_1.randomUUID)()}${ext}`;
        const storage = supabaseAdmin.storage.from(NEWS_BUCKET);
        const { error: uploadError } = await storage.upload(objectPath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });
        if (uploadError) {
            console.error("Failed to upload news image", uploadError);
            return res
                .status(500)
                .json({ success: false, message: "Falha ao enviar a imagem." });
        }
        const { data: publicUrlData } = storage.getPublicUrl(objectPath);
        const imageUrl = publicUrlData.publicUrl;
        const news = await prisma.news.create({
            data: {
                imageUrl,
                title,
                source,
                url: providedUrl,
            },
        });
        res.status(201).json({ success: true, news });
    }
    catch (err) {
        console.error("Failed to create news", err);
        res.status(500).json({ success: false, message: "Erro ao criar notícia." });
    }
});
// Remover notícia
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.news.findUnique({ where: { id } });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Notícia não encontrada." });
        }
        const storagePath = extractStoragePath(existing.imageUrl);
        const storage = supabaseAdmin.storage.from(NEWS_BUCKET);
        if (storagePath) {
            const { error: removeError } = await storage.remove([storagePath]);
            if (removeError) {
                console.error("Failed to remove news image", removeError);
            }
        }
        await prisma.news.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (err) {
        console.error("Failed to delete news", err);
        res
            .status(500)
            .json({ success: false, message: "Erro ao remover notícia." });
    }
});
exports.default = router;
