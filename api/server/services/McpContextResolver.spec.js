const {
  stripHiddenParamsFromSchema,
  applyContextInjection,
  getContextInjectionConfig,
} = require("./McpContextResolver");

describe("McpContextResolver", () => {
  describe("getContextInjectionConfig", () => {
    it("returns tool-specific default config for becauseai-server ask_data", () => {
      const config = getContextInjectionConfig("becauseai-server", undefined, "ask_data");
      expect(config?.inject).toEqual({ arg1: "projectId", arg2: "datasourceId", arg4: "question" });
      expect(config?.hideFromSchema).toContain("arg1");
    });

    it("prefers tool-specific mcpConfig override when provided", () => {
      const custom = {
        "custom-server": {
          contextInjection: {
            run: {
              resolve: [{ from: "requestBody", field: "datasourceId" }],
              inject: { foo: "projectId" },
              hideFromSchema: ["foo"],
            },
          },
        },
      };
      const config = getContextInjectionConfig("custom-server", custom, "run");
      expect(config?.inject).toEqual({ foo: "projectId" });
    });

    it("prefers server-level mcpConfig override when provided", () => {
      const custom = {
        "custom-server": {
          contextInjection: {
            resolve: [{ from: "requestBody", field: "datasourceId" }],
            inject: { foo: "projectId" },
            hideFromSchema: ["foo"],
          },
        },
      };
      const config = getContextInjectionConfig("custom-server", custom);
      expect(config?.inject).toEqual({ foo: "projectId" });
    });
  });

  describe("stripHiddenParamsFromSchema", () => {
    it("removes hidden properties and required entries", () => {
      const parameters = {
        type: "object",
        properties: {
          query: { type: "string" },
          arg1: { type: "string" },
          arg2: { type: "string" },
        },
        required: ["query", "arg1", "arg2"],
      };
      const result = stripHiddenParamsFromSchema(parameters, ["arg1", "arg2"]);
      expect(result.properties).not.toHaveProperty("arg1");
      expect(result.properties).not.toHaveProperty("arg2");
      expect(result.required).toEqual(["query"]);
    });
  });

  describe("applyContextInjection", () => {
    it("injects mapped fields without overwriting explicit values", () => {
      const args = applyContextInjection(
        { arg1: "user-set", query: "sales" },
        { projectId: "p1", datasourceId: "d1" },
        { arg1: "projectId", arg2: "datasourceId" },
        ["arg1", "arg2"],
      );
      expect(args.arg1).toBe("user-set");
      expect(args.arg2).toBe("d1");
      expect(args.query).toBe("sales");
    });

    it("maps question-like fields to arg4 when configured", () => {
      const args = applyContextInjection(
        { question: "how many accounts" },
        { projectId: "p1", datasourceId: "d1" },
        { arg1: "projectId", arg2: "datasourceId", arg4: "question" },
        ["arg1", "arg2"],
      );
      expect(args.arg1).toBe("p1");
      expect(args.arg2).toBe("d1");
      expect(args.arg4).toBe("how many accounts");
      expect(args.question).toBe("how many accounts");
    });
  });
});
