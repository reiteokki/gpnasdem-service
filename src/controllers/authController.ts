import { Request, Response } from "express";
import { createUser } from "../models/userModel";
import { supabase } from "../utils/supabaseClient";

export const registerUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, password, username, displayName } = req.body;

  try {
    // Register user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username, // Metadata for username
          displayName, // Metadata for display name
        },
      },
    });

    if (error) {
      console.error("Supabase registration error:", error.message);
      res
        .status(400)
        .json({ message: `Supabase registration error: ${error.message}` });
      return;
    }

    const { user } = data;
    if (!user) {
      res
        .status(500)
        .json({ message: "Failed to create user in Supabase Auth." });
      return;
    }

    // Optionally store user in the `users` table (if needed for additional fields)
    const createdUser = await createUser(user.id, email, username, displayName); // Ensure IDs match

    res.status(201).json({
      id: createdUser.id,
      email: createdUser.email,
      username: createdUser.username,
      displayName: createdUser.display_name,
      createdAt: createdUser.created_at,
      updatedAt: createdUser.updated_at,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const { session, user } = data;

    // Return Supabase tokens directly for API usage
    res.json({
      accessToken: session.access_token, // Use as the main JWT for your API
      refreshToken: session.refresh_token, // Use to refresh the access token
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.email_confirmed_at != null,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { refreshToken } = req.body;

  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      res.status(401).json({ message: "Failed to refresh token" });
      return;
    }

    const { session } = data;

    res.json({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
