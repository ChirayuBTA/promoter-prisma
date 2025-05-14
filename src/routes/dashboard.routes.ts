import express from "express";
import { getDashboardData } from "../controllers/dashboard.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.get("/", verifyApiKey, getDashboardData); // ✅ Simple GET route

export default router;
