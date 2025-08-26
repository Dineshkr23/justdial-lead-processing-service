import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  leadid: {
    type: String,
    required: [true, 'Lead ID is required'],
    unique: true,
    trim: true,
    maxlength: [255, 'Lead ID cannot exceed 255 characters']
  },
  leadtype: {
    type: String,
    required: [true, 'Lead type is required'],
    trim: true,
    maxlength: [255, 'Lead type cannot exceed 255 characters'],
    enum: {
      values: ['company', 'category'],
      message: 'Lead type must be either "company" or "category"'
    }
  },
  prefix: {
    type: String,
    trim: true,
    maxlength: [10, 'Prefix cannot exceed 10 characters'],
    enum: {
      values: ['Mr', 'Ms', 'Dr', ''],
      message: 'Prefix must be Mr, Ms, Dr, or empty'
    },
    default: ''
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [255, 'Name cannot exceed 255 characters']
  },
  mobile: {
    type: String,
    trim: true,
    maxlength: [50, 'Mobile cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return !v || /^[0-9+\-\s()]+$/.test(v);
      },
      message: 'Mobile number contains invalid characters'
    }
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [50, 'Phone cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return !v || /^[0-9+\-\s()]+$/.test(v);
      },
      message: 'Phone number contains invalid characters'
    }
  },
  email: {
    type: String,
    trim: true,
    maxlength: [255, 'Email cannot exceed 255 characters'],
    lowercase: true,
    validate: {
      validator: function(v) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please provide a valid email address'
    }
  },
  date: {
    type: Date,
    required: [true, 'Lead date is required'],
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v);
      },
      message: 'Please provide a valid date'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [255, 'Category cannot exceed 255 characters']
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [255, 'City cannot exceed 255 characters']
  },
  area: {
    type: String,
    trim: true,
    maxlength: [255, 'Area cannot exceed 255 characters']
  },
  brancharea: {
    type: String,
    trim: true,
    maxlength: [255, 'Branch area cannot exceed 255 characters']
  },
  dncmobile: {
    type: Number,
    required: [true, 'DNC mobile status is required'],
    enum: {
      values: [0, 1],
      message: 'DNC mobile must be 0 (non-DND) or 1 (DND)'
    }
  },
  dncphone: {
    type: Number,
    required: [true, 'DNC phone status is required'],
    enum: {
      values: [0, 1],
      message: 'DNC phone must be 0 (non-DND) or 1 (DND)'
    }
  },
  company: {
    type: String,
    trim: true,
    maxlength: [255, 'Company cannot exceed 255 characters']
  },
  pincode: {
    type: String,
    trim: true,
    maxlength: [50, 'Pincode cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return !v || /^[0-9]+$/.test(v);
      },
      message: 'Pincode must contain only numbers'
    }
  },
  time: {
    type: String,
    required: [true, 'Lead time is required'],
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: 'Please provide a valid time in HH:MM:SS format'
    }
  },
  branchpin: {
    type: String,
    trim: true,
    maxlength: [50, 'Branch pincode cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return !v || /^[0-9]+$/.test(v);
      },
      message: 'Branch pincode must contain only numbers'
    }
  },
  parentid: {
    type: String,
    trim: true,
    maxlength: [255, 'Parent ID cannot exceed 255 characters']
  },
  // Additional fields for tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending'
  },
  processingTime: {
    type: Number, // in milliseconds
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
leadSchema.index({ leadid: 1 }, { unique: true });
leadSchema.index({ date: 1 });
leadSchema.index({ city: 1 });
leadSchema.index({ category: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: 1 });
leadSchema.index({ leadtype: 1, city: 1, category: 1 }); // Compound index for common queries

// Pre-save middleware to update the updatedAt field
leadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for formatted date
leadSchema.virtual('formattedDate').get(function() {
  return this.date ? this.date.toISOString().split('T')[0] : null;
});

// Static method to find leads by date range
leadSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ date: -1 });
};

// Static method to find leads by city and category
leadSchema.statics.findByCityAndCategory = function(city, category) {
  return this.find({
    city: new RegExp(city, 'i'),
    category: new RegExp(category, 'i')
  }).sort({ createdAt: -1 });
};

// Instance method to mark as processed
leadSchema.methods.markAsProcessed = function(processingTime = 0) {
  this.status = 'processed';
  this.processingTime = processingTime;
  return this.save();
};

// Instance method to mark as failed
leadSchema.methods.markAsFailed = function() {
  this.status = 'failed';
  return this.save();
};

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;
