package scoring

import (
	"context"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/xrash/smetrics"
)

/*
NOTICE: SETUP REQUIREMENTS for React:
------------------------------------
- You must capture the *fully rendered* HTML after React finishes loading,
  not just the initial skeleton. Use the `python getrefhtml.py <IP> <PORT> > site_info.html`
  script (or a similar approach) to get the final DOM (i.e., the real content
  inside #root).

- Place that captured file in the tests/site_infos directory (or wherever
  you're pointing `dir`), so we can compare the new HTML to it.

- If you run inside Docker as root, consider adding `--no-sandbox` to the
  Chromedp flags.
*/

var site_info []byte
var webLoadOnce sync.Once

// Load the HTML file into memory once
func web_startup(dir string) error {
	var err error
	webLoadOnce.Do(func() {
		var content []byte
		content, err = os.ReadFile(dir)
		if err == nil {
			// remove newlines to normalize a bit
			site_info = []byte(strings.ReplaceAll(string(content), "\n", ""))
		}
	})
	return err
}

// onPage uses Chromedp to navigate to the given IP:port,
// wait for the page to load, and return the full HTML as []byte.
func onPage(ip string, port int) ([]byte, error) {
	// Check if server is reachable via TCP before spinning up headless Chrome
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), 500*time.Millisecond)
	if err != nil {
		return nil, fmt.Errorf("server unreachable: %v", err)
	}
	_ = conn.Close()

	// Build the URL
	url := fmt.Sprintf("http://%s:%d", ip, port)
	if port == 443 {
		// If you're truly on HTTPS, you might set url = "https://..."
		// and handle TLS accordingly.
		url = fmt.Sprintf("https://%s", ip)
	}

	// Create a parent context with a higher-level timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// If running as root in Docker, you may need no-sandbox:
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
	)

	allocCtx, _ := chromedp.NewExecAllocator(ctx, opts...)
	browserCtx, _ := chromedp.NewContext(allocCtx)

	// But if not, a default context typically works:
	// browserCtx, _ := chromedp.NewContext(ctx)

	var pageHTML string
	// Run Chromedp tasks
	err = chromedp.Run(browserCtx,
		chromedp.Navigate(url),
		// Wait for #root to appear; typical for React
		chromedp.WaitVisible("#root", chromedp.ByID),
		// Additional short delay if your data loads asynchronously
		chromedp.Sleep(2*time.Second),
		// Grab the full rendered HTML
		chromedp.OuterHTML("html", &pageHTML),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp failed: %v", err)
	}

	return []byte(pageHTML), nil
}

// Calculate similarity ratio between two byte slices
func similarityRatio(a, b []byte) float64 {
	return smetrics.JaroWinkler(string(a), string(b), 0.7, 4)
}

// Check if the website is up and matches expected content
func checkWeb(dir, ip string, portNum int) (bool, error) {
	// Load the reference HTML once
	if err := web_startup(dir); err != nil {
		return false, fmt.Errorf("failed to load reference HTML: %v", err)
	}

	// Retrieve actual rendered HTML via headless browser
	pageHTML, err := onPage(ip, portNum)
	if err != nil {
		return false, err
	}

	// Compare similarity
	similarity := similarityRatio(site_info, pageHTML)
	return similarity >= 0.8, nil // require at least 80% match
}

// Scoring logic for the web server
func ScoreWeb(dir, ip string, portNum int) (int, bool, error) {
	match, err := checkWeb(dir, ip, portNum)
	if err != nil {
		return 0, false, fmt.Errorf("web scoring failed: %v", err)
	}

	if match {
		return successPoints, true, nil
	}
	return 0, false, nil
}
