from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Set a small viewport to ensure content overflows
    page.set_viewport_size({"width": 300, "height": 800})

    page.goto("http://localhost:8080")

    # Force a wide element to ensure horizontal scrollbar
    page.evaluate("() => { document.body.style.width = '2000px'; }")

    # Scroll to the right
    page.evaluate("() => { window.scrollTo(1000, 0); }")

    # Wait for scroll to happen
    page.wait_for_timeout(500)

    page.screenshot(path="jules-scratch/verification/background.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
