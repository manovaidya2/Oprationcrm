import User from "../models/User.js";

export const createCounselor = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // check already exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ msg: "User already exists" });
    }

    const counselor = await User.create({
      name,
      email,
      password,
      role: "counselor",
    });

    res.json({
      msg: "Counselor created",
      counselor,
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};