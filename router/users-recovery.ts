import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import jwt from "jsonwebtoken";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "../services/supabaseClient";

const router = Router();
const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!SUPABASE_JWT_SECRET) {
  throw new Error("SUPABASE_JWT_SECRET não definido no arquivo .env");
}

// Solicitar recuperação de senha
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "E-mail obrigatório." });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res
      .status(200)
      .json({
        success: true,
        message: "Se o e-mail existir, enviaremos instruções.",
      });
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${FRONTEND_URL}/profile/reset-password`,
  });

  if (error) {
    console.error("Supabase resetPasswordForEmail error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Não foi possível enviar as instruções.",
      });
  }

  return res.json({ success: true, message: "E-mail de recuperação enviado." });
});

// Redefinir senha
router.post("/reset-password", async (req, res) => {
  const { accessToken, password } = req.body as {
    accessToken?: string;
    password?: string;
  };

  if (!accessToken || !password) {
    return res.status(400).json({
      success: false,
      message: "Token e nova senha obrigatórios.",
    });
  }

  try {
    const payload = jwt.verify(accessToken, SUPABASE_JWT_SECRET) as {
      sub: string;
      email?: string;
    };

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      payload.sub,
      {
        password,
      }
    );

    if (error) {
      console.error("Supabase updateUserById error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    if (payload.email) {
      await prisma.user.updateMany({
        where: { email: payload.email },
        data: { emailVerified: true },
      });
    }

    return res.json({
      success: true,
      message: "Senha redefinida com sucesso.",
    });
  } catch (err) {
    console.error("Erro ao redefinir senha:", err);
    return res
      .status(400)
      .json({ success: false, message: "Token inválido ou expirado." });
  }
});

export default router;
