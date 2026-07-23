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

const membersText = page.getByText(/members?$/).first()
const before = await membersText.boundingBox()
console.log("before:", before)

await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)

const after = await membersText.boundingBox()
console.log("after:", after)

const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow)
const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow)
console.log("body overflow:", bodyOverflow, "html overflow:", htmlOverflow)
console.log("innerWidth:", await page.evaluate(() => window.innerWidth))

await page.screenshot({ path: "shift-open.png" })

await browser.close()
