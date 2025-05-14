import { Request, Response } from "express";
import prisma from "../config/db";

export const createPromoCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let { vendorId, cityId, projectId, activityLocationId, createdBy } =
      req.body;

    let code;
    // const promoCode = generatePromoCode(name); // Still using society name or anything else you prefer
    code = Math.floor(100000 + Math.random() * 900000).toString();

    const duplicatePromoCode = await prisma.projectPromoCode.findFirst({
      where: { code: code },
    });

    if (duplicatePromoCode) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    }
    // Create promoter
    const newPromoter = await prisma.projectPromoCode.create({
      data: {
        projectId,
        vendorId,
        cityId,
        activityLocationId,
        code,
        createdBy,
      },
    });

    res.status(201).json({ success: true, data: newPromoter });
  } catch (error) {
    console.error("Error creating promoter:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create promoter" });
  }
};

export const getPromoCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      projectId,
      vendorId,
      cityId,
      activityLocationId,
      page,
      limit,
      from,
      to,
      createdBy,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const promoCodes = await prisma.projectPromoCode.findMany({
      where: {
        AND: [
          projectId ? { projectId } : {},
          vendorId ? { vendorId } : {},
          cityId ? { cityId } : {},
          activityLocationId ? { activityLocationId } : {},
          search
            ? {
                OR: [
                  {
                    code: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    project: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    vendor: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    city: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    activityLocation: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                ],
              }
            : {},
        ],
      },
      include: {
        project: true,
        vendor: true,
        city: true,
        activityLocation: true,
      },
      orderBy: {
        [sortBy]: sortOrder.toLowerCase() === "asc" ? "asc" : "desc",
      },
      skip: pageNumber && pageSize ? (pageNumber - 1) * pageSize : undefined,
      take: pageNumber && pageSize ? pageSize : undefined,
    });

    const totalCount = await prisma.projectPromoCode.count({
      where: {
        AND: [
          projectId ? { projectId } : {},
          vendorId ? { vendorId } : {},
          cityId ? { cityId } : {},
          activityLocationId ? { activityLocationId } : {},
          search
            ? {
                OR: [
                  {
                    code: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    project: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    vendor: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    city: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    activityLocation: {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                ],
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
      cityName: code.city?.name ?? "",
      activityName: code.activityLocation?.name ?? "",
      createdAt: code.createdAt,
    }));

    res.status(200).json({
      data: formatted,
      total: totalCount,
      page: pageNumber,
      limit: pageSize,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching project promo codes:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
