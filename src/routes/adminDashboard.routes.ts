import express from "express";
import {
  getDashboardData,
  getDashboardOverview,
  getClientDashboardOverview,
} from "../controllers/adminDashboard.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.get("/", getDashboardData); // ✅ Simple GET route
router.get("/getDashboardOverview", getDashboardOverview); // ✅ Simple GET route
router.get("/getClientDashboardOverview", getClientDashboardOverview); // New route with brandId filter

export default router;
