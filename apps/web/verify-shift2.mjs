import { chromium } from "@playwright/test"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })

await page.goto("http://localhost:3000/auth/sign-in")
await page.fill('input[name="email"]', "admin@selah.local")
await page.fill('input[name="password"]', "password123")
await page.click('button[type="submit"]')
await page.waitForTimeout(2000)

await page.goto("http://localhost:3000/line-ups")
await page.waitForTimeout(1500)
await page.click('text=Sermon')
await page.waitForTimeout(1500)
await page.screenshot({ path: "shift-before.png", clip: { x: 250, y: 60, width: 500, height: 160 } })

const btn = await page.$('button[aria-label="Add to roster"]')
const btnBoxBefore = await btn.boundingBox()
console.log("add button before:", btnBoxBefore)

await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)
const btnBoxAfter = await btn.boundingBox()
console.log("add button after:", btnBoxAfter)

await page.screenshot({ path: "shift-after.png", clip: { x: 250, y: 60, width: 500, height: 160 } })

await browser.close()
