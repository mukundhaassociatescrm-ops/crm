const Employee = require('../models/Employee');
const User = require('../models/User');

const getAuthRoleFromEmployeeRole = (employeeRole) => {
  return String(employeeRole || '').toLowerCase() === 'admin' ? 'admin' : 'user';
};

const isAdminUser = (user) => String(user?.role || '').toLowerCase() === 'admin';

const isLegacyPrimaryAdmin = async (user) => {
  if (!isAdminUser(user)) {
    return false;
  }

  const firstAdmin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).select('_id');
  return Boolean(firstAdmin?._id && String(firstAdmin._id) === String(user._id));
};

const getAdminCreateScope = (req) => {
  return isAdminUser(req.user) ? { adminOwner: req.user._id } : {};
};

const getAdminReadScope = async (req) => {
  if (!isAdminUser(req.user)) {
    return {};
  }

  const canSeeLegacyUnowned = await isLegacyPrimaryAdmin(req.user);
  if (canSeeLegacyUnowned) {
    return {
      $or: [
        { adminOwner: req.user._id },
        { adminOwner: { $exists: false } },
        { adminOwner: null },
      ],
    };
  }

  return { adminOwner: req.user._id };
};

const attachMustCreatePasswordFlags = async (employees) => {
  if (!employees.length) {
    return [];
  }

  const emails = employees
    .map((employee) => String(employee.email || '').toLowerCase().trim())
    .filter(Boolean);

  if (!emails.length) {
    return employees.map((employee) => ({
      ...employee.toObject(),
      mustCreatePassword: false,
    }));
  }

  const users = await User.find({ email: { $in: emails } }).select('email mustCreatePassword');
  const flagByEmail = new Map(
    users.map((user) => [String(user.email || '').toLowerCase(), !!user.mustCreatePassword]),
  );

  return employees.map((employee) => ({
    ...employee.toObject(),
    mustCreatePassword: flagByEmail.get(String(employee.email || '').toLowerCase()) || false,
  }));
};

exports.addEmployee = async (req, res, next) => {
  try {
    const { fullName, email, phone, address, role, status } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'fullName and email are required.' });
    }

    const exists = await Employee.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    const normalizedEmployeeRole = String(role || 'Employee');

    const employee = await Employee.create({
      fullName,
      email,
      phone,
      address,
      role: normalizedEmployeeRole,
      status: typeof status === 'boolean' ? status : true,
      ...getAdminCreateScope(req),
    });

    try {
      await User.create({
        name: fullName,
        email: email.toLowerCase(),
        role: getAuthRoleFromEmployeeRole(normalizedEmployeeRole),
        password: null,
        passwordSet: false,
      });
    } catch (err) {
      await Employee.findByIdAndDelete(employee._id);
      return res.status(500).json({ success: false, message: 'Failed to create authentication user.' });
    }

    res.status(201).json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
};

exports.getEmployees = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const query = { ...(await getAdminReadScope(req)) };

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ fullName: regex }, { email: regex }, { phone: regex }];
    }

    if (status !== undefined) {
      query.status = status === 'true';
    }

    const employees = await Employee.find(query).sort({ createdAt: -1 });
    const data = await attachMustCreatePasswordFlags(employees);
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

exports.resetEmployeePassword = async (req, res, next) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
    }

    const employee = await Employee.findOne({
      _id: req.params.employeeId,
      ...(await getAdminReadScope(req)),
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const normalizedEmail = String(employee.email || '').toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No login account found for this employee.' });
    }

    if (String(user.role || '').toLowerCase() === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Cannot reset password for this account.' });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot reset your own password from employee management.' });
    }

    user.mustCreatePassword = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset requested. Employee must create a new password.',
    });
  } catch (error) {
    next(error);
  }
};

exports.getEmployeeById = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...(await getAdminReadScope(req)) });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.status(200).json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...(await getAdminReadScope(req)) });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const { fullName, email, phone, address, role, status } = req.body;
    const oldEmail = employee.email;
    if (email && email !== employee.email) {
      const existingEmail = await Employee.findOne({ email: email.toLowerCase(), _id: { $ne: req.params.id } });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email already used by another employee' });
      }

      const authEmailExists = await User.findOne({ email: email.toLowerCase() });
      if (authEmailExists) {
        return res.status(400).json({ success: false, message: 'Email already used by another user' });
      }
    }

    employee.fullName = fullName ?? employee.fullName;
    employee.email = email ?? employee.email;
    employee.phone = phone ?? employee.phone;
    employee.address = address ?? employee.address;
    employee.role = role ?? employee.role;
    if (status !== undefined) employee.status = status;

    await employee.save();

    const authUser = await User.findOne({ email: oldEmail.toLowerCase() });
    if (authUser) {
      const nextAuthRole = getAuthRoleFromEmployeeRole(employee.role);
      const roleChanged = authUser.role !== nextAuthRole;

      authUser.name = employee.fullName;
      authUser.email = employee.email.toLowerCase();
      authUser.role = nextAuthRole;
      if (roleChanged) {
        authUser.tokenVersion = (authUser.tokenVersion || 0) + 1;
      }
      await authUser.save();
    } else {
      await User.create({
        name: employee.fullName,
        email: employee.email.toLowerCase(),
        role: getAuthRoleFromEmployeeRole(employee.role),
        password: null,
        passwordSet: false,
      });
    }

    res.status(200).json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOneAndDelete({ _id: req.params.id, ...(await getAdminReadScope(req)) });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    await User.findOneAndDelete({
      email: employee.email.toLowerCase(),
      role: { $in: ['admin', 'user', 'Admin', 'Employee', 'employee'] },
    });

    res.status(200).json({ success: true, message: 'Employee deleted successfully' });
  } catch (error) {
    next(error);
  }
};
