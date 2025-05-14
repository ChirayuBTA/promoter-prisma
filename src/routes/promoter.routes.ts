import express from "express";
import {
  createPromoter,
  getAllPromoters,
  getPromoterById,
  getSelectedPromotersDownload,
  updatePromoter,
  deletePromoters,
  updatePromoterProjects,
  getPromotersByProjects,
  bulkUploadPromoters,
  updateSelectedPromotersStatus,
} from "../controllers/promoter.controller";

const router = express.Router();

// Promoter Routes
router.post("/", createPromoter);
router.get("/", getAllPromoters);
router.get("/:id", getPromoterById);
router.put("/:id", updatePromoter);
router.delete("/:id", deletePromoters);
router.post("/getSelectedPromoterDownload", getSelectedPromotersDownload);
router.post("/updatePromoterProjects", updatePromoterProjects);
router.patch("/updateSelectedPromotersStatus", updateSelectedPromotersStatus);
router.post("/getPromotersByProjects", getPromotersByProjects);
router.post("/bulkUploadPromoters", bulkUploadPromoters);
export default router;
