import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "../services/supabaseClient";

const router = Router();
const prisma = new PrismaClient();

// Enviar e-mail de verificação
router.post("/verify-email", async (req, res) => {
  const { token, email, type, accessToken } = req.body as {
    token?: string;
    email?: string;
    type?: "signup" | "email_change";
    accessToken?: string;
  };

  const supabase = createSupabaseServerClient();
  const supabaseAdmin = createSupabaseAdminClient();

  const markEmailAsVerified = async (
    userEmail?: string | null,
    supabaseId?: string
  ) => {
    if (!userEmail) return;

    await prisma.user.updateMany({
      where: { email: userEmail },
      data: {
        emailVerified: true,
        ...(supabaseId ? { supabaseId } : {}),
      },
    });
  };

  try {
    if (accessToken) {
      const { data: userData, error: getUserError } =
        await supabase.auth.getUser(accessToken);

      if (getUserError || !userData.user?.email) {
        console.error("Supabase getUser error:", getUserError);
        return res
          .status(400)
          .json({ success: false, message: "Token inválido ou expirado." });
      }

      const supabaseUser = userData.user;
      const alreadyVerified = Boolean(supabaseUser.email_confirmed_at);

      await markEmailAsVerified(supabaseUser.email, supabaseUser.id);

      return res.json({
        success: true,
        message: alreadyVerified
          ? "E-mail já estava verificado."
          : "E-mail verificado com sucesso.",
        alreadyVerified,
        email: supabaseUser.email,
      });
    }

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: "Token e e-mail são obrigatórios.",
      });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: type ?? "signup",
    });

    if (error) {
      console.error("Supabase verifyOtp error:", error);

      const existingUser = await prisma.user.findUnique({ where: { email } });

      const fallbackAlreadyVerified = Boolean(existingUser?.emailVerified);

      let adminUserEmailConfirmed = false;
      let adminUserId: string | undefined =
        existingUser?.supabaseId ?? undefined;

      if (existingUser?.supabaseId) {
        const { data: adminData, error: adminError } =
          await supabaseAdmin.auth.admin.getUserById(existingUser.supabaseId);

        if (adminError) {
          console.error("Supabase admin getUserById error:", adminError);
        }

        adminUserEmailConfirmed = Boolean(
          adminData?.user?.email_confirmed_at ?? false
        );
        adminUserId = adminData?.user?.id ?? adminUserId;
      }

      const alreadyVerified =
        fallbackAlreadyVerified || adminUserEmailConfirmed;

      if (!alreadyVerified) {
        return res.status(400).json({ success: false, message: error.message });
      }

      await markEmailAsVerified(email, adminUserId);

      return res.json({
        success: true,
        message: "E-mail já estava verificado.",
        alreadyVerified: true,
        email,
      });
    }

    const supabaseUser = data.user;
    const userEmail = supabaseUser?.email ?? email;

    await markEmailAsVerified(userEmail, supabaseUser?.id);

    return res.json({
      success: true,
      message: "E-mail verificado com sucesso.",
      alreadyVerified: false,
      email: userEmail,
    });
  } catch (err) {
    console.error("Erro ao verificar e-mail:", err);
    return res
      .status(400)
      .json({ success: false, message: "Token inválido ou expirado." });
  }
});

export default router;
