import Lead from "../models/Lead.js";
import { logger } from "../utils/logger.js";
import { processAndForwardLead } from "../utils/apiService.js";

// Create a new lead
export const createLead = async (req, res) => {
  const startTime = Date.now();

  try {
    const leadData = req.sanitizedLead || req.validatedLead;

    // Check if lead already exists
    const existingLead = await Lead.findOne({ leadid: leadData.leadid }).lean();

    if (existingLead) {
      logger.warn("Duplicate lead attempt", {
        leadid: leadData.leadid,
        processingTime: Date.now() - startTime,
      });

      return res.status(409).json({
        success: false,
        message: "Lead already exists",
        leadid: leadData.leadid,
      });
    }

    // Create new lead
    const lead = new Lead(leadData);
    await lead.save();

    // Forward lead to appropriate external API
    let apiForwardingResult = null;
    try {
      apiForwardingResult = await processAndForwardLead(leadData);

      if (apiForwardingResult.success) {
        // Update lead status to processed if API call was successful
        lead.status = "processed";
        lead.processingTime = Date.now() - startTime;
        await lead.save();

        logger.info("Lead forwarded to external API successfully", {
          leadid: lead.leadid,
          apiEndpoint: apiForwardingResult.apiEndpoint,
          category: apiForwardingResult.category,
          processingTime: apiForwardingResult.processingTime,
        });
      } else {
        // Mark as failed if API call failed
        lead.status = "failed";
        lead.processingTime = Date.now() - startTime;
        await lead.save();

        logger.error("Lead forwarding to external API failed", {
          leadid: lead.leadid,
          error: apiForwardingResult.error,
          category: apiForwardingResult.category,
        });
      }
    } catch (error) {
      // Mark as failed if API call throws an exception
      lead.status = "failed";
      lead.processingTime = Date.now() - startTime;
      await lead.save();

      logger.error("Lead forwarding to external API failed with exception", {
        leadid: lead.leadid,
        error: error.message,
        category: leadData.category,
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info("Lead created successfully", {
      leadid: lead.leadid,
      processingTime,
      method: req.method,
      apiForwardingSuccess: apiForwardingResult?.success || false,
    });

    // Return success response as per requirements
    res.status(200).send("RECEIVED");
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Lead creation failed", {
      error: error.message,
      leadid: req.sanitizedLead?.leadid || req.validatedLead?.leadid,
      processingTime,
    });

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Lead already exists",
      });
    }

    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get all leads with pagination and filtering
export const getLeads = async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      page = 1,
      limit = 50,
      city,
      category,
      leadtype,
      status,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = {};

    if (city) filter.city = new RegExp(city, "i");
    if (category) filter.category = new RegExp(category, "i");
    if (leadtype) filter.leadtype = leadtype;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute queries
    const [leads, total] = await Promise.all([
      Lead.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
      Lead.countDocuments(filter),
    ]);

    const processingTime = Date.now() - startTime;

    logger.info("Leads retrieved successfully", {
      count: leads.length,
      total,
      page: parseInt(page),
      processingTime,
    });

    res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to retrieve leads", {
      error: error.message,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get lead by ID
export const getLeadById = async (req, res) => {
  const startTime = Date.now();

  try {
    const { leadid } = req.params;

    const lead = await Lead.findOne({ leadid }).lean();

    if (!lead) {
      logger.warn("Lead not found", {
        leadid,
        processingTime: Date.now() - startTime,
      });

      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info("Lead retrieved successfully", {
      leadid,
      processingTime,
    });

    res.status(200).json({
      success: true,
      data: lead,
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to retrieve lead", {
      error: error.message,
      leadid: req.params.leadid,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update lead status
export const updateLeadStatus = async (req, res) => {
  const startTime = Date.now();

  try {
    const { leadid } = req.params;
    const { status } = req.body;

    if (!["pending", "processed", "failed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be pending, processed, or failed",
      });
    }

    const lead = await Lead.findOneAndUpdate(
      { leadid },
      { status },
      { new: true, runValidators: true }
    );

    if (!lead) {
      logger.warn("Lead not found for status update", {
        leadid,
        processingTime: Date.now() - startTime,
      });

      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info("Lead status updated successfully", {
      leadid,
      status,
      processingTime,
    });

    res.status(200).json({
      success: true,
      data: lead,
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to update lead status", {
      error: error.message,
      leadid: req.params.leadid,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get lead statistics
export const getLeadStats = async (req, res) => {
  const startTime = Date.now();

  try {
    const { startDate, endDate, city, category } = req.query;

    // Build filter object
    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (city) filter.city = new RegExp(city, "i");
    if (category) filter.category = new RegExp(category, "i");

    // Aggregate statistics
    const stats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          pendingLeads: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          processedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "processed"] }, 1, 0] },
          },
          failedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          avgProcessingTime: { $avg: "$processingTime" },
        },
      },
    ]);

    // Get leads by city
    const cityStats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$city",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get leads by category
    const categoryStats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const processingTime = Date.now() - startTime;

    logger.info("Lead statistics retrieved successfully", {
      processingTime,
    });

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalLeads: 0,
          pendingLeads: 0,
          processedLeads: 0,
          failedLeads: 0,
          avgProcessingTime: 0,
        },
        cityStats,
        categoryStats,
      },
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to retrieve lead statistics", {
      error: error.message,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Retry failed lead forwarding
export const retryLeadForwarding = async (req, res) => {
  const startTime = Date.now();

  try {
    const { leadid } = req.params;

    const lead = await Lead.findOne({ leadid });

    if (!lead) {
      logger.warn("Lead not found for retry", {
        leadid,
        processingTime: Date.now() - startTime,
      });

      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    if (lead.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: "Lead is not in failed status",
        currentStatus: lead.status,
      });
    }

    // Retry forwarding to external API
    const apiForwardingResult = await processAndForwardLead(lead.toObject());

    if (apiForwardingResult.success) {
      // Update lead status to processed if API call was successful
      lead.status = "processed";
      lead.processingTime = Date.now() - startTime;
      await lead.save();

      logger.info("Lead forwarding retry successful", {
        leadid: lead.leadid,
        apiEndpoint: apiForwardingResult.apiEndpoint,
        category: apiForwardingResult.category,
        processingTime: apiForwardingResult.processingTime,
      });

      res.status(200).json({
        success: true,
        message: "Lead forwarding retry successful",
        data: {
          leadid: lead.leadid,
          status: lead.status,
          apiEndpoint: apiForwardingResult.apiEndpoint,
          category: apiForwardingResult.category,
        },
        processingTime: Date.now() - startTime,
      });
    } else {
      logger.error("Lead forwarding retry failed", {
        leadid: lead.leadid,
        error: apiForwardingResult.error,
        category: apiForwardingResult.category,
      });

      res.status(500).json({
        success: false,
        message: "Lead forwarding retry failed",
        error: apiForwardingResult.error,
        processingTime: Date.now() - startTime,
      });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to retry lead forwarding", {
      error: error.message,
      leadid: req.params.leadid,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Bulk forward multiple leads to external APIs
export const bulkForwardLeads = async (req, res) => {
  const startTime = Date.now();

  try {
    const { leadIds } = req.body;

    // Validate input
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "leadIds array is required and must not be empty",
      });
    }

    if (leadIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Maximum 100 leads can be processed at once",
      });
    }

    // Find all leads by IDs
    const leads = await Lead.find({ leadid: { $in: leadIds } });

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No leads found with the provided IDs",
      });
    }

    // Track results
    const results = {
      total: leads.length,
      successful: 0,
      failed: 0,
      notFound: leadIds.length - leads.length,
      details: [],
    };

    // Process each lead
    const processingPromises = leads.map(async (lead) => {
      const leadStartTime = Date.now();

      try {
        // Forward lead to external API
        const apiForwardingResult = await processAndForwardLead(
          lead.toObject()
        );

        const processingTime = Date.now() - leadStartTime;

        if (apiForwardingResult.success) {
          // Update lead status to processed
          lead.status = "processed";
          lead.processingTime = processingTime;
          await lead.save();

          results.successful++;

          logger.info("Bulk lead forwarding successful", {
            leadid: lead.leadid,
            apiEndpoint: apiForwardingResult.apiEndpoint,
            category: apiForwardingResult.category,
            processingTime,
          });

          return {
            leadid: lead.leadid,
            status: "success",
            apiEndpoint: apiForwardingResult.apiEndpoint,
            category: apiForwardingResult.category,
            processingTime,
          };
        } else {
          // Mark as failed
          lead.status = "failed";
          lead.processingTime = processingTime;
          await lead.save();

          results.failed++;

          logger.error("Bulk lead forwarding failed", {
            leadid: lead.leadid,
            error: apiForwardingResult.error,
            category: apiForwardingResult.category,
          });

          return {
            leadid: lead.leadid,
            status: "failed",
            error: apiForwardingResult.error,
            category: apiForwardingResult.category,
            processingTime,
          };
        }
      } catch (error) {
        const processingTime = Date.now() - leadStartTime;

        // Mark as failed
        lead.status = "failed";
        lead.processingTime = processingTime;
        await lead.save();

        results.failed++;

        logger.error("Bulk lead forwarding failed with exception", {
          leadid: lead.leadid,
          error: error.message,
          category: lead.category,
        });

        return {
          leadid: lead.leadid,
          status: "failed",
          error: error.message,
          category: lead.category,
          processingTime,
        };
      }
    });

    // Wait for all processing to complete
    const processingResults = await Promise.all(processingPromises);
    results.details = processingResults;

    const totalProcessingTime = Date.now() - startTime;

    logger.info("Bulk lead forwarding completed", {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      notFound: results.notFound,
      processingTime: totalProcessingTime,
    });

    res.status(200).json({
      success: true,
      message: "Bulk lead forwarding completed",
      summary: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        notFound: results.notFound,
      },
      details: results.details,
      processingTime: totalProcessingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Bulk lead forwarding failed", {
      error: error.message,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete lead (for admin purposes)
export const deleteLead = async (req, res) => {
  const startTime = Date.now();

  try {
    const { leadid } = req.params;

    const lead = await Lead.findOneAndDelete({ leadid });

    if (!lead) {
      logger.warn("Lead not found for deletion", {
        leadid,
        processingTime: Date.now() - startTime,
      });

      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info("Lead deleted successfully", {
      leadid,
      processingTime,
    });

    res.status(200).json({
      success: true,
      message: "Lead deleted successfully",
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to delete lead", {
      error: error.message,
      leadid: req.params.leadid,
      processingTime,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
