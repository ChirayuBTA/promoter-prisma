import { Request, Response } from "express";
import prisma from "../config/db";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Get dashboard data for a specific location and promoter
 */
export const getDashboardData = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { activityLocId, promoterId } = req.query; // Read from query parameters

    if (!activityLocId || typeof activityLocId !== "string") {
      res
        .status(400)
        .json({
          success: false,
          message: "activityLocId is required and must be a string",
        });
      return;
    }

    if (!promoterId || typeof promoterId !== "string") {
      res
        .status(400)
        .json({
          success: false,
          message: "promoterId is required and must be a string",
        });
      return;
    }

    // Get the start and end of today
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // Count of today's entries
    const todaysCount = await prisma.orderCaptured.count({
      where: {
        activityLocId,
        promoterId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // Get today's entries
    const todaysEntries = await prisma.orderCaptured.findMany({
      where: {
        activityLocId,
        promoterId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get all entries for the location and promoter
    const totalEntries = await prisma.orderCaptured.findMany({
      where: {
        activityLocId,
        promoterId,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: {
        todaysCount,
        todaysEntries,
        totalEntries, // Returning full list instead of just count
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data" });
  }
};
