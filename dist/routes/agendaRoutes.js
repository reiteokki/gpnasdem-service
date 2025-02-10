"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agendaController_1 = require("../controllers/agendaController");
const authMiddleware_1 = require("../auth/authMiddleware");
const router = (0, express_1.Router)();
// general CRUD
router.post("/", authMiddleware_1.authenticate, agendaController_1.createAgenda);
exports.default = router;
