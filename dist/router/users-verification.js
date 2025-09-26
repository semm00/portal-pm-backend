"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../generated/prisma");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
// Enviar e-mail de verificação
router.post("/send-verification", async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res
            .status(400)
            .json({ success: false, message: "E-mail obrigatório." });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
        return res
            .status(404)
            .json({ success: false, message: "Usuário não encontrado." });
    if (user.emailVerified) {
        return res
            .status(400)
            .json({ success: false, message: "Este e-mail já foi verificado." });
    }
    try {
        await (0, emailService_1.sendVerificationEmail)(user);
        return res.json({
            success: true,
            message: "E-mail de verificação reenviado com sucesso.",
        });
    }
    catch (error) {
        console.error("Falha ao reenviar e-mail de verificação:", error);
        return res
            .status(500)
            .json({ success: false, message: "Falha ao reenviar e-mail." });
    }
});
// Verificar e-mail
router.post("/verify-email", async (req, res) => {
    const { token } = req.body;
    if (!token)
        return res
            .status(400)
            .json({ success: false, message: "Token obrigatório." });
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        await prisma.user.update({
            where: { id: payload.sub },
            data: { emailVerified: true },
        });
        return res.json({
            success: true,
            message: "E-mail verificado com sucesso.",
        });
    }
    catch (err) {
        return res
            .status(400)
            .json({ success: false, message: "Token inválido ou expirado." });
    }
});
exports.default = router;
