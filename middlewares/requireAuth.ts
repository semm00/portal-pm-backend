import type { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../services/supabaseClient";

const supabaseAdmin = createSupabaseAdminClient();

const extractToken = (authorizationHeader?: string | string[]) => {
  if (!authorizationHeader) return null;
  const value = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (!value) return null;

  const [schema, token] = value.split(" ");
  if (!token) {
    return schema?.trim() ?? null;
  }

  if (schema?.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
};

export interface AuthenticatedRequest extends Request {
  authUser?: User;
}

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Autorização necessária para realizar esta ação.",
      });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      console.warn("Token inválido ou expirado", error);
      return res.status(401).json({
        success: false,
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    (req as AuthenticatedRequest).authUser = data.user;
    return next();
  } catch (err) {
    console.error("Falha ao validar token", err);
    return res.status(500).json({
      success: false,
      message: "Não foi possível validar a sessão. Tente novamente.",
    });
  }
};

export default requireAuth;
