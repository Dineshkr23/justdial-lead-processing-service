import express from "express";
import { validateLead, sanitizeLead } from "../middleware/validation.js";
import {
  createLead,
  getLeads,
  getLeadById,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
  retryLeadForwarding,
  bulkForwardLeads,
} from "../controllers/leadController.js";

const router = express.Router();

// Main lead processing endpoint - supports both GET and POST
// This is the primary endpoint for JustDial to send leads
router.post("/", validateLead, sanitizeLead, createLead);
router.get("/", validateLead, sanitizeLead, createLead);

// Additional endpoints for lead management and analytics
router.get("/list", getLeads);
router.get("/stats", getLeadStats);
router.post("/bulk-forward", bulkForwardLeads);
router.get("/:leadid", getLeadById);
router.patch("/:leadid/status", updateLeadStatus);
router.post("/:leadid/retry", retryLeadForwarding);
router.delete("/:leadid", deleteLead);

export default router;
