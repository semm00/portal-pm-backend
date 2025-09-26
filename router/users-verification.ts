import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import jwt, { Secret } from "jsonwebtoken";
import { sendVerificationEmail } from "../services/emailService";

const router = Router();
const prisma = new PrismaClient();

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;

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
    await sendVerificationEmail(user);
    return res.json({
      success: true,
      message: "E-mail de verificação reenviado com sucesso.",
    });
  } catch (error) {
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
