"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const prisma_1 = require("../../generated/prisma");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const sanitizeUser = ({ passwordHash: _ignored, ...user }) => user;
router.post("/login/google", async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
        return res
            .status(400)
            .json({ success: false, message: "Token Google ausente." });
    }
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) {
            return res
                .status(400)
                .json({ success: false, message: "E-mail Google não encontrado." });
        }
        let user = await prisma.user.findUnique({
            where: { email: payload.email },
        });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    fullName: payload.name ?? "Google User",
                    username: payload.email.split("@")[0],
                    email: payload.email,
                    avatarUrl: payload.picture,
                    passwordHash: "google-oauth",
                    emailVerified: true,
                },
            });
        }
        else if (!user.emailVerified) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { emailVerified: true },
            });
        }
        const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({ success: true, user: sanitizeUser(user), token });
    }
    catch (err) {
        return res
            .status(401)
            .json({ success: false, message: "Falha na autenticação Google." });
    }
});
exports.default = router;
