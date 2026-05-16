const taskSchema = new mongoose.Schema({
  title: String,

  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student"
  },

  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  stage: String,

  status: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending"
  }

}, { timestamps: true });