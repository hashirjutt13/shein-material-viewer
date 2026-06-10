import assert from "node:assert/strict";
import logic from "../src/shared/logic.js";

function byKey(materials, key) {
  return materials.find((material) => material.key === key);
}

function assertPercent(input, key, percentage) {
  const materials = logic.parseCompositionString(input);
  const material = byKey(materials, key);
  assert.ok(material, `expected ${key} in ${input}`);
  assert.equal(material.percentage, percentage);
}

assertPercent("100% Cotton", "cotton", 100);
assertPercent("65% Polyester, 35% Viscose", "polyester", 65);
assertPercent("65% Polyester, 35% Viscose", "rayon", 35);
assertPercent("Viscose 40%, Polyester 60%", "rayon", 40);
assertPercent("Viscose 40%, Polyester 60%", "polyester", 60);
assertPercent("95% Cotton, 5% Elastane", "cotton", 95);
assertPercent("95% Cotton, 5% Elastane", "elastane", 5);
assertPercent("Shell: 55% linen; 45% cotton", "linen", 55);
assertPercent("Shell: 55% linen; 45% cotton", "cotton", 45);
assertPercent("Cotton 80%, Linen 20%", "cotton", 80);
assertPercent("Cotton 80%, Linen 20%", "linen", 20);
assertPercent("90% Polyamide / 10% Spandex", "polyamide", 90);
assertPercent("90% Polyamide / 10% Spandex", "elastane", 10);

assert.ok(byKey(logic.parseCompositionString("TPU"), "tpu"));
assert.ok(byKey(logic.parseCompositionString("PC + TPU"), "polycarbonate"));
assert.ok(byKey(logic.parseCompositionString("PC + TPU"), "tpu"));
assert.ok(byKey(logic.parseCompositionString("PU Leather"), "pu-leather"));
assert.ok(byKey(logic.parseCompositionString("Tempered Glass"), "tempered-glass"));
assert.ok(byKey(logic.parseCompositionString("Zinc Alloy, Silicone"), "zinc-alloy"));
assert.ok(byKey(logic.parseCompositionString("Zinc Alloy, Silicone"), "silicone"));

const unknown = logic.parseCompositionString("Woven Fabric, Denim");
assert.ok(byKey(unknown, "woven"));
assert.ok(byKey(unknown, "denim"));
assert.equal(byKey(unknown, "woven").percentage, null);

assert.equal(
  logic.canonicalProductUrl("https://www.shein.com/Foo-p-123.html?src_identifier=noisy&mallCode=1&pageListType=4#x"),
  "https://www.shein.com/Foo-p-123.html?mallCode=1"
);

assert.equal(
  logic.canonicalProductUrl("https://www.shein.com/Foo-p-123.html?src_identifier=noisy&mall_code=1&attr_ids=160_212&pageListType=4#x"),
  "https://www.shein.com/Foo-p-123.html?mallCode=1&attr_ids=160_212"
);

assert.equal(
  logic.productCacheKeyFromUrl("https://www.shein.com/Foo-p-123.html?mallCode=1&attr_ids=160_212"),
  "123:attr_ids=160_212"
);

assert.equal(
  logic.productCacheKeyFromUrl("https://www.shein.com/Foo-p-123.html?mallCode=1"),
  "123"
);

assert.equal(logic.normalizeSettings({ otherPageScanMode: "auto-slow" }).otherPageScanMode, "auto-slow");
assert.equal(logic.normalizeSettings({ productPageScanMode: "auto-slow" }).productPageScanMode, "auto-slow");
assert.equal(logic.normalizeSettings({ scanMode: "auto-slow" }).otherPageScanMode, "auto-slow");
assert.equal(logic.normalizeSettings({ scanMode: "fast" }).otherPageScanMode, "manual");
assert.equal(logic.normalizeSettings({}).productPageScanMode, "manual");
assert.equal(logic.normalizeSettings({}).cardMode, "viewer");
assert.equal(logic.normalizeSettings({ cardMode: "filter" }).cardMode, "filter");
assert.equal(logic.normalizeSettings({ cardMode: "weird" }).cardMode, "viewer");
assert.equal(logic.normalizeSettings({ displayMode: "badge" }).displayMode, "badge");
assert.equal(logic.normalizeSettings({ displayMode: "weird" }).displayMode, "dim");
assert.equal(logic.normalizeSettings({ scanDelaySeconds: "12.5" }).scanDelaySeconds, 12.5);
assert.equal(logic.normalizeSettings({ scanDelaySeconds: "-1" }).scanDelaySeconds, 0);
assert.equal(logic.normalizeSettings({ scanDelaySeconds: "999" }).scanDelaySeconds, 300);
assert.equal(logic.normalizeSettings({ scanRandomnessSeconds: "2" }).scanRandomnessSeconds, 2);
assert.equal(logic.normalizeSettings({ scanRandomnessSeconds: "999" }).scanRandomnessSeconds, 120);

const html = `
  <script>
    window.__data = {"materialExposed":{"title":"Product details","materialInfoList":[
      {"attrName":"Material","attrValue":"Fabric"},
      {"attrName":"Composition","attrValue":"65% Polyester, 35% Viscose"}
    ]}};
  </script>
`;
const extracted = logic.extractMaterialsFromHtml(html);
assert.equal(extracted.materialExposedFound, true);
assert.equal(byKey(extracted.materials, "rayon").percentage, 35);
assert.equal(byKey(extracted.materials, "polyester").percentage, 65);

assert.equal(
  logic.evaluateProduct(
    { materials: logic.parseCompositionString("65% Polyester, 35% Viscose") },
    { enabled: true, combineMode: "all", displayMode: "dim", rules: [{ material: "viscose", comparator: ">", value: 30 }] }
  ),
  true
);

assert.equal(
  logic.evaluateProduct(
    { materials: logic.parseCompositionString("100% Polyester") },
    { enabled: true, combineMode: "all", displayMode: "dim", rules: [{ material: "polyester", comparator: "not contains" }] }
  ),
  false
);

console.log("parser tests passed");
