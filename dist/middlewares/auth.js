"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
    throw new Error("JWT_SECRET não definido no arquivo .env");
}
const JWT_SECRET = rawJwtSecret;
const authenticate = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Token não fornecido.",
        });
    }
    const token = authorization.replace("Bearer ", "");
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = {
            id: payload.sub,
            email: payload.email,
            username: payload.username,
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: "Token inválido ou expirado.",
        });
    }
};
exports.authenticate = authenticate;
