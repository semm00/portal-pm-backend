"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const extractSecret = (req) => {
    const headerSecret = req.headers["x-admin-secret"];
    const value = Array.isArray(headerSecret)
        ? headerSecret[0]
        : headerSecret ?? "";
    if (value) {
        return value.trim();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return null;
    const [schema, token] = authHeader.split(" ");
    if (!token) {
        return schema?.trim() ?? null;
    }
    if (schema?.toLowerCase() !== "bearer") {
        return null;
    }
    return token.trim();
};
const requireAdminSecret = (req, res, next) => {
    if (!ADMIN_SECRET) {
        console.error("ADMIN_SECRET não configurado no backend.");
        return res.status(500).json({
            success: false,
            message: "Configuração de segurança ausente. Contate o suporte.",
        });
    }
    const provided = extractSecret(req);
    if (!provided || provided !== ADMIN_SECRET) {
        return res.status(401).json({
            success: false,
            message: "Senha administrativa inválida.",
        });
    }
    return next();
};
exports.default = requireAdminSecret;
