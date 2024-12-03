import { Router } from "express";
import { createAgenda } from "../controllers/agendaController";
import { authenticate } from "../auth/authMiddleware";
const router = Router();

// general CRUD
router.post("/", authenticate, createAgenda);

export default router;
