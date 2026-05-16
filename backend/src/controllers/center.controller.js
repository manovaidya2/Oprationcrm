import Center from "../models/Center.js";

// ✅ Create Center
export const createCenter = async (req, res) => {
  try {
    const center = await Center.create(req.body);
    res.json(center);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ Get All Centers
export const getCenters = async (req, res) => {
  try {
    const centers = await Center.find().sort({ createdAt: -1 });
    res.json(centers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ Get Single Center
export const getCenterById = async (req, res) => {
  try {
    const center = await Center.findById(req.params.id);
    res.json(center);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ Update Center
export const updateCenter = async (req, res) => {
  try {
    const updated = await Center.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ Delete Center
export const deleteCenter = async (req, res) => {
  try {
    await Center.findByIdAndDelete(req.params.id);
    res.json({ msg: "Center deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};