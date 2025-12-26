const mongoose = require("mongoose");
const { getDatConnection } = require("../db/datConnect");

const datDatasourceSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    provider: {
      type: String, // e.g., 'mysql', 'postgresql', 'duckdb'
      required: true,
    },
    configuration: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    agentNames: {
      type: [String],
      default: [],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "datasources",
  },
);

// Compound index for unique name per project (mirrors Java: @CompoundIndex)
datDatasourceSchema.index({ projectId: 1, name: 1 }, { unique: true });

let DatDatasource;

try {
  const conn = getDatConnection();
  DatDatasource = conn.model("DatDatasource", datDatasourceSchema);
} catch (error) {
  // If connection isn't ready immediately, we might need a function to get model or handle it differently.
  // However, getDatConnection returns a connection instance (or a promise-like object that mongoose can use?
  // Wait, getDatConnection in datConnect.js returns `state.connection` which might be null if not connected.
  // Actually, looking at datConnect.js from previous steps, it returns a Promise if awaited, or checks state.
  // The previous DatProject implementation used `await getDatConnection()` inside the controller or initialized it.
  // Let's check DatProject.js to copy the pattern.
  console.error("Error defining DatDatasource model:", error);
}

module.exports = {
  getDatDatasourceModel: async () => {
    const conn = await getDatConnection();
    // Check if model already exists on connection
    if (conn.models.DatDatasource) {
      return conn.models.DatDatasource;
    }
    return conn.model("DatDatasource", datDatasourceSchema);
  },
};
