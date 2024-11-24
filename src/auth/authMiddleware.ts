import jwt, { JwtPayload } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ message: "Unauthorized: Invalid token format" });
    return;
  }

  try {
    // Verify the Supabase JWT token
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET) as Express.User; // Assert type here

    // Attach user details to the request
    req.user = decoded;
    req.userId = decoded.sub;

    next();
  } catch (err) {
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};
