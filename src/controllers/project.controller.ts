import { Request, Response } from "express";
import prisma from "../config/db";
import { create_slug } from "../helper/createSlug";
/**
 * @desc Create a new project
 * @route POST /projects
 */
export const createProject = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      description,
      brandId,
      startDate,
      endDate,
      status,
      budget,
      createdBy,
    } = req.body;

    name = name?.trim();
    description = description?.trim();

    const slug = create_slug(name);
    if (!name || !brandId) {
      res.status(400).json({
        success: false,
        message: "Project name and brandId are required",
      });
      return;
    }

    // Check if project name already exists
    const existingProject = await prisma.project.findFirst({
      where: {
        name: {
          equals: name.trim().replace(/\s+/g, " "), // Normalize spaces
          mode: "insensitive",
        },
        brandId,
      },
    });

    if (existingProject) {
      res.status(400).json({
        success: false,
        message: "Project name already exists",
      });
      return;
    }

    // Create the project if name is unique
    const project = await prisma.project.create({
      data: {
        name,
        slug,
        description,
        brandId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status || "ACTIVE",
        budget: budget ? Number(budget) : null,
        createdBy,
      },
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error("Error creating project:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create project" });
  }
};

/**
 * @desc Get all projects
 * @route GET /projects
 */
export const getAllProjects = async (
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
      status,
      brandId,
      from,
      to,
      startDate,
      endDate,
      createdBy,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { brand: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status) where.status = status;
    if (brandId) where.brandId = brandId;
    if (createdBy) where.createdBy = createdBy;

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
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = new Date(startDate);
      if (endDate) where.startDate.lte = new Date(endDate);
    }

    // Fetch projects including brand details
    let projects = await prisma.project.findMany({
      where,
      include: { brand: true }, // Include brand details
    });

    // ✅ Handle sorting manually if sorting by `brand.name`
    if (sortBy === "brand") {
      projects.sort((a, b) => {
        const brandA = a.brand?.name || "";
        const brandB = b.brand?.name || "";
        return order.toLowerCase() === "asc"
          ? brandA.localeCompare(brandB)
          : brandB.localeCompare(brandA);
      });
    } else {
      // ✅ Prisma-native sorting for other fields
      projects.sort((a, b) => {
        const fieldA = (a as any)[sortBy];
        const fieldB = (b as any)[sortBy];

        if (typeof fieldA === "string" && typeof fieldB === "string") {
          return order.toLowerCase() === "asc"
            ? fieldA.localeCompare(fieldB)
            : fieldB.localeCompare(fieldA);
        }
        return order.toLowerCase() === "asc"
          ? fieldA - fieldB
          : fieldB - fieldA;
      });
    }

    // Apply pagination
    const totalCount = projects.length;
    if (pageNumber && pageSize) {
      projects = projects.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: projects,
    });
  } catch (error) {
    console.error("❌ Error fetching projects:", error);
    res
      .status(500)
      .json({ success: true, message: "Failed to fetch projects" });
  }
};

/**
 * @desc Get all Selected project
 * @route POST /project
 */

export const getSelectedProjectsDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Accepts selected project IDs from request body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: true,
        message: "Invalid request. Provide an array of project IDs.",
      });
      return;
    }

    // Fetch selected projects from the database
    const projects = await prisma.project.findMany({
      where: { id: { in: ids } }, // Fetch only selected projects
      include: { brand: true }, // Include related brand details
    });

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error("❌ Error fetching selected projects:", error);
    res
      .status(500)
      .json({ success: true, message: "Failed to fetch selected projects" });
  }
};

/**
 * @desc Get a single project by ID
 * @route GET /projects/:id
 */
export const getProjectById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { brand: true, promoters: true, orders: true }, // Include related data
    });

    if (!project) {
      res.status(404).json({ success: true, message: "Project not found" });
      return;
    }

    res.json({ success: true, data: project });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ success: true, message: "Failed to fetch project" });
  }
};

/**
 * @desc Update a project by ID
 * @route PUT /projects/:id
 */
export const updateProject = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let {
      name,
      description,
      brandId,
      startDate,
      endDate,
      status,
      budget,
      updatedBy,
    } = req.body;

    name = name?.trim();
    description = description?.trim();

    // Check if project exists
    const existingProject = await prisma.project.findUnique({ where: { id } });
    if (!existingProject) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    // Check if the new name is already taken by another project
    const duplicateProjects = await prisma.project.findFirst({
      where: {
        AND: [
          { id: { not: id } }, // Exclude the current project being updated
          {
            name: {
              equals: name.trim().replace(/\s+/g, " "), // Normalize spaces
              mode: "insensitive",
            },
          }, // Case-insensitive name check
          { brandId }, // Must have the same brandId
        ],
      },
    });

    if (duplicateProjects) {
      let duplicateField = "";
      if (duplicateProjects.name.toLowerCase() === name.toLowerCase()) {
        duplicateField = "Project name";
      }
      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        name,
        description,
        brandId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status,
        budget: budget ? Number(budget) : undefined,
        updatedBy,
      },
    });

    res.json({ success: true, data: updatedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update project" });
  }
};

/**
 * @desc Update status of multiple projects
 * @route PATCH /project/updateSelectedProjectsStatus
 */
export const updateSelectedProjectsStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of project IDs.",
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

    // Check if all projects exist
    const existingProjects = await prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingProjects.length !== ids.length) {
      // Some projects were not found
      const existingIds = existingProjects.map((project) => project.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some projects were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified projects
    const updateResult = await prisma.project.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} projects.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating projects status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update projects status",
    });
  }
};

/**
 * @desc Delete a project by ID
 * @route DELETE /projects/:id
 */
export const deleteProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of project IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: true,
        message: "Invalid request. Provide an array of project IDs.",
      });
      return;
    }

    // Delete multiple projects at once
    const deleteResult = await prisma.project.deleteMany({
      where: { id: { in: ids } }, // Deletes only the selected project IDs
    });

    if (deleteResult.count === 0) {
      res.status(404).json({
        success: true,
        message: "No projects found for the given IDs.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} projects.`,
    });
  } catch (error) {
    console.error("❌ Error deleting projects:", error);
    res
      .status(500)
      .json({ success: true, message: "Failed to delete projects." });
  }
};

export const getProjectPromoCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "", // search promo code
      sortBy = "createdAt",
      sortOrder = "desc",
      projectId,
      vendorId,
      cityId,
      page = "1",
      limit = "10",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const promoCodes = await prisma.projectPromoCode.findMany({
      where: {
        AND: [
          search
            ? {
                code: {
                  contains: search,
                  mode: "insensitive",
                },
              }
            : {},
          projectId ? { projectId } : {},
          vendorId ? { vendorId } : {},
          cityId
            ? {
                activityLocation: {
                  area: {
                    cityId,
                  },
                },
              }
            : {},
        ],
      },
      include: {
        project: true,
        vendor: true,
        activityLocation: {
          include: {
            area: {
              include: {
                city: true,
              },
            },
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder.toLowerCase() === "asc" ? "asc" : "desc",
      },
      skip,
      take,
    });

    const totalCount = await prisma.projectPromoCode.count({
      where: {
        AND: [
          search
            ? {
                code: {
                  contains: search,
                  mode: "insensitive",
                },
              }
            : {},
          projectId ? { projectId } : {},
          vendorId ? { vendorId } : {},
          cityId
            ? {
                activityLocation: {
                  area: {
                    cityId,
                  },
                },
              }
            : {},
        ],
      },
    });

    const formatted = promoCodes.map((code) => ({
      id: code.id,
      promoCode: code.code,
      projectName: code.project.name,
      vendorName: code.vendor.name,
      cityName: code.activityLocation.area.city.name,
      createdAt: code.createdAt,
    }));

    res.status(200).json({
      data: formatted,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      success: true,
    });
    return;
  } catch (error) {
    console.error("Error fetching project promo codes:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
    return;
  }
};

export const bulkUploadProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const projects = req.body.projects;

    if (!Array.isArray(projects) || projects.length === 0) {
      res.status(400).json({ error: "Projects array is required." });
      return;
    }

    const formatted = projects
      .filter((proj: any) => proj["Project Name"] && proj["Brand"]) // skip empty rows
      .map((proj: any) => {
        const name = proj["Project Name"];
        const brand = proj["Brand"];
        const slug = create_slug(name);

        return {
          name,
          slug,
          description: proj["Description"] || null,
          status: proj["Status"] || "ACTIVE",

          brandName: brand,
        };
      });

    // Fetch brand IDs
    const brandMap = await prisma.brand.findMany({
      where: {
        name: {
          in: formatted.map((p) => p.brandName),
        },
      },
      select: { name: true, id: true },
    });

    const brandIdLookup = Object.fromEntries(
      brandMap.map((b) => [b.name, b.id])
    );

    const projectData = formatted.map((p) => ({
      name: p.name,
      slug: p.slug,
      description: p.description,
      status: p.status,

      brandId: brandIdLookup[p.brandName] || null,
    }));

    const created = await prisma.project.createMany({
      data: projectData,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: "Projects uploaded successfully",
      count: created.count,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to upload projects" });
  }
};
