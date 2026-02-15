const mongoose = require('mongoose');

const HospitalSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, index: true },
    address: { type: String, trim: true, default: '' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coords) => Array.isArray(coords) && coords.length === 2,
          message: 'location.coordinates must be [lng, lat]',
        },
      },
    },
    averageWaitMinutes: { type: Number, default: 30 },
  },
  { timestamps: true }
);

HospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', HospitalSchema);
