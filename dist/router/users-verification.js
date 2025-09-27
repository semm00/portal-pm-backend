"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../generated/prisma");
const supabaseClient_1 = require("../services/supabaseClient");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
// Enviar e-mail de verificação
router.post("/send-verification", async (req, res) => {
    const { email } = req.body;
    console.log(`[LOG] Recebida solicitação para reenviar verificação para: ${email}`);
    if (!email)
        return res
            .status(400)
            .json({ success: false, message: "E-mail obrigatório." });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return res
            .status(404)
            .json({ success: false, message: "Usuário não encontrado." });
    }
    if (user.emailVerified) {
        return res
            .status(400)
            .json({ success: false, message: "Este e-mail já foi verificado." });
    }
    try {
        const supabase = (0, supabaseClient_1.createSupabaseServerClient)();
        const { error } = await supabase.auth.resend({
            type: "signup",
            email,
            options: {
                emailRedirectTo: `${FRONTEND_URL}/profile/verification`,
            },
        });
        if (error) {
            console.error("Supabase resend error:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
        return res.json({
            success: true,
            message: "E-mail de verificação reenviado com sucesso.",
        });
    }
    catch (error) {
        console.error("Falha ao reenviar e-mail de verificação:", error);
        return res
            .status(500)
            .json({ success: false, message: "Falha ao reenviar e-mail." });
    }
});
// Verificar e-mail
router.post("/verify-email", async (req, res) => {
    const { token, email, type } = req.body;
    if (!token || !email) {
        return res.status(400).json({
            success: false,
            message: "Token e e-mail são obrigatórios.",
        });
    }
    try {
        const supabase = (0, supabaseClient_1.createSupabaseServerClient)();
        const supabaseAdmin = (0, supabaseClient_1.createSupabaseAdminClient)();
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
            if (existingUser?.supabaseId) {
                const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.getUserById(existingUser.supabaseId);
                if (adminError) {
                    console.error("Supabase admin getUserById error:", adminError);
                }
                adminUserEmailConfirmed = Boolean(adminData?.user?.email_confirmed_at ?? false);
            }
            const alreadyVerified = fallbackAlreadyVerified || adminUserEmailConfirmed;
            if (!alreadyVerified) {
                return res
                    .status(400)
                    .json({ success: false, message: error.message });
            }
            await prisma.user.updateMany({
                where: { email },
                data: {
                    emailVerified: true,
                    supabaseId: existingUser?.supabaseId,
                },
            });
            return res.json({
                success: true,
                message: "E-mail já estava verificado.",
                alreadyVerified: true,
            });
        }
        const supabaseUser = data.user;
        if (supabaseUser?.email) {
            await prisma.user.updateMany({
                where: { email: supabaseUser.email },
                data: { emailVerified: true, supabaseId: supabaseUser.id },
            });
        }
        return res.json({
            success: true,
            message: "E-mail verificado com sucesso.",
            alreadyVerified: false,
        });
    }
    catch (err) {
        console.error("Erro ao verificar e-mail:", err);
        return res
            .status(400)
            .json({ success: false, message: "Token inválido ou expirado." });
    }
});
exports.default = router;
