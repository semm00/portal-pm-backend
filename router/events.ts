import { Router } from "express";
import { PrismaClient, EventStatus } from "../generated/prisma";
import requireAuth, {
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router = Router();
const prisma = new PrismaClient();

const sanitizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parseDate = (value: unknown) => {
  if (typeof value === "string" || value instanceof Date) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

const normalizeStatus = (value: unknown): EventStatus | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === EventStatus.PENDING) {
    return EventStatus.PENDING;
  }

  if (normalized === EventStatus.APPROVED) {
    return EventStatus.APPROVED;
  }

  return undefined;
};

router.get("/", async (req, res) => {
  try {
    const status = normalizeStatus(req.query.status);
    const limitRaw = req.query.limit;

    let take: number | undefined;

    if (typeof limitRaw === "string") {
      const parsed = Number.parseInt(limitRaw, 10);

      if (!Number.isNaN(parsed) && parsed > 0) {
        take = Math.min(parsed, 100);
      }
    }

    const events = await prisma.event.findMany({
      where: {
        status: status ?? EventStatus.APPROVED,
      },
      orderBy: { startDate: "asc" },
      take,
    });

    res.json({ success: true, events });
  } catch (error) {
    console.error("Failed to list events", error);
    res.status(500).json({
      success: false,
      message: "Não foi possível carregar os eventos.",
    });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.authUser) {
      return res.status(401).json({
        success: false,
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    const title = sanitizeString(req.body?.title);
    const description = sanitizeString(req.body?.description);
    const category = sanitizeString(req.body?.category || "Evento");
    const location = sanitizeString(req.body?.location);
    const startDate = parseDate(req.body?.startDate);
    const endDate = parseDate(req.body?.endDate) ?? startDate;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Título é obrigatório.",
      });
    }

    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: "Data inicial inválida.",
      });
    }

    if (!endDate) {
      return res.status(400).json({
        success: false,
        message: "Data final inválida.",
      });
    }

    if (endDate.getTime() < startDate.getTime()) {
      return res.status(400).json({
        success: false,
        message: "Data final não pode ser anterior à data inicial.",
      });
    }

    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        category,
        location: location || null,
        startDate,
        endDate,
        status: EventStatus.PENDING,
      },
    });

    res.status(201).json({
      success: true,
      message: "Evento enviado para aprovação.",
      event,
    });
  } catch (error) {
    console.error("Failed to create event", error);
    res.status(500).json({
      success: false,
      message: "Erro ao enviar evento para aprovação.",
    });
  }
});

router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.event.findUnique({ where: { id } });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Evento não encontrado." });
    }

    if (existing.status === EventStatus.APPROVED) {
      return res.json({ success: true, event: existing });
    }

    const event = await prisma.event.update({
      where: { id },
      data: { status: EventStatus.APPROVED },
    });

    res.json({ success: true, event });
  } catch (error) {
    console.error("Failed to approve event", error);
    res
      .status(500)
      .json({ success: false, message: "Erro ao aprovar evento." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.event.findUnique({ where: { id } });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Evento não encontrado." });
    }

    await prisma.event.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete event", error);
    res
      .status(500)
      .json({ success: false, message: "Erro ao remover evento." });
  }
});

export default router;
