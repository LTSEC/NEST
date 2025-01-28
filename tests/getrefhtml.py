import sys
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

def main():
    if len(sys.argv) < 2:
        print("Usage: python capture_html.py <ip> [<port>]")
        sys.exit(1)

    ip = sys.argv[1]
    port = 3000  # Default port if none specified
    if len(sys.argv) >= 3:
        port = sys.argv[2]

    # Construct URL from IP and port
    url = f"http://{ip}:{port}"

    # Set up Chrome/Chromium in headless mode
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    # If running as root in Docker, you may need:
    # chrome_options.add_argument("--no-sandbox")

    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=chrome_options
    )

    try:
        # Navigate to your React site at the given IP:port
        driver.get(url)

        # Wait for a known element (#root in many React apps)
        WebDriverWait(driver, 10).until(
            EC.visibility_of_element_located((By.ID, "root"))
        )

        # Extra sleep if the page loads async data
        time.sleep(2)

        # Capture the final rendered HTML
        rendered_html = driver.page_source
        print(rendered_html)

    finally:
        driver.quit()

if __name__ == "__main__":
    main()
