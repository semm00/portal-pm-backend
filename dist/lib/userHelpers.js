"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUniqueUsername = exports.sanitizeUsername = void 0;
const sanitizeUsername = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
exports.sanitizeUsername = sanitizeUsername;
const ensureUniqueUsername = async (prisma, desired, excludeUserId) => {
    const base = (0, exports.sanitizeUsername)(desired) || `usuario-${Date.now()}`;
    let candidate = base;
    let counter = 1;
    while (true) {
        const existing = await prisma.user.findFirst({
            where: {
                username: candidate,
                ...(excludeUserId
                    ? {
                        NOT: {
                            id: excludeUserId,
                        },
                    }
                    : {}),
            },
        });
        if (!existing) {
            return candidate;
        }
        candidate = `${base}-${counter}`;
        counter += 1;
    }
};
exports.ensureUniqueUsername = ensureUniqueUsername;
