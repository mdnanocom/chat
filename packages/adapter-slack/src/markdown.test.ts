import { describe, expect, it } from "vitest";
import { SlackFormatConverter } from "./markdown";

describe("SlackFormatConverter", () => {
  const converter = new SlackFormatConverter();

  describe("toMarkdown (mrkdwn -> markdown)", () => {
    it("should convert bold", () => {
      expect(converter.toMarkdown("Hello *world*!")).toContain("**world**");
    });

    it("should convert strikethrough", () => {
      expect(converter.toMarkdown("Hello ~world~!")).toContain("~~world~~");
    });

    it("should convert links with text", () => {
      const result = converter.toMarkdown("Check <https://example.com|this>");
      expect(result).toContain("[this](https://example.com)");
    });

    it("should convert bare links", () => {
      const result = converter.toMarkdown("Visit <https://example.com>");
      expect(result).toContain("https://example.com");
    });

    it("should convert user mentions", () => {
      const result = converter.toMarkdown("Hey <@U123|john>!");
      expect(result).toContain("@john");
    });

    it("should convert channel mentions", () => {
      const result = converter.toMarkdown("Join <#C123|general>");
      expect(result).toContain("#general");
    });

    it("should convert bare channel ID mentions", () => {
      const result = converter.toMarkdown("Join <#C123>");
      expect(result).toContain("#C123");
    });
  });

  describe("toSlackPayload", () => {
    it("routes plain strings to text (preserves literal markdown chars)", () => {
      expect(converter.toSlackPayload("Use *foo* literally")).toEqual({
        text: "Use *foo* literally",
      });
    });

    it("routes raw strings to text", () => {
      expect(converter.toSlackPayload({ raw: "*already mrkdwn*" })).toEqual({
        text: "*already mrkdwn*",
      });
    });

    it("routes markdown to a markdown Block Kit block (with text fallback)", () => {
      expect(
        converter.toSlackPayload({ markdown: "## Heading\n\n- a\n- b" })
      ).toEqual({
        text: "## Heading\n\n- a\n- b",
        blocks: [{ type: "markdown", text: "## Heading\n\n- a\n- b" }],
      });
    });

    it("routes ast to a markdown block via stringifyMarkdown", () => {
      const ast = {
        type: "root" as const,
        children: [
          {
            type: "paragraph" as const,
            children: [
              {
                type: "strong" as const,
                children: [{ type: "text" as const, value: "bold" }],
              },
            ],
          },
        ],
      };
      const result = converter.toSlackPayload({ ast }) as {
        text: string;
        blocks: [{ type: "markdown"; text: string }];
      };
      expect(result.blocks[0].type).toBe("markdown");
      expect(result.blocks[0].text).toContain("**bold**");
      expect(result.text).toBe(result.blocks[0].text);
    });

    it("emits a markdown block (not markdown_text) so GFM tables render natively", () => {
      const result = converter.toSlackPayload({
        markdown: "Heading\n\n| A | B |\n|---|---|\n| 1 | 2 |",
      }) as { text: string; blocks: [{ type: "markdown"; text: string }] };
      expect(result).not.toHaveProperty("markdown_text");
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe("markdown");
      expect(result.blocks[0].text).toContain("| A | B |");
      expect(result.blocks[0].text).toContain("| 1 | 2 |");
    });

    it("preserves tables when rendering ast to a markdown block", () => {
      const ast = {
        type: "root" as const,
        children: [
          {
            type: "table" as const,
            align: [null, null] as Array<"left" | "right" | "center" | null>,
            children: [
              {
                type: "tableRow" as const,
                children: [
                  {
                    type: "tableCell" as const,
                    children: [{ type: "text" as const, value: "A" }],
                  },
                  {
                    type: "tableCell" as const,
                    children: [{ type: "text" as const, value: "B" }],
                  },
                ],
              },
              {
                type: "tableRow" as const,
                children: [
                  {
                    type: "tableCell" as const,
                    children: [{ type: "text" as const, value: "1" }],
                  },
                  {
                    type: "tableCell" as const,
                    children: [{ type: "text" as const, value: "2" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = converter.toSlackPayload({ ast }) as {
        text: string;
        blocks: [{ type: "markdown"; text: string }];
      };
      expect(result.blocks[0].type).toBe("markdown");
      expect(result.blocks[0].text).toContain("| A | B |");
      expect(result.blocks[0].text).toContain("| 1 | 2 |");
    });
  });

  describe("toResponseUrlText", () => {
    it("renders markdown to Slack mrkdwn text", () => {
      expect(
        converter.toResponseUrlText({
          markdown: "**Bold** and [link](https://example.com)",
        })
      ).toBe("*Bold* and <https://example.com|link>");
    });

    it("renders markdown tables as ASCII code blocks", () => {
      expect(
        converter.toResponseUrlText({
          markdown: "| A | B |\n|---|---|\n| 1 | 2 |",
        })
      ).toContain("```\n");
    });
  });

  describe("mentions", () => {
    it("does not double-wrap existing <@U123> mentions in plain strings", () => {
      expect(converter.toSlackPayload("Hey <@U12345>. Please select")).toEqual({
        text: "Hey <@U12345>. Please select",
      });
    });

    it("does not double-wrap existing mentions in markdown", () => {
      expect(
        converter.toSlackPayload({ markdown: "Hey <@U12345>. Please select" })
      ).toEqual({
        text: "Hey <@U12345>. Please select",
        blocks: [{ type: "markdown", text: "Hey <@U12345>. Please select" }],
      });
    });

    it("rewrites bare @mentions in plain strings", () => {
      expect(converter.toSlackPayload("Hey @george. Please select")).toEqual({
        text: "Hey <@george>. Please select",
      });
    });

    it("rewrites bare @mentions in markdown", () => {
      expect(
        converter.toSlackPayload({ markdown: "Hey @george. Please select" })
      ).toEqual({
        text: "Hey <@george>. Please select",
        blocks: [{ type: "markdown", text: "Hey <@george>. Please select" }],
      });
    });

    it("does not mangle email addresses in plain strings", () => {
      expect(
        converter.toSlackPayload("Contact user@example.com for help")
      ).toEqual({ text: "Contact user@example.com for help" });
    });

    it("does not mangle mailto links", () => {
      expect(
        converter.toSlackPayload("Email <mailto:user@example.com>")
      ).toEqual({ text: "Email <mailto:user@example.com>" });
    });

    it("converts mentions adjacent to non-word punctuation", () => {
      expect(converter.toSlackPayload("(cc @george, @anne)")).toEqual({
        text: "(cc <@george>, <@anne>)",
      });
    });
  });

  describe("toPlainText", () => {
    it("should remove bold markers", () => {
      expect(converter.toPlainText("Hello *world*!")).toBe("Hello world!");
    });

    it("should remove italic markers", () => {
      expect(converter.toPlainText("Hello _world_!")).toBe("Hello world!");
    });

    it("should extract link text", () => {
      expect(converter.toPlainText("Check <https://example.com|this>")).toBe(
        "Check this"
      );
    });

    it("should format user mentions", () => {
      const result = converter.toPlainText("Hey <@U123>!");
      expect(result).toContain("@U123");
    });

    it("should handle complex messages", () => {
      const input =
        "*Bold* and _italic_ with <https://x.com|link> and <@U123|user>";
      const result = converter.toPlainText(input);
      expect(result).toContain("Bold");
      expect(result).toContain("italic");
      expect(result).toContain("link");
      expect(result).toContain("user");
      expect(result).not.toContain("*");
      expect(result).not.toContain("<");
    });
  });
});
