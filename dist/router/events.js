"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../generated/prisma");
const requireAuth_1 = __importDefault(require("../middlewares/requireAuth"));
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const sanitizeString = (value) => typeof value === "string" ? value.trim() : "";
const parseDate = (value) => {
    if (typeof value === "string") {
        // Trata datas no formato "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm:ss"
        // como UTC para evitar problemas de fuso horário.
        const dateStr = value.trim();
        const parts = dateStr.split("T")[0].split("-");
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // mês é 0-indexado
            const day = parseInt(parts[2], 10);
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                // Cria a data como UTC, meia-noite
                const date = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
                return date;
            }
        }
    }
    if (value instanceof Date) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }
    return null;
};
const normalizeStatus = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toUpperCase();
    if (normalized === prisma_1.EventStatus.PENDING) {
        return prisma_1.EventStatus.PENDING;
    }
    if (normalized === prisma_1.EventStatus.APPROVED) {
        return prisma_1.EventStatus.APPROVED;
    }
    return undefined;
};
router.get("/", async (req, res) => {
    try {
        const status = normalizeStatus(req.query.status);
        const limitRaw = req.query.limit;
        let take;
        if (typeof limitRaw === "string") {
            const parsed = Number.parseInt(limitRaw, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                take = Math.min(parsed, 100);
            }
        }
        const events = await prisma.event.findMany({
            where: {
                status: status ?? prisma_1.EventStatus.APPROVED,
            },
            orderBy: { startDate: "asc" },
            take,
        });
        res.json({ success: true, events });
    }
    catch (error) {
        console.error("Failed to list events", error);
        res.status(500).json({
            success: false,
            message: "Não foi possível carregar os eventos.",
        });
    }
});
router.post("/", requireAuth_1.default, async (req, res) => {
    try {
        const authReq = req;
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
        const startTime = sanitizeString(req.body?.startTime);
        const endTime = sanitizeString(req.body?.endTime);
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
        if (startTime && endTime && endTime < startTime) {
            return res.status(400).json({
                success: false,
                message: "Horário final não pode ser anterior ao inicial.",
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
                startTime: startTime || null,
                endTime: endTime || null,
                status: prisma_1.EventStatus.PENDING,
            },
        });
        res.status(201).json({
            success: true,
            message: "Evento enviado para aprovação.",
            event,
        });
    }
    catch (error) {
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
        if (existing.status === prisma_1.EventStatus.APPROVED) {
            return res.json({ success: true, event: existing });
        }
        const event = await prisma.event.update({
            where: { id },
            data: { status: prisma_1.EventStatus.APPROVED },
        });
        res.json({ success: true, event });
    }
    catch (error) {
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
    }
    catch (error) {
        console.error("Failed to delete event", error);
        res
            .status(500)
            .json({ success: false, message: "Erro ao remover evento." });
    }
});
exports.default = router;
