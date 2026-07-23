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

async function snapshot(label) {
  const info = await page.evaluate(() => {
    const rosterRow = document.querySelector('[data-slot="avatar-group"]')?.parentElement
    const avatarGroup = document.querySelector('[data-slot="avatar-group"]')
    const membersSpan = Array.from(document.querySelectorAll('span')).find(s => /members?$/.test(s.textContent || ''))
    const rect = (el) => el ? el.getBoundingClientRect() : null
    return {
      rowClass: rosterRow?.className,
      rowRect: rect(rosterRow),
      avatarGroupClass: avatarGroup?.className,
      avatarGroupRect: rect(avatarGroup),
      membersSpanRect: rect(membersSpan),
      membersSpanText: membersSpan?.textContent,
    }
  })
  console.log(label, JSON.stringify(info, null, 2))
}

await snapshot("BEFORE")
await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)
await snapshot("AFTER")

await browser.close()
