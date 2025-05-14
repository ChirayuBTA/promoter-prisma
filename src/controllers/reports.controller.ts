import { Request, Response } from "express";
import prisma from "../config/db";

export const getOrderReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      status,
      projectId,
      promoterId,
      startDate,
      endDate,
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
      from,
      to,
      brandId,
      cityId,
      areaId,
      vendorId,
      activityId,
      locationId,
    } = req.query;

    const whereClause: any = {};

    // Search Query
    if (search) {
      whereClause.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { orderId: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { promoter: { name: { contains: search, mode: "insensitive" } } },
        { project: { name: { contains: search, mode: "insensitive" } } },
        {
          project: {
            brand: { name: { contains: search, mode: "insensitive" } },
          },
        },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { activityLoc: { name: { contains: search, mode: "insensitive" } } },
        { activity: { name: { contains: search, mode: "insensitive" } } },
        {
          activityLoc: {
            area: { name: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    // Filters
    if (status) whereClause.status = status;
    if (projectId) whereClause.projectId = projectId;
    if (promoterId) whereClause.promoterId = promoterId;
    if (brandId) whereClause.project = { brandId };
    if (vendorId) whereClause.vendorId = vendorId;
    if (locationId) whereClause.activityLocId = locationId;
    if (activityId) whereClause.activityId = activityId;
    if (cityId) whereClause.activityLoc = { area: { cityId } };
    if (areaId) whereClause.activityLoc = { areaId };

    // Date Filters
    if (startDate || endDate) {
      whereClause.createdAt = {
        gte: startDate ? new Date(startDate as string) : undefined,
        lte: endDate ? new Date(endDate as string) : undefined,
      };
    }
    if (from || to) {
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to
        ? new Date(new Date(to as string).setHours(23, 59, 59, 999))
        : undefined;

      whereClause.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    // Build orderBy clause
    let orderByClause: any = { createdAt: "desc" }; // default fallback

    if (sortBy) {
      orderByClause = {
        [sortBy as string]: order === "asc" ? "asc" : "desc",
      };
    }

    // Fetch Orders with Related Data
    const orders = await prisma.orderCaptured.findMany({
      where: whereClause,
      include: {
        vendor: { select: { id: true, name: true } },
        promoter: { select: { id: true, name: true, phone: true } },
        project: {
          select: {
            name: true,
            brand: { select: { name: true } },
          },
        },
        activityLoc: {
          select: {
            name: true,
            address: true,
            area: {
              select: {
                name: true,
                city: { select: { name: true } },
              },
            },
          },
        },
        activity: { select: { id: true, name: true } },
      },
      orderBy: orderByClause,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    const totalOrders = await prisma.orderCaptured.count({
      where: whereClause,
    });

    // **✅ Sorting Logic Fix**
    const formattedOrders = orders.sort((a, b) => {
      let aValue: any = "";
      let bValue: any = "";

      // Handle sorting for different fields
      switch (sortBy) {
        case "customerName":
          aValue = a.customerName?.toLowerCase() || "";
          bValue = b.customerName?.toLowerCase() || "";
          break;
        case "customerPhone":
          aValue = a.customerPhone || "";
          bValue = b.customerPhone || "";
          break;
        case "orderId":
          aValue = a.orderId?.toLowerCase() || "";
          bValue = b.orderId?.toLowerCase() || "";
          break;
        case "status":
          const statusOrder = ["APPROVED", "PENDING", "REJECTED"];
          aValue = statusOrder.indexOf(a.status);
          bValue = statusOrder.indexOf(b.status);
          break;
        case "cashbackAmount":
          aValue = a.cashbackAmount || 0;
          bValue = b.cashbackAmount || 0;
          break;
        case "createdAt":
        case "updatedAt":
          aValue = new Date(a[sortBy]).getTime();
          bValue = new Date(b[sortBy]).getTime();
          break;
        case "vendor":
          aValue = a.vendor?.name?.toLowerCase() || "";
          bValue = b.vendor?.name?.toLowerCase() || "";
          break;
        case "promoter":
          aValue = a.promoter?.name?.toLowerCase() || "";
          bValue = b.promoter?.name?.toLowerCase() || "";
          break;
        case "project":
          aValue = a.project?.name?.toLowerCase() || "";
          bValue = b.project?.name?.toLowerCase() || "";
          break;
        case "brand":
          aValue = a.project?.brand?.name?.toLowerCase() || "";
          bValue = b.project?.brand?.name?.toLowerCase() || "";
          break;
        case "activityLoc":
          aValue = a.activityLoc?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.name?.toLowerCase() || "";
          break;
        case "activity":
          aValue = a.activity?.name?.toLowerCase() || "";
          bValue = b.activity?.name?.toLowerCase() || "";
          break;
        case "area":
          aValue = a.activityLoc?.area?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.area?.name?.toLowerCase() || "";
          break;
        case "city":
          aValue = a.activityLoc?.area?.city?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.area?.city?.name?.toLowerCase() || "";
          break;
        default:
          aValue = a[sortBy as keyof typeof a] || "";
          bValue = b[sortBy as keyof typeof b] || "";
      }

      // Apply sorting
      if (typeof aValue === "string" && typeof bValue === "string") {
        return order === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return order === "asc" ? aValue - bValue : bValue - aValue;
      }
    });

    // **✅ Response**
    res.json({
      success: true,
      totalOrders,
      currentPage: Number(page),
      totalPages: Math.ceil(totalOrders / Number(limit)),
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Error fetching order reports:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch order reports" });
  }
};

export const getOrderReportSummary = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "activityDate",
      order = "desc",
      page,
      limit,
      startDate,
      endDate,
      from,
      to,
      brandId,
      projectId,
      cityId,
      areaId,
      activityId,
      locationId,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const whereClause: any = {};

    // Search Query
    if (search) {
      whereClause.OR = [
        { project: { name: { contains: search, mode: "insensitive" } } },
        {
          project: {
            brand: { name: { contains: search, mode: "insensitive" } },
          },
        },
        { activity: { name: { contains: search, mode: "insensitive" } } },
        { activityLoc: { name: { contains: search, mode: "insensitive" } } },
        {
          activityLoc: {
            area: { name: { contains: search, mode: "insensitive" } },
          },
        },
        {
          activityLoc: {
            area: {
              city: { name: { contains: search, mode: "insensitive" } },
            },
          },
        },
        { orderId: { contains: search, mode: "insensitive" } },
      ];
    }

    // Apply filters
    if (projectId) whereClause.projectId = projectId;
    if (brandId) whereClause.project = { brandId };
    if (locationId) whereClause.activityLocId = locationId;
    if (activityId) whereClause.activityId = activityId;
    if (cityId) whereClause.activityLoc = { area: { cityId } };
    if (areaId) whereClause.activityLoc = { areaId };

    // Date Filters
    // if (startDate || endDate) {
    //   whereClause.createdAt = {
    //     gte: startDate ? new Date(startDate as string) : undefined,
    //     lte: endDate ? new Date(endDate as string) : undefined,
    //   };
    // }
    if (startDate || endDate) {
      const fromDate = startDate ? new Date(startDate as string) : undefined;
      const toDate = endDate
        ? new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
        : undefined;

      whereClause.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    // Support for alternative date parameter names
    if (from || to) {
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to
        ? new Date(new Date(to as string).setHours(23, 59, 59, 999))
        : undefined;

      whereClause.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    // Fetch all orders with the needed relations including IDs and slugs
    const orders = await prisma.orderCaptured.findMany({
      where: whereClause,
      select: {
        id: true,
        orderId: true,
        createdAt: true,
        projectId: true,
        activityId: true,
        activityLocId: true,
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            brand: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        activity: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        activityLoc: {
          select: {
            id: true,
            name: true,
            slug: true,
            area: {
              select: {
                id: true,
                name: true,
                slug: true,
                city: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Group the data
    const groupedData = new Map();

    orders.forEach((order) => {
      // Format the date to YYYY-MM-DD
      const activityDate = new Date(order.createdAt)
        .toISOString()
        .split("T")[0];

      // Extract all required fields with IDs and slugs
      const cityName = order.activityLoc?.area?.city?.name || "Unknown";
      const cityId = order.activityLoc?.area?.city?.id;
      const citySlug = order.activityLoc?.area?.city?.slug;

      const brandName = order.project?.brand?.name || "Unknown";
      const brandId = order.project?.brand?.id;
      const brandSlug = order.project?.brand?.slug;

      const projectName = order.project?.name || "Unknown";
      const projectId = order.project?.id;
      const projectSlug = order.project?.slug;

      const activityTypeName = order.activity?.name || "Unknown";
      const activityTypeId = order.activity?.id;
      const activityTypeSlug = order.activity?.slug;

      const areaName = order.activityLoc?.area?.name || "Unknown";
      const areaId = order.activityLoc?.area?.id;
      const areaSlug = order.activityLoc?.area?.slug;

      const societyName = order.activityLoc?.name || "Unknown";
      const societyId = order.activityLoc?.id;
      const societySlug = order.activityLoc?.slug;

      // Create a unique key for grouping
      const groupKey = `${activityDate}|${cityName}|${brandName}|${projectName}|${activityTypeName}|${areaName}|${societyName}`;

      // Get or initialize the group
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, {
          activityDate,
          city: {
            id: cityId,
            name: cityName,
            slug: citySlug,
          },
          brand: {
            id: brandId,
            name: brandName,
            slug: brandSlug,
          },
          project: {
            id: projectId,
            name: projectName,
            slug: projectSlug,
          },
          activityType: {
            id: activityTypeId,
            name: activityTypeName,
            slug: activityTypeSlug,
          },
          area: {
            id: areaId,
            name: areaName,
            slug: areaSlug,
          },
          society: {
            id: societyId,
            name: societyName,
            slug: societySlug,
          },
          ordersWithoutId: 0,
          ordersWithId: 0,
          totalOrders: 0,
        });
      }

      // Increment the appropriate counter
      const group = groupedData.get(groupKey);
      if (order.orderId) {
        group.ordersWithId++;
      } else {
        group.ordersWithoutId++;
      }
      group.totalOrders++;
    });

    // Convert the map to array for response
    let result = Array.from(groupedData.values());

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any = "";
      let bValue: any = "";

      switch (sortBy) {
        case "activityDate":
          aValue = new Date(a.activityDate).getTime();
          bValue = new Date(b.activityDate).getTime();
          break;
        case "city":
          aValue = a.city.name.toLowerCase();
          bValue = b.city.name.toLowerCase();
          break;
        case "cityId":
          aValue = a.city.id;
          bValue = b.city.id;
          break;
        case "citySlug":
          aValue = a.city.slug?.toLowerCase() || "";
          bValue = b.city.slug?.toLowerCase() || "";
          break;
        case "brand":
          aValue = a.brand.name.toLowerCase();
          bValue = b.brand.name.toLowerCase();
          break;
        case "brandId":
          aValue = a.brand.id;
          bValue = b.brand.id;
          break;
        case "brandSlug":
          aValue = a.brand.slug?.toLowerCase() || "";
          bValue = b.brand.slug?.toLowerCase() || "";
          break;
        case "project":
          aValue = a.project.name.toLowerCase();
          bValue = b.project.name.toLowerCase();
          break;
        case "projectId":
          aValue = a.project.id;
          bValue = b.project.id;
          break;
        case "projectSlug":
          aValue = a.project.slug?.toLowerCase() || "";
          bValue = b.project.slug?.toLowerCase() || "";
          break;
        case "activityType":
          aValue = a.activityType.name.toLowerCase();
          bValue = b.activityType.name.toLowerCase();
          break;
        case "activityTypeId":
          aValue = a.activityType.id;
          bValue = b.activityType.id;
          break;
        case "activityTypeSlug":
          aValue = a.activityType.slug?.toLowerCase() || "";
          bValue = b.activityType.slug?.toLowerCase() || "";
          break;
        case "area":
          aValue = a.area.name.toLowerCase();
          bValue = b.area.name.toLowerCase();
          break;
        case "areaId":
          aValue = a.area.id;
          bValue = b.area.id;
          break;
        case "areaSlug":
          aValue = a.area.slug?.toLowerCase() || "";
          bValue = b.area.slug?.toLowerCase() || "";
          break;
        case "society":
          aValue = a.society.name.toLowerCase();
          bValue = b.society.name.toLowerCase();
          break;
        case "societyId":
          aValue = a.society.id;
          bValue = b.society.id;
          break;
        case "societySlug":
          aValue = a.society.slug?.toLowerCase() || "";
          bValue = b.society.slug?.toLowerCase() || "";
          break;
        case "ordersWithId":
          aValue = a.ordersWithId;
          bValue = b.ordersWithId;
          break;
        case "ordersWithoutId":
          aValue = a.ordersWithoutId;
          bValue = b.ordersWithoutId;
          break;
        case "totalOrders":
          aValue = a.totalOrders;
          bValue = b.totalOrders;
          break;
        default:
          aValue = a[sortBy as keyof typeof a] || "";
          bValue = b[sortBy as keyof typeof b] || "";
      }

      // Apply sorting
      if (typeof aValue === "string" && typeof bValue === "string") {
        return order === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return order === "asc" ? aValue - bValue : bValue - aValue;
      }
    });

    // Apply pagination
    // const totalGroups = result.length;
    // const pageNumber = Number(page);
    // const pageSize = Number(limit);
    // const startIndex = (pageNumber - 1) * pageSize;
    // const endIndex = startIndex + pageSize;

    // Slice the result array for pagination
    // result = result.slice(startIndex, endIndex);

    const totalCount = result.length;
    if (pageNumber && pageSize) {
      result = result.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    }

    res.json({
      success: true,
      totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      groupedStats: result,
    });
  } catch (error) {
    console.error("Error fetching grouped order statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grouped order statistics",
    });
  }
};

export const getExcelOrderReports = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      status,
      projectId,
      promoterId,
      startDate,
      endDate,
      from,
      to,
      sortBy = "createdAt",
      order = "desc",
      brandId,
      cityId,
      areaId,
      vendorId,
      activityId,
      locationId,
    } = req.query;

    const whereClause: any = {};

    // Search
    if (search) {
      whereClause.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { orderId: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { promoter: { name: { contains: search, mode: "insensitive" } } },
        { project: { name: { contains: search, mode: "insensitive" } } },
        {
          project: {
            brand: { name: { contains: search, mode: "insensitive" } },
          },
        },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { activityLoc: { name: { contains: search, mode: "insensitive" } } },
        { activity: { name: { contains: search, mode: "insensitive" } } },
        {
          activityLoc: {
            area: { name: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    // Filters
    if (status) whereClause.status = status;
    if (projectId) whereClause.projectId = projectId;
    if (promoterId) whereClause.promoterId = promoterId;
    if (brandId) whereClause.project = { brandId };
    if (vendorId) whereClause.vendorId = vendorId;
    if (locationId) whereClause.activityLocId = locationId;
    if (activityId) whereClause.activityId = activityId;
    if (cityId) whereClause.activityLoc = { area: { cityId } };
    if (areaId) whereClause.activityLoc = { areaId };

    // Date Filters
    if (startDate || endDate) {
      whereClause.createdAt = {
        gte: startDate ? new Date(startDate as string) : undefined,
        lte: endDate ? new Date(endDate as string) : undefined,
      };
    }
    if (from || to) {
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to
        ? new Date(new Date(to as string).setHours(23, 59, 59, 999))
        : undefined;

      whereClause.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    const orders = await prisma.orderCaptured.findMany({
      where: whereClause,
      include: {
        vendor: { select: { id: true, name: true } },
        promoter: { select: { id: true, name: true, phone: true } },
        project: {
          select: {
            name: true,
            brand: { select: { name: true } },
          },
        },
        activityLoc: {
          select: {
            name: true,
            address: true,
            area: {
              select: {
                name: true,
                city: { select: { name: true } },
              },
            },
          },
        },
        activity: { select: { id: true, name: true } },
      },
    });

    // Optional: total count
    const totalOrders = orders.length;

    const formattedOrders = orders.sort((a, b) => {
      let aValue: any = "";
      let bValue: any = "";

      switch (sortBy) {
        case "customerName":
          aValue = a.customerName?.toLowerCase() || "";
          bValue = b.customerName?.toLowerCase() || "";
          break;
        case "customerPhone":
          aValue = a.customerPhone || "";
          bValue = b.customerPhone || "";
          break;
        case "orderId":
          aValue = a.orderId?.toLowerCase() || "";
          bValue = b.orderId?.toLowerCase() || "";
          break;
        case "status":
          const statusOrder = ["APPROVED", "PENDING", "REJECTED"];
          aValue = statusOrder.indexOf(a.status);
          bValue = statusOrder.indexOf(b.status);
          break;
        case "cashbackAmount":
          aValue = a.cashbackAmount || 0;
          bValue = b.cashbackAmount || 0;
          break;
        case "createdAt":
        case "updatedAt":
          aValue = new Date(a[sortBy]).getTime();
          bValue = new Date(b[sortBy]).getTime();
          break;
        case "vendor":
          aValue = a.vendor?.name?.toLowerCase() || "";
          bValue = b.vendor?.name?.toLowerCase() || "";
          break;
        case "promoter":
          aValue = a.promoter?.name?.toLowerCase() || "";
          bValue = b.promoter?.name?.toLowerCase() || "";
          break;
        case "project":
          aValue = a.project?.name?.toLowerCase() || "";
          bValue = b.project?.name?.toLowerCase() || "";
          break;
        case "brand":
          aValue = a.project?.brand?.name?.toLowerCase() || "";
          bValue = b.project?.brand?.name?.toLowerCase() || "";
          break;
        case "activityLoc":
          aValue = a.activityLoc?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.name?.toLowerCase() || "";
          break;
        case "activity":
          aValue = a.activity?.name?.toLowerCase() || "";
          bValue = b.activity?.name?.toLowerCase() || "";
          break;
        case "area":
          aValue = a.activityLoc?.area?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.area?.name?.toLowerCase() || "";
          break;
        case "city":
          aValue = a.activityLoc?.area?.city?.name?.toLowerCase() || "";
          bValue = b.activityLoc?.area?.city?.name?.toLowerCase() || "";
          break;
        default:
          aValue = a[sortBy as keyof typeof a] || "";
          bValue = b[sortBy as keyof typeof b] || "";
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return order === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return order === "asc" ? aValue - bValue : bValue - aValue;
      }
    });

    res.json({
      success: true,
      totalOrders,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Error fetching all order reports:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch all order reports" });
  }
};

export const getOrderReportByIds = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of order IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of order IDs.",
      });
      return;
    }

    // Fetch orders by IDs
    const orders = await prisma.orderCaptured.findMany({
      where: { id: { in: ids } },
      include: {
        vendor: { select: { id: true, name: true } },
        promoter: { select: { id: true, name: true, phone: true } },
        project: {
          select: {
            name: true,
            brand: { select: { name: true } },
          },
        },
        activityLoc: {
          select: {
            name: true,
            address: true,
            area: {
              select: {
                name: true,
                city: { select: { name: true } },
              },
            },
          },
        },
        activity: { select: { id: true, name: true } },
      },
    });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("❌ Error fetching orders by IDs:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch orders." });
  }
};

export const getOrderDashboardOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get total counts for different order statuses
    const totalOrders = await prisma.orderCaptured.count();
    const pendingOrders = await prisma.orderCaptured.count({
      where: { status: "PENDING" },
    });
    const approvedOrders = await prisma.orderCaptured.count({
      where: { status: "APPROVED" },
    });
    const rejectedOrders = await prisma.orderCaptured.count({
      where: { status: "REJECTED" },
    });

    // Get recent orders (latest 5)
    const recentOrders = await prisma.orderCaptured.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        promoter: { select: { name: true } },
        project: { select: { name: true } },
        activityLoc: { select: { name: true, address: true } },
      },
    });

    // Data for Pie Chart (Pending, Approved, Rejected)
    const pieChartData = [
      { status: "Pending", count: pendingOrders },
      { status: "Approved", count: approvedOrders },
      { status: "Rejected", count: rejectedOrders },
    ];

    // Fetch all orders createdAt dates
    const orderDates = await prisma.orderCaptured.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group orders by date manually
    const orderTrendsMap: Record<string, number> = {};

    orderDates.forEach((order) => {
      const date = order.createdAt.toISOString().split("T")[0]; // Extract date part
      orderTrendsMap[date] = (orderTrendsMap[date] || 0) + 1;
    });

    const statisticsGraph = Object.entries(orderTrendsMap).map(
      ([date, count]) => ({
        date,
        count,
      })
    );

    res.json({
      success: true,
      totalOrders,
      pendingOrders,
      approvedOrders,
      rejectedOrders,
      recentOrders,
      pieChartData,
      statisticsGraph,
    });
  } catch (error) {
    console.error("Error fetching dashboard overview:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data" });
  }
};

export const getOrderDashboardOverviewByBrandId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { brandId } = req.query;

    if (!brandId || typeof brandId !== "string") {
      res.status(400).json({
        success: false,
        message: "brandId query parameter is required",
      });
      return;
    }

    // First verify the brand exists
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) {
      res.status(404).json({ success: false, message: "Brand not found" });
      return;
    }

    // Get projects associated with this brand
    const brandProjects = await prisma.project.findMany({
      where: { brandId },
      select: { id: true },
    });

    const projectIds = brandProjects.map((project) => project.id);

    // Get total counts for different order statuses for this brand's projects
    const totalOrders = await prisma.orderCaptured.count({
      where: { projectId: { in: projectIds } },
    });

    const pendingOrders = await prisma.orderCaptured.count({
      where: {
        projectId: { in: projectIds },
        status: "PENDING",
      },
    });

    const approvedOrders = await prisma.orderCaptured.count({
      where: {
        projectId: { in: projectIds },
        status: "APPROVED",
      },
    });

    const rejectedOrders = await prisma.orderCaptured.count({
      where: {
        projectId: { in: projectIds },
        status: "REJECTED",
      },
    });

    // Get recent orders (latest 5) for this brand's projects
    const recentOrders = await prisma.orderCaptured.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        promoter: { select: { name: true, phone: true } },
        project: { select: { name: true } },
        activityLoc: { select: { name: true, address: true } },
        vendor: { select: { name: true } },
      },
    });

    // Data for Pie Chart (Pending, Approved, Rejected)
    const pieChartData = [
      { status: "Pending", count: pendingOrders },
      { status: "Approved", count: approvedOrders },
      { status: "Rejected", count: rejectedOrders },
    ];

    // Fetch all orders createdAt dates for this brand's projects
    const orderDates = await prisma.orderCaptured.findMany({
      where: { projectId: { in: projectIds } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group orders by date manually
    const orderTrendsMap: Record<string, number> = {};

    orderDates.forEach((order) => {
      const date = order.createdAt.toISOString().split("T")[0]; // Extract date part
      orderTrendsMap[date] = (orderTrendsMap[date] || 0) + 1;
    });

    const statisticsGraph = Object.entries(orderTrendsMap).map(
      ([date, count]) => ({
        date,
        count,
      })
    );

    // Get project performance metrics
    const projectPerformance = await prisma.project.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    // Format project performance data
    const projectMetrics = projectPerformance.map((project) => ({
      projectName: project.name,
      orderCount: project._count.orders,
    }));

    // Get vendor performance for this brand's projects
    const vendorPerformance = await prisma.vendor.findMany({
      where: {
        projects: {
          some: {
            project: {
              brandId,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    // Format vendor performance data
    const vendorMetrics = vendorPerformance.map((vendor) => ({
      vendorName: vendor.name,
      orderCount: vendor._count.orders,
    }));

    res.json({
      success: true,
      brand: {
        id: brand.id,
        name: brand.name,
      },
      totalOrders,
      pendingOrders,
      approvedOrders,
      rejectedOrders,
      recentOrders,
      pieChartData,
      statisticsGraph,
      projectMetrics,
      vendorMetrics,
    });
  } catch (error) {
    console.error("Error fetching brand dashboard overview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch brand dashboard data",
    });
  }
};

export const updateOrderStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { orders } = req.body; // Expecting an array of orders [{ id or orderId, status }]

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of orders.",
      });
      return;
    }

    // Update orders in bulk
    const updatePromises = orders.map(async (order: any) => {
      if (!order.id && !order.orderId) return null; // Ensure at least one identifier is present
      if (!order.status) return null; // Ensure status is provided

      return prisma.orderCaptured.updateMany({
        where: {
          OR: [{ id: order.id }, { orderId: order.orderId }],
        },
        data: { status: order.status },
      });
    });

    const updatedOrders = await Promise.all(updatePromises);

    // Count successful updates
    const updatedCount = updatedOrders.filter((order) => order !== null).length;

    res.json({
      success: true,
      message: `Updated ${updatedCount} orders successfully.`,
    });
  } catch (error) {
    console.error("❌ Error updating orders:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update orders." });
  }
};

export const getPromoterReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      promoterId,
      projectId,
      vendorId,
      brandId,
      cityId,
      areaId,
      locationId,
      activityId,
      activeToday,
      sortBy = "totalOrders",
      order = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Get the start and end of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create time ranges for 9am to 9pm in 1-hour intervals
    const timeRanges = [];
    for (let hour = 1; hour < 23; hour++) {
      const startTime = new Date(today);
      startTime.setHours(hour, 0, 0, 0);

      const endTime = new Date(today);
      endTime.setHours(hour + 1, 0, 0, 0);

      timeRanges.push({
        label: `${hour}:00 - ${hour + 1}:00`,
        start: startTime,
        end: endTime,
      });
    }

    // Define the where clause for promoters
    const whereClause: any = {};

    // Basic filters
    if (promoterId) whereClause.id = promoterId;
    if (vendorId) whereClause.vendorId = vendorId;

    // Project and brand filters
    if (projectId || brandId) {
      whereClause.projects = {
        some: {
          ...(projectId && { projectId }),
          ...(brandId && { project: { brandId } }),
        },
      };
    }

    // City and area filters through connected orders
    if (cityId || areaId) {
      whereClause.orders = {
        some: {
          activityLoc: {
            area: {
              ...(cityId && { cityId }),
              ...(areaId && { id: areaId }),
            },
          },
        },
      };
    }

    // Location filter through connected orders
    if (locationId) {
      whereClause.orders = {
        some: {
          activityLocId: locationId,
        },
      };
    }

    // Activity filter through connected orders
    if (activityId) {
      whereClause.orders = {
        some: {
          activityId,
        },
      };
    }

    // Search filter (look for matches in name, phone, email, or connected vendor/project names)
    if (search && search.toString().trim() !== "") {
      const searchTerm = search.toString().trim();
      whereClause.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { phone: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { vendor: { name: { contains: searchTerm, mode: "insensitive" } } },
        {
          projects: {
            some: {
              project: {
                name: { contains: searchTerm, mode: "insensitive" },
              },
            },
          },
        },
        {
          projects: {
            some: {
              project: {
                brand: {
                  name: { contains: searchTerm, mode: "insensitive" },
                },
              },
            },
          },
        },
      ];
    }

    // Get all promoters with the defined filters
    const promoters = await prisma.promoter.findMany({
      where: whereClause,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                brand: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Process results for each promoter
    let results = await Promise.all(
      promoters.map(async (promoter) => {
        // Check if promoter was active today
        const wasActiveToday = promoter.lastActive
          ? new Date(promoter.lastActive) >= today &&
            new Date(promoter.lastActive) < tomorrow
          : false;

        // Skip this promoter if activeToday filter is applied and doesn't match
        if (
          activeToday !== undefined &&
          String(wasActiveToday) !== String(activeToday)
        ) {
          return null;
        }

        // Additional filters for orders
        const orderWhereClause: any = {
          promoterId: promoter.id,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        };

        // Add locationId filter if provided
        if (locationId) orderWhereClause.activityLocId = locationId;

        // Add activityId filter if provided
        if (activityId) orderWhereClause.activityId = activityId;

        // Get orders for this promoter today with filters
        const orders = await prisma.orderCaptured.findMany({
          where: orderWhereClause,
          include: {
            project: {
              select: {
                id: true,
                name: true,
                brand: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            vendor: {
              select: {
                id: true,
                name: true,
              },
            },
            activity: {
              select: {
                id: true,
                name: true,
              },
            },
            activityLoc: {
              select: {
                id: true,
                name: true,
                area: {
                  select: {
                    id: true,
                    name: true,
                    city: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        // Calculate hourly breakdown
        const hourlyBreakdown = timeRanges.map((range) => {
          const ordersInRange = orders.filter(
            (order) =>
              order.createdAt >= range.start && order.createdAt < range.end
          );

          return {
            timeRange: range.label,
            count: ordersInRange.length,
            orders: ordersInRange.map((order) => ({
              id: order.id,
              orderId: order.orderId,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              status: order.status,
              cashbackAmount: order.cashbackAmount,
              createdAt: order.createdAt,
              project: order.project,
              vendor: order.vendor,
              activity: order.activity,
              location: order.activityLoc,
            })),
          };
        });

        return {
          promoter: {
            id: promoter.id,
            name: promoter.name,
            phone: promoter.phone,
            email: promoter.email,
            vendorId: promoter.vendorId,
            vendor: promoter.vendor,
            projects: promoter.projects.map((p) => p.project),
            lastActive: promoter.lastActive,
          },
          activeToday: wasActiveToday,
          hourlyBreakdown,
          totalOrders: orders.length,
        };
      })
    );

    // Filter out null results (from activeToday filter)
    results = results.filter((result) => result !== null);

    // Apply sorting
    if (sortBy) {
      results.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortBy.toString()) {
          case "name":
            aValue = a?.promoter?.name?.toLowerCase() || "";
            bValue = b?.promoter?.name?.toLowerCase() || "";
            break;
          case "phone":
            aValue = a?.promoter?.phone || "";
            bValue = b?.promoter?.phone || "";
            break;
          case "email":
            aValue = a?.promoter?.email?.toLowerCase() || "";
            bValue = b?.promoter?.email?.toLowerCase() || "";
            break;
          case "vendor":
            aValue = a?.promoter?.vendor?.name?.toLowerCase() || "";
            bValue = b?.promoter?.vendor?.name?.toLowerCase() || "";
            break;
          case "lastActive":
            aValue = a?.promoter?.lastActive
              ? new Date(a.promoter.lastActive).getTime()
              : 0;
            bValue = b?.promoter?.lastActive
              ? new Date(b.promoter.lastActive).getTime()
              : 0;
            break;
          case "activeToday":
            aValue = a?.activeToday ? 1 : 0;
            bValue = b?.activeToday ? 1 : 0;
            break;
          case "totalOrders":
          default:
            aValue = a?.totalOrders || 0;
            bValue = b?.totalOrders || 0;
            break;
        }

        // Apply order (asc or desc)
        if (order.toString().toLowerCase() === "asc") {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }

    // Apply pagination
    const totalResults = results.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedResults = results.slice(startIndex, endIndex);

    res.json({
      success: true,
      date: today.toISOString().split("T")[0],
      totalPromoters: totalResults,
      totalActivePromoters: results.filter((r) => r.activeToday).length,
      totalOrders: results.reduce((sum, r) => sum + r.totalOrders, 0),
      currentPage: Number(page),
      totalPages: Math.ceil(totalResults / Number(limit)),
      promoters: paginatedResults,
    });
  } catch (error) {
    console.error("Error fetching promoter report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch promoter report",
    });
  }
};

export const getProjectReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const filters: any = {};
    if (startDate || endDate) {
      const fromDate = startDate ? new Date(startDate as string) : undefined;
      const toDate = endDate
        ? new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
        : undefined;

      filters.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    const projects = await prisma.project.findMany({
      where: filters,
      include: {
        _count: { select: { orders: true, promoters: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        totalOrders: p._count.orders,
        totalPromoters: p._count.promoters,
      })),
    });
  } catch (error) {
    console.error("Error fetching project reports:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch project reports" });
  }
};

// GET /api/activity-images-summary

export const getActivityImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const images = await prisma.activityImages.findMany({
      where: {
        promoterId: {
          not: null,
        },
      },
      select: {
        imgURL: true,
        activityLocation: {
          select: {
            name: true,
            ProjectLocation: {
              select: {
                project: {
                  select: {
                    name: true,
                    brand: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        promoter: {
          select: {
            name: true,
          },
        },
      },
    });

    // Group by promoter + activityLocation + project
    const grouped = {};

    for (const img of images) {
      const locationName = img.activityLocation?.name || "Unknown Location";
      const projectData = img.activityLocation?.ProjectLocation?.[0]?.project;
      const projectName = projectData?.name || "Unknown Project";
      const brandName = projectData?.brand?.name || "Unknown Brand";
      const promoterName = img.promoter?.name || "Unknown Promoter";

      const key = `${locationName}_${projectName}_${promoterName}`;

      if (!grouped[key]) {
        grouped[key] = {
          activityLocationName: locationName,
          projectName,
          brandName,
          promoterName,
          images: [],
        };
      }

      grouped[key].images.push(img.imgURL);
    }

    res.json(Object.values(grouped));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateOrderReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      id,
      orderId,
      customerName,
      customerPhone,
      orderAddress,
      orderPlacedAt,
      cashbackAmount,
      projectId,
    } = req.body;

    const existingOrder = await prisma.orderCaptured.findFirst({
      where: {
        orderId: orderId,
        projectId: projectId || undefined,
        NOT: {
          id: id,
        },
      },
    });

    if (existingOrder) {
      res
        .status(400)
        .json({ success: false, message: "Order ID already exists" });
      return;
    }

    const updateOrder = await prisma.orderCaptured.update({
      where: {
        id: id,
      },
      data: {
        orderId: orderId,
        customerName: customerName,
        customerPhone: customerPhone,
        orderAddress: orderAddress,
        orderPlacedAt: orderPlacedAt,
        cashbackAmount: cashbackAmount,
      },
    });

    res.json({
      success: true,
      message: `Updated  orders successfully.`,
      Order: updateOrder,
    });
  } catch (error) {
    console.error("❌ Error updating orders:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update orders." });
  }
};
