import Joi from 'joi';
import { logger } from '../utils/logger.js';

// Lead validation schema
const leadSchema = Joi.object({
  leadid: Joi.string()
    .required()
    .max(255)
    .trim()
    .messages({
      'string.empty': 'Lead ID is required',
      'any.required': 'Lead ID is required',
      'string.max': 'Lead ID cannot exceed 255 characters'
    }),
  
  leadtype: Joi.string()
    .required()
    .valid('company', 'category')
    .max(255)
    .trim()
    .messages({
      'string.empty': 'Lead type is required',
      'any.required': 'Lead type is required',
      'any.only': 'Lead type must be either "company" or "category"',
      'string.max': 'Lead type cannot exceed 255 characters'
    }),
  
  prefix: Joi.string()
    .valid('Mr', 'Ms', 'Dr', '')
    .max(10)
    .trim()
    .allow('')
    .messages({
      'any.only': 'Prefix must be Mr, Ms, Dr, or empty',
      'string.max': 'Prefix cannot exceed 10 characters'
    }),
  
  name: Joi.string()
    .required()
    .max(255)
    .trim()
    .messages({
      'string.empty': 'Name is required',
      'any.required': 'Name is required',
      'string.max': 'Name cannot exceed 255 characters'
    }),
  
  mobile: Joi.string()
    .max(50)
    .trim()
    .allow('')
    .pattern(/^[0-9+\-\s()]*$/)
    .messages({
      'string.max': 'Mobile cannot exceed 50 characters',
      'string.pattern.base': 'Mobile number contains invalid characters'
    }),
  
  phone: Joi.string()
    .max(50)
    .trim()
    .allow('')
    .pattern(/^[0-9+\-\s()]*$/)
    .messages({
      'string.max': 'Phone cannot exceed 50 characters',
      'string.pattern.base': 'Phone number contains invalid characters'
    }),
  
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(255)
    .trim()
    .lowercase()
    .allow('')
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email cannot exceed 255 characters'
    }),
  
  date: Joi.date()
    .required()
    .iso()
    .messages({
      'any.required': 'Lead date is required',
      'date.base': 'Please provide a valid date',
      'date.format': 'Date must be in ISO format (YYYY-MM-DD)'
    }),
  
  category: Joi.string()
    .required()
    .max(255)
    .trim()
    .messages({
      'string.empty': 'Category is required',
      'any.required': 'Category is required',
      'string.max': 'Category cannot exceed 255 characters'
    }),
  
  city: Joi.string()
    .required()
    .max(255)
    .trim()
    .messages({
      'string.empty': 'City is required',
      'any.required': 'City is required',
      'string.max': 'City cannot exceed 255 characters'
    }),
  
  area: Joi.string()
    .max(255)
    .trim()
    .allow('')
    .messages({
      'string.max': 'Area cannot exceed 255 characters'
    }),
  
  brancharea: Joi.string()
    .max(255)
    .trim()
    .allow('')
    .messages({
      'string.max': 'Branch area cannot exceed 255 characters'
    }),
  
  dncmobile: Joi.number()
    .required()
    .valid(0, 1)
    .integer()
    .messages({
      'any.required': 'DNC mobile status is required',
      'any.only': 'DNC mobile must be 0 (non-DND) or 1 (DND)',
      'number.base': 'DNC mobile must be a number'
    }),
  
  dncphone: Joi.number()
    .required()
    .valid(0, 1)
    .integer()
    .messages({
      'any.required': 'DNC phone status is required',
      'any.only': 'DNC phone must be 0 (non-DND) or 1 (DND)',
      'number.base': 'DNC phone must be a number'
    }),
  
  company: Joi.string()
    .max(255)
    .trim()
    .allow('')
    .messages({
      'string.max': 'Company cannot exceed 255 characters'
    }),
  
  pincode: Joi.string()
    .max(50)
    .trim()
    .allow('')
    .pattern(/^[0-9]*$/)
    .messages({
      'string.max': 'Pincode cannot exceed 50 characters',
      'string.pattern.base': 'Pincode must contain only numbers'
    }),
  
  time: Joi.string()
    .required()
    .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/)
    .messages({
      'any.required': 'Lead time is required',
      'string.pattern.base': 'Please provide a valid time in HH:MM:SS format'
    }),
  
  branchpin: Joi.string()
    .max(50)
    .trim()
    .allow('')
    .pattern(/^[0-9]*$/)
    .messages({
      'string.max': 'Branch pincode cannot exceed 50 characters',
      'string.pattern.base': 'Branch pincode must contain only numbers'
    }),
  
  parentid: Joi.string()
    .max(255)
    .trim()
    .allow('')
    .messages({
      'string.max': 'Parent ID cannot exceed 255 characters'
    })
});

// Validation middleware
export const validateLead = (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Handle both GET and POST requests
    const data = req.method === 'GET' ? req.query : req.body;
    
    // Convert string values to appropriate types for validation
    const processedData = {
      ...data,
      dncmobile: data.dncmobile ? parseInt(data.dncmobile) : data.dncmobile,
      dncphone: data.dncphone ? parseInt(data.dncphone) : data.dncphone,
      date: data.date ? new Date(data.date) : data.date
    };
    
    const { error, value } = leadSchema.validate(processedData, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      logger.warn('Lead validation failed', {
        leadid: data.leadid,
        errors: validationErrors,
        processingTime: Date.now() - startTime
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Store validated data in request
    req.validatedLead = value;
    
    logger.info('Lead validation successful', {
      leadid: value.leadid,
      processingTime: Date.now() - startTime
    });
    
    next();
  } catch (err) {
    logger.error('Validation middleware error', {
      error: err.message,
      leadid: req.body?.leadid || req.query?.leadid,
      processingTime: Date.now() - startTime
    });
    
    return res.status(500).json({
      success: false,
      message: 'Internal validation error'
    });
  }
};

// Sanitization middleware
export const sanitizeLead = (req, res, next) => {
  try {
    const data = req.validatedLead || (req.method === 'GET' ? req.query : req.body);
    
    // Sanitize string fields
    const sanitizedData = {};
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        // Remove extra whitespace and trim
        sanitizedData[key] = data[key].trim().replace(/\s+/g, ' ');
      } else {
        sanitizedData[key] = data[key];
      }
    });
    
    req.sanitizedLead = sanitizedData;
    next();
  } catch (err) {
    logger.error('Sanitization error', { error: err.message });
    next(err);
  }
};
