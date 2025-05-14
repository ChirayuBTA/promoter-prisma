import { Request, Response } from "express";
import prisma from "../config/db";
import { create_slug } from "../helper/createSlug";
import { generatePromoCode } from "../utils/promoCodeUtil";

/**
 * @desc Create a new activity location
 * @route POST /activity-location
 */
export const createActivityLocation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      address,
      areaId,
      status = "ACTIVE",
      activityId,
      pincode,
      projectIds = [],
    } = req.body;

    name = name?.trim();
    address = address?.trim();

    if (!name || !address || !areaId || !activityId) {
      res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
      return;
    }

    // ✅ Check for existing location
    const existingLocation = await prisma.activityLocation.findFirst({
      where: {
        name: { equals: name.trim().replace(/\s+/g, " "), mode: "insensitive" },
        areaId,
        activityId,
      },
    });
    if (existingLocation) {
      res.status(400).json({
        success: false,
        message:
          "Activity location with the same name already exists in this area",
      });
      return;
    }

    let slugBase = create_slug(name);
    let slug = slugBase;
    let counter = 1;

    while (
      await prisma.activityLocation.findFirst({
        where: { slug },
      })
    ) {
      slug = `${slugBase}-${counter}`;
      counter++;
    }

    // ✅ Create new location
    const newActivityLocation = await prisma.activityLocation.create({
      data: {
        name,
        slug,
        address,
        areaId,
        status,
        activityId,
        pincode,
      },
    });

    // ✅ Insert project-location mappings if projectIds provided
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      const mappings = projectIds.map((projectId: string) => ({
        projectId,
        activityLocationId: newActivityLocation.id,
      }));

      await prisma.projectLocation.createMany({
        data: mappings,
        skipDuplicates: true,
      });
    }

    // for (const projectId of projectIds) {
    //   // Get vendors for the project
    //   const projectVendors = await prisma.projectVendor.findMany({
    //     where: { projectId },
    //     include: { vendor: true },
    //   });

    //   for (const { vendor } of projectVendors) {
    //     let promoCode;
    //     // const promoCode = generatePromoCode(name); // Still using society name or anything else you prefer
    //     promoCode = Math.floor(100000 + Math.random() * 900000).toString();

    //     const duplicatePromoCode = await prisma.projectPromoCode.findFirst({
    //       where: { code: promoCode },
    //     });

    //     if (duplicatePromoCode) {
    //       promoCode = Math.floor(100000 + Math.random() * 900000).toString();
    //     }

    //     const city = await prisma.area.findFirst({
    //       where: { id: areaId },
    //       include: { city: true },
    //     });
    //     console.log("cityyyyyyy", city);
    //     await prisma.projectPromoCode.create({
    //       data: {
    //         code: promoCode,
    //         projectId,
    //         vendorId: vendor.id,
    //         activityLocationId: newActivityLocation.id,
    //         cityId: city.cityId,
    //       },
    //     });
    //   }
    // }

    res.status(201).json({
      success: true,
      data: newActivityLocation,
      message: "Activity location created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating activity location:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create activity location" });
  }
};

/**
 * @desc Update an activity location
 * @route PUT /activity-location/:id
 */
export const updateActivityLocation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let {
      name,
      address,
      areaId,
      status,
      activityId,
      pincode,
      projectIds = [],
    } = req.body;

    name = name?.trim();
    address = address?.trim();

    const existingLocation = await prisma.activityLocation.findUnique({
      where: { id },
    });

    if (!existingLocation) {
      res
        .status(404)
        .json({ success: false, message: "Activity location not found" });
      return;
    }

    if (name || areaId || activityId) {
      const duplicateLocation = await prisma.activityLocation.findFirst({
        where: {
          name: name?.trim().replace(/\s+/g, " ") || existingLocation.name,
          areaId: areaId || existingLocation.areaId,
          activityId: activityId || existingLocation.activityId,
          NOT: { id }, // Exclude current record
        },
      });

      if (duplicateLocation) {
        res.status(400).json({
          success: false,
          message:
            "Activity location with the same name already exists in this area",
        });
        return;
      }
    }

    // ✅ Update the activity location details
    const updatedActivityLocation = await prisma.activityLocation.update({
      where: { id },
      data: { name, address, areaId, status, activityId, pincode },
    });

    // ✅ Update related projects
    if (Array.isArray(projectIds)) {
      // 1. Delete existing relations
      await prisma.projectLocation.deleteMany({
        where: { activityLocationId: id },
      });

      // 2. Add new relations
      if (projectIds.length > 0) {
        const newMappings = projectIds.map((projectId: string) => ({
          projectId,
          activityLocationId: id,
        }));

        await prisma.projectLocation.createMany({
          data: newMappings,
          skipDuplicates: true,
        });
      }
    }

    res.json({
      success: true,
      message: "Activity location updated successfully",
      data: updatedActivityLocation,
    });
  } catch (error) {
    console.error("❌ Error updating activity location:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update activity location" });
  }
};

/**
 * @desc Update status of multiple activity location
 * @route PATCH /activity-location/updateSelectedActivityLocationStatus
 */
export const updateSelectedActivityLocationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message:
          "Invalid request. Please provide an array of activity location IDs.",
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

    // Check if all Activity Locations exist
    const existingActivityLocations = await prisma.activityLocation.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingActivityLocations.length !== ids.length) {
      // Some Activity Locations were not found
      const existingIds = existingActivityLocations.map(
        (activityLocation) => activityLocation.id
      );
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some Activity Locations were not found: ${missingIds.join(
          ", "
        )}`,
      });
      return;
    }

    // Update status of all specified activity locations
    const updateResult = await prisma.activityLocation.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} activity locations.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating activity locations status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update activity locations status",
    });
  }
};

/**
 * @desc Get all activity locations
 * @route GET /activity-locations
 */

export const getAllActivityLocations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "createdAt",
      order = "desc",
      page,
      status,
      limit,
      areaId,
      activityId,
      projectId,
      from,
      to,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { area: { name: { contains: search, mode: "insensitive" } } },
        { activity: { name: { contains: search, mode: "insensitive" } } },
        { area: { city: { name: { contains: search, mode: "insensitive" } } } },
        {
          ProjectLocation: {
            some: {
              project: { name: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ];
    }

    if (areaId) where.areaId = areaId;
    if (activityId) where.activityId = activityId;
    if (status) where.status = status;

    if (projectId) {
      where.ProjectLocation = {
        some: {
          projectId,
        },
      };
    }

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

    let activityLocations = await prisma.activityLocation.findMany({
      where,
      include: {
        area: {
          include: {
            city: true,
          },
        },
        activity: true,
        orders: true,
        images: true,
        ProjectLocation: {
          include: {
            project: true,
          },
        },
      },
    });

    // Add flattened `projects` array
    activityLocations = activityLocations.map((location) => ({
      ...location,
      projects: location.ProjectLocation.map((pl) => pl.project),
    }));

    // Sort logic
    if (sortBy === "area") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? a.area?.name.localeCompare(b.area?.name)
          : b.area?.name.localeCompare(a.area?.name)
      );
    } else if (sortBy === "activity") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? a.activity?.name.localeCompare(b.activity?.name)
          : b.activity?.name.localeCompare(a.activity?.name)
      );
    } else if (sortBy === "city") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? a.area?.city?.name.localeCompare(b.area?.city?.name)
          : b.area?.city?.name.localeCompare(a.area?.city?.name)
      );
    } else {
      activityLocations.sort((a, b) => {
        const fieldA = (a as any)[sortBy];
        const fieldB = (b as any)[sortBy];

        if (typeof fieldA === "string" && typeof fieldB === "string") {
          return order === "asc"
            ? fieldA.localeCompare(fieldB)
            : fieldB.localeCompare(fieldA);
        }
        return order === "asc" ? fieldA - fieldB : fieldB - fieldA;
      });
    }

    const totalCount = activityLocations.length;

    if (pageNumber && pageSize) {
      activityLocations = activityLocations.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: activityLocations,
    });
  } catch (error) {
    console.error("❌ Error fetching activity locations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity locations",
    });
  }
};

/**
 * @desc Get all activity locations by brand Id
 * @route GET /activity-locations?brandId
 */

export const getActivityLocationsByBrand = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      brandId,
      search = "",
      sortBy = "createdAt",
      order = "desc",
      page,
      status,
      limit,
      areaId,
      activityId,
      cityId, // Added cityId parameter
      from,
      to,
    } = req.query as Record<string, string>;

    // Validate brandId is provided
    if (!brandId) {
      res.status(400).json({
        success: false,
        message: "brandId is required",
      });
      return;
    }

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {
      // Filter for activity locations associated with projects of the specified brand
      ProjectLocation: {
        some: {
          project: {
            brandId: brandId,
          },
        },
      },
    };

    // Add additional filters
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { area: { name: { contains: search, mode: "insensitive" } } },
        { activity: { name: { contains: search, mode: "insensitive" } } },
        { area: { city: { name: { contains: search, mode: "insensitive" } } } },
        {
          ProjectLocation: {
            some: {
              project: { name: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ];
    }

    if (areaId) where.areaId = areaId;
    if (activityId) where.activityId = activityId;
    if (status) where.status = status;

    // Add city filter if cityId is provided
    if (cityId) {
      where.area = {
        ...where.area,
        cityId: cityId,
      };
    }

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

    let activityLocations = await prisma.activityLocation.findMany({
      where,
      include: {
        area: {
          include: {
            city: true,
          },
        },
        activity: true,
        orders: true,
        images: true,
        ProjectLocation: {
          include: {
            project: {
              include: {
                brand: true, // Include brand data for reference
              },
            },
          },
        },
      },
    });

    // Add flattened `projects` array and ensure they only belong to the requested brand
    activityLocations = activityLocations.map((location) => ({
      ...location,
      projects: location.ProjectLocation.map((pl) => pl.project).filter(
        (project) => project.brandId === brandId
      ),
    }));

    // Sort logic
    if (sortBy === "area") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? (a.area?.name || "").localeCompare(b.area?.name || "")
          : (b.area?.name || "").localeCompare(a.area?.name || "")
      );
    } else if (sortBy === "activity") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? (a.activity?.name || "").localeCompare(b.activity?.name || "")
          : (b.activity?.name || "").localeCompare(a.activity?.name || "")
      );
    } else if (sortBy === "city") {
      activityLocations.sort((a, b) =>
        order === "asc"
          ? (a.area?.city?.name || "").localeCompare(b.area?.city?.name || "")
          : (b.area?.city?.name || "").localeCompare(a.area?.city?.name || "")
      );
    } else {
      activityLocations.sort((a, b) => {
        const fieldA = (a as any)[sortBy];
        const fieldB = (b as any)[sortBy];

        if (typeof fieldA === "string" && typeof fieldB === "string") {
          return order === "asc"
            ? fieldA.localeCompare(fieldB)
            : fieldB.localeCompare(fieldA);
        }
        return order === "asc"
          ? (fieldA || 0) - (fieldB || 0)
          : (fieldB || 0) - (fieldA || 0);
      });
    }

    const totalCount = activityLocations.length;

    if (pageNumber && pageSize) {
      activityLocations = activityLocations.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: activityLocations,
    });
  } catch (error) {
    console.error("❌ Error fetching activity locations by brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity locations for the specified brand",
      error: (error as Error).message,
    });
  }
};

// /**
//  * @desc Get a single activity location by ID
//  * @route GET /activity-location/:id
//  */
export const getActivityLocationById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const activityLocation = await prisma.activityLocation.findUnique({
      where: { id },
      include: {
        area: {
          include: {
            city: true,
          },
        },
        activity: true,
        orders: true,
        ProjectLocation: {
          // ✅ Correct field name from your Prisma schema
          include: {
            project: true,
          },
        },
        images: true,
      },
    });

    if (!activityLocation) {
      res.status(404).json({
        success: false,
        message: "Activity location not found",
      });
      return;
    }

    const result = {
      ...activityLocation,
      projects: activityLocation.ProjectLocation.map((pl) => pl.project),
    };

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Error fetching activity location:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity location",
    });
  }
};

// /**
//  * @desc Delete multiple activity locations
//  * @route DELETE /activity-locations
//  */
export const deleteActivityLocations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of activity location IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        error: "Invalid request. Provide an array of activity location IDs.",
      });
      return;
    }

    const deleteResult = await prisma.activityLocation.deleteMany({
      where: { id: { in: ids } },
    });

    if (deleteResult.count === 0) {
      res.status(404).json({
        success: false,
        message: "No activity locations found for the given IDs.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} activity locations.`,
    });
  } catch (error) {
    console.error("❌ Error deleting activity locations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete activity locations.",
    });
  }
};

// /**
//  * @desc Get selected activity locations based on provided IDs
//  * @route POST /activity-locations/download
//  */
export const getSelectedActivityLocationsDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of activity location IDs.",
      });
      return;
    }

    // Fetch selected activity locations with related data
    const activityLocations = await prisma.activityLocation.findMany({
      where: { id: { in: ids } },
      include: {
        area: { include: { city: true } },
        activity: true,
        orders: true,
        ProjectLocation: {
          // ✅ Correct field
          include: { project: true },
        },
        images: true,
      },
    });

    // ✅ Flatten ProjectLocation into a clean projects array
    const result = activityLocations.map((location) => ({
      ...location,
      projects: location.ProjectLocation.map((pl) => pl.project),
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Error fetching selected activity locations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch selected activity locations",
    });
  }
};

export const bulkCreateActivityLocations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const locations = req.body.locations; // Expecting array of location objects
    if (!Array.isArray(locations) || locations.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "No locations provided" });
      return;
    }

    const createdLocations = [];
    const failedLocations = [];

    for (const loc of locations) {
      try {
        const {
          name,
          address,
          areaSlug,
          activitySlug,
          status = "ACTIVE",
          pincode,
          projectSlugs = [],
        } = loc;

        if (!name || !address || !areaSlug || !activitySlug) {
          failedLocations.push({ ...loc, reason: "Missing required fields" });
          continue;
        }

        const area = await prisma.area.findUnique({
          where: { slug: areaSlug },
        });
        const activity = await prisma.activity.findUnique({
          where: { slug: activitySlug },
        });

        if (!area || !activity) {
          failedLocations.push({
            ...loc,
            reason: "Invalid areaSlug or activitySlug",
          });
          continue;
        }

        const trimmedName = name.trim().replace(/\s+/g, " ");
        const trimmedAddress = address.trim();

        // Check for duplicate
        const duplicate = await prisma.activityLocation.findFirst({
          where: {
            name: { equals: trimmedName, mode: "insensitive" },
            areaId: area.id,
            activityId: activity.id,
          },
        });

        if (duplicate) {
          failedLocations.push({
            ...loc,
            reason: "Duplicate location in the same area & activity",
          });
          continue;
        }

        // Slug creation with fallback for duplicates
        let slugBase = create_slug(trimmedName);
        let slug = slugBase;
        let counter = 1;

        while (
          await prisma.activityLocation.findFirst({
            where: { slug },
          })
        ) {
          slug = `${slugBase}-${counter}`;
          counter++;
        }

        // Insert location
        const newLoc = await prisma.activityLocation.create({
          data: {
            name: trimmedName,
            slug,
            address: trimmedAddress,
            status,
            pincode,
            areaId: area.id,
            activityId: activity.id,
          },
        });

        // Map project slugs to IDs and insert project-location mapping
        if (Array.isArray(projectSlugs) && projectSlugs.length > 0) {
          const projectIds: string[] = [];
          for (const slug of projectSlugs) {
            const project = await prisma.project.findUnique({
              where: { slug },
            });
            if (project) projectIds.push(project.id);
          }

          const mappings = projectIds.map((projectId) => ({
            projectId,
            activityLocationId: newLoc.id,
          }));

          await prisma.projectLocation.createMany({
            data: mappings,
            skipDuplicates: true,
          });
        }

        createdLocations.push(newLoc);
      } catch (err) {
        failedLocations.push({
          ...loc,
          reason: "Unexpected error",
          error: (err as any)?.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Bulk upload processed",
      createdCount: createdLocations.length,
      failedCount: failedLocations.length,
      created: createdLocations,
      failed: failedLocations,
    });
  } catch (error) {
    console.error("❌ Error in bulk upload:", error);
    res.status(500).json({
      success: false,
      message: "Failed to bulk upload activity locations",
    });
  }
};

export const bulkCreateActivityLocation = async (
  req: Request,
  res: Response
): Promise<void> => {
  const locations = req.body.locations;

  try {
    for (const loc of locations) {
      const name = loc["Society Name"];
      let slugBase = create_slug(name);
      let slug = slugBase;
      let counter = 1;

      while (
        await prisma.activityLocation.findFirst({
          where: { slug },
        })
      ) {
        slug = `${slugBase}-${counter}`;
        counter++;
      }

      const areaName = loc["Area"];
      const activityType = loc["Activity Type"];
      const projectNames = loc["Projects"]
        ? loc["Projects"].split(",").map((p: string) => p.trim())
        : [];

      // 🔍 Lookup Area
      const area = await prisma.area.findFirst({ where: { name: areaName } });
      if (!area) {
        console.warn(`Area not found: ${areaName}`);
        continue;
      }

      // 🔍 Lookup Activity
      const activity = await prisma.activity.findFirst({
        where: { name: activityType },
      });
      if (!activity) {
        console.warn(`Activity not found: ${activityType}`);
        continue;
      }

      // ✅ Create Activity Location
      const activityLocation = await prisma.activityLocation.create({
        data: {
          name,
          slug,
          address: loc["Address"] !== "-" ? loc["Address"] : null,
          pincode: loc["Pincode"] !== "-" ? loc["Pincode"] : null,
          status: loc["Status"] || "ACTIVE",
          areaId: area.id,
          activityId: activity.id,
        },
      });

      // ✅ Link all Projects
      for (const projectName of projectNames) {
        const project = await prisma.project.findFirst({
          where: { name: projectName },
        });

        if (!project) {
          console.warn(`Project not found: ${projectName}`);
          continue;
        }

        await prisma.projectLocation.create({
          data: {
            projectId: project.id,
            activityLocationId: activityLocation.id,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Activity locations uploaded successfully.",
    });
  } catch (err) {
    console.error("Bulk Upload Error:", err);
    res
      .status(500)
      .json({ success: false, error: "Bulk upload failed", details: err });
  }
};
