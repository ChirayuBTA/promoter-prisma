import express from "express";
import {
  getOrderReport,
  getExcelOrderReports,
  getPromoterReport,
  getProjectReport,
  updateOrderStatus,
  getOrderReportByIds,
  getOrderDashboardOverview,
  getOrderDashboardOverviewByBrandId,
  getOrderReportSummary,
  getActivityImages,
  updateOrderReport,
} from "../controllers/reports.controller";

const router = express.Router();

// Promoter Routes
router.get("/getOrderReport", getOrderReport);
router.get("/getExcelOrderReports", getExcelOrderReports);
router.get("/getPromoterReport", getPromoterReport);
router.get("/getProjectReport", getProjectReport);
router.get("/getOrderDashboardOverview", getOrderDashboardOverview);
router.get(
  "/getOrderDashboardOverviewByBrandId",
  getOrderDashboardOverviewByBrandId
);
router.post("/updateOrderStatus", updateOrderStatus);
router.post("/getOrderReportByIds", getOrderReportByIds);
router.get("/getOrderReportSummary", getOrderReportSummary);
router.get("/getActivityImages", getActivityImages);
router.patch("/updateOrderReport", updateOrderReport);

export default router;
