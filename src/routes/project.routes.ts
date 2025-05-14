import { Router } from "express";
import {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProjects,
  getSelectedProjectsDownload,
  getProjectPromoCode,
  updateSelectedProjectsStatus,
  bulkUploadProjects,
} from "../controllers/project.controller";

const router = Router();

router.get("/getProjectPromoCode", getProjectPromoCode);
router.post("/", createProject);
router.get("/", getAllProjects);
router.get("/:id", getProjectById);
router.put("/:id", updateProject);
router.patch("/updateSelectedProjectsStatus", updateSelectedProjectsStatus);
router.delete("/:id", deleteProjects);
router.post("/getSelectedProjectsDownload", getSelectedProjectsDownload);
router.post("/bulkUploadProjects", bulkUploadProjects);

export default router;
