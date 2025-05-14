import { Router } from "express";
import {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  getSelectedBrandsDownload,
  dashboardSummary,
  report,
  updateSelectedBrandsStatus,
  bulkUploadBrands,
} from "../controllers/brand.controller";

const router = Router();
router.get("/:id/dashboard", dashboardSummary);
router.get("/:id/report", report);
router.post("/", createBrand);
router.get("/", getAllBrands);
router.post("/getSelectedBrandsDownload", getSelectedBrandsDownload);
router.get("/:id", getBrandById);
router.put("/:id", updateBrand);
router.delete("/", deleteBrand);
router.patch("/updateSelectedBrandsStatus", updateSelectedBrandsStatus);
router.post("/bulkUploadBrands", bulkUploadBrands);

export default router;
