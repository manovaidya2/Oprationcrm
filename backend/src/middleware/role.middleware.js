export const allowRoles = (...roles) => {
  return (req, res, next) => {
    // ❗ check user exists
    if (!req.user) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    // ❗ check role exists
    if (!req.user.role) {
      return res.status(403).json({ msg: "Role not found" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    next();
  };
};