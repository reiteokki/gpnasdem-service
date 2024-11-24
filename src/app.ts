import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import forumRoutes from "./routes/forumRoutes";
import postRoutes from "./routes/postRoutes";
import commentRoutes from "./routes/commentRoutes";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware for parsing JSON
app.use(express.json());

const supabaseBase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Add Supabase client to request object for easy access in routes
app.use((req: Request, res: Response, next: NextFunction) => {
  const accessToken = req.headers.authorization?.split("Bearer ")[1]; // Extract token from header
  if (accessToken) {
    req.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      }
    );
  } else {
    req.supabase = supabaseBase; // Default to base client
  }
  next();
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/forums", forumRoutes);
app.use("/api/post", postRoutes);
app.use("/api/comment", commentRoutes);

// Health check endpoint
// app.get("/api/health", (req, res) => {
//   res.status(200).json({ status: "OK", message: "API is running" });
// });

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
