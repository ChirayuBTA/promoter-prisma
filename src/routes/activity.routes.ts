import express from "express";
import {
  getAllActivities,
  createActivity,
  updateActivity,
  deleteActivities,
  getActivityById,
  getSelectedActivitiesDownload,
  updateSelectedActivityStatus,
} from "../controllers/activity.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.get("/", verifyApiKey, getAllActivities); // ✅ Simple GET route
router.post("/", verifyApiKey, createActivity); // create route
router.put("/:id", verifyApiKey, updateActivity); // update route
router.patch("/updateSelectedActivityStatus", updateSelectedActivityStatus);
router.get("/:id", verifyApiKey, getActivityById); // ✅ Simple GET by id route
router.delete("/:id", verifyApiKey, deleteActivities); // delete route
router.post(
  "/getSelectedActivitiesDownload",
  verifyApiKey,
  getSelectedActivitiesDownload
); // delete route

export default router;
