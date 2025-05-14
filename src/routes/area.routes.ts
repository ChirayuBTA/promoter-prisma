import express from "express";
import {
  getAllAreas,
  createArea,
  updateArea,
  deleteAreas,
  getAreaById,
  getSelectedAreasDownload,
  updateSelectedAreasStatus,
  bulkUploadAreas,
} from "../controllers/area.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.get("/", verifyApiKey, getAllAreas); // ✅ Simple GET route
router.post("/", verifyApiKey, createArea); // create route
router.put("/:id", verifyApiKey, updateArea); // update route
router.patch("/updateSelectedAreasStatus", updateSelectedAreasStatus);
router.get("/:id", verifyApiKey, getAreaById); // ✅ Simple GET by id route
router.delete("/:id", verifyApiKey, deleteAreas); // delete route
router.post("/getSelectedAreasDownload", getSelectedAreasDownload);
router.post("/bulkUploadAreas", bulkUploadAreas);

export default router;
