import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db";

export const createAgenda = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId, imageUrl, title, description, startDate } = req.body;

  if (!title || !description || !imageUrl || !startDate) {
    res.status(400).json({ message: "Required form are missing." });
    return;
  }

  const agendaId = uuidv4(); // Generate a unique ID for the agenda

  try {
    // Start a transaction for atomicity
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

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
      const agendaResult = await client.query(insertAgendaQuery, agendaValues);

      await client.query("COMMIT");
      res.status(201).json(agendaResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during agenda creation transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error creating agenda:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};
