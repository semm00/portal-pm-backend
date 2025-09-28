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
const requireAuth_1 = __importDefault(require("../middlewares/requireAuth"));
const requireAdminSecret_1 = __importDefault(require("../middlewares/requireAdminSecret"));
const supabaseClient_1 = require("../services/supabaseClient");
const userHelpers_1 = require("../lib/userHelpers");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const supabaseAdmin = (0, supabaseClient_1.createSupabaseAdminClient)();
const POSTS_BUCKET = process.env.SUPABASE_POSTS_BUCKET ?? "posts";
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        files: 6,
        fileSize: 15 * 1024 * 1024,
    },
});
const isAllowedMimeType = (mime) => {
    if (!mime)
        return false;
    return mime.startsWith("image/") || mime.startsWith("video/");
};
const sanitizeString = (value) => {
    if (typeof value === "string") {
        return value.trim();
    }
    if (Array.isArray(value)) {
        const firstString = value.find((item) => typeof item === "string");
        return typeof firstString === "string" ? firstString.trim() : "";
    }
    return "";
};
const parseBoolean = (value) => {
    if (typeof value === "boolean")
        return value;
    if (Array.isArray(value)) {
        const first = value[0];
        return parseBoolean(first);
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return ["1", "true", "yes", "on"].includes(normalized);
    }
    return false;
};
const parseDateTime = (value) => {
    if (typeof value === "string" || value instanceof Date) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }
    return null;
};
const normalizeStatus = (value) => {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === "ALL")
        return "ALL";
    if (normalized === prisma_1.PostStatus.PENDING)
        return prisma_1.PostStatus.PENDING;
    if (normalized === prisma_1.PostStatus.APPROVED)
        return prisma_1.PostStatus.APPROVED;
    if (normalized === prisma_1.PostStatus.REJECTED)
        return prisma_1.PostStatus.REJECTED;
    return null;
};
const mapPostResponse = (post) => ({
    id: post.id,
    authorId: post.authorId,
    authorName: post.authorName,
    authorUsername: post.author?.username || null,
    authorAvatarUrl: post.authorAvatarUrl,
    content: post.content,
    category: post.category,
    location: post.location,
    eventDate: post.eventDate,
    poll: post.pollQuestion
        ? {
            question: post.pollQuestion,
            options: Array.isArray(post.pollOptions) ? post.pollOptions : [],
        }
        : null,
    alertUsers: post.alertUsers,
    likes: post.likes,
    shares: post.shares,
    status: post.status,
    rejectedReason: post.rejectedReason,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    approvedAt: post.approvedAt,
    media: post.media?.map((media) => ({
        id: media.id,
        url: media.url,
        mimeType: media.mimeType,
    })) ?? [],
    reportsCount: post._count?.reports ?? 0,
    reports: post.reports?.map((report) => ({
        id: report.id,
        reason: report.reason,
        createdAt: report.createdAt,
    })),
});
const extractMetadataString = (metadata, keys) => {
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return null;
};
const ensureAuthorUser = async (authUser) => {
    if (!authUser)
        return null;
    const metadata = (authUser.user_metadata ?? {});
    const email = authUser.email?.toLowerCase?.() ?? null;
    const existing = await prisma.user.findFirst({
        where: {
            OR: [{ supabaseId: authUser.id }, ...(email ? [{ email }] : [])],
        },
    });
    const fullName = extractMetadataString(metadata, [
        "fullName",
        "name",
        "full_name",
        "given_name",
    ]) ||
        (email ? email.split("@")[0] : null) ||
        "Morador";
    const avatarUrl = extractMetadataString(metadata, ["avatarUrl", "avatar_url", "picture"]) ||
        null;
    if (existing) {
        const needsUpdate = existing.supabaseId !== authUser.id ||
            (avatarUrl && existing.avatarUrl !== avatarUrl) ||
            (fullName && existing.fullName !== fullName) ||
            (email && existing.email !== email);
        if (needsUpdate) {
            return prisma.user.update({
                where: { id: existing.id },
                data: {
                    fullName,
                    avatarUrl: avatarUrl ?? undefined,
                    email: email ?? existing.email,
                    emailVerified: Boolean(authUser.email_confirmed_at),
                    supabaseId: authUser.id,
                },
            });
        }
        if (!existing.supabaseId) {
            return prisma.user.update({
                where: { id: existing.id },
                data: { supabaseId: authUser.id },
            });
        }
        return existing;
    }
    const desiredUsername = extractMetadataString(metadata, ["username", "preferred_username"]) ||
        (email ? email.split("@")[0] : `usuario-${authUser.id.slice(0, 8)}`);
    const username = await (0, userHelpers_1.ensureUniqueUsername)(prisma, desiredUsername);
    return prisma.user.create({
        data: {
            fullName,
            username,
            email: email ?? `${authUser.id}@portal.pm`,
            avatarUrl: avatarUrl ?? undefined,
            emailVerified: Boolean(authUser.email_confirmed_at),
            supabaseId: authUser.id,
        },
    });
};
const extractPollOptions = (body) => {
    const collected = new Map();
    const directOptions = body.pollOptions;
    const hasDirectArray = Array.isArray(directOptions);
    const hasDirectValue = typeof directOptions === "string";
    if (hasDirectArray) {
        directOptions.forEach((item, index) => {
            const sanitized = sanitizeString(item);
            if (sanitized) {
                collected.set(index, sanitized);
            }
        });
    }
    else if (hasDirectValue) {
        try {
            const parsed = JSON.parse(directOptions);
            if (Array.isArray(parsed)) {
                parsed.forEach((item, index) => {
                    const sanitized = sanitizeString(item);
                    if (sanitized) {
                        collected.set(index, sanitized);
                    }
                });
            }
        }
        catch (error) {
            const sanitized = sanitizeString(directOptions);
            if (sanitized) {
                collected.set(0, sanitized);
            }
        }
    }
    Object.entries(body).forEach(([key, value]) => {
        const match = key.match(/^pollOptions(?:\[(\d+)\])?$/);
        if (!match)
            return;
        if (!match[1] && (hasDirectArray || hasDirectValue)) {
            // Já tratamos o campo "pollOptions" acima.
            return;
        }
        const index = match[1] ? Number.parseInt(match[1], 10) : collected.size;
        const sanitized = sanitizeString(value);
        if (sanitized) {
            collected.set(Number.isNaN(index) ? collected.size : index, sanitized);
        }
    });
    return Array.from(collected.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, text], position) => ({
        id: `opt${position + 1}`,
        text,
        votes: 0,
    }));
};
const uploadMediaFiles = async (files, ownerId) => {
    if (!files.length) {
        return [];
    }
    const storage = supabaseAdmin.storage.from(POSTS_BUCKET);
    const uploaded = [];
    try {
        for (const file of files) {
            if (!isAllowedMimeType(file.mimetype)) {
                throw new Error("Apenas arquivos de imagem ou vídeo são permitidos.");
            }
            const ext = node_path_1.default.extname(file.originalname || "").toLowerCase();
            const safeExt = ext || (file.mimetype.startsWith("image/") ? ".jpg" : ".mp4");
            const objectPath = `posts/${ownerId}/${(0, node_crypto_1.randomUUID)()}${safeExt}`;
            const { error: uploadError } = await storage.upload(objectPath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });
            if (uploadError) {
                throw uploadError;
            }
            const { data: publicData } = storage.getPublicUrl(objectPath);
            uploaded.push({
                url: publicData.publicUrl,
                storagePath: objectPath,
                mimeType: file.mimetype,
            });
        }
        return uploaded;
    }
    catch (error) {
        if (uploaded.length) {
            await storage
                .remove(uploaded.map((item) => item.storagePath))
                .catch((cleanupError) => {
                console.warn("Falha ao remover mídias após erro", cleanupError);
            });
        }
        throw error;
    }
};
router.get("/", async (req, res) => {
    try {
        const statusParam = normalizeStatus(req.query.status);
        const alertOnly = parseBoolean(req.query.alertOnly);
        const includeReports = parseBoolean(req.query.includeReports);
        const hasReports = parseBoolean(req.query.hasReports);
        let take;
        const limitRaw = req.query.limit;
        if (typeof limitRaw === "string") {
            const parsed = Number.parseInt(limitRaw, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                take = Math.min(parsed, 100);
            }
        }
        const where = {};
        if (statusParam && statusParam !== "ALL") {
            where.status = statusParam;
        }
        else if (!statusParam) {
            where.status = prisma_1.PostStatus.APPROVED;
        }
        if (alertOnly) {
            where.alertUsers = true;
        }
        if (hasReports) {
            where.reports = { some: {} };
        }
        const posts = await prisma.post.findMany({
            where,
            take,
            orderBy: { createdAt: "desc" },
            include: {
                author: true,
                media: true,
                reports: includeReports
                    ? {
                        orderBy: { createdAt: "desc" },
                    }
                    : false,
                _count: {
                    select: { reports: true },
                },
            },
        });
        res.json({
            success: true,
            posts: posts.map((post) => mapPostResponse(post)),
        });
    }
    catch (error) {
        console.error("Failed to list posts", error);
        res.status(500).json({
            success: false,
            message: "Não foi possível carregar os posts.",
        });
    }
});
router.post("/", requireAuth_1.default, upload.array("media", 6), async (req, res) => {
    try {
        const authReq = req;
        const authUser = authReq.authUser;
        if (!authUser) {
            return res.status(401).json({
                success: false,
                message: "Sessão inválida. Faça login novamente.",
            });
        }
        const metadata = (authUser.user_metadata ?? {});
        const content = sanitizeString(req.body?.content);
        const rawCategory = sanitizeString(req.body?.category || "outro");
        const location = sanitizeString(req.body?.location);
        const eventDate = parseDateTime(req.body?.eventDate);
        const alertUsers = parseBoolean(req.body?.alertUsers ?? req.body?.isImportant);
        if (!content) {
            return res.status(400).json({
                success: false,
                message: "Conteúdo é obrigatório.",
            });
        }
        const category = rawCategory === "outro"
            ? sanitizeString(req.body?.customCategory) || "outro"
            : rawCategory;
        if (!category) {
            return res.status(400).json({
                success: false,
                message: "Categoria é obrigatória.",
            });
        }
        const pollQuestion = sanitizeString(req.body?.pollQuestion);
        const pollOptions = extractPollOptions((req.body ?? {}));
        if (pollQuestion && pollOptions.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Informe pelo menos duas opções para a enquete.",
            });
        }
        const files = req.files ?? [];
        const mediaPayload = await uploadMediaFiles(files, authUser.id);
        const authorRecord = await ensureAuthorUser(authUser);
        const authorName = sanitizeString(req.body?.authorName) ||
            extractMetadataString(metadata, ["fullName", "full_name", "name"]) ||
            (authorRecord?.fullName ?? null) ||
            authUser.email ||
            "Morador";
        const authorAvatarUrl = sanitizeString(req.body?.authorAvatarUrl) ||
            extractMetadataString(metadata, ["avatarUrl", "avatar_url", "picture"]) ||
            (authorRecord?.avatarUrl ?? null);
        const post = await prisma.post.create({
            data: {
                authorId: authorRecord?.id ?? null,
                authorName,
                authorAvatarUrl: authorAvatarUrl || null,
                content,
                category,
                location: location || null,
                eventDate: eventDate ?? null,
                pollQuestion: pollQuestion && pollOptions.length >= 2 ? pollQuestion : null,
                pollOptions: pollQuestion && pollOptions.length >= 2 ? pollOptions : undefined,
                alertUsers,
                media: mediaPayload.length
                    ? {
                        create: mediaPayload.map((media) => ({
                            url: media.url,
                            storagePath: media.storagePath,
                            mimeType: media.mimeType,
                        })),
                    }
                    : undefined,
            },
            include: {
                media: true,
                reports: true,
                _count: { select: { reports: true } },
            },
        });
        res.status(201).json({
            success: true,
            message: "Post enviado para aprovação.",
            post: mapPostResponse(post),
        });
    }
    catch (error) {
        console.error("Failed to create post", error);
        const message = error instanceof Error
            ? error.message
            : "Erro ao enviar o post para aprovação.";
        const status = error instanceof Error &&
            error.message === "Apenas arquivos de imagem ou vídeo são permitidos."
            ? 400
            : 500;
        res.status(status).json({
            success: false,
            message,
        });
    }
});
router.patch("/:id/approve", requireAdminSecret_1.default, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.post.findUnique({
            where: { id },
            include: {
                _count: { select: { reports: true } },
                reports: true,
                media: true,
            },
        });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        if (existing.status === prisma_1.PostStatus.APPROVED) {
            return res.json({ success: true, post: mapPostResponse(existing) });
        }
        const updated = await prisma.post.update({
            where: { id },
            data: { status: prisma_1.PostStatus.APPROVED, approvedAt: new Date() },
            include: {
                _count: { select: { reports: true } },
                reports: true,
                media: true,
            },
        });
        res.json({ success: true, post: mapPostResponse(updated) });
    }
    catch (error) {
        console.error("Failed to approve post", error);
        res.status(500).json({ success: false, message: "Erro ao aprovar post." });
    }
});
router.patch("/:id/reject", requireAdminSecret_1.default, async (req, res) => {
    try {
        const { id } = req.params;
        const reason = sanitizeString(req.body?.reason);
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        const updated = await prisma.post.update({
            where: { id },
            data: {
                status: prisma_1.PostStatus.REJECTED,
                rejectedReason: reason || null,
                alertUsers: false,
            },
            include: {
                _count: { select: { reports: true } },
                reports: true,
                media: true,
            },
        });
        res.json({ success: true, post: mapPostResponse(updated) });
    }
    catch (error) {
        console.error("Failed to reject post", error);
        res.status(500).json({ success: false, message: "Erro ao rejeitar post." });
    }
});
router.patch("/:id/alert", requireAdminSecret_1.default, async (req, res) => {
    try {
        const { id } = req.params;
        const alertUsers = parseBoolean(req.body?.alertUsers);
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        const updated = await prisma.post.update({
            where: { id },
            data: { alertUsers, status: existing.status },
            include: {
                _count: { select: { reports: true } },
                reports: true,
                media: true,
            },
        });
        res.json({ success: true, post: mapPostResponse(updated) });
    }
    catch (error) {
        console.error("Failed to update alert flag", error);
        res.status(500).json({
            success: false,
            message: "Erro ao atualizar alerta do post.",
        });
    }
});
router.post("/:id/like", async (req, res) => {
    try {
        const { id } = req.params;
        const action = sanitizeString(req.body?.action).toLowerCase();
        const increment = action === "decrement" ? -1 : 1;
        const updated = await prisma.post.update({
            where: { id },
            data: {
                likes: {
                    increment,
                },
            },
            include: {
                _count: { select: { reports: true } },
                reports: false,
                media: false,
            },
        });
        const likes = Math.max(0, updated.likes);
        if (updated.likes !== likes) {
            await prisma.post.update({ where: { id }, data: { likes } });
        }
        res.json({ success: true, likes });
    }
    catch (error) {
        console.error("Failed to like post", error);
        res.status(500).json({ success: false, message: "Erro ao curtir post." });
    }
});
router.post("/:id/share", async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.post.update({
            where: { id },
            data: {
                shares: {
                    increment: 1,
                },
            },
            include: {
                _count: { select: { reports: true } },
                reports: false,
                media: false,
            },
        });
        res.json({ success: true, shares: updated.shares });
    }
    catch (error) {
        console.error("Failed to share post", error);
        res
            .status(500)
            .json({ success: false, message: "Erro ao compartilhar post." });
    }
});
router.post("/:id/poll/vote", async (req, res) => {
    try {
        const { id } = req.params;
        const { optionId } = req.body;
        if (!optionId) {
            return res
                .status(400)
                .json({ success: false, message: "Informe a opção desejada." });
        }
        const post = await prisma.post.findUnique({
            where: { id },
            select: {
                pollQuestion: true,
                pollOptions: true,
                status: true,
            },
        });
        if (!post) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        if (post.status !== prisma_1.PostStatus.APPROVED) {
            return res.status(400).json({
                success: false,
                message: "Somente enquetes de posts publicados podem receber votos.",
            });
        }
        if (!Array.isArray(post.pollOptions) || !post.pollOptions.length) {
            return res.status(400).json({
                success: false,
                message: "Esta publicação não possui enquete ativa.",
            });
        }
        const updatedOptions = post.pollOptions.map((option) => {
            if (!option || typeof option !== "object")
                return option;
            if (option.id !== optionId)
                return option;
            const currentVotes = Number.isFinite(option.votes)
                ? Number(option.votes)
                : 0;
            return {
                ...option,
                votes: currentVotes + 1,
            };
        });
        const optionExists = updatedOptions.some((option) => option?.id === optionId);
        if (!optionExists) {
            return res.status(404).json({
                success: false,
                message: "Opção da enquete não encontrada.",
            });
        }
        await prisma.post.update({
            where: { id },
            data: {
                pollOptions: updatedOptions,
            },
        });
        return res.json({
            success: true,
            poll: {
                question: post.pollQuestion,
                options: updatedOptions,
            },
        });
    }
    catch (error) {
        console.error("Failed to vote on poll", error);
        res.status(500).json({
            success: false,
            message: "Não foi possível registrar o voto. Tente novamente.",
        });
    }
});
router.delete("/:id", requireAuth_1.default, async (req, res) => {
    try {
        const { id } = req.params;
        const supabaseUserId = req.authUser.id;
        const user = await prisma.user.findUnique({
            where: { supabaseId: supabaseUserId },
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Usuário não encontrado.",
            });
        }
        const post = await prisma.post.findUnique({
            where: { id },
            include: { media: true },
        });
        if (!post) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        // Verificar se o usuário é o autor ou admin
        if (post.authorId !== user.id) {
            return res.status(403).json({
                success: false,
                message: "Você não tem permissão para excluir este post.",
            });
        }
        if (post.status !== prisma_1.PostStatus.APPROVED) {
            return res.status(400).json({
                success: false,
                message: "Apenas posts aprovados podem ser excluídos.",
            });
        }
        const storagePaths = post.media
            .map((item) => item.storagePath)
            .filter((value) => Boolean(value));
        if (storagePaths.length) {
            const storage = supabaseAdmin.storage.from(POSTS_BUCKET);
            const { error: removeError } = await storage.remove(storagePaths);
            if (removeError) {
                console.warn("Falha ao remover mídias antes da exclusão", removeError);
            }
        }
        await prisma.post.delete({ where: { id } });
        res.json({ success: true, message: "Post excluído com sucesso." });
    }
    catch (error) {
        console.error("Failed to delete post", error);
        res.status(500).json({ success: false, message: "Erro ao excluir post." });
    }
});
router.post("/:id/report", async (req, res) => {
    try {
        const { id } = req.params;
        const reason = sanitizeString(req.body?.reason);
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Post não encontrado." });
        }
        const report = await prisma.postReport.create({
            data: {
                postId: id,
                reason: reason || null,
            },
        });
        res.status(201).json({ success: true, report });
    }
    catch (error) {
        console.error("Failed to report post", error);
        res
            .status(500)
            .json({ success: false, message: "Erro ao denunciar post." });
    }
});
router.get("/reports/all", requireAdminSecret_1.default, async (_req, res) => {
    try {
        const reports = await prisma.post.findMany({
            where: {
                reports: {
                    some: {},
                },
            },
            orderBy: { createdAt: "desc" },
            include: {
                reports: {
                    orderBy: { createdAt: "desc" },
                },
                media: true,
                _count: { select: { reports: true } },
            },
        });
        res.json({
            success: true,
            posts: reports.map((post) => mapPostResponse(post)),
        });
    }
    catch (error) {
        console.error("Failed to list reported posts", error);
        res.status(500).json({
            success: false,
            message: "Não foi possível carregar as denúncias.",
        });
    }
});
exports.default = router;
