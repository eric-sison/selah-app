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

async function dump(label) {
  const info = await page.evaluate(() => {
    const avatarGroup = document.querySelector('[data-slot="avatar-group"]')
    return Array.from(avatarGroup.children).map(c => ({
      tag: c.tagName,
      class: c.className,
      dataSlot: c.getAttribute('data-slot'),
      rect: c.getBoundingClientRect(),
      html: c.outerHTML.slice(0, 150),
    }))
  })
  console.log(label, JSON.stringify(info, null, 2))
}

await dump("BEFORE")
await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)
await dump("AFTER")

await browser.close()
