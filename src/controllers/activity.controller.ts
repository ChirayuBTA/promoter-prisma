import { Request, Response } from "express";
import prisma from "../config/db";
import { create_slug } from "../helper/createSlug";
/**
 * @desc Create a new activity
 * @route POST /activity
 */
export const createActivity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let { name, status = "ACTIVE", createdBy } = req.body;

    name = name?.trim();
    const slug = create_slug(name);
    if (!name) {
      res
        .status(400)
        .json({ success: false, message: "Activity name is required" });
      return;
    }

    // Check for duplicate activity name
    const existingActivity = await prisma.activity.findFirst({
      where: {
        name: { equals: name.trim().replace(/\s+/g, " "), mode: "insensitive" },
      },
    });

    if (existingActivity) {
      res.status(400).json({
        success: false,
        message: "Activity with this name already exists",
      });
      return;
    }

    // Create new activity
    const newActivity = await prisma.activity.create({
      data: {
        name,
        slug,
        status,
        createdBy,
      },
    });

    res.status(201).json({ success: true, data: newActivity });
  } catch (error) {
    console.error("❌ Error creating activity:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create activity" });
  }
};

/**
 * @desc Update an activity
 * @route PUT /activity/:id
 */
export const updateActivity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let { name, status, updatedBy } = req.body;

    name = name?.trim();

    const existingActivity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!existingActivity) {
      res.status(404).json({ success: false, message: "Activity not found" });
      return;
    }

    // Check if the new name is already taken by another activity
    if (name && name !== existingActivity.name) {
      const duplicateActivity = await prisma.activity.findFirst({
        where: {
          name: {
            equals: name.trim().replace(/\s+/g, " "),
            mode: "insensitive",
          },
        },
      });

      if (duplicateActivity) {
        res.status(400).json({
          success: false,
          message: "Activity with this name already exists",
        });
        return;
      }
    }

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: { name, status, updatedBy },
    });

    res.json({
      success: true,
      message: "Activity updated successfully",
      data: updatedActivity,
    });
  } catch (error) {
    console.error("❌ Error updating activity:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update activity" });
  }
};

/**
 * @desc Update status of multiple activity
 * @route PATCH /activity/updateSelectedActivityStatus
 */
export const updateSelectedActivityStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of activity IDs.",
      });
      return;
    }

    if (!status || !["ACTIVE", "INACTIVE"].includes(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid status. Status must be either ACTIVE or INACTIVE.",
      });
      return;
    }

    // Check if all Activities exist
    const existingActivities = await prisma.activity.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingActivities.length !== ids.length) {
      // Some Activities were not found
      const existingIds = existingActivities.map((activity) => activity.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some Activities were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified activities
    const updateResult = await prisma.activity.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} activities.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating activities status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update activities status",
    });
  }
};

/**
 * @desc Get all activities
 * @route GET /activities
 */
export const getAllActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "createdAt",
      order = "desc",
      page,
      limit,
      createdBy,
      status,
      from,
      to,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    // ✅ Filtering
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (createdBy) where.createdBy = createdBy;

    // if (from || to) {
    //   where.createdAt = {};
    //   if (from) where.createdAt.gte = new Date(from);
    //   if (to) where.createdAt.lte = new Date(to);
    // }
    if (from || to) {
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to
        ? new Date(new Date(to as string).setHours(23, 59, 59, 999))
        : undefined;

      where.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }
    if (status) where.status = status;

    // ✅ Fetch activities including activityLocation details
    let activities = await prisma.activity.findMany({
      where,
      include: { activityLocation: true }, // Include activity location details
    });

    // ✅ Sorting
    activities.sort((a, b) => {
      const fieldA = (a as any)[sortBy];
      const fieldB = (b as any)[sortBy];

      if (typeof fieldA === "string" && typeof fieldB === "string") {
        return order.toLowerCase() === "asc"
          ? fieldA.localeCompare(fieldB)
          : fieldB.localeCompare(fieldA);
      }
      return order.toLowerCase() === "asc" ? fieldA - fieldB : fieldB - fieldA;
    });

    // ✅ Pagination
    const totalCount = activities.length;
    if (pageNumber && pageSize) {
      activities = activities.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: activities,
    });
  } catch (error) {
    console.error("❌ Error fetching activities:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch activities" });
  }
};

/**
 * @desc Get a single activity by ID
 * @route GET /activity/:id
 */
export const getActivityById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const activity = await prisma.activity.findUnique({
      where: { id },
      include: { activityLocation: true }, // Include related activity locations
    });

    if (!activity) {
      res.status(404).json({ success: false, message: "Activity not found" });
      return;
    }

    res.json({ success: true, data: activity });
  } catch (error) {
    console.error("❌ Error fetching activity:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch activity" });
  }
};

/**
 * @desc Delete activities
 * @route DELETE /activities
 */
export const deleteActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of activity IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of activity IDs.",
      });
      return;
    }

    // Delete activities
    const deleteResult = await prisma.activity.deleteMany({
      where: { id: { in: ids } },
    });

    if (deleteResult.count === 0) {
      res.status(404).json({
        success: false,
        message: "No activities found for the given IDs.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} activities.`,
    });
  } catch (error) {
    console.error("❌ Error deleting activities:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete activities." });
  }
};

/**
 * @desc Get selected activities based on provided IDs
 * @route POST /activities/download
 */
export const getSelectedActivitiesDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of activity IDs.",
      });
      return;
    }

    // Fetch selected activities
    const activities = await prisma.activity.findMany({
      where: { id: { in: ids } },
      include: { activityLocation: true }, // Include related activity locations
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    console.error("❌ Error fetching selected activities:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch selected activities" });
  }
};
