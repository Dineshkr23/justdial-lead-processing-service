import Lead from '../models/Lead.js';
import { logger } from '../utils/logger.js';

// Create a new lead
export const createLead = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const leadData = req.sanitizedLead || req.validatedLead;
    
    // Check if lead already exists
    const existingLead = await Lead.findOne({ leadid: leadData.leadid }).lean();
    
    if (existingLead) {
      logger.warn('Duplicate lead attempt', {
        leadid: leadData.leadid,
        processingTime: Date.now() - startTime
      });
      
      return res.status(409).json({
        success: false,
        message: 'Lead already exists',
        leadid: leadData.leadid
      });
    }
    
    // Create new lead
    const lead = new Lead(leadData);
    await lead.save();
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Lead created successfully', {
      leadid: lead.leadid,
      processingTime,
      method: req.method
    });
    
    // Return success response as per requirements
    res.status(200).send('RECEIVED');
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Lead creation failed', {
      error: error.message,
      leadid: req.sanitizedLead?.leadid || req.validatedLead?.leadid,
      processingTime
    });
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Lead already exists'
      });
    }
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (city) filter.city = new RegExp(city, 'i');
    if (category) filter.category = new RegExp(category, 'i');
    if (leadtype) filter.leadtype = leadtype;
    if (status) filter.status = status;
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute queries
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Lead.countDocuments(filter)
    ]);
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Leads retrieved successfully', {
      count: leads.length,
      total,
      page: parseInt(page),
      processingTime
    });
    
    res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to retrieve leads', {
      error: error.message,
      processingTime
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
      logger.warn('Lead not found', {
        leadid,
        processingTime: Date.now() - startTime
      });
      
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Lead retrieved successfully', {
      leadid,
      processingTime
    });
    
    res.status(200).json({
      success: true,
      data: lead,
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to retrieve lead', {
      error: error.message,
      leadid: req.params.leadid,
      processingTime
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update lead status
export const updateLeadStatus = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { leadid } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'processed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be pending, processed, or failed'
      });
    }
    
    const lead = await Lead.findOneAndUpdate(
      { leadid },
      { status },
      { new: true, runValidators: true }
    );
    
    if (!lead) {
      logger.warn('Lead not found for status update', {
        leadid,
        processingTime: Date.now() - startTime
      });
      
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Lead status updated successfully', {
      leadid,
      status,
      processingTime
    });
    
    res.status(200).json({
      success: true,
      data: lead,
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to update lead status', {
      error: error.message,
      leadid: req.params.leadid,
      processingTime
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
    
    if (city) filter.city = new RegExp(city, 'i');
    if (category) filter.category = new RegExp(category, 'i');
    
    // Aggregate statistics
    const stats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          pendingLeads: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          processedLeads: {
            $sum: { $cond: [{ $eq: ['$status', 'processed'] }, 1, 0] }
          },
          failedLeads: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          avgProcessingTime: { $avg: '$processingTime' }
        }
      }
    ]);
    
    // Get leads by city
    const cityStats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get leads by category
    const categoryStats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Lead statistics retrieved successfully', {
      processingTime
    });
    
    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalLeads: 0,
          pendingLeads: 0,
          processedLeads: 0,
          failedLeads: 0,
          avgProcessingTime: 0
        },
        cityStats,
        categoryStats
      },
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to retrieve lead statistics', {
      error: error.message,
      processingTime
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
      logger.warn('Lead not found for deletion', {
        leadid,
        processingTime: Date.now() - startTime
      });
      
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Lead deleted successfully', {
      leadid,
      processingTime
    });
    
    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully',
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to delete lead', {
      error: error.message,
      leadid: req.params.leadid,
      processingTime
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
