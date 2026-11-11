import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { App, ago, type Row } from "../src/popup/main";
const row: Row = { id:"demo", sentAt:1000, mode:"combined", recipients:[{status:"OPENED",label:"Opened",tooltip:"Image loaded, not proof of reading",openCount:1,firstOpenedAt:1000}] };
describe("popup",()=>{
 it("labels development and combined uncertainty",()=>{const html=renderToStaticMarkup(<App rows={[row]} now={61000}/>); expect(html).toContain("Prototype");expect(html).toContain("All recipients · combined status");expect(html).toContain("Subject not stored");expect(html).toContain("1 image load");expect(html).toContain("not proof anyone read");});
 it("empty state does not pretend tracking is live",()=>{const html=renderToStaticMarkup(<App rows={[]}/>);expect(html).toContain("not ready for real mail");});
 it("tolerates rows with no recipients",()=>{expect(()=>renderToStaticMarkup(<App rows={[{...row,recipients:[]}]}/>)).not.toThrow();});
 it("never renders a future timestamp as negative",()=>{expect(ago(100000,1)).toBe("just now");});
});
