jest.mock('@because/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/models/DatDatasource', () => ({ getDatDatasourceModel: jest.fn() }));
jest.mock('~/models/Conversation', () => ({ getConvo: jest.fn() }));
jest.mock('~/db/models', () => ({ Conversation: { findOneAndUpdate: jest.fn() } }));
jest.mock('~/server/services/DataSource', () => ({ getDataSourceByAgentId: jest.fn() }));

const {
  stripHiddenParamsFromSchema,
  applyContextInjection,
  getContextInjectionConfig,
} = require("./McpContextResolver");

describe("McpContextResolver", () => {
  describe("getContextInjectionConfig", () => {
    it("returns tool-specific default config for becauseai-server ask_data", () => {
      const config = getContextInjectionConfig("becauseai-server", undefined, "ask_data");
      expect(config?.inject).toEqual({
        projectId: "projectId",
        arg1: "projectId",
        arg2: "datasourceId",
        arg4: "orgCode",
        arg5: "question",
      });
      expect(config?.hideFromSchema).toEqual(
        expect.arrayContaining(["arg1", "arg2", "arg4"]),
      );
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

    it("reads question from inject-mapped param (arg5) and routes orgCode into arg4", () => {
      const args = applyContextInjection(
        { arg5: "how many accounts" },
        { projectId: "p1", datasourceId: "d1", orgCode: "H0001" },
        {
          arg1: "projectId",
          arg2: "datasourceId",
          arg4: "orgCode",
          arg5: "question",
        },
        ["arg1", "arg2", "arg4"],
      );
      expect(args.arg1).toBe("p1");
      expect(args.arg2).toBe("d1");
      expect(args.arg4).toBe("H0001");
      expect(args.arg5).toBe("how many accounts");
    });

    it("does not treat a user-supplied arg4 (orgCode) as the question text", () => {
      const args = applyContextInjection(
        { arg4: "H0001", question: "how many accounts" },
        { projectId: "p1", datasourceId: "d1" },
        {
          arg1: "projectId",
          arg2: "datasourceId",
          arg4: "orgCode",
          arg5: "question",
        },
        ["arg1", "arg2", "arg4"],
      );
      // user-supplied arg4 wins, never gets overwritten by context.orgCode
      expect(args.arg4).toBe("H0001");
      // arg5 derives from `question`, not from arg4
      expect(args.arg5).toBe("how many accounts");
    });
  });
});
