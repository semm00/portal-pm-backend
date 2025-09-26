import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt, { SignOptions, Secret } from "jsonwebtoken";

const router = Router();
const prisma = new PrismaClient();

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "1h";

const transporter = nodemailer.createTransport({
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

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
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
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
    };
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash },
    });
    return res.json({
      success: true,
      message: "Senha redefinida com sucesso.",
    });
  } catch (err) {
    return res
      .status(400)
      .json({ success: false, message: "Token inválido ou expirado." });
  }
});

export default router;
