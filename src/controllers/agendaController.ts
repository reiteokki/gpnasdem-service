import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db";
import { uploadFile } from "../utils/supabaseStorage";
import { SupabaseClient } from "@supabase/supabase-js";

export const createAgenda = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId, image, title, description, startDate } = req.body;

  if (!title || !description || !image || !startDate) {
    res.status(400).json({ message: "Required form are missing." });
    return;
  }

  const agendaId = uuidv4(); // Generate a unique ID for the agenda
  let imageUrl;

  try {
    // Start a transaction for atomicity
    const client = req.supabase as SupabaseClient;
    const dbClient = await pool.connect();
    try {
      await dbClient.query("BEGIN");

      if (image) {
        const agendaPath = `forums/${forumId}/agendas/${agendaId}/${Date.now()}_${
          image?.originalname
        }`;
        imageUrl = await uploadFile(
          client,
          "user-media",
          image?.buffer,
          agendaPath
        );
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
      const agendaResult = await dbClient.query(insertAgendaQuery, agendaValues);

      await dbClient.query("COMMIT");
      res.status(201).json(agendaResult.rows[0]);
    } catch (err) {
      await dbClient.query("ROLLBACK");
      console.error("Error during agenda creation transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error("Error creating agenda:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};
