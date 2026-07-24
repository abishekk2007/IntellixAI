import { describe, expect, it } from "vitest";
import { analysisSchema, parseModelJson } from "../src/modules/ai/provider.js";
import { retrieveRelevantChunks, sanitizeOriginalName, splitIntoChunks, validateUpload } from "../src/modules/documents/document.service.js";

describe("document processing utilities",()=>{
  it("splits text into bounded ordered chunks",()=>{const chunks=splitIntoChunks(`${"a".repeat(900)}\n\n${"b".repeat(900)}`,1000);expect(chunks).toHaveLength(2);expect(chunks[0]).toMatch(/^a/);});
  it("retrieves chunks matching question keywords",()=>{const chunks=[{chunkIndex:0,content:"Revenue increased in Europe"},{chunkIndex:1,content:"Singapore leads APAC demand"}];expect(retrieveRelevantChunks("What is the APAC demand?",chunks,1)[0].chunkIndex).toBe(1);});
  it("rejects extension and content mismatches",async()=>{const file={buffer:Buffer.from("not a png"),size:9,originalname:"fake.png",mimetype:"image/png"} as Express.Multer.File;await expect(validateUpload(file)).rejects.toMatchObject({code:"INVALID_FILE_TYPE"});});
  it("validates structured AI output before persistence",()=>{expect(()=>analysisSchema.parse({summary:"ok",keyPoints:[],keywords:[],actionItems:[{title:"Do it",priority:"URGENT"}],importantDates:[]})).toThrow();});
  it("extracts JSON from Gemini markdown fences",()=>{expect(parseModelJson("```json\n{\"summary\":\"ok\"}\n```")).toEqual({summary:"ok"});});
  it("rejects malformed Gemini JSON",()=>{expect(()=>parseModelJson("```json\nnot-json\n```")).toThrow(SyntaxError);});
  it("sanitizes uploaded display names without retaining paths",()=>{expect(sanitizeOriginalName("../../unsafe<script>.txt")).toBe("unsafe_script_.txt");});
});
