import { Router } from "express";
import { PrismaClient } from "../generated/prisma";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "../services/supabaseClient";
import { ensureUniqueUsername } from "../lib/userHelpers";

const prisma = new PrismaClient();
const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

const normalizeSupabaseError = (message: string) => {
  if (!message) return "Falha ao processar a solicitação.";
  const normalized = message.toLowerCase();
  if (normalized.includes("email")) {
    if (normalized.includes("already registered")) {
      return "E-mail já cadastrado.";
    }
    if (normalized.includes("not confirmed")) {
      return "Seu e-mail ainda não foi verificado.";
    }
  }
  if (normalized.includes("invalid login credentials")) {
    return "Credenciais inválidas.";
  }
  return message;
};

const ensureUniqueUsernameForPrisma = (
  desired: string,
  excludeUserId?: string
) => ensureUniqueUsername(prisma, desired, excludeUserId);

router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body as {
    fullName?: string;
    username?: string;
    email?: string;
    password?: string;
  };

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

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        fullName,
        username,
      },
      emailRedirectTo: `${FRONTEND_URL}/profile/verification`,
    },
  });

  if (error) {
    console.error("Supabase signUp error:", error);
    return res.status(400).json({
      success: false,
      message: normalizeSupabaseError(error.message),
    });
  }

  const supabaseUser = data.user;

  if (!supabaseUser || !supabaseUser.email) {
    return res.status(500).json({
      success: false,
      message: "Não foi possível concluir o cadastro. Tente novamente.",
    });
  }

  await prisma.user.upsert({
    where: { email: supabaseUser.email },
    update: {
      fullName,
      username,
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      avatarUrl: (supabaseUser.user_metadata as Record<string, unknown>)
        ?.avatarUrl as string | undefined,
      supabaseId: supabaseUser.id,
    },
    create: {
      fullName,
      username,
      email: supabaseUser.email,
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      avatarUrl: (supabaseUser.user_metadata as Record<string, unknown>)
        ?.avatarUrl as string | undefined,
      supabaseId: supabaseUser.id,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Cadastro realizado! Verifique seu e-mail para ativar a conta.",
    emailSent: !supabaseUser.email_confirmed_at,
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Informe e-mail e senha.",
    });
  }

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const message = normalizeSupabaseError(error.message);
    const isEmailNotVerified = error.message
      .toLowerCase()
      .includes("email not confirmed");

    return res.status(isEmailNotVerified ? 403 : 401).json({
      success: false,
      message,
      ...(isEmailNotVerified ? { code: "EMAIL_NOT_VERIFIED" } : {}),
    });
  }

  const session = data.session;
  const supabaseUser = data.user;

  if (!session || !supabaseUser || !supabaseUser.email) {
    return res.status(401).json({
      success: false,
      message: "Credenciais inválidas.",
    });
  }

  const metadata = (supabaseUser.user_metadata ?? {}) as Record<
    string,
    unknown
  >;
  const fullName =
    (metadata.fullName as string) ??
    (metadata.name as string) ??
    supabaseUser.email.split("@")[0];

  const existingUser = await prisma.user.findUnique({
    where: { email: supabaseUser.email },
  });

  const desiredUsername = (metadata.username as string) ?? supabaseUser.email;
  const username = existingUser
    ? existingUser.username
    : await ensureUniqueUsernameForPrisma(desiredUsername);

  const avatarUrl =
    (metadata.avatarUrl as string | undefined) ??
    (metadata.avatar_url as string | undefined) ??
    (metadata.picture as string | undefined) ??
    undefined;

  const userRecord = await prisma.user.upsert({
    where: { email: supabaseUser.email },
    update: {
      fullName,
      username,
      avatarUrl,
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      supabaseId: supabaseUser.id,
    },
    create: {
      fullName,
      username,
      email: supabaseUser.email,
      avatarUrl,
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      supabaseId: supabaseUser.id,
    },
  });

  return res.json({
    success: true,
    user: {
      name: userRecord.fullName,
      email: userRecord.email,
      username: userRecord.username,
      avatarUrl: userRecord.avatarUrl ?? undefined,
      token: session.access_token,
    },
    token: session.access_token,
    refreshToken: session.refresh_token,
  });
});

router.post("/logout", async (_req, res) => {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return res.json({ success: true });
});

export default router;
