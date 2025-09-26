"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../generated/prisma");
const prisma = new prisma_1.PrismaClient();
const router = (0, express_1.Router)();
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
    throw new Error("JWT_SECRET não definido no arquivo .env");
}
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const toSanitizedUser = (user) => {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
};
const buildToken = (user) => jsonwebtoken_1.default.sign({
    sub: user.id,
    email: user.email,
    username: user.username,
}, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
router.post("/register", async (req, res) => {
    const { fullName, username, email, password } = req.body;
    if (!fullName || !username || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Campos obrigatórios ausentes.",
        });
    }
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }],
        },
    });
    if (existingUser) {
        return res.status(409).json({
            success: false,
            message: "E-mail ou nome de usuário já cadastrado.",
        });
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma.user.create({
        data: {
            fullName,
            username,
            email,
            passwordHash,
        },
    });
    const token = buildToken(user);
    return res.status(201).json({
        success: true,
        user: toSanitizedUser(user),
        token,
    });
});
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Informe e-mail e senha.",
        });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Credenciais inválidas.",
        });
    }
    const passwordMatches = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!passwordMatches) {
        return res.status(401).json({
            success: false,
            message: "Credenciais inválidas.",
        });
    }
    const token = buildToken(user);
    return res.json({
        success: true,
        user: toSanitizedUser(user),
        token,
    });
});
exports.default = router;
