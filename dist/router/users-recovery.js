"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../generated/prisma");
const nodemailer_1 = __importDefault(require("nodemailer"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
const transporter = nodemailer_1.default.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});
// Solicitar recuperação de senha
router.post("/forgot-password", async (req, res) => {
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
    const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
    const resetUrl = `${process.env.FRONTEND_URL}/profile/reset-password?token=${token}`;
    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: "Recuperação de senha - Portal PM",
        html: `<p>Olá,</p><p>Para redefinir sua senha, clique <a href="${resetUrl}">aqui</a>.</p><p>Se não foi você, ignore este e-mail.</p>`,
    });
    return res.json({ success: true, message: "E-mail de recuperação enviado." });
});
// Redefinir senha
router.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password)
        return res
            .status(400)
            .json({ success: false, message: "Token e nova senha obrigatórios." });
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        await prisma.user.update({
            where: { id: payload.sub },
            data: { passwordHash },
        });
        return res.json({
            success: true,
            message: "Senha redefinida com sucesso.",
        });
    }
    catch (err) {
        return res
            .status(400)
            .json({ success: false, message: "Token inválido ou expirado." });
    }
});
exports.default = router;
