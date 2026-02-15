const mongoose = require('mongoose');

const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    relation: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    age: { type: Number, min: 0, max: 130, default: null },
    gender: { type: String, trim: true, default: '' },
    heightCm: { type: Number, min: 30, max: 300, default: null },
    weightKg: { type: Number, min: 2, max: 500, default: null },
    emergencyContacts: { type: [EmergencyContactSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
