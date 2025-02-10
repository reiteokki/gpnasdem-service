"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgenda = void 0;
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../db"));
const supabaseStorage_1 = require("../utils/supabaseStorage");
const createAgenda = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { forumId, image, title, description, startDate } = req.body;
    if (!title || !description || !image || !startDate) {
        res.status(400).json({ message: "Required form are missing." });
        return;
    }
    const agendaId = (0, uuid_1.v4)(); // Generate a unique ID for the agenda
    let imageUrl;
    try {
        // Start a transaction for atomicity
        const client = req.supabase;
        const dbClient = yield db_1.default.connect();
        try {
            yield dbClient.query("BEGIN");
            if (image) {
                const agendaPath = `forums/${forumId}/agendas/${agendaId}/${Date.now()}_${image === null || image === void 0 ? void 0 : image.originalname}`;
                imageUrl = yield (0, supabaseStorage_1.uploadFile)(client, "user-media", image === null || image === void 0 ? void 0 : image.buffer, agendaPath);
            }
            // Insert the new agenda into the database
            const insertAgendaQuery = `
        INSERT INTO agenda (
          id, forum_id, image_url, title, description, start_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, forum_id, image_url, title, description, start_date, created_at, updated_at;
      `;
            const agendaValues = [
                agendaId,
                forumId || null, // Allow forum_id to be null
                imageUrl,
                title,
                description,
                startDate,
            ];
            const agendaResult = yield dbClient.query(insertAgendaQuery, agendaValues);
            yield dbClient.query("COMMIT");
            res.status(201).json(agendaResult.rows[0]);
        }
        catch (err) {
            yield dbClient.query("ROLLBACK");
            console.error("Error during agenda creation transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            dbClient.release();
        }
    }
    catch (err) {
        console.error("Error creating agenda:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.createAgenda = createAgenda;
