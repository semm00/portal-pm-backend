import type { Request } from "express";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "../services/supabaseClient";
import { ensureUniqueUsername } from "../lib/userHelpers";

const router = Router();
const prisma = new PrismaClient();
const supabase = createSupabaseServerClient();
const supabaseAdmin = createSupabaseAdminClient();

const PROFILE_BUCKET = process.env.SUPABASE_PROFILE_BUCKET ?? "profile";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

class UnauthorizedError extends Error {}

const extractAccessToken = (req: Request): string | undefined => {
  const authHeader = req.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  if (typeof req.query.accessToken === "string") {
    return req.query.accessToken;
  }

  if (
    req.body &&
    typeof (req.body as Record<string, unknown>).accessToken === "string"
  ) {
    return ((req.body as Record<string, unknown>).accessToken as string).trim();
  }

  return undefined;
};

const authenticateUser = async (accessToken?: string) => {
  if (!accessToken) {
    throw new UnauthorizedError("Token de acesso ausente.");
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new UnauthorizedError("Token inválido ou expirado.");
  }

  const supabaseUser = data.user;

  if (!supabaseUser.email) {
    throw new UnauthorizedError("Usuário sem e-mail associado.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: supabaseUser.email },
  });

  if (existingUser) {
    return { supabaseUser, userRecord: existingUser };
  }

  const metadata = (supabaseUser.user_metadata ?? {}) as Record<
    string,
    unknown
  >;
  const fullName =
    (metadata.fullName as string) ??
    (metadata.name as string) ??
    supabaseUser.email.split("@")[0];
  const desiredUsername = (metadata.username as string) ?? supabaseUser.email;
  const username = await ensureUniqueUsername(prisma, desiredUsername);

  const createdUser = await prisma.user.create({
    data: {
      fullName,
      username,
      email: supabaseUser.email,
      avatarUrl:
        (metadata.avatarUrl as string | undefined) ??
        (metadata.avatar_url as string | undefined) ??
        undefined,
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      bio: (metadata.bio as string | undefined) ?? null,
      city: (metadata.city as string | undefined) ?? null,
      supabaseId: supabaseUser.id,
    },
  });

  return { supabaseUser, userRecord: createdUser };
};

const toProfileResponse = (user: {
  fullName: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
}) => ({
  fullName: user.fullName,
  email: user.email,
  username: user.username,
  avatarUrl: user.avatarUrl ?? undefined,
  bio: user.bio ?? "",
  city: user.city ?? "",
});

router.get("/me", async (req, res) => {
  try {
    const token = extractAccessToken(req);
    const { userRecord } = await authenticateUser(token);

    return res.json({
      success: true,
      profile: toProfileResponse(userRecord),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, message: error.message });
    }

    console.error("Erro ao obter perfil:", error);
    return res
      .status(500)
      .json({ success: false, message: "Não foi possível carregar o perfil." });
  }
});

router.put("/me", async (req, res) => {
  try {
    const token = extractAccessToken(req);
    const { supabaseUser, userRecord } = await authenticateUser(token);

    const { fullName, bio, city } = req.body as {
      fullName?: string;
      bio?: string | null;
      city?: string | null;
    };

    const updates: Record<string, unknown> = {};

    if (typeof fullName === "string") {
      const trimmed = fullName.trim();
      if (trimmed.length > 0 && trimmed !== userRecord.fullName) {
        updates.fullName = trimmed;
      }
    }

    if (typeof bio === "string") {
      const trimmed = bio.trim();
      updates.bio = trimmed.length > 0 ? trimmed : null;
    }

    if (typeof city === "string") {
      const trimmed = city.trim();
      updates.city = trimmed.length > 0 ? trimmed : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({
        success: true,
        profile: toProfileResponse(userRecord),
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userRecord.id },
      data: updates,
    });

    await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      user_metadata: {
        ...(supabaseUser.user_metadata ?? {}),
        fullName: updatedUser.fullName,
        bio: updatedUser.bio ?? undefined,
        city: updatedUser.city ?? undefined,
      },
    });

    return res.json({
      success: true,
      profile: toProfileResponse(updatedUser),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, message: error.message });
    }

    console.error("Erro ao atualizar perfil:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Não foi possível atualizar o perfil.",
      });
  }
});

router.post("/me/avatar", upload.single("avatar"), async (req, res) => {
  try {
    const token = extractAccessToken(req);
    const { supabaseUser, userRecord } = await authenticateUser(token);

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Nenhum arquivo enviado.",
      });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Apenas imagens são permitidas.",
      });
    }

    const fileExtension = path.extname(file.originalname) || ".png";
    const sanitizedExtension = fileExtension.toLowerCase();
    const objectPath = `${
      supabaseUser.id
    }/avatar-${Date.now()}${sanitizedExtension}`;

    const storage = supabaseAdmin.storage.from(PROFILE_BUCKET);

    const { error: uploadError } = await storage.upload(
      objectPath,
      file.buffer,
      {
        contentType: file.mimetype,
        upsert: true,
      }
    );

    if (uploadError) {
      console.error("Erro ao enviar arquivo para o Supabase:", uploadError);
      return res.status(500).json({
        success: false,
        message: "Falha ao fazer upload da imagem.",
      });
    }

    const { data: publicUrlData } = storage.getPublicUrl(objectPath);

    const avatarUrl = publicUrlData.publicUrl;

    const updatedUser = await prisma.user.update({
      where: { id: userRecord.id },
      data: {
        avatarUrl,
      },
    });

    await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      user_metadata: {
        ...(supabaseUser.user_metadata ?? {}),
        avatarUrl,
      },
    });

    return res.json({
      success: true,
      profile: toProfileResponse(updatedUser),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, message: error.message });
    }

    console.error("Erro ao atualizar avatar:", error);
    return res.status(500).json({
      success: false,
      message: "Não foi possível atualizar a foto de perfil.",
    });
  }
});

export default router;
