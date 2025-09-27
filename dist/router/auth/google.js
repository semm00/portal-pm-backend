"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../generated/prisma");
const supabaseClient_1 = require("../../services/supabaseClient");
const userHelpers_1 = require("../../lib/userHelpers");
const router = (0, express_1.Router)();
const prisma = new prisma_1.PrismaClient();
router.post("/login/google", async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
        return res
            .status(400)
            .json({ success: false, message: "Token Google ausente." });
    }
    try {
        const supabase = (0, supabaseClient_1.createSupabaseServerClient)();
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: idToken,
        });
        if (error || !data.user || !data.session || !data.user.email) {
            console.error("Supabase Google login error:", error);
            return res
                .status(401)
                .json({ success: false, message: "Falha na autenticação Google." });
        }
        const supabaseUser = data.user;
        const email = supabaseUser.email;
        const metadata = (supabaseUser.user_metadata ?? {});
        const fullName = metadata.fullName ??
            metadata.name ??
            email.split("@")[0];
        const avatarUrl = metadata.avatarUrl ??
            metadata.avatar_url ??
            metadata.picture ??
            undefined;
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });
        const username = existingUser
            ? existingUser.username
            : await (0, userHelpers_1.ensureUniqueUsername)(prisma, email.split("@")[0]);
        const userRecord = await prisma.user.upsert({
            where: { email },
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
                email,
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
                token: data.session.access_token,
            },
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
        });
    }
    catch (err) {
        console.error("Erro inesperado ao autenticar com Google:", err);
        return res
            .status(401)
            .json({ success: false, message: "Falha na autenticação Google." });
    }
});
exports.default = router;
