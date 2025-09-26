"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../generated/prisma");
const nodemailer_1 = __importDefault(require("nodemailer"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1d";
const transporter = nodemailer_1.default.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});
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
    const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
    const verifyUrl = `${process.env.FRONTEND_URL}/profile/verify-email?token=${token}`;
    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: "Verificação de e-mail - Portal PM",
        html: `<p>Olá,</p><p>Para verificar seu e-mail, clique <a href="${verifyUrl}">aqui</a>.</p>`,
    });
    return res.json({ success: true, message: "E-mail de verificação enviado." });
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
