"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../generated/prisma");
const supabaseClient_1 = require("../services/supabaseClient");
const userHelpers_1 = require("../lib/userHelpers");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const supabase = (0, supabaseClient_1.createSupabaseServerClient)();
const supabaseAdmin = (0, supabaseClient_1.createSupabaseAdminClient)();
const PROFILE_BUCKET = process.env.SUPABASE_PROFILE_BUCKET ?? "profile";
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
});
class UnauthorizedError extends Error {
}
const extractAccessToken = (req) => {
    const authHeader = req.header("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
        return authHeader.slice(7).trim();
    }
    if (typeof req.query.accessToken === "string") {
        return req.query.accessToken;
    }
    if (req.body && typeof req.body.accessToken === "string") {
        return req.body.accessToken.trim();
    }
    return undefined;
};
const authenticateUser = async (accessToken) => {
    if (!accessToken) {
        throw new UnauthorizedError("Token de acesso ausente.");
    }
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
        throw new UnauthorizedError("Token inválido ou expirado.");
    }
    const supabaseUser = data.user;
    if (!supabaseUser.email) {
        throw new UnauthorizedError("Usuário sem e-mail associado.");
    }
    const existingUser = await prisma.user.findUnique({
        where: { email: supabaseUser.email },
    });
    if (existingUser) {
        return { supabaseUser, userRecord: existingUser };
    }
    const metadata = (supabaseUser.user_metadata ?? {});
    const fullName = metadata.fullName ??
        metadata.name ??
        supabaseUser.email.split("@")[0];
    const desiredUsername = metadata.username ?? supabaseUser.email;
    const username = await (0, userHelpers_1.ensureUniqueUsername)(prisma, desiredUsername);
    const createdUser = await prisma.user.create({
        data: {
            fullName,
            username,
            email: supabaseUser.email,
            avatarUrl: metadata.avatarUrl ??
                metadata.avatar_url ??
                undefined,
            emailVerified: Boolean(supabaseUser.email_confirmed_at),
            bio: metadata.bio ?? null,
            city: metadata.city ?? null,
            supabaseId: supabaseUser.id,
        },
    });
    return { supabaseUser, userRecord: createdUser };
};
const toProfileResponse = (user) => ({
    fullName: user.fullName,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? "",
    city: user.city ?? "",
});
router.get("/me", async (req, res) => {
    try {
        const token = extractAccessToken(req);
        const { userRecord } = await authenticateUser(token);
        return res.json({
            success: true,
            profile: toProfileResponse(userRecord),
        });
    }
    catch (error) {
        if (error instanceof UnauthorizedError) {
            return res.status(401).json({ success: false, message: error.message });
        }
        console.error("Erro ao obter perfil:", error);
        return res
            .status(500)
            .json({ success: false, message: "Não foi possível carregar o perfil." });
    }
});
router.put("/me", async (req, res) => {
    try {
        const token = extractAccessToken(req);
        const { supabaseUser, userRecord } = await authenticateUser(token);
        const { fullName, bio, city } = req.body;
        const updates = {};
        if (typeof fullName === "string") {
            const trimmed = fullName.trim();
            if (trimmed.length > 0 && trimmed !== userRecord.fullName) {
                updates.fullName = trimmed;
            }
        }
        if (typeof bio === "string") {
            const trimmed = bio.trim();
            updates.bio = trimmed.length > 0 ? trimmed : null;
        }
        if (typeof city === "string") {
            const trimmed = city.trim();
            updates.city = trimmed.length > 0 ? trimmed : null;
        }
        if (Object.keys(updates).length === 0) {
            return res.json({
                success: true,
                profile: toProfileResponse(userRecord),
            });
        }
        const updatedUser = await prisma.user.update({
            where: { id: userRecord.id },
            data: updates,
        });
        await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
            user_metadata: {
                ...(supabaseUser.user_metadata ?? {}),
                fullName: updatedUser.fullName,
                bio: updatedUser.bio ?? undefined,
                city: updatedUser.city ?? undefined,
            },
        });
        return res.json({
            success: true,
            profile: toProfileResponse(updatedUser),
        });
    }
    catch (error) {
        if (error instanceof UnauthorizedError) {
            return res.status(401).json({ success: false, message: error.message });
        }
        console.error("Erro ao atualizar perfil:", error);
        return res
            .status(500)
            .json({ success: false, message: "Não foi possível atualizar o perfil." });
    }
});
router.post("/me/avatar", upload.single("avatar"), async (req, res) => {
    try {
        const token = extractAccessToken(req);
        const { supabaseUser, userRecord } = await authenticateUser(token);
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                message: "Nenhum arquivo enviado.",
            });
        }
        if (!file.mimetype.startsWith("image/")) {
            return res.status(400).json({
                success: false,
                message: "Apenas imagens são permitidas.",
            });
        }
        const fileExtension = node_path_1.default.extname(file.originalname) || ".png";
        const sanitizedExtension = fileExtension.toLowerCase();
        const objectPath = `${supabaseUser.id}/avatar-${Date.now()}${sanitizedExtension}`;
        const storage = supabaseAdmin.storage.from(PROFILE_BUCKET);
        const { error: uploadError } = await storage.upload(objectPath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
        });
        if (uploadError) {
            console.error("Erro ao enviar arquivo para o Supabase:", uploadError);
            return res.status(500).json({
                success: false,
                message: "Falha ao fazer upload da imagem.",
            });
        }
        const { data: publicUrlData } = storage.getPublicUrl(objectPath);
        const avatarUrl = publicUrlData.publicUrl;
        const updatedUser = await prisma.user.update({
            where: { id: userRecord.id },
            data: {
                avatarUrl,
            },
        });
        await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
            user_metadata: {
                ...(supabaseUser.user_metadata ?? {}),
                avatarUrl,
            },
        });
        return res.json({
            success: true,
            profile: toProfileResponse(updatedUser),
        });
    }
    catch (error) {
        if (error instanceof UnauthorizedError) {
            return res.status(401).json({ success: false, message: error.message });
        }
        console.error("Erro ao atualizar avatar:", error);
        return res.status(500).json({
            success: false,
            message: "Não foi possível atualizar a foto de perfil.",
        });
    }
});
exports.default = router;
