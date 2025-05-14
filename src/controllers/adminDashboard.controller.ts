import { Request, Response } from "express";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  parseISO,
} from "date-fns";
import prisma from "../config/db";

export const getDashboardData = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { range } = req.query;

    if (
      !range ||
      !["day", "week", "month", "year", "lifetime"].includes(range as string)
    ) {
      res.status(400).json({
        error:
          "range must be one of 'day', 'week', 'month', 'year', 'lifetime'",
      });
      return;
    }

    // Determine start & end dates based on range
    let startDate: Date | undefined, endDate: Date | undefined;

    switch (range) {
      case "day":
        startDate = startOfDay(new Date());
        endDate = endOfDay(new Date());
        break;
      case "week":
        startDate = startOfWeek(new Date());
        endDate = endOfWeek(new Date());
        break;
      case "month":
        startDate = startOfMonth(new Date());
        endDate = endOfMonth(new Date());
        break;
      case "year":
        startDate = startOfYear(new Date());
        endDate = endOfYear(new Date());
        break;
      case "lifetime":
        startDate = undefined;
        endDate = undefined;
        break;
    }

    // Apply date filter to all queries
    const whereCondition =
      startDate && endDate
        ? { createdAt: { gte: startDate, lte: endDate } }
        : {};

    // Fetch all counts based on selected range
    const [
      totalBrands,
      totalProjects,
      totalPromoters,
      totalOrders,
      todaysOrders,
      todaysPromoters,
      ordersByRangeRaw,
      topPromotersRaw,
    ] = await Promise.all([
      prisma.brand.count({ where: whereCondition }),
      prisma.project.count({ where: whereCondition }),
      prisma.promoter.count({ where: whereCondition }),
      prisma.orderCaptured.count({ where: whereCondition }),
      prisma.orderCaptured.count({
        where: {
          createdAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
        },
      }),
      prisma.promoter.count({
        where: {
          createdAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
        },
      }),
      prisma.orderCaptured.groupBy({
        by: ["createdAt"],
        _count: { id: true },
        where: whereCondition,
        orderBy: { createdAt: "asc" },
      }),
      prisma.orderCaptured.groupBy({
        by: ["promoterId"],
        _count: { id: true },
        where: whereCondition,
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),
    ]);

    // Format orders by range
    const ordersByRange = ordersByRangeRaw.map((entry) => ({
      date: format(entry.createdAt, "yyyy-MM-dd"),
      count: entry._count.id,
    }));

    // Format top promoters
    const topPromoters = await Promise.all(
      topPromotersRaw.map(async (entry) => {
        const promoter = await prisma.promoter.findUnique({
          where: { id: entry.promoterId },
        });
        return {
          id: promoter?.id,
          phone: promoter?.phone,
          totalOrders: entry._count.id,
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalBrands,
        totalProjects,
        totalPromoters,
        totalOrders,
        todaysOrders,
        todaysPromoters,
        ordersByRange, // ✅ Now filters by selected range
        topPromoters, // ✅ Now filters by selected range
      },
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard data:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data" });
  }
};

export const getDashboardOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      filter = "overall",
      startDate: startDateParam,
      endDate: endDateParam,
    } = req.query;

    let startDate: Date | undefined, endDate: Date | undefined;

    // ✅ Custom Date Range Support
    if (startDateParam && endDateParam) {
      startDate = startOfDay(parseISO(startDateParam as string));
      endDate = endOfDay(parseISO(endDateParam as string));
    } else {
      // ✅ Use predefined filters if no custom range is provided
      const now = new Date();
      switch (filter) {
        case "day":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 6);
          endDate = endOfDay(now);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = endOfDay(now);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = endOfDay(now);
          break;
        case "overall":
          startDate = undefined;
          endDate = undefined;
          break;
        default:
          res.status(400).json({
            success: false,
            message:
              "Invalid filter value. Use 'day', 'week', 'month', 'year', 'overall', or provide startDate & endDate.",
          });
          return;
      }
    }

    // ✅ Prisma Where Condition for Filtering by Date
    const whereClause =
      startDate && endDate
        ? { createdAt: { gte: startDate, lte: endDate } }
        : {};

    // ✅ Fetch all required counts
    const orderStats = await prisma.orderCaptured.aggregate({
      where: whereClause,
      _count: { orderId: true },
    });

    const [counts, topPromoters, orders] = await Promise.all([
      prisma.$transaction([
        prisma.activityLocation.count({ where: whereClause }),
        prisma.project.count({ where: whereClause }),
        prisma.promoter.count({ where: whereClause }),
        prisma.vendor.count({
          where: {
            promoters: {
              some: { orders: { some: whereClause } },
            },
          },
        }),
      ]),

      prisma.promoter.findMany({
        take: 5,
        orderBy: { orders: { _count: "desc" } },
        where: { orders: { some: whereClause } },
        select: { id: true, name: true, _count: { select: { orders: true } } },
      }),

      prisma.orderCaptured.findMany({
        where: whereClause,
        select: { createdAt: true, status: true, projectId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const [
      locationsCount,
      projectsCount,
      activePromotersCount,
      activeVendorsCount,
    ] = counts;
    const totalEntries = orderStats._count.orderId;

    // ✅ Process Order Status Distribution
    const orderStatusMap: Record<string, number> = {};
    orders.forEach(({ status }) => {
      orderStatusMap[status] = (orderStatusMap[status] || 0) + 1;
    });

    const formattedOrderStatus = Object.entries(orderStatusMap).map(
      ([status, count]) => ({ status, count })
    );

    // ✅ Process Orders Chart Data
    const ordersChartMap: Record<string, number> = {};
    orders.forEach(({ createdAt }) => {
      const key =
        filter === "day"
          ? new Date(createdAt).getHours().toString().padStart(2, "0") + ":00"
          : format(createdAt, "yyyy-MM-dd");

      ordersChartMap[key] = (ordersChartMap[key] || 0) + 1;
    });

    const ordersChart = Object.entries(ordersChartMap).map(([date, count]) => ({
      date,
      count,
    }));

    // ✅ Process Project Distribution
    const projectOrderMap: Record<string, number> = {};
    orders.forEach(({ projectId }) => {
      projectOrderMap[projectId] = (projectOrderMap[projectId] || 0) + 1;
    });

    const projectDistribution = await Promise.all(
      Object.entries(projectOrderMap).map(async ([projectId, count]) => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true },
        });

        return {
          name: project?.name || "Unknown",
          percentage: ((count / totalEntries) * 100).toFixed(2),
        };
      })
    );

    res.json({
      success: true,
      locationsCount,
      projectsCount,
      activePromotersCount,
      totalEntries,
      activeVendorsCount,
      ordersStatus: formattedOrderStatus,
      topPromoters: topPromoters.map((p) => ({
        name: p.name,
        entries: p._count.orders,
      })),
      ordersChart,
      projectDistribution,
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard data:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data" });
  }
};

export const getClientDashboardOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      brandId,
      filter = "overall",
      startDate: startDateParam,
      endDate: endDateParam,
    } = req.query;

    // Check if brandId is provided
    if (!brandId) {
      res.status(400).json({
        success: false,
        message: "brandId is required",
      });
      return;
    }

    let startDate: Date | undefined, endDate: Date | undefined;

    // Custom Date Range Support
    if (startDateParam && endDateParam) {
      startDate = startOfDay(parseISO(startDateParam as string));
      endDate = endOfDay(parseISO(endDateParam as string));
    } else {
      // Use predefined filters if no custom range is provided
      const now = new Date();
      switch (filter) {
        case "day":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 6);
          endDate = endOfDay(now);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = endOfDay(now);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = endOfDay(now);
          break;
        case "overall":
          startDate = undefined;
          endDate = undefined;
          break;
        default:
          res.status(400).json({
            success: false,
            message:
              "Invalid filter value. Use 'day', 'week', 'month', 'year', 'overall', or provide startDate & endDate.",
          });
          return;
      }
    }

    // Date filter condition
    const dateWhereClause =
      startDate && endDate
        ? { createdAt: { gte: startDate, lte: endDate } }
        : {};

    // First, get all projects associated with the brandId
    const brandProjects = await prisma.project.findMany({
      where: {
        brandId: brandId as string,
      },
      select: {
        id: true,
      },
    });

    // If no projects found for the brand
    if (brandProjects.length === 0) {
      res.json({
        success: true,
        message: "No projects found for this brand",
        locationsCount: 0,
        projectsCount: 0,
        activePromotersCount: 0,
        totalEntries: 0,
        activeVendorsCount: 0,
        ordersStatus: [],
        topPromoters: [],
        ordersChart: [],
        projectDistribution: [],
      });
      return;
    }

    // Extract project IDs
    const projectIds = brandProjects.map((project) => project.id);

    // Create combined where clause for brand-specific projects and date filters
    const whereClause = {
      ...dateWhereClause,
      projectId: { in: projectIds },
    };

    // Fetch order statistics for brand-specific projects
    const orderStats = await prisma.orderCaptured.aggregate({
      where: whereClause,
      _count: { orderId: true },
    });

    // Fetch counts, top promoters, and orders
    const [counts, topPromoters, orders] = await Promise.all([
      prisma.$transaction([
        // Count locations associated with these projects
        prisma.activityLocation.count({
          where: {
            ProjectLocation: {
              some: {
                projectId: { in: projectIds },
              },
            },
            ...dateWhereClause,
          },
        }),
        // Count projects for this brand
        prisma.project.count({
          where: {
            brandId: brandId as string,
            ...dateWhereClause,
          },
        }),
        // Count promoters associated with these projects
        prisma.promoter.count({
          where: {
            projects: {
              some: {
                projectId: { in: projectIds },
              },
            },
            ...dateWhereClause,
          },
        }),
        // Count vendors associated with these projects
        prisma.vendor.count({
          where: {
            projects: {
              some: {
                projectId: { in: projectIds },
              },
            },
            ...dateWhereClause,
          },
        }),
      ]),

      // Get top promoters for these projects
      prisma.promoter.findMany({
        take: 5,
        where: {
          orders: {
            some: {
              projectId: { in: projectIds },
              ...dateWhereClause,
            },
          },
        },
        orderBy: { orders: { _count: "desc" } },
        select: { id: true, name: true, _count: { select: { orders: true } } },
      }),

      // Get orders for these projects
      prisma.orderCaptured.findMany({
        where: whereClause,
        select: { createdAt: true, status: true, projectId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const [
      locationsCount,
      projectsCount,
      activePromotersCount,
      activeVendorsCount,
    ] = counts;
    const totalEntries = orderStats._count.orderId;

    // Process Order Status Distribution
    const orderStatusMap: Record<string, number> = {};
    orders.forEach(({ status }) => {
      orderStatusMap[status] = (orderStatusMap[status] || 0) + 1;
    });

    const formattedOrderStatus = Object.entries(orderStatusMap).map(
      ([status, count]) => ({ status, count })
    );

    // Process Orders Chart Data
    const ordersChartMap: Record<string, number> = {};
    orders.forEach(({ createdAt }) => {
      const key =
        filter === "day"
          ? new Date(createdAt).getHours().toString().padStart(2, "0") + ":00"
          : format(createdAt, "yyyy-MM-dd");

      ordersChartMap[key] = (ordersChartMap[key] || 0) + 1;
    });

    const ordersChart = Object.entries(ordersChartMap).map(([date, count]) => ({
      date,
      count,
    }));

    // Process Project Distribution
    const projectOrderMap: Record<string, number> = {};
    orders.forEach(({ projectId }) => {
      if (projectId) {
        projectOrderMap[projectId] = (projectOrderMap[projectId] || 0) + 1;
      }
    });

    const projectDistribution = await Promise.all(
      Object.entries(projectOrderMap).map(async ([projectId, count]) => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true },
        });

        return {
          name: project?.name || "Unknown",
          percentage:
            totalEntries > 0 ? ((count / totalEntries) * 100).toFixed(2) : "0",
        };
      })
    );

    // Return the data
    res.json({
      success: true,
      locationsCount,
      projectsCount,
      activePromotersCount,
      totalEntries,
      activeVendorsCount,
      ordersStatus: formattedOrderStatus,
      topPromoters: topPromoters.map((p) => ({
        name: p.name || "Unknown",
        entries: p._count.orders,
      })),
      ordersChart,
      projectDistribution,
    });
  } catch (error) {
    console.error("❌ Error fetching client dashboard data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch client dashboard data",
    });
  }
};
