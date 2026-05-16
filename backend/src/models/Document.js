import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
    },

    fileUrl: {
      type: String,
      required: true,
    },

    fileName: String,

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    type: {
      type: String, // agreement, certificate, etc.
    },
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);