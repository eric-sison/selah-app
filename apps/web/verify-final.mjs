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

// verify no shift when opening add-member popover
const membersBtn = page.getByRole('button', { name: /members$/ })
const before = await membersBtn.boundingBox()
await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)
const after = await membersBtn.boundingBox()
console.log("members button x before/after:", before.x, after.x)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// verify dropdown menu on clicking members
await membersBtn.click()
await page.waitForTimeout(400)
await page.screenshot({ path: "final-dropdown.png" })

await browser.close()
