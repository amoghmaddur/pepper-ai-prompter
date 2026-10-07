const { launch } = require("./harness.js");
(async () => {
  const { ctx, extId } = await launch();
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 390, height: 844 });
  for (const s of ["home", "about", "history", "privacy"]) {
    await pg.goto(`chrome-extension://${extId}/dashboard.html#${s}`); await pg.waitForTimeout(400);
    const w = await pg.evaluate(() => document.documentElement.scrollWidth);
    console.log(s, "scrollWidth", w);
  }
  await pg.goto(`chrome-extension://${extId}/dashboard.html#about`); await pg.waitForTimeout(400);
  await pg.screenshot({ path: "e2e/shots/dashboard-mobile-about.png" });
  await ctx.close();
})();
