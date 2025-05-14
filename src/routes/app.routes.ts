import express from "express";
import {
  getAllCities,
  getAllActivityLocations,
  getDashboardData,
  uploadImages,
  getActivityLocation,
  uploadMiddleware,
  updateOrderFlag,
} from "../controllers/app.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";
import { authenticateUser } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/getAllCities", authenticateUser, verifyApiKey, getAllCities);
router.get(
  "/getAllActivityLocations",
  authenticateUser,
  verifyApiKey,
  getAllActivityLocations
);
router.get(
  "/getDashboardData",
  authenticateUser,
  verifyApiKey,
  getDashboardData
);
router.post("/uploadImages", authenticateUser, uploadMiddleware, uploadImages);
router.get(
  "/getDashboardData/:id",
  authenticateUser,
  verifyApiKey,
  getActivityLocation
);
router.patch(
  "/updateOrderFlag",
  authenticateUser,
  verifyApiKey,
  updateOrderFlag
);

export default router;
