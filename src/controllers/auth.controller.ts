import { NextFunction, Request, Response } from "express";
import prisma from "../config/db";
import jwt from "jsonwebtoken";
import { generateOTP } from "../services/otp.service";
import axios from "axios";

const JWT_SECRET = process.env.JWT_SECRET;

// MSG91 API Credentials
const MSG91_AUTH_KEY = "265903AN7EYNH85c7e2383";
const MSG91_SENDER_ID = "CYNQ";
const MSG91_TEMPLATE_ID = "1307174452398717283";

export const sendOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;

    if (!phone) {
      res
        .status(400)
        .json({ success: false, message: "Phone number is required" });
      return;
    }

    // ✅ Check if user exists
    const existingUser = await prisma.promoter.findUnique({
      where: { phone },
      include: {
        projects: true, // Fetch related projects
      },
    });

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "User not found with this phone number",
      });
      return;
    }

    // ✅ Check if promoter is active
    if (existingUser.status !== "ACTIVE") {
      res.status(403).json({ success: false, message: "User is not active" });
      return;
    }

    // ✅ Check if promoter is assigned to any project
    if (existingUser.projects.length === 0) {
      res.status(403).json({
        success: false,
        message: "User is not assigned to any project",
      });
      return;
    }

    // ✅ Generate OTP and expiry time
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // OTP valid for 2 minutes

    // ✅ Update existing user OTP
    await prisma.promoter.update({
      where: { phone },
      data: { otp, otpExpiresAt },
    });

    // ✅ Send OTP via MSG91
    await sendOTPViaMSG91(phone, otp);
    // console.log("OTP sent successfully", phone, "-", otp);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

const sendOTPViaMSG91 = async (phone: string, otp: string) => {
  const message = `Hello, Your OTP for logging into CYNQ is ${otp}. Please do not share OTP with anyone.`;

  const options = {
    method: "POST",
    url: "https://api.msg91.com/api/v2/sendsms",
    headers: {
      "Content-Type": "application/json",
      authkey: MSG91_AUTH_KEY,
    },
    data: {
      sender: MSG91_SENDER_ID,
      route: "4",
      DLT_TE_ID: MSG91_TEMPLATE_ID, // DLT template ID from MSG91
      sms: [
        {
          message: message,
          to: [`91${phone}`], // Adding country code
        },
      ],
    },
  };

  try {
    const response = await axios(options);
    console.log("OTP sent successfully", response);

    return response.data;
  } catch (error) {
    console.error(
      "Error sending OTP via MSG91:",
      error.response?.data || error
    );
    throw new Error("Failed to send OTP via MSG91");
  }
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, otp } = req.body;

    // Validate input
    if (!phone || !otp) {
      res
        .status(400)
        .json({ success: false, message: "Phone and OTP are required." });
      return;
    }

    // Find user by phone and include related project IDs and vendor ID
    const promoter = await prisma.promoter.findUnique({
      where: { phone },
      // include: {
      //   projects: {
      //     select: {
      //       projectId: true,
      //       project: {
      //         select: {
      //           brand: { select: { id: true } }, // 👈 nested deeply
      //         },
      //       },
      //     },
      //   },
      //   vendor: { select: { id: true } },
      // },
    });

    console.log("Promoter Data:", promoter); // Debugging

    if (!promoter || promoter.otp !== otp) {
      res.status(400).json({ success: false, message: "Invalid OTP." });
      return;
    }

    // Check if OTP is expired
    if (!promoter.otpExpiresAt || new Date() > promoter.otpExpiresAt) {
      res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
      return;
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: promoter.id, phone: promoter.phone },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // OTP is valid → Clear OTP from database (security)
    await prisma.promoter.update({
      where: { phone },
      data: {
        otp: null,
        otpExpiresAt: null,
        lastActive: new Date(),
        sessionToken: token,
      },
    });

    // Extract project IDs
    // const projectIds = promoter.projects.map((project) => project.projectId);

    // // Extract vendor ID
    // const vendorId = promoter.vendor?.id ?? null; // Ensure it handles null values
    // const brandIds = promoter.projects.map(
    //   (project) => project.project?.brand?.id
    // );
    res.json({
      success: true,
      message: "OTP verified successfully.",
      token,
      promoter: {
        id: promoter.id,
        phone: promoter.phone,
        status: promoter.status,
        // cityId: promoter.cityId,
        // projectIds,
        // vendorId, // Include vendor ID
        // brandIds,
      },
    });
  } catch (error) {
    console.error("Error verifying OTP:", error); // Debugging
    next(error);
  }
};

// export const selfRegisterPromoter = async (req, res): Promise<void> => {
//   const { name, email, phone, promoCode } = req.body;
//   console.log(req.body);
//   if (!promoCode || !phone) {
//     return res
//       .status(400)
//       .json({ success: false, message: "Promo code and phone are required." });
//   }

//   try {
//     // 1. Lookup promo code entry
//     const promoEntry = await prisma.projectPromoCode.findUnique({
//       where: { code: promoCode },
//       include: {
//         project: {
//           include: {
//             vendors: {
//               include: { vendor: true },
//             },
//           },
//         },
//         activityLocation: {
//           include: {
//             area: {
//               include: { city: true },
//             },
//           },
//         },
//       },
//     });

//     if (!promoEntry)
//       return res
//         .status(404)
//         .json({ success: false, message: "Invalid promo code." });

//     const { project, activityLocation } = promoEntry;
//     const vendor = project.vendors[0]?.vendor;
//     const city = activityLocation?.area?.city;

//     const promoterExists = await prisma.promoter.findUnique({
//       where: { phone },
//     });

//     if (promoterExists) {
//       return res.status(409).json({
//         success: false,
//         message: "Phone number already registered. Please Login",
//       });
//     }

//     const promoter = await prisma.promoter.create({
//       data: {
//         name,
//         email,
//         phone,
//         vendorId: promoEntry?.vendorId,
//         cityId: city?.id,
//         projects: {
//           create: { projectId: project.id },
//         },
//       },
//     });

//     // ✅ Generate OTP and expiry time
//     const otp = generateOTP();
//     const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // OTP valid for 2 minutes

//     // ✅ Update existing user OTP
//     await prisma.promoter.update({
//       where: { phone },
//       data: { otp, otpExpiresAt },
//     });

//     // ✅ Send OTP via MSG91
//     await sendOTPViaMSG91(phone, otp);

//     res.json({ success: true, message: "OTP sent successfully" });
//   } catch (error) {
//     console.error("Error sending OTP:", error);
//     res.status(500).json({ success: false, message: "Failed to send OTP" });
//   }
// };

export const selfRegisterPromoter = async (req, res): Promise<void> => {
  const { name, email, phone, altPhone, promoCode } = req.body;
  console.log(req.body);

  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "Promo code and phone are required." });
  }

  try {
    // 1. Lookup promo code entry
    // const promoEntry = await prisma.projectPromoCode.findUnique({
    //   where: { code: promoCode },
    //   include: {
    //     project: {
    //       include: {
    //         vendors: {
    //           include: { vendor: true },
    //         },
    //       },
    //     },
    //     city: true, // ✅ Fetch city directly from promoEntry
    //   },
    // });

    // if (!promoEntry) {
    //   return res
    //     .status(404)
    //     .json({ success: false, message: "Invalid promo code." });
    // }

    // const { project, city } = promoEntry;
    // const vendor = project.vendors[0]?.vendor;

    // Check if promoter already exists
    const promoterExists = await prisma.promoter.findUnique({
      where: { phone },
    });

    if (promoterExists) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered. Please Login",
      });
    }

    // Create new promoter
    const promoter = await prisma.promoter.create({
      data: {
        name,
        email,
        phone,
        altPhone,
        // vendorId: promoEntry.vendorId,
        // cityId: city?.id, // ✅ Use direct city reference
        // projects: {
        //   create: { projectId: project.id },
        // },
      },
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // Update OTP in promoter
    await prisma.promoter.update({
      where: { phone },
      data: { otp, otpExpiresAt },
    });
    console.log("otp-", otp);

    // Send OTP
    await sendOTPViaMSG91(phone, otp);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

export const verifyPromoCode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { promoCode, phone, promoterId } = req.body;

    // Validate input
    if (!phone || !promoCode) {
      res.status(400).json({
        success: false,
        message: "Phone and Project Code are required.",
      });
      return;
    }

    // Find promo entry
    const promoEntry = await prisma.projectPromoCode.findFirst({
      where: { code: promoCode },
    });

    if (!promoEntry) {
      res.status(404).json({ success: false, message: "Invalid promo code." });
      return;
    }

    // Update promoter with vendorId and cityId from the promo entry
    await prisma.promoter.update({
      where: { id: promoterId },
      data: {
        vendorId: promoEntry.vendorId,
        cityId: promoEntry.cityId,
        activityLocId: promoEntry.activityLocationId,
      },
    });

    // Delete existing project-promoter relations and create a new one (transactional)
    await prisma.$transaction([
      prisma.projectPromoter.deleteMany({ where: { promoterId } }),
      prisma.projectPromoter.create({
        data: {
          projectId: promoEntry.projectId,
          promoterId: promoterId,
        },
      }),
    ]);

    // Fetch the updated promoter info with related project and vendor data
    const promoter = await prisma.promoter.findUnique({
      where: { id: promoterId },
      include: {
        projects: {
          select: {
            projectId: true,
            project: {
              select: {
                brand: { select: { id: true } },
              },
            },
          },
        },
        vendor: { select: { id: true } },
        activityLocation: true,
      },
    });

    if (!promoter) {
      res.status(404).json({ success: false, message: "Promoter not found." });
      return;
    }

    // Extract project IDs and brand IDs
    const projectIds = promoter.projects.map((project) => project.projectId);
    const brandIds = promoter.projects.map(
      (project) => project.project?.brand?.id
    );
    const vendorId = promoter.vendor?.id ?? null;
    const activityLocId = promoter.activityLocation?.id ?? null;

    res.json({
      success: true,
      message: "Project Code Applied Successfully",
      promoter: {
        id: promoter.id,
        phone: promoter.phone,
        status: promoter.status,
        cityId: promoter.cityId,
        projectIds,
        vendorId,
        brandIds,
        activityLocId,
        activityLocName: promoter.activityLocation?.name,
        activityId: promoter.activityLocation.activityId,
      },
    });
  } catch (error) {
    console.error("Error verifying promo code:", error);
    next(error);
  }
};
