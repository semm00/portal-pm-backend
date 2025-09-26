import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import nodemailer from "nodemailer";
import jwt, { SignOptions, Secret } from "jsonwebtoken";

const router = Router();
const prisma = new PrismaClient();

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "1d";

const transporter = nodemailer.createTransport({
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

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
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
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
    };
    await prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
    return res.json({
      success: true,
      message: "E-mail verificado com sucesso.",
    });
  } catch (err) {
    return res
      .status(400)
      .json({ success: false, message: "Token inválido ou expirado." });
  }
});

export default router;
