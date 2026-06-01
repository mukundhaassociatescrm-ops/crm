const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'] },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/.+@.+\..+/, 'Please add a valid email'],
    },
    password: { type: String, minlength: 5, select: false },
    passwordSet: { type: Boolean, default: false },
    mustCreatePassword: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'user'],
      default: 'user',
      lowercase: true,
      trim: true,
    },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  // Support passwordless users created from employee onboarding.
  if (!this.password) {
    this.passwordSet = false;
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordSet = true;
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
