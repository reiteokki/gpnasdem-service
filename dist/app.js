"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("@supabase/supabase-js");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const forumRoutes_1 = __importDefault(require("./routes/forumRoutes"));
const postRoutes_1 = __importDefault(require("./routes/postRoutes"));
const commentRoutes_1 = __importDefault(require("./routes/commentRoutes"));
const agendaRoutes_1 = __importDefault(require("./routes/agendaRoutes"));
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
// Middleware for parsing JSON
app.use(express_1.default.json());
const supabaseBase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
// Add Supabase client to request object for easy access in routes
app.use((req, res, next) => {
    var _a;
    const accessToken = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split("Bearer ")[1]; // Extract token from header
    if (accessToken) {
        req.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        });
    }
    else {
        req.supabase = supabaseBase; // Default to base client
    }
    next();
});
// API Routes
app.use("/api/auth", authRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/forums", forumRoutes_1.default);
app.use("/api/post", postRoutes_1.default);
app.use("/api/comment", commentRoutes_1.default);
app.use("/api/agenda", agendaRoutes_1.default);
// Health check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "OK", message: "API is running on Cloud" });
});
// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
});
// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});
exports.default = app;
