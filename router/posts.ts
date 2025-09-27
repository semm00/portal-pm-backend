import { Router } from "express";
import type { Express } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient, PostStatus } from "../generated/prisma";
import requireAuth, {
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { createSupabaseAdminClient } from "../services/supabaseClient";
import { ensureUniqueUsername } from "../lib/userHelpers";

const router = Router();
const prisma = new PrismaClient();
const supabaseAdmin = createSupabaseAdminClient();
const POSTS_BUCKET = process.env.SUPABASE_POSTS_BUCKET ?? "posts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 6,
    fileSize: 15 * 1024 * 1024,
  },
});

const isAllowedMimeType = (mime: string | undefined) => {
  if (!mime) return false;
  return mime.startsWith("image/") || mime.startsWith("video/");
};

const sanitizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parseBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
};

const parseDateTime = (value: unknown) => {
  if (typeof value === "string" || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};

const normalizeStatus = (value: unknown): PostStatus | null | "ALL" => {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();

  if (normalized === "ALL") return "ALL";
  if (normalized === PostStatus.PENDING) return PostStatus.PENDING;
  if (normalized === PostStatus.APPROVED) return PostStatus.APPROVED;
  if (normalized === PostStatus.REJECTED) return PostStatus.REJECTED;

  return null;
};

const mapPostResponse = (post: any) => ({
  id: post.id,
  authorName: post.authorName,
  authorAvatarUrl: post.authorAvatarUrl,
  content: post.content,
  category: post.category,
  location: post.location,
  eventDate: post.eventDate,
  poll: post.pollQuestion
    ? {
        question: post.pollQuestion,
        options: Array.isArray(post.pollOptions) ? post.pollOptions : [],
      }
    : null,
  alertUsers: post.alertUsers,
  likes: post.likes,
  shares: post.shares,
  status: post.status,
  rejectedReason: post.rejectedReason,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  approvedAt: post.approvedAt,
  media:
    post.media?.map((media: any) => ({
      id: media.id,
      url: media.url,
      mimeType: media.mimeType,
    })) ?? [],
  reportsCount: post._count?.reports ?? 0,
  reports: post.reports?.map((report: any) => ({
    id: report.id,
    reason: report.reason,
    createdAt: report.createdAt,
  })),
});

const extractMetadataString = (
  metadata: Record<string, unknown>,
  keys: string[]
) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const ensureAuthorUser = async (authUser: AuthenticatedRequest["authUser"]) => {
  if (!authUser) return null;

  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const email = authUser.email?.toLowerCase?.() ?? null;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ supabaseId: authUser.id }, ...(email ? [{ email }] : [])],
    },
  });

  const fullName =
    extractMetadataString(metadata, [
      "fullName",
      "name",
      "full_name",
      "given_name",
    ]) ||
    (email ? email.split("@")[0] : null) ||
    "Morador";

  const avatarUrl =
    extractMetadataString(metadata, ["avatarUrl", "avatar_url", "picture"]) ||
    null;

  if (existing) {
    const needsUpdate =
      existing.supabaseId !== authUser.id ||
      (avatarUrl && existing.avatarUrl !== avatarUrl) ||
      (fullName && existing.fullName !== fullName) ||
      (email && existing.email !== email);

    if (needsUpdate) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName,
          avatarUrl: avatarUrl ?? undefined,
          email: email ?? existing.email,
          emailVerified: Boolean(authUser.email_confirmed_at),
          supabaseId: authUser.id,
        },
      });
    }

    if (!existing.supabaseId) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { supabaseId: authUser.id },
      });
    }

    return existing;
  }

  const desiredUsername =
    extractMetadataString(metadata, ["username", "preferred_username"]) ||
    (email ? email.split("@")[0] : `usuario-${authUser.id.slice(0, 8)}`);

  const username = await ensureUniqueUsername(prisma, desiredUsername);

  return prisma.user.create({
    data: {
      fullName,
      username,
      email: email ?? `${authUser.id}@portal.pm`,
      avatarUrl: avatarUrl ?? undefined,
      emailVerified: Boolean(authUser.email_confirmed_at),
      supabaseId: authUser.id,
    },
  });
};

const uploadMediaFiles = async (
  files: Express.Multer.File[],
  ownerId: string
) => {
  if (!files.length) {
    return [] as Array<{ url: string; storagePath: string; mimeType: string }>;
  }

  const storage = supabaseAdmin.storage.from(POSTS_BUCKET);
  const uploaded: Array<{
    url: string;
    storagePath: string;
    mimeType: string;
  }> = [];

  try {
    for (const file of files) {
      if (!isAllowedMimeType(file.mimetype)) {
        throw new Error("Apenas arquivos de imagem ou vídeo são permitidos.");
      }

      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt =
        ext || (file.mimetype.startsWith("image/") ? ".jpg" : ".mp4");
      const objectPath = `posts/${ownerId}/${randomUUID()}${safeExt}`;

      const { error: uploadError } = await storage.upload(
        objectPath,
        file.buffer,
        {
          contentType: file.mimetype,
          upsert: false,
        }
      );

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = storage.getPublicUrl(objectPath);
      uploaded.push({
        url: publicData.publicUrl,
        storagePath: objectPath,
        mimeType: file.mimetype,
      });
    }

    return uploaded;
  } catch (error) {
    if (uploaded.length) {
      await storage
        .remove(uploaded.map((item) => item.storagePath))
        .catch((cleanupError) => {
          console.warn("Falha ao remover mídias após erro", cleanupError);
        });
    }

    throw error;
  }
};

router.get("/", async (req, res) => {
  try {
    const statusParam = normalizeStatus(req.query.status);
    const alertOnly = parseBoolean(req.query.alertOnly);
    const includeReports = parseBoolean(req.query.includeReports);
    const hasReports = parseBoolean(req.query.hasReports);

    let take: number | undefined;
    const limitRaw = req.query.limit;

    if (typeof limitRaw === "string") {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        take = Math.min(parsed, 100);
      }
    }

    const where: Record<string, unknown> = {};

    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam;
    } else if (!statusParam) {
      where.status = PostStatus.APPROVED;
    }

    if (alertOnly) {
      where.alertUsers = true;
    }

    if (hasReports) {
      where.reports = { some: {} };
    }

    const posts = await prisma.post.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        media: true,
        reports: includeReports
          ? {
              orderBy: { createdAt: "desc" },
            }
          : false,
        _count: {
          select: { reports: true },
        },
      },
    });

    res.json({
      success: true,
      posts: posts.map((post) => mapPostResponse(post)),
    });
  } catch (error) {
    console.error("Failed to list posts", error);
    res.status(500).json({
      success: false,
      message: "Não foi possível carregar os posts.",
    });
  }
});

router.post("/", requireAuth, upload.array("media", 6), async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const authUser = authReq.authUser;

    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    const content = sanitizeString(req.body?.content);
    const rawCategory = sanitizeString(req.body?.category || "outro");
    const location = sanitizeString(req.body?.location);
    const eventDate = parseDateTime(req.body?.eventDate);
    const alertUsers = parseBoolean(
      req.body?.alertUsers ?? req.body?.isImportant
    );

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Conteúdo é obrigatório.",
      });
    }

    const category =
      rawCategory === "outro"
        ? sanitizeString(req.body?.customCategory) || "outro"
        : rawCategory;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Categoria é obrigatória.",
      });
    }

    const pollQuestion = sanitizeString(req.body?.pollQuestion);
    const pollOptions = Object.entries(req.body ?? {})
      .filter(([key]) => key.startsWith("pollOptions"))
      .map(([, value]) => sanitizeString(value))
      .filter((value) => value.length > 0)
      .map((text, index) => ({ id: `opt${index + 1}`, text, votes: 0 }));

    const files = (req.files as Express.Multer.File[]) ?? [];
    const mediaPayload = await uploadMediaFiles(files, authUser.id);

    const authorRecord = await ensureAuthorUser(authUser);

    const authorName =
      sanitizeString(req.body?.authorName) ||
      sanitizeString(authUser.user_metadata?.full_name) ||
      sanitizeString(authUser.user_metadata?.name) ||
      (authorRecord?.fullName ?? null) ||
      authUser.email ||
      "Morador";

    const authorAvatarUrl =
      sanitizeString(req.body?.authorAvatarUrl) ||
      sanitizeString(authUser.user_metadata?.avatar_url);

    const post = await prisma.post.create({
      data: {
        authorId: authorRecord?.id ?? null,
        authorName,
        authorAvatarUrl: authorAvatarUrl || null,
        content,
        category,
        location: location || null,
        eventDate: eventDate ?? null,
        pollQuestion: pollQuestion || null,
        pollOptions: pollOptions.length > 0 ? pollOptions : undefined,
        alertUsers,
        media: mediaPayload.length
          ? {
              create: mediaPayload.map((media) => ({
                url: media.url,
                storagePath: media.storagePath,
                mimeType: media.mimeType,
              })),
            }
          : undefined,
      },
      include: {
        media: true,
        reports: true,
        _count: { select: { reports: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Post enviado para aprovação.",
      post: mapPostResponse(post),
    });
  } catch (error) {
    console.error("Failed to create post", error);
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao enviar o post para aprovação.";
    const status =
      error instanceof Error &&
      error.message === "Apenas arquivos de imagem ou vídeo são permitidos."
        ? 400
        : 500;

    res.status(status).json({
      success: false,
      message,
    });
  }
});

router.patch("/:id/approve", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.post.findUnique({
      where: { id },
      include: {
        _count: { select: { reports: true } },
        reports: true,
        media: true,
      },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Post não encontrado." });
    }

    if (existing.status === PostStatus.APPROVED) {
      return res.json({ success: true, post: mapPostResponse(existing) });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { status: PostStatus.APPROVED, approvedAt: new Date() },
      include: {
        _count: { select: { reports: true } },
        reports: true,
        media: true,
      },
    });

    res.json({ success: true, post: mapPostResponse(updated) });
  } catch (error) {
    console.error("Failed to approve post", error);
    res.status(500).json({ success: false, message: "Erro ao aprovar post." });
  }
});

router.patch("/:id/reject", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const reason = sanitizeString(req.body?.reason);

    const existing = await prisma.post.findUnique({ where: { id } });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Post não encontrado." });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.REJECTED,
        rejectedReason: reason || null,
        alertUsers: false,
      },
      include: {
        _count: { select: { reports: true } },
        reports: true,
        media: true,
      },
    });

    res.json({ success: true, post: mapPostResponse(updated) });
  } catch (error) {
    console.error("Failed to reject post", error);
    res.status(500).json({ success: false, message: "Erro ao rejeitar post." });
  }
});

router.patch("/:id/alert", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const alertUsers = parseBoolean(req.body?.alertUsers);

    const existing = await prisma.post.findUnique({ where: { id } });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Post não encontrado." });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { alertUsers, status: existing.status },
      include: {
        _count: { select: { reports: true } },
        reports: true,
        media: true,
      },
    });

    res.json({ success: true, post: mapPostResponse(updated) });
  } catch (error) {
    console.error("Failed to update alert flag", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar alerta do post.",
    });
  }
});

router.post("/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const action = sanitizeString(req.body?.action).toLowerCase();
    const increment = action === "decrement" ? -1 : 1;

    const updated = await prisma.post.update({
      where: { id },
      data: {
        likes: {
          increment,
        },
      },
      include: {
        _count: { select: { reports: true } },
        reports: false,
        media: false,
      },
    });

    const likes = Math.max(0, updated.likes);

    if (updated.likes !== likes) {
      await prisma.post.update({ where: { id }, data: { likes } });
    }

    res.json({ success: true, likes });
  } catch (error) {
    console.error("Failed to like post", error);
    res.status(500).json({ success: false, message: "Erro ao curtir post." });
  }
});

router.post("/:id/share", async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await prisma.post.update({
      where: { id },
      data: {
        shares: {
          increment: 1,
        },
      },
      include: {
        _count: { select: { reports: true } },
        reports: false,
        media: false,
      },
    });

    res.json({ success: true, shares: updated.shares });
  } catch (error) {
    console.error("Failed to share post", error);
    res
      .status(500)
      .json({ success: false, message: "Erro ao compartilhar post." });
  }
});

router.post("/:id/report", async (req, res) => {
  try {
    const { id } = req.params;
    const reason = sanitizeString(req.body?.reason);

    const existing = await prisma.post.findUnique({ where: { id } });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Post não encontrado." });
    }

    const report = await prisma.postReport.create({
      data: {
        postId: id,
        reason: reason || null,
      },
    });

    res.status(201).json({ success: true, report });
  } catch (error) {
    console.error("Failed to report post", error);
    res
      .status(500)
      .json({ success: false, message: "Erro ao denunciar post." });
  }
});

router.get("/reports/all", requireAuth, async (_req, res) => {
  try {
    const reports = await prisma.post.findMany({
      where: {
        reports: {
          some: {},
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        reports: {
          orderBy: { createdAt: "desc" },
        },
        media: true,
        _count: { select: { reports: true } },
      },
    });

    res.json({
      success: true,
      posts: reports.map((post) => mapPostResponse(post)),
    });
  } catch (error) {
    console.error("Failed to list reported posts", error);
    res.status(500).json({
      success: false,
      message: "Não foi possível carregar as denúncias.",
    });
  }
});

export default router;
