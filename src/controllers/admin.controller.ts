import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../config/db";
import { Role, Status } from "@prisma/client";
import { sendEmail } from "../services/otp.service";

interface AuthRequest extends Request {
  user?: {
    adminId: string;
    role: string;
  };
}

export const adminLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
      return;
    }

    const admin = await prisma.admin.findUnique({
      where: { email },
      include: { brand: true },
    });
    if (!admin) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    // Include role in JWT payload
    const token = jwt.sign(
      { adminId: admin.id, role: admin.role },
      process.env.JWT_SECRET!,
      {
        expiresIn: "1d",
      }
    );

    res.json({
      success: true,
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      phone: admin.phone,
      brandId: admin.brandId,
      brand: admin.brand,
      token,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const createAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, email, password, role, phone, brandId } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      res
        .status(400)
        .json({ success: false, message: "All fields are required" });
      return;
    }

    // Check if admin already exists
    const existingAdmin = await prisma.admin.findUnique({ where: { email } });
    if (existingAdmin) {
      res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const newAdmin = await prisma.admin.create({
      data: {
        name,
        email,
        phone,
        brandId,
        password: hashedPassword,
        role,
      },
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: newAdmin,
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "createdAt",
      order = "desc",
      brandId,
      page,
      limit,
      createdBy,
      from,
      to,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    // ✅ Filtering
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
      if (brandId) where.brandId = brandId;

      // ✅ Handle Role & Status as ENUMs (Prisma doesn't allow `contains` for ENUM)
      if (Object.values(Role).includes(search.toUpperCase() as Role)) {
        where.OR.push({ role: search.toUpperCase() as Role });
      }
      if (Object.values(Status).includes(search.toUpperCase() as Status)) {
        where.OR.push({ status: search.toUpperCase() as Status });
      }
    }
    if (createdBy) where.createdBy = createdBy;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // ✅ Fetch users
    let users = await prisma.admin.findMany({
      where,
      include: { brand: true },
    });

    // ✅ Handle sorting manually
    if (sortBy === "brand") {
      users.sort((a, b) => {
        const brandA = a.brand?.name || "";
        const brandB = b.brand?.name || "";
        return order.toLowerCase() === "asc"
          ? brandA.localeCompare(brandB)
          : brandB.localeCompare(brandA);
      });
    } else {
      users.sort((a, b) => {
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
    // ✅ Apply Pagination
    const totalCount = users.length;
    if (pageNumber && pageSize) {
      users = users.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

export const getAdminById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, message: "Admin ID is required" });
      return;
    }

    // Fetch admin by ID
    const admin = await prisma.admin.findUnique({
      where: { id },
      include: { brand: true },
    });

    if (!admin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    res.status(200).json({ success: true, data: admin });
  } catch (error) {
    console.error("Error fetching admin by ID:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const deleteAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, message: "Admin ID is required" });
      return;
    }

    // Check if the admin exists
    const existingAdmin = await prisma.admin.findUnique({ where: { id } });

    if (!existingAdmin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    // Delete the admin
    await prisma.admin.delete({ where: { id } });

    res
      .status(200)
      .json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const updateAdminRoleStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, status, phone, brandId } = req.body;

    if (!id) {
      res.status(400).json({ success: false, message: "Admin ID is required" });
      return;
    }

    // Check if admin exists
    const existingAdmin = await prisma.admin.findUnique({ where: { id } });
    if (!existingAdmin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    // Update admin
    const updatedAdmin = await prisma.admin.update({
      where: { id },
      data: {
        phone: phone,
        brandId: brandId,
        role: role || existingAdmin.role, // Keep old role if not provided
        status: status || existingAdmin.status, // Ensure status is always saved in lowercase
      },
    });

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    console.error("Error updating admin role/status:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const changeAdminPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id, oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
      return;
    }

    const admin = await prisma.admin.findUnique({
      where: { id: id },
    });

    if (!admin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      res
        .status(400)
        .json({ success: false, message: "Incorrect old password" });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.admin.update({
      where: { id: id },
      data: { password: hashedPassword },
    });

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const sendAdminResetOTP = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    // Check if admin exists
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

    // Save OTP in the database
    await prisma.admin.update({
      where: { email },
      data: { otp, otpExpiresAt },
    });

    // Send OTP via email (replace with actual email service)
    // await sendEmail(email, otp);
    console.log("otp", otp);

    res.status(200).json({
      success: true,
      message: "OTP sent to registered email",
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const resetAdminPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Email, OTP, and new password are required",
      });
      return;
    }

    // Find admin by email
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin || admin.otp !== otp) {
      res.status(400).json({ success: false, message: "Invalid OTP" });
      return;
    }

    // Check if OTP is expired
    if (!admin.otpExpiresAt || new Date() > admin.otpExpiresAt) {
      res
        .status(400)
        .json({ success: false, message: "OTP expired. Request a new one" });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP
    await prisma.admin.update({
      where: { email },
      data: { password: hashedPassword, otp: null, otpExpiresAt: null },
    });

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
