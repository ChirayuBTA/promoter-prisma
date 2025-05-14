import express from "express";
import {
  getAllVendors,
  getSelectedVendorsDownload,
  createVendor,
  updateVendor,
  deleteVendors,
  getVendorById,
  getProjectsByVendorId,
  updateSelectedVendorsStatus,
} from "../controllers/vendor.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.get("/:id/projects", getProjectsByVendorId);
router.get("/", verifyApiKey, getAllVendors); // ✅ Simple GET route
router.post("/", verifyApiKey, createVendor); // create route
router.put("/:id", verifyApiKey, updateVendor); // update route
router.patch("/updateSelectedVendorsStatus", updateSelectedVendorsStatus);
router.get("/:id", verifyApiKey, getVendorById); // ✅ Simple GET by id route
router.delete("/:id", verifyApiKey, deleteVendors); // delete route
router.post("/getSelectedVendorsDownload", getSelectedVendorsDownload);

export default router;
