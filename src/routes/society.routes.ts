import express from "express";
import {
  //   lisSoc,
  createActivityLocation,
  updateActivityLocation,
  deleteActivityLocations,
  getAllActivityLocations,
  getActivityLocationsByBrand,
  getActivityLocationById,
  getSelectedActivityLocationsDownload,
  bulkCreateActivityLocations,
  updateSelectedActivityLocationStatus,
  bulkCreateActivityLocation,
} from "../controllers/society.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

// router.get("/list-soc", verifyApiKey, lisSoc); // ✅ Simple GET route
router.post(
  "/bulkCreateActivityLocations",
  verifyApiKey,
  bulkCreateActivityLocations
); // create route
router.get("/", verifyApiKey, getAllActivityLocations); // ✅ Simple GET route
router.get(
  "/getActivityLocationsByBrand",
  verifyApiKey,
  getActivityLocationsByBrand
); // ✅ Simple GET route
router.post("/", verifyApiKey, createActivityLocation); // create route
router.put("/:id", verifyApiKey, updateActivityLocation); // update route
router.patch(
  "/updateSelectedActivityLocationStatus",
  updateSelectedActivityLocationStatus
);
router.get("/:id", verifyApiKey, getActivityLocationById); // ✅ Simple GET by id route
router.delete("/:id", verifyApiKey, deleteActivityLocations); // delete route
router.post(
  "/getSelectedActivityLocationsDownload",
  verifyApiKey,
  getSelectedActivityLocationsDownload
); // delete route
router.post("/bulkCreateActivityLocation", bulkCreateActivityLocation);

export default router;
