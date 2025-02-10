"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const authenticate = (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, SUPABASE_JWT_SECRET); // Assert type here
        // Attach user details to the request
        req.user = decoded;
        req.userId = decoded.sub;
        next();
    }
    catch (err) {
        res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
    }
};
exports.authenticate = authenticate;
