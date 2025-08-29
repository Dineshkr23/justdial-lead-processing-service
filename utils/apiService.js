import { logger } from "./logger.js";

// API endpoints for different categories
const API_ENDPOINTS = {
  // Marketing and advertising categories
  MARKETING_API:
    "https://crm-leads-service.pointofconnect.com/api/leads/webapi/b49a0df6-0516-440a-a22d-c79a3dad7011",
  // WhatsApp and broadcast categories
  WHATSAPP_API:
    "https://crm-leads-service.pointofconnect.com/api/leads/webapi/3bf6fe8f-5c5d-4182-86d2-9dfa19a62220",
};

// Category mappings
const CATEGORY_MAPPINGS = {
  // Marketing and advertising categories - goes to first API
  MARKETING_CATEGORIES: [
    "Advertising Agencies",
    "Branding Services",
    "Website Marketing Services",
    "Campaign Management Services",
    "Content Creation Services",
    "Digital Marketing Services",
    "Google Ads Certified Partners",
    "Marketing Agencies",
    "Marketing Services",
    "Pay Per Click Services",
    "Social Media Consultants",
    "Social Media Marketing Agencies",
  ],

  // WhatsApp and broadcast categories - goes to second API
  WHATSAPP_CATEGORIES: [
    "Broadcast Services",
    "Whatsapp Business Api Services",
    "Whatsapp Marketing Services",
    "Bulk Whatsapp Messaging Services",
  ],
};

/**
 * Determine which API endpoint to use based on the lead category
 * @param {string} category - The lead category
 * @returns {string} - The appropriate API endpoint
 */
export const getApiEndpoint = (category) => {
  if (!category) {
    logger.warn("No category provided, defaulting to marketing API");
    return API_ENDPOINTS.MARKETING_API;
  }

  const normalizedCategory = category.trim();

  if (CATEGORY_MAPPINGS.WHATSAPP_CATEGORIES.includes(normalizedCategory)) {
    logger.info(`Category "${normalizedCategory}" mapped to WhatsApp API`);
    return API_ENDPOINTS.WHATSAPP_API;
  }

  // Default to marketing API for all other categories
  logger.info(`Category "${normalizedCategory}" mapped to Marketing API`);
  return API_ENDPOINTS.MARKETING_API;
};

/**
 * Transform lead data to the format expected by external APIs
 * @param {Object} leadData - The original lead data
 * @returns {Object} - Transformed data for API
 */
export const transformLeadData = (leadData) => {
  const transformed = {};

  // Map fields according to requirements
  if (leadData.prefix && leadData.name) {
    transformed.name = `${leadData.prefix} ${leadData.name}`.trim();
  } else if (leadData.name) {
    transformed.name = leadData.name;
  }

  // Phone number - prefer mobile over phone
  if (leadData.mobile) {
    transformed["phone-number"] = leadData.mobile;
  } else if (leadData.phone) {
    transformed["phone-number"] = leadData.phone;
  }

  // Email
  if (leadData.email) {
    transformed["email-address"] = leadData.email;
  }

  // Date and time combination
  if (leadData.date && leadData.time) {
    const dateTime = new Date(leadData.date);
    const [hours, minutes, seconds] = leadData.time.split(":");
    dateTime.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds));
    transformed["enquiry-date-time"] = dateTime.toISOString();
  } else if (leadData.date) {
    transformed["enquiry-date-time"] = new Date(leadData.date).toISOString();
  }

  // Category
  if (leadData.category) {
    transformed.category = leadData.category;
  }

  // City
  if (leadData.city) {
    transformed.city = leadData.city;
  }

  // Area
  if (leadData.area) {
    transformed.area = leadData.area;
  }

  // Branch area
  if (leadData.brancharea) {
    transformed["branch-area"] = leadData.brancharea;
  }

  // Pincode
  if (leadData.pincode) {
    transformed.pincode = leadData.pincode;
  }

  return transformed;
};

/**
 * Send lead data to external API
 * @param {Object} leadData - The lead data to send
 * @param {string} apiEndpoint - The API endpoint to send to
 * @returns {Promise<Object>} - API response
 */
export const sendLeadToApi = async (leadData, apiEndpoint) => {
  const startTime = Date.now();

  try {
    logger.info("Sending lead to external API", {
      endpoint: apiEndpoint,
      leadId: leadData.leadid,
    });

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(leadData),
      timeout: 30000, // 30 second timeout
    });

    const processingTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("External API request failed", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        processingTime,
        leadId: leadData.leadid,
      });

      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const responseData = await response.json();

    logger.info("Lead sent to external API successfully", {
      status: response.status,
      processingTime,
      leadId: leadData.leadid,
    });

    return {
      success: true,
      data: responseData,
      processingTime,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Failed to send lead to external API", {
      error: error.message,
      processingTime,
      leadId: leadData.leadid,
      endpoint: apiEndpoint,
    });

    throw error;
  }
};

/**
 * Process and forward lead to appropriate external API
 * @param {Object} leadData - The lead data to process
 * @returns {Promise<Object>} - Processing result
 */
export const processAndForwardLead = async (leadData) => {
  try {
    // Determine the appropriate API endpoint based on category
    const apiEndpoint = getApiEndpoint(leadData.category);

    // Transform the lead data to the expected format
    const transformedData = transformLeadData(leadData);

    // Send to external API
    const result = await sendLeadToApi(transformedData, apiEndpoint);

    return {
      success: true,
      apiEndpoint,
      category: leadData.category,
      ...result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      category: leadData.category,
    };
  }
};
