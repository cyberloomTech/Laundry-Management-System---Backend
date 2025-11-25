const Role = require('../models/Role');

/**
 * Get unique permissions for a user based on their roles
 * @param {Array} userRoles - Array of role names
 * @returns {Array} - Array of unique permissions
 */
const getUserPermissions = async (userRoles) => {
  if (!userRoles || userRoles.length === 0) {
    return [];
  }

  const allPermissions = [];
  
  // Get permissions from each role
  for (let roleName of userRoles) {
    const roleDoc = await Role.findOne({ roleName: roleName });
    if (roleDoc && roleDoc.permission) {
      // Add all permissions from this role
      allPermissions.push(...roleDoc.permission);
    }
  }

  // Remove duplicates and filter out empty/null values
  const uniquePermissions = [...new Set(allPermissions.filter(permission => permission && permission.trim()))];
  
  return uniquePermissions;
};

module.exports = {
  getUserPermissions
};