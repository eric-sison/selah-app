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

const before = await page.evaluate(() => {
  const g = document.querySelector('[data-slot="avatar-group"]')
  return g.getBoundingClientRect().width
})
console.log("width with guards:", before)

const after = await page.evaluate(() => {
  const g = document.querySelector('[data-slot="avatar-group"]')
  Array.from(g.children).forEach(c => {
    if (c.tagName === 'SPAN' && c.getAttribute('data-slot') !== 'avatar') {
      c.remove()
    }
  })
  return g.getBoundingClientRect().width
})
console.log("width after removing guard spans:", after)

await browser.close()
