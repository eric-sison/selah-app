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

await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)

const info = await page.evaluate(() => {
  const groups = document.querySelectorAll('[data-slot="avatar-group"]')
  return Array.from(groups).map(g => ({
    rect: g.getBoundingClientRect(),
    childCount: g.children.length,
    outerHTMLStart: g.outerHTML.slice(0, 120),
  }))
})
console.log(JSON.stringify(info, null, 2))

await browser.close()
