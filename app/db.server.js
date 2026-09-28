import { PrismaClient } from "@prisma/client";

// Always use a global singleton to avoid exhausting DB connections
// on every hot-reload (dev) or serverless invocation (production/Vercel).
const prisma = global.prismaGlobal ?? new PrismaClient();
global.prismaGlobal = prisma;

export default prisma;
